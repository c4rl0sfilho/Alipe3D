import type {
  AuthSession,
  AuthUser,
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
} from '@alipe3d/shared';
import type { Logger } from 'pino';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { DbClient } from '../../prisma/types.js';
import type { Mailer } from '../../services/mailer.js';
import { AppError } from '../../utils/app-error.js';
import { generateOpaqueToken, sha256 } from '../../utils/crypto.js';
import type { PasswordHasher } from '../../utils/password.js';
import type { RequestContext } from '../../utils/request-context.js';
import type { AuditService } from '../audit/audit.service.js';
import { toAuthUser, userWithRoleInclude } from './auth-user.js';
import type { IssuedRefreshToken, TokenService } from './token.service.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
/** Janela em que o reuso de um token recém-rotacionado é tratado como corrida entre abas, não como ataque. */
const ROTATION_GRACE_MS = 30_000;
const RESET_TOKEN_TTL_MINUTES = 60;
export const ADMIN_RESET_TOKEN_TTL_HOURS = 24;

const INVALID_CREDENTIALS = 'E-mail ou senha inválidos.';
const SESSION_EXPIRED = 'Sua sessão expirou. Faça login novamente.';

export interface SessionResult {
  session: AuthSession;
  refreshToken: IssuedRefreshToken;
}

export interface AuthServiceDeps {
  prisma: PrismaClient;
  tokens: TokenService;
  hasher: PasswordHasher;
  audit: AuditService;
  mailer: Mailer;
  logger: Logger;
  appUrl: string;
  isProduction: boolean;
}

export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async login(input: LoginInput, context: RequestContext): Promise<SessionResult> {
    const { prisma, hasher, audit } = this.deps;
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: userWithRoleInclude,
    });

    if (!user) {
      await hasher.simulateVerify(input.password);
      await audit.record({
        action: 'auth.login_failed',
        metadata: { email: input.email, reason: 'unknown_email' },
        context,
      });
      throw AppError.unauthorized(INVALID_CREDENTIALS);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new AppError(
        423,
        'ACCOUNT_LOCKED',
        `Acesso bloqueado por excesso de tentativas. Tente novamente em ${minutes} min.`,
      );
    }

    const valid = await hasher.verify(input.password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const lock = attempts >= MAX_FAILED_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: lock ? 0 : attempts,
          lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      await audit.record({
        action: 'auth.login_failed',
        actorId: user.id,
        entity: 'user',
        entityId: user.id,
        metadata: { reason: 'invalid_password', locked: lock },
        context,
      });
      throw AppError.unauthorized(INVALID_CREDENTIALS);
    }

    if (!user.isActive) {
      throw AppError.forbidden('Este usuário está desativado. Procure o administrador.');
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
        include: userWithRoleInclude,
      });
      const refreshToken = await this.deps.tokens.issueRefreshToken(
        user.id,
        context,
        undefined,
        tx,
      );
      await audit.record(
        { action: 'auth.login', actorId: user.id, entity: 'user', entityId: user.id, context },
        tx,
      );
      return { session: this.buildSession(toAuthUser(updated)), refreshToken };
    });
  }

  async refresh(rawToken: string | undefined, context: RequestContext): Promise<SessionResult> {
    if (!rawToken) throw AppError.unauthorized(SESSION_EXPIRED);
    const { prisma, tokens, audit } = this.deps;

    const record = await prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: { include: userWithRoleInclude } },
    });
    if (!record || record.revokedAt) throw AppError.unauthorized(SESSION_EXPIRED);

    if (record.rotatedAt) {
      const sinceRotation = Date.now() - record.rotatedAt.getTime();
      if (sinceRotation > ROTATION_GRACE_MS) {
        // Token antigo reapresentado: possível roubo. Encerra todas as sessões da família.
        await tokens.revokeFamily(record.familyId);
        await audit.record({
          action: 'auth.refresh_reuse_detected',
          actorId: record.userId,
          entity: 'user',
          entityId: record.userId,
          context,
        });
      }
      throw AppError.unauthorized(SESSION_EXPIRED);
    }

    if (record.expiresAt <= new Date() || !record.user.isActive) {
      await tokens.revokeFamily(record.familyId);
      throw AppError.unauthorized(SESSION_EXPIRED);
    }

    return prisma.$transaction(async (tx) => {
      // updateMany condicionado garante que duas requisições simultâneas não rotacionem o mesmo token.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: record.id, rotatedAt: null, revokedAt: null },
        data: { rotatedAt: new Date() },
      });
      if (count !== 1) throw AppError.unauthorized(SESSION_EXPIRED);

      const refreshToken = await tokens.issueRefreshToken(
        record.userId,
        context,
        record.familyId,
        tx,
      );
      return { session: this.buildSession(toAuthUser(record.user)), refreshToken };
    });
  }

  async logout(rawToken: string | undefined, context: RequestContext): Promise<void> {
    if (!rawToken) return;
    const record = await this.deps.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });
    if (!record) return;
    await this.deps.tokens.revokeFamily(record.familyId);
    await this.deps.audit.record({
      action: 'auth.logout',
      actorId: record.userId,
      entity: 'user',
      entityId: record.userId,
      context,
    });
  }

  /** Carrega o usuário de um access token. Retorna null se ele não puder mais acessar o sistema. */
  async resolveAccessToken(token: string): Promise<AuthUser | null> {
    const payload = this.deps.tokens.verifyAccessToken(token);
    if (!payload) return null;

    const user = await this.deps.prisma.user.findUnique({
      where: { id: payload.userId },
      include: userWithRoleInclude,
    });
    if (!user || !user.isActive) return null;

    // Tokens emitidos antes da última troca de senha deixam de valer.
    if (
      user.passwordChangedAt &&
      Math.floor(user.passwordChangedAt.getTime() / 1000) > payload.issuedAt
    ) {
      return null;
    }
    return toAuthUser(user);
  }

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    context: RequestContext,
  ): Promise<SessionResult> {
    const { prisma, hasher, tokens, audit } = this.deps;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!(await hasher.verify(input.currentPassword, user.passwordHash))) {
      throw AppError.badRequest('A senha atual está incorreta.', [
        { field: 'currentPassword', message: 'Senha atual incorreta' },
      ]);
    }
    const passwordHash = await hasher.hash(input.newPassword);

    return prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
        include: userWithRoleInclude,
      });
      // Encerra todas as outras sessões e abre uma nova para quem trocou a senha.
      await tokens.revokeAllForUser(userId, tx);
      const refreshToken = await tokens.issueRefreshToken(userId, context, undefined, tx);
      await audit.record(
        {
          action: 'auth.password_changed',
          actorId: userId,
          entity: 'user',
          entityId: userId,
          context,
        },
        tx,
      );
      return { session: this.buildSession(toAuthUser(updated)), refreshToken };
    });
  }

  /** Sempre conclui sem erro, exista ou não o e-mail, para não revelar quais contas existem. */
  async forgotPassword(input: ForgotPasswordInput, context: RequestContext): Promise<void> {
    const { prisma, mailer, logger, audit } = this.deps;
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.isActive) return;

    const { url } = await this.createResetToken(user.id, RESET_TOKEN_TTL_MINUTES * 60_000, null);
    await audit.record({
      action: 'auth.password_reset_requested',
      actorId: user.id,
      entity: 'user',
      entityId: user.id,
      metadata: { delivery: mailer.isConfigured ? 'email' : 'none' },
      context,
    });

    if (mailer.isConfigured) {
      await mailer.send({
        to: user.email,
        subject: 'Redefinição de senha — Alipe3D Manager',
        text: `Olá, ${user.name}.\n\nPara criar uma nova senha, acesse: ${url}\n\nO link vale por ${RESET_TOKEN_TTL_MINUTES} minutos. Se você não pediu a redefinição, ignore este e-mail.`,
        html: `<p>Olá, ${escapeHtml(user.name)}.</p><p>Para criar uma nova senha, <a href="${url}">clique aqui</a>.</p><p>O link vale por ${RESET_TOKEN_TTL_MINUTES} minutos. Se você não pediu a redefinição, ignore este e-mail.</p>`,
      });
    } else if (!this.deps.isProduction) {
      logger.warn(
        { url },
        'SMTP não configurado. Link de redefinição (somente em desenvolvimento):',
      );
    } else {
      logger.warn(
        'Recuperação de senha solicitada, mas o SMTP não está configurado. Um administrador deve gerar o link pela tela de usuários.',
      );
    }
  }

  async resetPassword(input: ResetPasswordInput, context: RequestContext): Promise<void> {
    const { prisma, hasher, tokens, audit } = this.deps;
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(input.token) },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date() || !record.user.isActive) {
      throw AppError.badRequest('Este link de redefinição é inválido ou expirou. Solicite outro.');
    }

    const passwordHash = await hasher.hash(input.password);
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count !== 1) throw AppError.badRequest('Este link de redefinição já foi utilizado.');

      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await tokens.revokeAllForUser(record.userId, tx);
      await audit.record(
        {
          action: 'auth.password_reset',
          actorId: record.userId,
          entity: 'user',
          entityId: record.userId,
          context,
        },
        tx,
      );
    });
  }

  /** Cria um token de redefinição, invalidando os anteriores ainda não usados. */
  async createResetToken(
    userId: string,
    ttlMs: number,
    createdById: string | null,
    db: DbClient = this.deps.prisma,
  ): Promise<{ url: string; expiresAt: Date }> {
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + ttlMs);
    await db.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await db.passwordResetToken.create({
      data: { userId, tokenHash: sha256(token), expiresAt, createdById },
    });
    const url = new URL('/redefinir-senha', this.deps.appUrl);
    url.searchParams.set('token', token);
    return { url: url.toString(), expiresAt };
  }

  private buildSession(user: AuthUser): AuthSession {
    return {
      accessToken: this.deps.tokens.signAccessToken(user.id),
      expiresIn: this.deps.tokens.accessTokenTtl,
      user,
    };
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}
