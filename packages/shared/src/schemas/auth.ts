import { z } from 'zod';
import type { PermissionCode } from '../permissions.js';

export const emailSchema = z
  .string({ error: 'Informe o e-mail' })
  .trim()
  .toLowerCase()
  .min(1, 'Informe o e-mail')
  .max(160, 'E-mail muito longo')
  .pipe(z.email('E-mail inválido'));

/** Política de senha: mínimo 8 caracteres, com ao menos uma letra e um número. */
export const passwordSchema = z
  .string({ error: 'Informe a senha' })
  .min(8, 'A senha deve ter ao menos 8 caracteres')
  .max(72, 'A senha deve ter no máximo 72 caracteres')
  .regex(/[A-Za-z]/, 'A senha deve conter ao menos uma letra')
  .regex(/\d/, 'A senha deve conter ao menos um número');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Informe a senha' }).min(1, 'Informe a senha').max(72),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(32, 'Link inválido').max(128, 'Link inválido'),
  password: passwordSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual').max(72),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'A nova senha deve ser diferente da atual',
    path: ['newPassword'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Usuário autenticado, como devolvido pela API (sem dados sensíveis). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
  role: { id: string; code: string; name: string };
  permissions: PermissionCode[];
}

export interface AuthSession {
  accessToken: string;
  /** Validade do access token em segundos. */
  expiresIn: number;
  user: AuthUser;
}
