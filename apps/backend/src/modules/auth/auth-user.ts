import {
  isPermissionCode,
  PERMISSION_CODES,
  SYSTEM_ROLES,
  type AuthUser,
  type PermissionCode,
} from '@alipe3d/shared';
import type { Prisma } from '../../generated/prisma/client.js';

/** Include padrão para carregar um usuário com perfil e permissões. */
export const userWithRoleInclude = {
  role: { include: { permissions: { include: { permission: true } } } },
} satisfies Prisma.UserInclude;

export type UserWithRole = Prisma.UserGetPayload<{ include: typeof userWithRoleInclude }>;

/** O perfil ADMIN tem todas as permissões, independentemente do que estiver gravado. */
export function resolvePermissions(role: UserWithRole['role']): PermissionCode[] {
  if (role.code === SYSTEM_ROLES.ADMIN) return [...PERMISSION_CODES];
  return role.permissions.map((rp) => rp.permission.code).filter(isPermissionCode);
}

export function toAuthUser(user: UserWithRole): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mustChangePassword: user.mustChangePassword,
    role: { id: user.role.id, code: user.role.code, name: user.role.name },
    permissions: resolvePermissions(user.role),
  };
}
