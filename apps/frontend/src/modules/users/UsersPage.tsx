import type { ListUsersQuery, PasswordResetLink, UserSummary } from '@alipe3d/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, Search, UserCheck, UserX, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { toApiRequestError } from '@/services/api';
import { formatDateTime } from '@/utils/format';
import { initials } from '@/utils/text';
import { ResetLinkModal } from './ResetLinkModal';
import { UserFormModal } from './UserFormModal';
import { queryKeys, rolesApi, usersApi } from './users.api';

const PAGE_SIZE = 20;

export function UsersPage() {
  const { can, user: me } = useAuth();
  const canManage = can('users:manage');
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [roleId, setRoleId] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  const query: ListUsersQuery = {
    search: debouncedSearch,
    status,
    roleId,
    page,
    pageSize: PAGE_SIZE,
    sort: 'name',
    order: 'asc',
  };
  const users = useQuery({
    queryKey: queryKeys.users(query),
    queryFn: () => usersApi.list(query),
    placeholderData: keepPreviousData,
  });
  const roles = useQuery({ queryKey: queryKeys.roles, queryFn: rolesApi.list });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [statusTarget, setStatusTarget] = useState<UserSummary | null>(null);
  const [resetTarget, setResetTarget] = useState<UserSummary | null>(null);
  const [resetLink, setResetLink] = useState<PasswordResetLink | null>(null);

  const statusMutation = useMutation({
    mutationFn: (user: UserSummary) => usersApi.setStatus(user.id, !user.isActive),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(updated.isActive ? 'Usuário reativado.' : 'Usuário desativado.');
      setStatusTarget(null);
    },
    onError: (error) => {
      toast.error(toApiRequestError(error).message);
      setStatusTarget(null);
    },
  });

  const resetMutation = useMutation({
    mutationFn: (user: UserSummary) => usersApi.resetLink(user.id),
    onSuccess: (link) => setResetLink(link),
    onError: (error) => {
      toast.error(toApiRequestError(error).message);
      setResetTarget(null);
    },
  });

  const resetFilters = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const columns: Column<UserSummary>[] = [
    {
      key: 'name',
      header: 'Usuário',
      cell: (user) => (
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
            {initials(user.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">
              {user.name}
              {user.id === me?.id && <span className="ml-1.5 text-xs text-ink-muted">(você)</span>}
            </p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'Perfil', cell: (user) => user.role.name, hideOnMobile: true },
    {
      key: 'status',
      header: 'Situação',
      cell: (user) =>
        !user.isActive ? (
          <StatusBadge tone="neutral" label="Inativo" />
        ) : user.mustChangePassword ? (
          <StatusBadge tone="warning" label="Aguardando 1º acesso" />
        ) : (
          <StatusBadge tone="success" label="Ativo" />
        ),
    },
    {
      key: 'lastLogin',
      header: 'Último acesso',
      cell: (user) => (
        <span className="text-ink-muted">
          {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Nunca acessou'}
        </span>
      ),
      hideOnMobile: true,
    },
  ];

  if (canManage) {
    columns.push({
      key: 'actions',
      header: 'Ações',
      className: 'text-right',
      cell: (user) => (
        <div className="flex justify-end gap-1">
          <IconAction
            label={`Editar ${user.name}`}
            onClick={() => {
              setEditing(user);
              setFormOpen(true);
            }}
            icon={<Pencil className="size-4" />}
          />
          {user.isActive && user.id !== me?.id && (
            <IconAction
              label={`Gerar link de redefinição de senha para ${user.name}`}
              onClick={() => setResetTarget(user)}
              icon={<KeyRound className="size-4" />}
            />
          )}
          {user.id !== me?.id && (
            <IconAction
              label={user.isActive ? `Desativar ${user.name}` : `Reativar ${user.name}`}
              onClick={() => setStatusTarget(user)}
              icon={
                user.isActive ? (
                  <UserX className="size-4 text-danger" />
                ) : (
                  <UserCheck className="size-4 text-success" />
                )
              }
            />
          )}
        </div>
      ),
    });
  }

  const hasFilters = !!search || status !== 'all' || !!roleId;

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Pessoas com acesso ao sistema e seus perfis."
        actions={
          canManage && (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              disabled={!roles.data}
            >
              Novo usuário
            </Button>
          )
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Buscar por nome ou e-mail"
              aria-label="Buscar usuários"
              value={search}
              onChange={(event) => resetFilters(() => setSearch(event.target.value))}
              className="pl-9"
            />
          </div>
          <Select
            aria-label="Filtrar por perfil"
            value={roleId}
            onChange={(event) => resetFilters(() => setRoleId(event.target.value))}
            className="md:w-48"
          >
            <option value="">Todos os perfis</option>
            {roles.data?.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filtrar por situação"
            value={status}
            onChange={(event) => resetFilters(() => setStatus(event.target.value as typeof status))}
            className="md:w-40"
          >
            <option value="all">Todas as situações</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </Select>
        </div>

        {users.error ? (
          <EmptyState
            icon={Users}
            title="Não foi possível carregar os usuários"
            description={toApiRequestError(users.error).message}
            action={
              <Button variant="secondary" onClick={() => void users.refetch()}>
                Tentar novamente
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={users.data?.items}
            rowKey={(user) => user.id}
            loading={users.isFetching}
            empty={
              <EmptyState
                icon={Users}
                title={hasFilters ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}
                description={hasFilters ? 'Ajuste a busca ou os filtros.' : undefined}
              />
            }
          />
        )}

        {users.data && (
          <Pagination
            page={users.data.meta.page}
            totalPages={users.data.meta.totalPages}
            totalItems={users.data.meta.totalItems}
            pageSize={users.data.meta.pageSize}
            onPageChange={setPage}
          />
        )}
      </Card>

      {roles.data && (
        <UserFormModal
          open={formOpen}
          user={editing}
          roles={roles.data}
          onClose={() => setFormOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!statusTarget}
        title={statusTarget?.isActive ? 'Desativar usuário' : 'Reativar usuário'}
        message={
          statusTarget?.isActive ? (
            <>
              <strong className="text-ink">{statusTarget.name}</strong> perderá o acesso
              imediatamente e todas as sessões abertas serão encerradas. O histórico é mantido.
            </>
          ) : (
            <>
              <strong className="text-ink">{statusTarget?.name}</strong> voltará a ter acesso com o
              perfil atual.
            </>
          )
        }
        confirmLabel={statusTarget?.isActive ? 'Desativar' : 'Reativar'}
        tone={statusTarget?.isActive ? 'danger' : 'primary'}
        loading={statusMutation.isPending}
        onConfirm={() => statusTarget && statusMutation.mutate(statusTarget)}
        onCancel={() => setStatusTarget(null)}
      />

      <ConfirmDialog
        open={!!resetTarget && !resetLink}
        title="Gerar link de redefinição"
        message={
          <>
            Será gerado um link de uso único, válido por 24 horas, para{' '}
            <strong className="text-ink">{resetTarget?.name}</strong> criar uma nova senha. Links
            anteriores deixarão de valer.
          </>
        }
        confirmLabel="Gerar link"
        tone="primary"
        loading={resetMutation.isPending}
        onConfirm={() => resetTarget && resetMutation.mutate(resetTarget)}
        onCancel={() => setResetTarget(null)}
      />

      <ResetLinkModal
        user={resetTarget}
        link={resetLink}
        onClose={() => {
          setResetLink(null);
          setResetTarget(null);
        }}
      />
    </>
  );
}

function IconAction({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-md p-2 text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
    >
      {icon}
    </button>
  );
}
