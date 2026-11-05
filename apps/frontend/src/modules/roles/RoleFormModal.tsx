import {
  PERMISSION_MODULES,
  PERMISSIONS,
  roleInputSchema,
  type PermissionCode,
  type RoleSummary,
} from '@alipe3d/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { applyServerErrors } from '@/utils/form';
import { queryKeys, rolesApi } from '../users/users.api';

type FormValues = z.input<typeof roleInputSchema>;

/** Permissões que podem ser atribuídas, agrupadas por módulo (as administrativas ficam de fora). */
const GROUPS = Object.entries(PERMISSION_MODULES)
  .map(([module, label]) => ({
    module,
    label,
    permissions: PERMISSIONS.filter((p) => p.module === module && !p.adminOnly),
  }))
  .filter((group) => group.permissions.length > 0);

interface RoleFormModalProps {
  open: boolean;
  role: RoleSummary | null;
  onClose: () => void;
}

export function RoleFormModal({ open, role, onClose }: RoleFormModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={role ? `Editar perfil: ${role.name}` : 'Novo perfil de acesso'}
      description="Escolha o que os usuários deste perfil podem ver e fazer."
    >
      <RoleForm key={role?.id ?? 'new'} role={role} onDone={onClose} />
    </Modal>
  );
}

function RoleForm({ role, onDone }: { role: RoleSummary | null; onDone: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(roleInputSchema),
    defaultValues: {
      name: role?.name ?? '',
      description: role?.description ?? '',
      permissions: role?.permissions ?? [],
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const input = roleInputSchema.parse(values);
      return role ? rolesApi.update(role.id, input) : rolesApi.create(input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.roles });
      toast.success(role ? 'Perfil atualizado.' : 'Perfil criado.');
      onDone();
    },
    onError: (error) => setFormError(applyServerErrors(error, setError, ['name', 'description'])),
  });

  return (
    <form
      onSubmit={handleSubmit((values) => {
        setFormError(null);
        mutation.mutate(values);
      })}
      noValidate
      className="space-y-5"
    >
      {formError && <Alert tone="error">{formError}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nome"
          htmlFor="role-name"
          error={errors.name?.message}
          hint={role?.isSystem ? 'Perfis do sistema não podem ser renomeados.' : undefined}
          required
        >
          <Input
            id="role-name"
            readOnly={role?.isSystem}
            invalid={!!errors.name}
            {...register('name')}
          />
        </Field>
        <Field label="Descrição" htmlFor="role-description" error={errors.description?.message}>
          <Textarea
            id="role-description"
            rows={1}
            className="min-h-10"
            {...register('description')}
          />
        </Field>
      </div>

      <Controller
        control={control}
        name="permissions"
        render={({ field }) => {
          const selected = new Set(field.value);
          const toggle = (code: PermissionCode, checked: boolean) => {
            const next = new Set(selected);
            if (checked) next.add(code);
            else next.delete(code);
            field.onChange([...next]);
          };
          return (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Permissões</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {GROUPS.map((group) => (
                  <div key={group.module} className="rounded-lg border border-line p-2">
                    <p className="px-2 pt-1 pb-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
                      {group.label}
                    </p>
                    {group.permissions.map((permission) => (
                      <Checkbox
                        key={permission.code}
                        id={`perm-${permission.code}`}
                        label={permission.label}
                        checked={selected.has(permission.code)}
                        onChange={(event) => toggle(permission.code, event.target.checked)}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-ink-muted">
                Usuários, perfis e auditoria são exclusivos do perfil Administrador.
              </p>
            </fieldset>
          );
        }}
      />

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone} disabled={mutation.isPending}>
          Cancelar
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          {role ? 'Salvar alterações' : 'Criar perfil'}
        </Button>
      </div>
    </form>
  );
}
