import {
  AUDIT_ACTIONS,
  PERMISSIONS,
  type AuditLogEntry,
  type ListAuditLogsQuery,
} from '@alipe3d/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { toApiRequestError } from '@/services/api';
import { formatDateTime } from '@/utils/format';
import { auditApi, queryKeys, usersApi } from '../users/users.api';

const PAGE_SIZE = 25;

const METADATA_LABELS: Record<string, string> = {
  name: 'Nome',
  email: 'E-mail',
  role: 'Perfil',
  reason: 'Motivo',
  locked: 'Bloqueado',
  added: 'Permissões adicionadas',
  removed: 'Permissões removidas',
  permissions: 'Permissões',
  delivery: 'Envio',
};

const PERMISSION_LABELS = new Map<string, string>(PERMISSIONS.map((p) => [p.code, p.label]));

const REASON_LABELS: Record<string, string> = {
  unknown_email: 'e-mail não cadastrado',
  invalid_password: 'senha incorreta',
};

function describeValue(key: string, value: unknown): string {
  if (value && typeof value === 'object' && 'from' in value && 'to' in value) {
    return `${String(value.from)} → ${String(value.to)}`;
  }
  if (Array.isArray(value)) {
    if (!value.length) return '—';
    // Listas de permissões: mostrar o nome legível em vez do código
    return value.map((item) => PERMISSION_LABELS.get(String(item)) ?? String(item)).join(', ');
  }
  if (typeof value === 'boolean') return value ? 'sim' : 'não';
  if (key === 'reason' && typeof value === 'string') return REASON_LABELS[value] ?? value;
  return String(value);
}

function Details({ entry }: { entry: AuditLogEntry }) {
  if (!entry.metadata) return <span className="text-ink-muted">—</span>;
  return (
    <ul className="space-y-0.5 text-xs text-ink-muted">
      {Object.entries(entry.metadata).map(([key, value]) => (
        <li key={key}>
          <span className="text-ink">{METADATA_LABELS[key] ?? key}:</span>{' '}
          {describeValue(key, value)}
        </li>
      ))}
    </ul>
  );
}

export function AuditPage() {
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const query: ListAuditLogsQuery = { action, userId, from, to, page, pageSize: PAGE_SIZE };
  const logs = useQuery({
    queryKey: queryKeys.audit(query),
    queryFn: () => auditApi.list(query),
    placeholderData: keepPreviousData,
  });
  // Lista de usuários para o filtro (inclui inativos)
  const users = useQuery({
    queryKey: ['users', 'all-for-filter'],
    queryFn: () => usersApi.list({ pageSize: 100, status: 'all' }),
  });

  const update = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'date',
      header: 'Data e hora',
      cell: (entry) => <span className="whitespace-nowrap">{formatDateTime(entry.createdAt)}</span>,
    },
    {
      key: 'action',
      header: 'Operação',
      cell: (entry) => (
        <span className="font-medium">
          {AUDIT_ACTIONS[entry.action as keyof typeof AUDIT_ACTIONS] ?? entry.action}
        </span>
      ),
    },
    {
      key: 'user',
      header: 'Responsável',
      cell: (entry) =>
        entry.user ? (
          <div>
            <p>{entry.user.name}</p>
            <p className="text-xs text-ink-muted">{entry.user.email}</p>
          </div>
        ) : (
          <span className="text-ink-muted">Não identificado</span>
        ),
      hideOnMobile: true,
    },
    {
      key: 'details',
      header: 'Detalhes',
      cell: (entry) => <Details entry={entry} />,
      hideOnMobile: true,
    },
    {
      key: 'ip',
      header: 'IP',
      cell: (entry) => <span className="font-mono text-xs text-ink-muted">{entry.ip ?? '—'}</span>,
      hideOnMobile: true,
    },
  ];

  const hasFilters = !!(action || userId || from || to);

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Registro das operações importantes realizadas no sistema. Os registros não podem ser alterados."
      />
      <Card>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            aria-label="Filtrar por operação"
            value={action}
            onChange={(e) => update(() => setAction(e.target.value))}
          >
            <option value="">Todas as operações</option>
            {Object.entries(AUDIT_ACTIONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filtrar por responsável"
            value={userId}
            onChange={(e) => update(() => setUserId(e.target.value))}
          >
            <option value="">Todos os responsáveis</option>
            {users.data?.items.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            aria-label="Data inicial"
            value={from}
            max={to || undefined}
            onChange={(e) => update(() => setFrom(e.target.value))}
          />
          <Input
            type="date"
            aria-label="Data final"
            value={to}
            min={from || undefined}
            onChange={(e) => update(() => setTo(e.target.value))}
          />
        </div>

        {logs.error ? (
          <EmptyState
            icon={ScrollText}
            title="Não foi possível carregar a auditoria"
            description={toApiRequestError(logs.error).message}
            action={
              <Button variant="secondary" onClick={() => void logs.refetch()}>
                Tentar novamente
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={logs.data?.items}
            rowKey={(entry) => entry.id}
            loading={logs.isFetching}
            empty={
              <EmptyState
                icon={ScrollText}
                title="Nenhum registro encontrado"
                description={
                  hasFilters ? 'Ajuste os filtros para ver outros registros.' : undefined
                }
              />
            }
          />
        )}
        {logs.data && (
          <Pagination
            page={logs.data.meta.page}
            totalPages={logs.data.meta.totalPages}
            totalItems={logs.data.meta.totalItems}
            pageSize={logs.data.meta.pageSize}
            onPageChange={setPage}
          />
        )}
      </Card>
    </>
  );
}
