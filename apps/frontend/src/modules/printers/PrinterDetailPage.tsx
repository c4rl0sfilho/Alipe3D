import type { MaintenanceEntry, PrinterSummary } from '@alipe3d/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Power, Printer, Trash2, Wrench } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { JobsHistory } from '@/modules/production/JobsTable';
import { toApiRequestError } from '@/services/api';
import { formatCurrency, formatDateOnly, formatHours } from '@/utils/format';
import { MaintenanceFormModal } from './MaintenanceFormModal';
import { PrinterFormModal, PrinterStatusModal } from './PrinterFormModal';
import { ActiveJobSummary, MaintenanceLine } from './PrintersPage';
import { maintenanceTypeLabel, printerActivityBadge } from './printer-ui';
import { maintenanceApi, printerKeys, printersApi } from './printers.api';

type TabId = 'jobs' | 'failures' | 'maintenance';

export function PrinterDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const canManage = can('printers:manage');
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>('jobs');
  const [editing, setEditing] = useState(false);
  const [changingStatus, setChangingStatus] = useState<PrinterSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const printer = useQuery({
    queryKey: printerKeys.detail(id),
    queryFn: () => printersApi.get(id),
    refetchInterval: 60_000,
  });
  const remove = useMutation({
    mutationFn: () => printersApi.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['printers'] });
      toast.success('Impressora excluída. O histórico foi preservado.');
      navigate('/impressoras', { replace: true });
    },
    onError: (error) => {
      toast.error(toApiRequestError(error).message);
      setDeleting(false);
    },
  });

  if (printer.isPending) return <Card className="h-64 animate-pulse bg-canvas" />;
  if (printer.error || !printer.data) {
    return (
      <EmptyState
        icon={Printer}
        title="Impressora não encontrada"
        description={printer.error ? toApiRequestError(printer.error).message : undefined}
        action={
          <Link to="/impressoras" className="text-sm font-medium text-brand-700">
            Voltar para impressoras
          </Link>
        }
      />
    );
  }
  const p = printer.data;

  return (
    <>
      <Link
        to="/impressoras"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Impressoras
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-xl font-semibold tracking-tight">{p.code}</h1>
            <StatusBadge {...printerActivityBadge(p.activity)} />
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {p.name ? `${p.name} · ` : ''}
            {p.model}
          </p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<Power className="size-4" />}
              onClick={() => setChangingStatus(p)}
            >
              Situação
            </Button>
            <Button
              variant="secondary"
              icon={<Pencil className="size-4" />}
              onClick={() => setEditing(true)}
            >
              Editar
            </Button>
            <Button
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              onClick={() => setDeleting(true)}
              aria-label="Excluir impressora"
            />
          </div>
        )}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card className="p-5">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Info label="Horas acumuladas">{formatHours(p.totalHours)}</Info>
            <Info label="Impressas pelo sistema">{formatHours(p.stats.printedHours)}</Info>
            <Info label="Número de série">{p.serialNumber ?? '—'}</Info>
            <Info label="Aquisição">{p.acquiredAt ? formatDateOnly(p.acquiredAt) : '—'}</Info>
            <Info label="Impressões">{p.stats.jobs}</Info>
            <Info label="Falhas">
              {p.stats.failedJobs}
              {p.stats.jobs > 0 && (
                <span className="text-ink-muted">
                  {' '}
                  ({Math.round((p.stats.failedJobs / p.stats.jobs) * 100)}%)
                </span>
              )}
            </Info>
          </dl>
          <MaintenanceLine printer={p} />
          {p.notes && <p className="mt-3 text-sm text-ink-muted">{p.notes}</p>}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-muted">Agora</h2>
          {p.activeJob ? (
            <>
              <ActiveJobSummary job={p.activeJob} />
              <Link
                to={`/producao/ordens/${p.activeJob.order.id}`}
                className="mt-3 inline-block text-sm font-medium text-brand-700"
              >
                Abrir a ordem para pausar ou finalizar
              </Link>
            </>
          ) : (
            <p className="text-sm text-ink-muted">
              Nenhuma impressão em andamento.{' '}
              {p.queuedOrders > 0 && (
                <Link to={`/producao?impressora=${p.id}`} className="font-medium text-brand-700">
                  Ver {p.queuedOrders} ordem(ns) na fila desta impressora
                </Link>
              )}
            </p>
          )}
        </Card>
      </div>

      <Tabs<TabId>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'jobs', label: 'Impressões' },
          { id: 'failures', label: 'Falhas' },
          { id: 'maintenance', label: 'Manutenções' },
        ]}
      />
      {tab === 'jobs' && (
        <Card>
          <JobsHistory
            filter={{ printerId: id }}
            showPrinter={false}
            emptyTitle="Nenhuma impressão registrada"
            emptyDescription="As impressões aparecem aqui quando são iniciadas pela produção."
          />
        </Card>
      )}
      {tab === 'failures' && (
        <Card>
          <JobsHistory
            filter={{ printerId: id, status: 'FAILED' }}
            showPrinter={false}
            emptyTitle="Nenhuma falha registrada"
          />
        </Card>
      )}
      {tab === 'maintenance' && <MaintenancePanel printer={p} canManage={canManage} />}

      <PrinterFormModal open={editing} printer={p} onClose={() => setEditing(false)} />
      <PrinterStatusModal printer={changingStatus} onClose={() => setChangingStatus(null)} />
      <ConfirmDialog
        open={deleting}
        title="Excluir impressora"
        message={
          <>
            <strong className="text-ink">{p.code}</strong> sai das listas e não recebe novas
            impressões. O histórico de impressões e manutenções é preservado e a identificação não
            poderá ser reutilizada.
          </>
        }
        confirmLabel="Excluir"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

function MaintenancePanel({ printer, canManage }: { printer: PrinterSummary; canManage: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ open: boolean; entry: MaintenanceEntry | null }>({
    open: false,
    entry: null,
  });
  const [toDelete, setToDelete] = useState<MaintenanceEntry | null>(null);
  const query = { printerId: printer.id, page, pageSize: 20 };
  const entries = useQuery({
    queryKey: printerKeys.maintenance(query),
    queryFn: () => maintenanceApi.list(query),
    placeholderData: keepPreviousData,
  });
  const remove = useMutation({
    mutationFn: (entry: MaintenanceEntry) => maintenanceApi.remove(entry.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['printers'] });
      await queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Manutenção excluída.');
      setToDelete(null);
    },
    onError: (error) => {
      toast.error(toApiRequestError(error).message);
      setToDelete(null);
    },
  });

  const columns: Column<MaintenanceEntry>[] = [
    {
      key: 'date',
      header: 'Data',
      cell: (m) => <span className="whitespace-nowrap">{formatDateOnly(m.performedAt)}</span>,
    },
    {
      key: 'what',
      header: 'Manutenção',
      cell: (m) => (
        <div>
          <p className="text-sm font-medium">{maintenanceTypeLabel(m.type)}</p>
          <p className="text-xs text-ink-muted">{m.description}</p>
          {m.partsReplaced && <p className="text-xs text-ink-muted">Peças: {m.partsReplaced}</p>}
        </div>
      ),
    },
    {
      key: 'who',
      header: 'Responsável',
      cell: (m) => <span className="text-sm">{m.responsibleName}</span>,
      hideOnMobile: true,
    },
    {
      key: 'cost',
      header: 'Custo',
      cell: (m) => <span className="whitespace-nowrap">{formatCurrency(m.cost)}</span>,
      hideOnMobile: true,
    },
    {
      key: 'next',
      header: 'Próxima',
      cell: (m) => (
        <span className="text-sm whitespace-nowrap">
          {m.nextMaintenanceAt ? formatDateOnly(m.nextMaintenanceAt) : '—'}
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
      cell: (m) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Editar manutenção"
            icon={<Pencil className="size-4" />}
            onClick={() => setForm({ open: true, entry: m })}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label="Excluir manutenção"
            icon={<Trash2 className="size-4" />}
            onClick={() => setToDelete(m)}
          />
        </div>
      ),
    });
  }

  return (
    <Card>
      {canManage && (
        <div className="flex justify-end border-b border-line p-4">
          <Button
            icon={<Plus className="size-4" />}
            onClick={() => setForm({ open: true, entry: null })}
          >
            Registrar manutenção
          </Button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={entries.data?.items}
        rowKey={(m) => m.id}
        loading={entries.isFetching}
        empty={
          <EmptyState
            icon={Wrench}
            title="Nenhuma manutenção registrada"
            description="Registre limpezas, trocas de peças e calibrações para manter o histórico do equipamento."
          />
        }
      />
      {entries.data && (
        <Pagination
          page={entries.data.meta.page}
          totalPages={entries.data.meta.totalPages}
          totalItems={entries.data.meta.totalItems}
          pageSize={entries.data.meta.pageSize}
          onPageChange={setPage}
        />
      )}
      <MaintenanceFormModal
        open={form.open}
        printerId={printer.id}
        printerCode={printer.code}
        entry={form.entry}
        onClose={() => setForm({ open: false, entry: null })}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Excluir manutenção"
        message="O registro sai do histórico da impressora. A exclusão fica na auditoria."
        confirmLabel="Excluir"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </Card>
  );
}
