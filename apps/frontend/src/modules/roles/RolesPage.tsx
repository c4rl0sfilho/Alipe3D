import { PERMISSIONS, type RoleSummary } from '@alipe3d/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { toApiRequestError } from '@/services/api';
import { queryKeys, rolesApi } from '../users/users.api';
import { RoleFormModal } from './RoleFormModal';

const ASSIGNABLE_TOTAL = PERMISSIONS.filter((p) => !p.adminOnly).length;

export function RolesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const roles = useQuery({ queryKey: queryKeys.roles, queryFn: rolesApi.list });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RoleSummary | null>(null);
  const [deleting, setDeleting] = useState<RoleSummary | null>(null);

  const removeMutation = useMutation({
    mutationFn: (role: RoleSummary) => rolesApi.remove(role.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.roles });
      toast.success('Perfil excluído.');
      setDeleting(null);
    },
    onError: (error) => {
      toast.error(toApiRequestError(error).message);
      setDeleting(null);
    },
  });

  const openForm = (role: RoleSummary | null) => {
    setEditing(role);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Perfis de acesso"
        description="Defina o que cada grupo de usuários pode ver e fazer no sistema."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => openForm(null)}>
            Novo perfil
          </Button>
        }
      />

      {roles.error ? (
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title="Não foi possível carregar os perfis"
            description={toApiRequestError(roles.error).message}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.isPending &&
            Array.from({ length: 2 }, (_, i) => (
              <Card key={i} className="h-40 animate-pulse bg-canvas" />
            ))}
          {roles.data?.map((role) => (
            <Card key={role.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    {role.isAdmin ? (
                      <Lock className="size-5" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="size-5" aria-hidden="true" />
                    )}
                  </span>
                  <div>
                    <p className="font-medium">{role.name}</p>
                    <p className="text-xs text-ink-muted">
                      {role.userCount} {role.userCount === 1 ? 'usuário' : 'usuários'}
                      {role.isSystem && ' · Perfil do sistema'}
                    </p>
                  </div>
                </div>
              </div>

              {role.description && (
                <p className="mt-3 text-sm text-ink-muted">{role.description}</p>
              )}

              <p className="mt-4 text-sm">
                {role.isAdmin ? (
                  <span className="font-medium text-brand-700">Acesso completo</span>
                ) : (
                  <>
                    <span className="font-medium">{role.permissions.length}</span>
                    <span className="text-ink-muted"> de {ASSIGNABLE_TOTAL} permissões</span>
                  </>
                )}
              </p>

              <div className="mt-auto flex gap-2 pt-4">
                {role.isAdmin ? (
                  <p className="text-xs text-ink-muted">
                    Possui todas as permissões e não pode ser alterado.
                  </p>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Pencil className="size-3.5" />}
                      onClick={() => openForm(role)}
                    >
                      Editar
                    </Button>
                    {!role.isSystem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 className="size-3.5" />}
                        onClick={() => setDeleting(role)}
                        className="text-danger hover:text-danger"
                      >
                        Excluir
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <RoleFormModal open={formOpen} role={editing} onClose={() => setFormOpen(false)} />

      <ConfirmDialog
        open={!!deleting}
        title="Excluir perfil"
        message={
          <>
            O perfil <strong className="text-ink">{deleting?.name}</strong> será excluído. Só é
            possível excluir perfis sem usuários.
          </>
        }
        confirmLabel="Excluir"
        loading={removeMutation.isPending}
        onConfirm={() => deleting && removeMutation.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
