import { changePasswordSchema, passwordSchema } from '@alipe3d/shared';
import { z } from 'zod';

const confirmMessage = { message: 'As senhas não conferem', path: ['confirmPassword'] };

/** Formulário de troca de senha: schema da API + confirmação (apenas no cliente). */
export const changePasswordFormSchema = changePasswordSchema
  .and(z.object({ confirmPassword: z.string() }))
  .refine((data) => data.newPassword === data.confirmPassword, confirmMessage);

export type ChangePasswordForm = z.infer<typeof changePasswordFormSchema>;

export const resetPasswordFormSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, confirmMessage);

export type ResetPasswordForm = z.infer<typeof resetPasswordFormSchema>;

export const PASSWORD_HINT = 'Mínimo de 8 caracteres, com letras e números.';
