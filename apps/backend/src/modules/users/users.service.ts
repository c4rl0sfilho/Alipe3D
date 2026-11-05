import {
  listUsersQuerySchema,
  SYSTEM_ROLES,
  type AuthUser,
  type CreateUserInput,
  type ListUsersQuery,
  type Paginated,
  type PasswordResetLink,
  type UpdateUserInput,
  type UserSummary,
} from '@alipe3d/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { DbClient } from '../../prisma/types.js';
import { AppError } from '../../utils/app-error.js';
import { paginated, paginationArgs } from '../../utils/pagination.js';
import type { PasswordHasher } from '../../utils/password.js';
import type { RequestContext } from '../../utils/request-context.js';
import type { AuditService } from '../audit/audit.service.js';
import { ADMIN_RESET_TOKEN_TTL_HOURS, type AuthService } from '../auth/auth.service.js';
import type { TokenService } from '../auth/token.service.js';

const summarySelect = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, code: true, name: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof summarySelect }>;

function toSummary(user: UserRow): UserSummary {
  return {
    ...user,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export interface UsersServiceDeps {
  prisma: PrismaClient;
  hasher: PasswordHasher;
  audit: AuditService;
  tokens: TokenService;
  auth: AuthService;
}

export class UsersService {
  constructor(private readonly deps: UsersServiceDeps) {}

  async list(rawQuery: ListUsersQuery): Promise<Paginated<UserSummary>> {
    const query = listUsersQuerySchema.parse(rawQuery);
    const where: Prisma.UserWhereInput = {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.roleId ? { roleId: query.roleId } : {}),
      ...(query.status !== 'all' ? { isActive: query.status === 'active' } : {}),
    };

    const [rows, total] = await this.deps.prisma.$transaction([
      this.deps.prisma.user.findMany({
        where,
        select: summarySelect,
        orderBy: [
          query.sort === 'lastLoginAt'
            ? { lastLoginAt: { sort: query.order, nulls: 'last' } }
            : { [query.sort]: query.order },
          { id: 'asc' },
        ],
        ...paginationArgs(query.page, query.pageSize),
      }),
      this.deps.prisma.user.count({ where }),
    ]);
    return paginated(rows.map(toSummary), total, query.page, query.pageSize);
  }

  async getById(id: string): Promise<UserSummary> {
    const user = await this.deps.prisma.user.findUnique({ where: { id }, select: summarySelect });
    if (!user) throw AppError.notFound('Usuário não encontrado.');
    return toSummary(user);
  }

  async create(input: CreateUserInput, actor: AuthUser, context: RequestContext) {
    const { prisma, hasher, audit } = this.deps;
    await this.assertEmailAvailable(input.email);
    const role = await this.getRole(input.roleId);
    const passwordHash = await hasher.hash(input.password);

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          roleId: role.id,
          passwordHash,
          mustChangePassword: true,
        },
        select: summarySelect,
      });
      await audit.record(
        {
          action: 'user.created',
          actorId: actor.id,
          entity: 'user',
          entityId: user.id,
          metadata: { name: user.name, email: user.email, role: role.name },
          context,
        },
        tx,
      );
      return toSummary(user);
    });
  }

  async update(id: string, input: UpdateUserInput, actor: AuthUser, context: RequestContext) {
    const { prisma, audit } = this.deps;
    const current = await prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!current) throw AppError.notFound('Usuário não encontrado.');

    if (input.email !== current.email) await this.assertEmailAvailable(input.email, id);

    const roleChanged = input.roleId !== current.roleId;
    if (roleChanged) {
      if (id === actor.id) {
        throw AppError.badRequest('Você não pode alterar o seu próprio perfil de acesso.');
      }
      if (current.role.code === SYSTEM_ROLES.ADMIN && current.isActive) {
        await this.assertNotLastActiveAdmin(id);
      }
    }
    const role = roleChanged ? await this.getRole(input.roleId) : current.role;

    const changes: Record<string, { from: string; to: string }> = {};
    if (input.name !== current.name) changes.name = { from: current.name, to: input.name };
    if (input.email !== current.email) changes.email = { from: current.email, to: input.email };
    if (roleChanged) changes.role = { from: current.role.name, to: role.name };

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { name: input.name, email: input.email, roleId: role.id },
        select: summarySelect,
      });
      if (Object.keys(changes).length > 0) {
        await audit.record(
          {
            action: 'user.updated',
            actorId: actor.id,
            entity: 'user',
            entityId: id,
            metadata: changes,
            context,
          },
          tx,
        );
      }
      return toSummary(user);
    });
  }

  async setActive(id: string, isActive: boolean, actor: AuthUser, context: RequestContext) {
    const { prisma, audit, tokens } = this.deps;
    const current = await prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!current) throw AppError.notFound('Usuário não encontrado.');
    if (current.isActive === isActive) return this.getById(id);

    if (!isActive) {
      if (id === actor.id)
        throw AppError.badRequest('Você não pode desativar o seu próprio usuário.');
      if (current.role.code === SYSTEM_ROLES.ADMIN) await this.assertNotLastActiveAdmin(id);
    }

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { isActive, ...(isActive ? { failedLoginAttempts: 0, lockedUntil: null } : {}) },
        select: summarySelect,
      });
      // Desativar encerra todas as sessões e invalida links de redefinição pendentes.
      if (!isActive) {
        await tokens.revokeAllForUser(id, tx);
        await tx.passwordResetToken.updateMany({
          where: { userId: id, usedAt: null },
          data: { usedAt: new Date() },
        });
      }
      await audit.record(
        {
          action: isActive ? 'user.activated' : 'user.deactivated',
          actorId: actor.id,
          entity: 'user',
          entityId: id,
          metadata: { email: user.email },
          context,
        },
        tx,
      );
      return toSummary(user);
    });
  }

  /** Alternativa manual à recuperação por e-mail: o administrador gera e repassa o link. */
  async generateResetLink(
    id: string,
    actor: AuthUser,
    context: RequestContext,
  ): Promise<PasswordResetLink> {
    const { prisma, audit, auth } = this.deps;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw AppError.notFound('Usuário não encontrado.');
    if (!user.isActive) {
      throw AppError.badRequest('Reative o usuário antes de gerar um link de redefinição.');
    }

    return prisma.$transaction(async (tx) => {
      const link = await auth.createResetToken(
        id,
        ADMIN_RESET_TOKEN_TTL_HOURS * 60 * 60_000,
        actor.id,
        tx,
      );
      await audit.record(
        {
          action: 'user.reset_link_generated',
          actorId: actor.id,
          entity: 'user',
          entityId: id,
          metadata: { email: user.email },
          context,
        },
        tx,
      );
      return { url: link.url, expiresAt: link.expiresAt.toISOString() };
    });
  }

  private async assertEmailAvailable(
    email: string,
    ignoreId?: string,
    db: DbClient = this.deps.prisma,
  ) {
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing && existing.id !== ignoreId) {
      throw AppError.conflict('Já existe um usuário com este e-mail.');
    }
  }

  private async getRole(roleId: string) {
    const role = await this.deps.prisma.role.findUnique({ where: { id: roleId } });
    if (!role)
      throw AppError.badRequest('Perfil de acesso inválido.', [
        { field: 'roleId', message: 'Perfil não encontrado' },
      ]);
    return role;
  }

  private async assertNotLastActiveAdmin(userId: string) {
    const others = await this.deps.prisma.user.count({
      where: { id: { not: userId }, isActive: true, role: { code: SYSTEM_ROLES.ADMIN } },
    });
    if (others === 0) {
      throw AppError.badRequest(
        'Este é o último administrador ativo. Promova outro usuário a administrador antes.',
      );
    }
  }
}
