import {
  createUserSchema,
  passwordSchema,
  updateUserSchema,
  type RoleSummary,
  type UserSummary,
} from '@alipe3d/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { applyServerErrors } from '@/utils/form';
import { PASSWORD_HINT } from '../auth/password-forms';
import { usersApi } from './users.api';

/** Mesmo formulário para criar e editar; a senha só é exigida (e enviada) no cadastro. */
const baseUserFormSchema = updateUserSchema.extend({ password: z.string().optional() });
type FormValues = z.input<typeof baseUserFormSchema>;

function userFormSchema(isEdit: boolean) {
  return baseUserFormSchema.superRefine((data, ctx) => {
    if (isEdit) return;
    const result = passwordSchema.safeParse(data.password ?? '');
    if (!result.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: result.error.issues[0]?.message ?? 'Senha inválida',
      });
    }
  });
}

interface UserFormModalProps {
  open: boolean;
  user: UserSummary | null;
  roles: RoleSummary[];
  onClose: () => void;
}

export function UserFormModal({ open, user, roles, onClose }: UserFormModalProps) {
  const isEdit = !!user;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar usuário' : 'Novo usuário'}
      description={
        isEdit
          ? 'Altere os dados de acesso do usuário.'
          : 'O usuário deverá trocar a senha provisória no primeiro acesso.'
      }
    >
      {/* key força um formulário novo a cada abertura */}
      <UserForm key={user?.id ?? 'new'} user={user} roles={roles} onDone={onClose} />
    </Modal>
  );
}

function UserForm({
  user,
  roles,
  onDone,
}: {
  user: UserSummary | null;
  roles: RoleSummary[];
  onDone: () => void;
}) {
  const isEdit = !!user;
  const { user: me } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const editingSelf = user?.id === me?.id;
  const defaultRole = roles.find((role) => role.code === 'OPERACIONAL') ?? roles[0];

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(userFormSchema(isEdit)),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      roleId: user?.role.id ?? defaultRole?.id ?? '',
      password: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      user
        ? usersApi.update(user.id, {
            name: values.name,
            email: values.email,
            roleId: values.roleId,
          })
        : usersApi.create(createUserSchema.parse(values)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success(isEdit ? 'Usuário atualizado.' : 'Usuário criado.');
      onDone();
    },
    onError: (error) => {
      setFormError(applyServerErrors(error, setError, ['name', 'email', 'roleId', 'password']));
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => {
        setFormError(null);
        mutation.mutate(values);
      })}
      noValidate
      className="space-y-4"
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <Field label="Nome" htmlFor="user-name" error={errors.name?.message} required>
        <Input id="user-name" autoFocus invalid={!!errors.name} {...register('name')} />
      </Field>

      <Field label="E-mail" htmlFor="user-email" error={errors.email?.message} required>
        <Input
          id="user-email"
          type="email"
          autoComplete="off"
          invalid={!!errors.email}
          {...register('email')}
        />
      </Field>

      <Field
        label="Perfil de acesso"
        htmlFor="user-role"
        error={errors.roleId?.message}
        hint={editingSelf ? 'Você não pode alterar o seu próprio perfil.' : undefined}
        required
      >
        <Select
          id="user-role"
          disabled={editingSelf}
          invalid={!!errors.roleId}
          {...register('roleId')}
        >
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </Select>
      </Field>

      {!isEdit && (
        <Field
          label="Senha provisória"
          htmlFor="user-password"
          error={errors.password?.message}
          hint={`${PASSWORD_HINT} Repasse-a ao usuário por um canal seguro.`}
          required
        >
          <PasswordInput
            id="user-password"
            autoComplete="new-password"
            invalid={!!errors.password}
            {...register('password')}
          />
        </Field>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          {isEdit ? 'Salvar alterações' : 'Criar usuário'}
        </Button>
      </div>
    </form>
  );
}
