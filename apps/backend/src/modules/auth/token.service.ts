import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Env } from '../../config/env.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { DbClient } from '../../prisma/types.js';
import { generateOpaqueToken, sha256 } from '../../utils/crypto.js';
import type { RequestContext } from '../../utils/request-context.js';

const ISSUER = 'alipe3d-manager';
const AUDIENCE = 'alipe3d-web';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface AccessTokenPayload {
  userId: string;
  /** Momento de emissão (segundos desde epoch). */
  issuedAt: number;
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export type TokenConfig = Pick<
  Env,
  'JWT_ACCESS_SECRET' | 'JWT_ACCESS_TTL' | 'REFRESH_TOKEN_TTL_DAYS'
>;

/**
 * Access token: JWT curto (padrão 15 min), enviado no cabeçalho Authorization e mantido só em memória no navegador.
 * Refresh token: valor opaco em cookie httpOnly; no banco fica apenas o hash. Rotacionado a cada uso.
 */
export class TokenService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: TokenConfig,
  ) {}

  get accessTokenTtl(): number {
    return this.config.JWT_ACCESS_TTL;
  }

  signAccessToken(userId: string): string {
    return jwt.sign({}, this.config.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      subject: userId,
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: this.config.JWT_ACCESS_TTL,
    });
  }

  /** Retorna null para qualquer token inválido, expirado ou adulterado. */
  verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
      const payload = jwt.verify(token, this.config.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      if (typeof payload === 'string' || !payload.sub || typeof payload.iat !== 'number') {
        return null;
      }
      return { userId: payload.sub, issuedAt: payload.iat };
    } catch {
      return null;
    }
  }

  async issueRefreshToken(
    userId: string,
    context: RequestContext,
    familyId: string = randomUUID(),
    db: DbClient = this.prisma,
  ): Promise<IssuedRefreshToken> {
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
    await db.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(token),
        expiresAt,
        ip: context.ip,
        userAgent: context.userAgent,
      },
    });
    return { token, expiresAt };
  }

  async revokeFamily(familyId: string, db: DbClient = this.prisma): Promise<void> {
    await db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string, db: DbClient = this.prisma): Promise<void> {
    await db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
