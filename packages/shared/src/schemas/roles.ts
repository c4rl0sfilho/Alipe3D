import { z } from 'zod';
import { ASSIGNABLE_PERMISSION_CODES, type PermissionCode } from '../permissions.js';

export const roleInputSchema = z.object({
  name: z
    .string({ error: 'Informe o nome do perfil' })
    .trim()
    .min(2, 'O nome deve ter ao menos 2 caracteres')
    .max(60, 'Nome muito longo'),
  description: z
    .string()
    .trim()
    .max(240, 'Descrição muito longa')
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  permissions: z
    .array(
      z.enum(ASSIGNABLE_PERMISSION_CODES as [PermissionCode, ...PermissionCode[]], {
        error: 'Permissão inválida ou exclusiva do administrador',
      }),
    )
    .max(100),
});

export type RoleInput = z.infer<typeof roleInputSchema>;

export interface RoleSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** true para o perfil ADMIN: possui todas as permissões e não é editável. */
  isAdmin: boolean;
  permissions: PermissionCode[];
  userCount: number;
}
