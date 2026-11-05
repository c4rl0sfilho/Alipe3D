import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { applyServerErrors } from '@/utils/form';
import { authApi } from './auth.api';
import { AuthLayout } from './AuthLayout';
import { PASSWORD_HINT, resetPasswordFormSchema, type ResetPasswordForm } from './password-forms';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await authApi.resetPassword({ token, password });
      setDone(true);
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['password']));
    }
  });

  if (!token) {
    return (
      <AuthLayout title="Link inválido">
        <Alert tone="error">
          Este link de redefinição está incompleto. Solicite um novo pela tela de login.
        </Alert>
        <BackToLogin />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Nova senha" description="Escolha a nova senha de acesso.">
      {done ? (
        <>
          <Alert tone="success">Senha redefinida. Você já pode entrar com a nova senha.</Alert>
          <BackToLogin />
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {formError && <Alert tone="error">{formError}</Alert>}
          <Field
            label="Nova senha"
            htmlFor="password"
            error={errors.password?.message}
            hint={PASSWORD_HINT}
          >
            <PasswordInput
              id="password"
              autoComplete="new-password"
              autoFocus
              invalid={!!errors.password}
              {...register('password')}
            />
          </Field>
          <Field
            label="Confirme a nova senha"
            htmlFor="confirmPassword"
            error={errors.confirmPassword?.message}
          >
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              invalid={!!errors.confirmPassword}
              {...register('confirmPassword')}
            />
          </Field>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Salvar nova senha
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

function BackToLogin() {
  return (
    <Link
      to="/login"
      className="mt-6 inline-block text-sm font-medium text-brand-700 hover:text-brand-500"
    >
      Ir para o login
    </Link>
  );
}
