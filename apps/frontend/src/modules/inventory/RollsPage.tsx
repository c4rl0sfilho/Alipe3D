import {
  ROLL_STATUS_LABELS,
  ROLL_STATUSES,
  type ListRollsQuery,
  type RollSummary,
} from '@alipe3d/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Cylinder, Pencil, Plus, Scale } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ColorSwatch } from '@/components/ui/ColorSwatch';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Field';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cn } from '@/utils/cn';
import { formatDateOnly, formatGrams, formatUnitCost } from '@/utils/format';
import { inventoryKeys, materialsApi } from './inventory.api';
import { rollStatusBadge } from './inventory-ui';
import { MovementModal, type MovementTarget } from './MovementModal';
import { EditRollModal, RollFormModal } from './RollFormModal';
import { WeighRollModal } from './WeighRollModal';

type StatusFilter = ListRollsQuery['status'];

export function RollsPage() {
  const { can } = useAuth();
  const canEdit = can('inventory:manage');
  const [params, setParams] = useSearchParams();
  const materialId = params.get('material') ?? '';
  const [status, setStatus] = useState<StatusFilter>('available');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search);
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<MovementTarget | null>(null);
  const [weighing, setWeighing] = useState<RollSummary | null>(null);
  const [editing, setEditing] = useState<RollSummary | null>(null);

  const query: ListRollsQuery = { materialId, status, search: debounced, page, pageSize: 20 };
  const rolls = useQuery({
    queryKey: inventoryKeys.rolls(query),
    queryFn: () => materialsApi.listRolls(query),
    placeholderData: keepPreviousData,
  });
  const materials = useQuery({ queryKey: inventoryKeys.materials, queryFn: materialsApi.list });

  const columns: Column<RollSummary>[] = [
    {
      key: 'roll',
      header: 'Rolo',
      cell: (r) => (
        <div className="flex items-center gap-3">
          <ColorSwatch hex={r.material.colorHex} className="size-5" />
          <div>
            <p className="font-mono text-sm font-semibold whitespace-nowrap">{r.code}</p>
            <p className="text-xs text-ink-muted">{r.material.name}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'remaining',
      header: 'Saldo',
      cell: (r) => {
        const percent = Math.max(
          0,
          Math.min(100, (Number(r.remainingWeightGrams) / Number(r.initialWeightGrams)) * 100),
        );
        return (
          <div className="w-36">
            <div className="flex justify-between text-xs">
              <span
                className={cn(
                  'font-medium tabular-nums',
                  r.isLow && 'text-warning',
                  Number(r.remainingWeightGrams) < 0 && 'text-danger',
                )}
              >
                {formatGrams(r.remainingWeightGrams)}
              </span>
              <span className="text-ink-muted">{Math.round(percent)}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
              <div
                className={cn('h-full rounded-full', r.isLow ? 'bg-warning' : 'bg-brand-500')}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'cost',
      header: 'Custo',
      cell: (r) => <span className="whitespace-nowrap">{formatUnitCost(r.costPerGram)}/g</span>,
      hideOnMobile: true,
    },
    {
      key: 'origin',
      header: 'Entrada',
      cell: (r) => (
        <div className="text-xs">
          <p>{formatDateOnly(r.purchasedAt)}</p>
          <p className="text-ink-muted">{r.supplier?.name ?? 'Fornecedor não informado'}</p>
        </div>
      ),
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Situação',
      cell: (r) => <StatusBadge {...rollStatusBadge(r.status)} />,
    },
  ];
  if (canEdit) {
    columns.push({
      key: 'actions',
      header: 'Ações',
      className: 'text-right',
      cell: (r) =>
        r.status === 'DISCARDED' ? null : (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              title="Registrar movimentação"
              aria-label={`Movimentar ${r.code}`}
              onClick={() =>
                setMoving({
                  kind: 'ROLL',
                  id: r.id,
                  label: `${r.code} · ${r.material.name}`,
                  unit: 'g',
                  balance: r.remainingWeightGrams,
                })
              }
              icon={<ArrowLeftRight className="size-4" />}
            />
            <Button
              variant="ghost"
              size="sm"
              title="Pesar e conferir"
              aria-label={`Pesar ${r.code}`}
              onClick={() => setWeighing(r)}
              icon={<Scale className="size-4" />}
            />
            <Button
              variant="ghost"
              size="sm"
              title="Editar"
              aria-label={`Editar ${r.code}`}
              onClick={() => setEditing(r)}
              icon={<Pencil className="size-4" />}
            />
          </div>
        ),
    });
  }

  return (
    <>
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar por código, lote ou filamento"
          />
          <Select
            aria-label="Filtrar por filamento"
            value={materialId}
            onChange={(e) => {
              setParams(e.target.value ? { material: e.target.value } : {});
              setPage(1);
            }}
            className="lg:w-60"
          >
            <option value="">Todos os filamentos</option>
            {materials.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filtrar por situação"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter);
              setPage(1);
            }}
            className="lg:w-48"
          >
            <option value="available">Com saldo</option>
            {ROLL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ROLL_STATUS_LABELS[s]}
              </option>
            ))}
            <option value="all">Todos</option>
          </Select>
          {canEdit && (
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Cadastrar rolos
            </Button>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={rolls.data?.items}
          rowKey={(r) => r.id}
          loading={rolls.isFetching}
          empty={
            <EmptyState
              icon={Cylinder}
              title="Nenhum rolo encontrado"
              description="Cadastre os rolos comprados para controlar o filamento em gramas."
            />
          }
        />
        {rolls.data && (
          <Pagination
            page={rolls.data.meta.page}
            totalPages={rolls.data.meta.totalPages}
            totalItems={rolls.data.meta.totalItems}
            pageSize={rolls.data.meta.pageSize}
            onPageChange={setPage}
          />
        )}
      </Card>

      <RollFormModal
        open={creating}
        materialId={materialId || undefined}
        onClose={() => setCreating(false)}
      />
      <MovementModal target={moving} onClose={() => setMoving(null)} />
      <WeighRollModal roll={weighing} onClose={() => setWeighing(null)} />
      <EditRollModal roll={editing} onClose={() => setEditing(null)} />
    </>
  );
}
