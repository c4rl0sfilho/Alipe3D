import { z } from 'zod';
import { emailSchema, passwordSchema } from './auth.js';
import { optionalTrimmed, paginationQuerySchema, uuidSchema } from './common.js';

const nameSchema = z
  .string({ error: 'Informe o nome' })
  .trim()
  .min(2, 'O nome deve ter ao menos 2 caracteres')
  .max(120, 'Nome muito longo');

export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  roleId: uuidSchema,
  /** Senha provisória: o usuário deverá trocá-la no primeiro acesso. */
  password: passwordSchema,
});

export const updateUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  roleId: uuidSchema,
});

export const setUserStatusSchema = z.object({ isActive: z.boolean() });

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: optionalTrimmed,
  roleId: uuidSchema.optional().or(z.literal('').transform(() => undefined)),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
  sort: z.enum(['name', 'email', 'createdAt', 'lastLoginAt']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.input<typeof listUsersQuerySchema>;

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: { id: string; code: string; name: string };
}

export interface PasswordResetLink {
  url: string;
  expiresAt: string;
}
