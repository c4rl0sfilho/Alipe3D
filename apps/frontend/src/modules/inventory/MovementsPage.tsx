import {
  MOVEMENT_TYPE_LABELS,
  MOVEMENT_TYPES,
  type ListMovementsQuery,
  type MovementEntry,
  type MovementType,
  type StockUnit,
} from '@alipe3d/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { History, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { cn } from '@/utils/cn';
import { formatCurrency, formatDate, formatTime } from '@/utils/format';
import { inventoryKeys, stockApi } from './inventory.api';
import { formatStock } from './inventory-ui';

type Target = NonNullable<ListMovementsQuery['target']>;

const TARGET_LABELS: Record<Target, string> = {
  all: 'Todos os itens',
  ROLL: 'Rolos de filamento',
  SUPPLY: 'Insumos',
  FINISHED_GOOD: 'Produtos acabados',
};

export function MovementsPage() {
  const [type, setType] = useState<MovementType | ''>('');
  const [target, setTarget] = useState<Target>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const update = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const query: ListMovementsQuery = { type, target, from, to, page, pageSize: 30 };
  const movements = useQuery({
    queryKey: inventoryKeys.movements(query),
    queryFn: () => stockApi.listMovements(query),
    placeholderData: keepPreviousData,
  });

  const columns: Column<MovementEntry>[] = [
    {
      key: 'date',
      header: 'Data',
      cell: (m) => (
        <div className="whitespace-nowrap">
          <p>{formatDate(m.occurredAt)}</p>
          <p className="text-xs text-ink-muted" title="Registrado em">
            {formatTime(m.createdAt)}
          </p>
        </div>
      ),
    },
    {
      key: 'item',
      header: 'Item',
      cell: (m) => (
        <div>
          <p className="font-medium">{m.target.label}</p>
          <p className="text-xs text-ink-muted">{TARGET_LABELS[m.target.kind]}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Movimentação',
      cell: (m) => (
        <div>
          <p className="flex items-center gap-1.5">
            {MOVEMENT_TYPE_LABELS[m.type]}
            {m.negativeAuthorized && (
              <ShieldAlert
                className="size-3.5 text-danger"
                aria-label="Saldo negativo autorizado"
              />
            )}
          </p>
          <p className="max-w-xs truncate text-xs text-ink-muted" title={m.reason}>
            {m.reason}
          </p>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Quantidade',
      className: 'text-right',
      cell: (m) => {
        const n = Number(m.quantity);
        return (
          <span
            className={cn(
              'font-medium whitespace-nowrap tabular-nums',
              n > 0 ? 'text-success' : 'text-danger',
            )}
          >
            {n > 0 ? '+' : '−'}
            {formatStock(Math.abs(n), m.unit as StockUnit | 'g')}
          </span>
        );
      },
    },
    {
      key: 'balance',
      header: 'Saldo após',
      className: 'text-right',
      cell: (m) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatStock(m.balanceAfter, m.unit as StockUnit | 'g')}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'cost',
      header: 'Valor',
      className: 'text-right',
      cell: (m) =>
        m.totalCost ? formatCurrency(m.totalCost) : <span className="text-ink-muted">—</span>,
      hideOnMobile: true,
    },
    { key: 'user', header: 'Responsável', cell: (m) => m.user.name, hideOnMobile: true },
  ];

  return (
    <Card>
      <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          aria-label="Filtrar por item"
          value={target}
          onChange={(e) => update(() => setTarget(e.target.value as Target))}
        >
          {Object.entries(TARGET_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filtrar por tipo"
          value={type}
          onChange={(e) => update(() => setType(e.target.value as MovementType | ''))}
        >
          <option value="">Todos os tipos</option>
          {MOVEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {MOVEMENT_TYPE_LABELS[t]}
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
      <DataTable
        columns={columns}
        rows={movements.data?.items}
        rowKey={(m) => m.id}
        loading={movements.isFetching}
        empty={
          <EmptyState
            icon={History}
            title="Nenhuma movimentação encontrada"
            description="Entradas, saídas e ajustes aparecem aqui com data, quantidade e responsável."
          />
        }
      />
      {movements.data && (
        <Pagination
          page={movements.data.meta.page}
          totalPages={movements.data.meta.totalPages}
          totalItems={movements.data.meta.totalItems}
          pageSize={movements.data.meta.pageSize}
          onPageChange={setPage}
        />
      )}
    </Card>
  );
}
