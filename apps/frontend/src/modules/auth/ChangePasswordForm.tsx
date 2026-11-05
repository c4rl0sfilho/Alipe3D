import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useAuth } from '@/contexts/AuthContext';
import { applyServerErrors } from '@/utils/form';
import { authApi } from './auth.api';
import { changePasswordFormSchema, PASSWORD_HINT, type ChangePasswordForm } from './password-forms';

/** Formulário de troca de senha, usado no primeiro acesso e em "Meu perfil". */
export function ChangePasswordFormFields({
  submitLabel,
  onSuccess,
}: {
  submitLabel: string;
  onSuccess: () => void;
}) {
  const { applySession } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setFormError(null);
    try {
      const session = await authApi.changePassword({ currentPassword, newPassword });
      applySession(session);
      reset();
      onSuccess();
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['currentPassword', 'newPassword'] as const));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field label="Senha atual" htmlFor="currentPassword" error={errors.currentPassword?.message}>
        <PasswordInput
          id="currentPassword"
          autoComplete="current-password"
          invalid={!!errors.currentPassword}
          {...register('currentPassword')}
        />
      </Field>
      <Field
        label="Nova senha"
        htmlFor="newPassword"
        error={errors.newPassword?.message}
        hint={PASSWORD_HINT}
      >
        <PasswordInput
          id="newPassword"
          autoComplete="new-password"
          invalid={!!errors.newPassword}
          {...register('newPassword')}
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
      <Button type="submit" loading={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
