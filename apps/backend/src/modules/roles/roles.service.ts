import {
  SYSTEM_ROLES,
  type AuthUser,
  type PermissionCode,
  type RoleInput,
  type RoleSummary,
} from '@alipe3d/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/app-error.js';
import type { RequestContext } from '../../utils/request-context.js';
import type { AuditService } from '../audit/audit.service.js';
import { resolvePermissions } from '../auth/auth-user.js';

const roleInclude = {
  permissions: { include: { permission: true } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude;

type RoleRow = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

function toSummary(role: RoleRow): RoleSummary {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    isAdmin: role.code === SYSTEM_ROLES.ADMIN,
    permissions: resolvePermissions(role),
    userCount: role._count.users,
  };
}

/** Gera um código estável a partir do nome: "Expedição Loja" → EXPEDICAO_LOJA. */
function codeFromName(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'PERFIL'
  );
}

export class RolesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<RoleSummary[]> {
    const roles = await this.prisma.role.findMany({
      include: roleInclude,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map(toSummary);
  }

  async create(input: RoleInput, actor: AuthUser, context: RequestContext): Promise<RoleSummary> {
    await this.assertNameAvailable(input.name);
    const code = await this.uniqueCode(codeFromName(input.name));
    const permissionIds = await this.permissionIds(input.permissions);

    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          code,
          name: input.name,
          description: input.description ?? null,
          permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
        },
        include: roleInclude,
      });
      await this.audit.record(
        {
          action: 'role.created',
          actorId: actor.id,
          entity: 'role',
          entityId: role.id,
          metadata: { name: role.name, permissions: input.permissions },
          context,
        },
        tx,
      );
      return toSummary(role);
    });
  }

  async update(
    id: string,
    input: RoleInput,
    actor: AuthUser,
    context: RequestContext,
  ): Promise<RoleSummary> {
    const current = await this.prisma.role.findUnique({ where: { id }, include: roleInclude });
    if (!current) throw AppError.notFound('Perfil não encontrado.');
    if (current.code === SYSTEM_ROLES.ADMIN) {
      throw AppError.forbidden(
        'O perfil Administrador possui todas as permissões e não pode ser alterado.',
      );
    }
    if (current.isSystem && input.name !== current.name) {
      throw AppError.badRequest('O nome de um perfil do sistema não pode ser alterado.');
    }
    if (input.name !== current.name) await this.assertNameAvailable(input.name, id);

    const before = new Set(resolvePermissions(current));
    const after = new Set(input.permissions);
    const added = [...after].filter((code) => !before.has(code));
    const removed = [...before].filter((code) => !after.has(code));
    const permissionIds = await this.permissionIds(input.permissions);

    return this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      const role = await tx.role.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description ?? null,
          permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
        },
        include: roleInclude,
      });
      await this.audit.record(
        {
          action: 'role.updated',
          actorId: actor.id,
          entity: 'role',
          entityId: id,
          metadata: { name: role.name, added, removed },
          context,
        },
        tx,
      );
      return toSummary(role);
    });
  }

  async remove(id: string, actor: AuthUser, context: RequestContext): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { id }, include: roleInclude });
    if (!role) throw AppError.notFound('Perfil não encontrado.');
    if (role.isSystem) throw AppError.badRequest('Perfis do sistema não podem ser excluídos.');
    if (role._count.users > 0) {
      throw AppError.conflict(
        'Este perfil está atribuído a usuários. Altere o perfil desses usuários antes de excluí-lo.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'role.deleted',
          actorId: actor.id,
          entity: 'role',
          entityId: id,
          metadata: { name: role.name },
          context,
        },
        tx,
      );
    });
  }

  private async permissionIds(codes: PermissionCode[]): Promise<string[]> {
    if (codes.length === 0) return [];
    const rows = await this.prisma.permission.findMany({
      where: { code: { in: codes }, adminOnly: false },
      select: { id: true },
    });
    if (rows.length !== new Set(codes).size) {
      throw AppError.badRequest('Uma ou mais permissões são inválidas.');
    }
    return rows.map((row) => row.id);
  }

  private async assertNameAvailable(name: string, ignoreId?: string) {
    const existing = await this.prisma.role.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing && existing.id !== ignoreId) {
      throw AppError.conflict('Já existe um perfil com este nome.');
    }
  }

  private async uniqueCode(base: string): Promise<string> {
    let code = base;
    for (let suffix = 2; await this.prisma.role.findUnique({ where: { code } }); suffix++) {
      code = `${base.slice(0, 36)}_${suffix}`;
    }
    return code;
  }
}
