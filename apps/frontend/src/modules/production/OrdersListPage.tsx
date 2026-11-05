import {
  PRODUCTION_PRIORITIES,
  PRODUCTION_PRIORITY_LABELS,
  PRODUCTION_STATUS_LABELS,
  PRODUCTION_STATUSES,
  type ListProductionOrdersQuery,
  type ProductionOrderSummary,
  type ProductionPriority,
  type ProductionStatus,
} from '@alipe3d/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, Play } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ColorSwatch } from '@/components/ui/ColorSwatch';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Field';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { inventoryKeys, materialsApi } from '@/modules/inventory/inventory.api';
import { printerLabel } from '@/modules/printers/printer-ui';
import { printerKeys, printersApi } from '@/modules/printers/printers.api';
import { cn } from '@/utils/cn';
import { formatDateOnly, formatGrams, formatMinutes } from '@/utils/format';
import { productionApi, productionKeys } from './production.api';
import {
  DUE_LABELS,
  DUE_TONES,
  orderProductLabel,
  orderStatusBadge,
  PRIORITY_CLASSES,
} from './production-ui';
import { StartJobModal } from './StartJobModal';

type View = 'queue' | 'inspection' | 'all';

const EMPTY: Record<View, { title: string; description: string }> = {
  queue: {
    title: 'Fila vazia',
    description: 'Crie uma ordem de produção para planejar o que será impresso.',
  },
  inspection: {
    title: 'Nada aguardando inspeção',
    description: 'As ordens aparecem aqui quando a impressão termina.',
  },
  all: { title: 'Nenhuma ordem encontrada', description: 'Ajuste os filtros ou crie uma ordem.' },
};

/** Fila de produção, ordens aguardando inspeção ou todas as ordens. */
export function OrdersListPage({ view }: { view: View }) {
  const { can } = useAuth();
  const canManage = can('production:manage');
  const [params, setParams] = useSearchParams();
  const printerId = params.get('impressora') ?? '';
  const [search, setSearch] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [priority, setPriority] = useState<ProductionPriority | ''>('');
  const [status, setStatus] = useState<ProductionStatus | ''>('');
  const [grouped, setGrouped] = useState(false);
  const [page, setPage] = useState(1);
  const [starting, setStarting] = useState<ProductionOrderSummary | null>(null);
  const debounced = useDebouncedValue(search);

  const query: ListProductionOrdersQuery = {
    view,
    search: debounced,
    materialId,
    printerId,
    priority,
    status,
    page,
    pageSize: 50,
  };
  const orders = useQuery({
    queryKey: productionKeys.orders(query),
    queryFn: () => productionApi.listOrders(query),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const printers = useQuery({ queryKey: printerKeys.list, queryFn: printersApi.list });
  const materials = useQuery({ queryKey: inventoryKeys.materials, queryFn: materialsApi.list });
  const resetPage = () => setPage(1);

  const columns: Column<ProductionOrderSummary>[] = [
    {
      key: 'code',
      header: 'Ordem',
      cell: (o) => (
        <Link to={`/producao/ordens/${o.id}`} className="group block">
          <p className="font-mono text-sm font-semibold whitespace-nowrap group-hover:text-brand-700">
            {o.code}
          </p>
          <p className={cn('text-xs', PRIORITY_CLASSES[o.priority])}>
            {PRODUCTION_PRIORITY_LABELS[o.priority]}
          </p>
        </Link>
      ),
    },
    {
      key: 'product',
      header: 'Produto',
      cell: (o) => (
        <div className="min-w-40">
          <p className="text-sm font-medium">{orderProductLabel(o)}</p>
          <p className="text-xs text-ink-muted">
            {o.quantity} peça(s)
            {o.producedQuantity > 0 && ` · ${o.producedQuantity} impressa(s)`}
            {o.remainingToPrint > 0 &&
              o.remainingToPrint < o.quantity &&
              ` · faltam ${o.remainingToPrint}`}
            {o.failedJobs > 0 && <span className="text-danger"> · {o.failedJobs} falha(s)</span>}
          </p>
        </div>
      ),
    },
    {
      key: 'material',
      header: 'Filamento',
      cell: (o) =>
        o.material ? (
          <div className="flex items-center gap-2">
            <ColorSwatch hex={o.material.colorHex} className="size-4" />
            <div className="text-xs">
              <p className="text-sm whitespace-nowrap">
                {o.material.type} · {o.material.color}
              </p>
              <p className="text-ink-muted">
                {formatGrams(o.estimatedWeightGrams)} · {formatMinutes(o.estimatedMinutes)}
              </p>
            </div>
          </div>
        ) : (
          <span className="text-xs text-ink-muted">A definir</span>
        ),
      hideOnMobile: true,
    },
    {
      key: 'printer',
      header: 'Impressora',
      cell: (o) => (
        <span className={cn('text-sm whitespace-nowrap', !o.printer && 'text-ink-muted')}>
          {o.printer ? printerLabel(o.printer) : 'Sem impressora'}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'due',
      header: 'Prazo',
      cell: (o) =>
        o.dueDate ? (
          <div className="space-y-1">
            <p className="text-sm whitespace-nowrap">{formatDateOnly(o.dueDate)}</p>
            {o.dueState && o.dueState !== 'ok' && (
              <StatusBadge tone={DUE_TONES[o.dueState]} label={DUE_LABELS[o.dueState]} />
            )}
          </div>
        ) : (
          <span className="text-xs text-ink-muted">Sem prazo</span>
        ),
    },
    {
      key: 'status',
      header: 'Situação',
      cell: (o) => (
        <div className="space-y-1">
          <StatusBadge {...orderStatusBadge(o.status)} />
          {o.pendingInspection > 0 && view !== 'inspection' && (
            <p className="text-xs text-warning">{o.pendingInspection} p/ inspecionar</p>
          )}
        </div>
      ),
    },
  ];
  if (canManage && view === 'queue') {
    columns.push({
      key: 'actions',
      header: 'Ações',
      className: 'text-right',
      cell: (o) =>
        o.status === 'PENDING' || o.status === 'PLANNED' ? (
          <Button
            variant="secondary"
            size="sm"
            icon={<Play className="size-4" />}
            onClick={() => setStarting(o)}
          >
            Iniciar
          </Button>
        ) : (
          <Link
            to={`/producao/ordens/${o.id}`}
            className="text-sm font-medium whitespace-nowrap text-brand-700"
          >
            Acompanhar
          </Link>
        ),
    });
  }

  const rows = orders.data?.items;
  const empty = <EmptyState icon={ClipboardList} {...EMPTY[view]} />;

  return (
    <>
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:flex-wrap">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              resetPage();
            }}
            placeholder="Buscar por código, produto ou SKU"
          />
          <Select
            aria-label="Filtrar por impressora"
            value={printerId}
            onChange={(e) => {
              setParams(e.target.value ? { impressora: e.target.value } : {});
              resetPage();
            }}
            className="lg:w-52"
          >
            <option value="">Todas as impressoras</option>
            <option value="none">Sem impressora</option>
            {printers.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {printerLabel(p)}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filtrar por filamento"
            value={materialId}
            onChange={(e) => {
              setMaterialId(e.target.value);
              resetPage();
            }}
            className="lg:w-52"
          >
            <option value="">Todos os filamentos</option>
            {materials.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.color}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filtrar por prioridade"
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value as ProductionPriority | '');
              resetPage();
            }}
            className="lg:w-40"
          >
            <option value="">Prioridade</option>
            {PRODUCTION_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRODUCTION_PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
          {view === 'all' && (
            <Select
              aria-label="Filtrar por situação"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as ProductionStatus | '');
                resetPage();
              }}
              className="lg:w-48"
            >
              <option value="">Todas as situações</option>
              {PRODUCTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PRODUCTION_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
          {view === 'queue' && (
            <Checkbox
              id="group-material"
              className="lg:ml-auto lg:self-center"
              label="Agrupar por filamento"
              checked={grouped}
              onChange={(e) => setGrouped(e.target.checked)}
            />
          )}
        </div>

        {grouped && rows?.length ? (
          <GroupedByMaterial
            rows={rows}
            render={(groupRows) => (
              <DataTable columns={columns} rows={groupRows} rowKey={(o) => o.id} empty={empty} />
            )}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(o) => o.id}
            loading={orders.isFetching}
            empty={empty}
          />
        )}
        {orders.data && (
          <Pagination
            page={orders.data.meta.page}
            totalPages={orders.data.meta.totalPages}
            totalItems={orders.data.meta.totalItems}
            pageSize={orders.data.meta.pageSize}
            onPageChange={setPage}
          />
        )}
      </Card>
      <StartJobModal order={starting} onClose={() => setStarting(null)} />
    </>
  );
}

/**
 * Agrupa ordens compatíveis (mesmo filamento): imprimi-las em sequência evita troca de rolo.
 * A ordem da fila (prioridade e prazo) é mantida dentro de cada grupo.
 */
function GroupedByMaterial({
  rows,
  render,
}: {
  rows: ProductionOrderSummary[];
  render: (rows: ProductionOrderSummary[]) => ReactNode;
}) {
  const groups = new Map<string, ProductionOrderSummary[]>();
  for (const row of rows) {
    const key = row.material?.id ?? 'none';
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return (
    <div className="divide-y divide-line">
      {[...groups.entries()].map(([key, group]) => {
        const material = group[0]?.material;
        const grams = group.reduce((sum, o) => sum + Number(o.estimatedWeightGrams), 0);
        const minutes = group.reduce((sum, o) => sum + o.estimatedMinutes, 0);
        return (
          <section key={key}>
            <header className="flex flex-wrap items-center gap-2 bg-canvas/60 px-4 py-2.5 text-sm">
              <ColorSwatch hex={material?.colorHex ?? null} className="size-4" />
              <span className="font-medium">
                {material ? `${material.name} · ${material.color}` : 'Filamento a definir'}
              </span>
              <span className="text-xs text-ink-muted">
                {group.length} ordem(ns) · {formatGrams(grams)} · {formatMinutes(minutes)}
              </span>
            </header>
            {render(group)}
          </section>
        );
      })}
    </div>
  );
}
