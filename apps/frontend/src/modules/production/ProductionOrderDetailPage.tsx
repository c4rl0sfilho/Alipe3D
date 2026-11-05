import {
  PRODUCTION_PRIORITY_LABELS,
  type PrintJobEntry,
  type ProductionOrderDetail,
} from '@alipe3d/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CircleCheck,
  CircleStop,
  ClipboardCheck,
  ClipboardList,
  OctagonX,
  Pause,
  Pencil,
  Play,
  SearchCheck,
  XCircle,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ColorSwatch } from '@/components/ui/ColorSwatch';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { useNow } from '@/hooks/use-now';
import { printerLabel } from '@/modules/printers/printer-ui';
import { toApiRequestError } from '@/services/api';
import { cn } from '@/utils/cn';
import {
  elapsedSeconds,
  formatDateOnly,
  formatDateTimeShort,
  formatDuration,
  formatGrams,
  formatMinutes,
  formatNumber,
} from '@/utils/format';
import { FinishJobModal, type FinishMode, type FinishTarget } from './FinishJobModal';
import { InspectionModal, ReasonModal } from './InspectionModal';
import { jobColumns } from './job-columns';
import { productionApi, productionKeys, useInvalidateProduction } from './production.api';
import {
  DUE_LABELS,
  DUE_TONES,
  orderProductLabel,
  orderStatusBadge,
  PRIORITY_CLASSES,
} from './production-ui';
import { ProductionOrderFormModal } from './ProductionOrderFormModal';
import { StartJobModal } from './StartJobModal';

type ReasonAction = 'cancel' | 'close';

export function ProductionOrderDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const canManage = can('production:manage');
  const toast = useToast();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateProduction();
  const [editing, setEditing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState<FinishTarget | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [reason, setReason] = useState<ReasonAction | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);

  const order = useQuery({
    queryKey: productionKeys.order(id),
    queryFn: () => productionApi.getOrder(id),
    refetchInterval: 60_000,
  });

  const onSaved = async (saved: ProductionOrderDetail, message: string) => {
    queryClient.setQueryData(productionKeys.order(id), saved);
    await invalidate();
    toast.success(message);
  };
  const jobAction = useMutation({
    mutationFn: ({ jobId, action }: { jobId: string; action: 'pause' | 'resume' }) =>
      action === 'pause' ? productionApi.pauseJob(jobId) : productionApi.resumeJob(jobId),
    onSuccess: async (_, { action }) => {
      await invalidate();
      toast.success(action === 'pause' ? 'Impressão pausada.' : 'Impressão retomada.');
    },
    onError: (error) => toast.error(toApiRequestError(error).message),
  });
  const startInspection = useMutation({
    mutationFn: () => productionApi.startInspection(id),
    onSuccess: (saved) => onSaved(saved, 'Ordem em inspeção.'),
    onError: (error) => toast.error(toApiRequestError(error).message),
  });
  const reasonAction = useMutation({
    mutationFn: ({ action, text }: { action: ReasonAction; text: string }) =>
      action === 'cancel'
        ? productionApi.cancelOrder(id, { reason: text })
        : productionApi.closeOrder(id, { reason: text }),
    onSuccess: async (saved, { action }) => {
      await onSaved(saved, action === 'cancel' ? 'Ordem cancelada.' : 'Produção encerrada.');
      setReason(null);
    },
    onError: (error) => setReasonError(toApiRequestError(error).message),
  });

  if (order.isPending) return <Card className="h-64 animate-pulse bg-canvas" />;
  if (order.error || !order.data) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Ordem não encontrada"
        description={order.error ? toApiRequestError(order.error).message : undefined}
        action={
          <Link to="/producao" className="text-sm font-medium text-brand-700">
            Voltar para a fila
          </Link>
        }
      />
    );
  }
  const o = order.data;
  const activeJob = o.jobs.find((j) => j.status === 'IN_PROGRESS' || j.status === 'PAUSED');
  const inQueue = o.status === 'PENDING' || o.status === 'PLANNED';
  const finishTarget = (job: PrintJobEntry, mode: FinishMode): FinishTarget => ({
    jobId: job.id,
    orderCode: o.code,
    plannedQuantity: job.plannedQuantity,
    estimatedGrams: job.estimatedGrams,
    startedAt: job.startedAt,
    pausedAt: job.pausedAt,
    pausedSeconds: job.pausedSeconds,
    roll: { id: job.roll.id, code: job.roll.code, materialName: job.roll.materialName },
    mode,
  });

  const actions: ReactNode[] = [];
  if (canManage) {
    if (activeJob) {
      actions.push(
        activeJob.status === 'IN_PROGRESS' ? (
          <Button
            key="pause"
            variant="secondary"
            icon={<Pause className="size-4" />}
            loading={jobAction.isPending}
            onClick={() => jobAction.mutate({ jobId: activeJob.id, action: 'pause' })}
          >
            Pausar
          </Button>
        ) : (
          <Button
            key="resume"
            variant="secondary"
            icon={<Play className="size-4" />}
            loading={jobAction.isPending}
            onClick={() => jobAction.mutate({ jobId: activeJob.id, action: 'resume' })}
          >
            Retomar
          </Button>
        ),
        <Button
          key="fail"
          variant="secondary"
          icon={<OctagonX className="size-4" />}
          onClick={() => setFinishing(finishTarget(activeJob, 'FAILED'))}
        >
          Registrar falha
        </Button>,
        <Button
          key="finish"
          icon={<CircleCheck className="size-4" />}
          onClick={() => setFinishing(finishTarget(activeJob, 'SUCCESS'))}
        >
          Finalizar impressão
        </Button>,
      );
    }
    if (inQueue) {
      if (o.producedQuantity === 0) {
        actions.push(
          <Button
            key="cancel"
            variant="ghost"
            icon={<XCircle className="size-4" />}
            onClick={() => {
              setReasonError(null);
              setReason('cancel');
            }}
          >
            Cancelar ordem
          </Button>,
        );
      } else {
        actions.push(
          <Button
            key="close"
            variant="ghost"
            icon={<CircleStop className="size-4" />}
            onClick={() => {
              setReasonError(null);
              setReason('close');
            }}
          >
            Encerrar produção
          </Button>,
        );
      }
      actions.push(
        <Button
          key="edit"
          variant="secondary"
          icon={<Pencil className="size-4" />}
          onClick={() => setEditing(true)}
        >
          Editar
        </Button>,
        <Button key="start" icon={<Play className="size-4" />} onClick={() => setStarting(true)}>
          Iniciar impressão
        </Button>,
      );
    }
    if (o.status === 'COMPLETED') {
      actions.push(
        <Button
          key="start-inspection"
          variant="secondary"
          icon={<SearchCheck className="size-4" />}
          loading={startInspection.isPending}
          onClick={() => startInspection.mutate()}
        >
          Marcar em inspeção
        </Button>,
      );
    }
    if (o.pendingInspection > 0 && !['APPROVED', 'FAILED', 'CANCELLED'].includes(o.status)) {
      actions.push(
        <Button
          key="inspect"
          variant={o.status === 'COMPLETED' || o.status === 'INSPECTION' ? 'primary' : 'secondary'}
          icon={<ClipboardCheck className="size-4" />}
          onClick={() => setInspecting(true)}
        >
          Registrar inspeção
        </Button>,
      );
    }
  }

  return (
    <>
      <Link
        to="/producao"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Produção
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-xl font-semibold tracking-tight">{o.code}</h1>
            <StatusBadge {...orderStatusBadge(o.status)} />
            {o.dueState && o.dueState !== 'ok' && (
              <StatusBadge tone={DUE_TONES[o.dueState]} label={DUE_LABELS[o.dueState]} />
            )}
          </div>
          <p className="mt-1 text-sm">
            <Link to={`/produtos/${o.product.id}`} className="font-medium hover:text-brand-700">
              {orderProductLabel(o)}
            </Link>
            <span className="text-ink-muted"> · {o.variant.sku}</span>
          </p>
        </div>
        {actions.length > 0 && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>

      {o.cancelReason && (
        <div className="mb-4">
          <Alert tone="info">
            {o.status === 'CANCELLED' ? 'Cancelada' : 'Produção encerrada'}: {o.cancelReason}
          </Alert>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Counter label="Planejadas" value={o.quantity} />
        <Counter label="Impressas" value={o.producedQuantity} />
        <Counter label="Aprovadas" value={o.approvedQuantity} tone="success" />
        <Counter
          label="Reprovadas"
          value={o.rejectedQuantity}
          tone={o.rejectedQuantity > 0 ? 'danger' : undefined}
        />
        <Counter
          label={o.pendingInspection > 0 ? 'Para inspecionar' : 'Faltam imprimir'}
          value={o.pendingInspection > 0 ? o.pendingInspection : o.remainingToPrint}
          tone={o.pendingInspection > 0 ? 'warning' : undefined}
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className="p-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Info label="Filamento">
              {o.material ? (
                <span className="flex items-center gap-2">
                  <ColorSwatch hex={o.material.colorHex} className="size-4" />
                  {o.material.name} · {o.material.color}
                </span>
              ) : (
                'Definido ao iniciar a impressão'
              )}
            </Info>
            <Info label="Impressora">{o.printer ? printerLabel(o.printer) : 'Sem impressora'}</Info>
            <Info label="Estimativa da ordem">
              {formatGrams(o.estimatedWeightGrams)} · {formatMinutes(o.estimatedMinutes)}
            </Info>
            <Info label="Por peça">
              {formatGrams(o.unitWeightGrams)} · {formatMinutes(o.unitMinutes)}
            </Info>
            <Info label="Prazo">{o.dueDate ? formatDateOnly(o.dueDate) : 'Sem prazo'}</Info>
            <Info label="Prioridade">
              <span className={PRIORITY_CLASSES[o.priority]}>
                {PRODUCTION_PRIORITY_LABELS[o.priority]}
              </span>
            </Info>
            <Info label="Responsável">{o.responsible.name}</Info>
            <Info label="Criada em">
              {formatDateTimeShort(o.createdAt)} por {o.createdBy.name}
            </Info>
            {o.waivedQuantity > 0 && (
              <Info label="Dispensadas">{o.waivedQuantity} peça(s) não serão refeitas</Info>
            )}
            {o.closedAt && <Info label="Encerrada em">{formatDateTimeShort(o.closedAt)}</Info>}
          </dl>
          {o.notes && <p className="mt-4 text-sm whitespace-pre-line text-ink-muted">{o.notes}</p>}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-muted">Impressão atual</h2>
          {activeJob ? (
            <ActiveJob job={activeJob} />
          ) : (
            <p className="text-sm text-ink-muted">
              {inQueue
                ? 'Nenhuma impressão em andamento. Use "Iniciar impressão" quando a mesa estiver pronta.'
                : 'Nenhuma impressão em andamento.'}
            </p>
          )}
          {o.supplies.length > 0 && (
            <p className="mt-4 border-t border-line pt-3 text-xs text-ink-muted">
              Insumos baixados quando as peças são aprovadas:{' '}
              {o.supplies
                .map((s) => `${s.name} (${formatNumber(s.quantityPerUnit, 3)} por peça)`)
                .join(', ')}
            </p>
          )}
        </Card>
      </div>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">Impressões</h2>
        <Card>
          <DataTable
            columns={jobColumns({ showOrder: false })}
            rows={o.jobs}
            rowKey={(j) => j.id}
            empty={
              <EmptyState
                icon={Play}
                title="Nenhuma impressão ainda"
                description="Cada impressão registra impressora, rolo, tempo e o filamento consumido."
              />
            }
          />
        </Card>
      </section>

      {o.inspections.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink-muted">Inspeções</h2>
          <Card>
            <ul className="divide-y divide-line">
              {o.inspections.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className="text-sm font-medium text-success">
                    {i.approvedQuantity} aprovada(s)
                  </span>
                  {i.rejectedQuantity > 0 && (
                    <span className="text-sm font-medium text-danger">
                      {i.rejectedQuantity} reprovada(s)
                    </span>
                  )}
                  <span className="text-xs text-ink-muted">
                    {formatDateTimeShort(i.inspectedAt)} · {i.inspectedBy.name}
                  </span>
                  {i.notes && <span className="w-full text-sm text-ink-muted">{i.notes}</span>}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <ProductionOrderFormModal open={editing} order={o} onClose={() => setEditing(false)} />
      <StartJobModal order={starting ? o : null} onClose={() => setStarting(false)} />
      <FinishJobModal target={finishing} onClose={() => setFinishing(null)} />
      <InspectionModal order={inspecting ? o : null} onClose={() => setInspecting(false)} />
      <ReasonModal
        open={reason !== null}
        title={reason === 'cancel' ? 'Cancelar ordem' : 'Encerrar produção'}
        description={
          reason === 'cancel'
            ? 'A ordem sai da fila. Nada foi impresso, então o estoque não muda.'
            : `As ${o.remainingToPrint} peça(s) que faltam serão dispensadas. As já impressas seguem para inspeção.`
        }
        submitLabel={reason === 'cancel' ? 'Cancelar ordem' : 'Encerrar'}
        loading={reasonAction.isPending}
        error={reasonError}
        onSubmit={(text) => reason && reasonAction.mutate({ action: reason, text })}
        onClose={() => setReason(null)}
      />
    </>
  );
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'warning' | 'danger' | undefined;
}) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
          tone === 'danger' && 'text-danger',
        )}
      >
        {value}
      </p>
    </Card>
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

function ActiveJob({ job }: { job: PrintJobEntry }) {
  const now = useNow();
  const reference = job.pausedAt ? new Date(job.pausedAt).getTime() : now;
  const elapsed = elapsedSeconds(job.startedAt, reference, job.pausedSeconds);
  const estimated = job.estimatedMinutes * 60;
  const percent = estimated > 0 ? Math.min(100, (elapsed / estimated) * 100) : 0;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{printerLabel(job.printer)}</span>
        <StatusBadge
          tone={job.status === 'PAUSED' ? 'warning' : 'success'}
          label={job.status === 'PAUSED' ? 'Pausada' : 'Imprimindo'}
        />
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
        <div
          className={cn(
            'h-full rounded-full',
            job.status === 'PAUSED' ? 'bg-warning' : 'bg-success',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-ink-muted">
        {formatDuration(elapsed)} de {estimated > 0 ? formatDuration(estimated) : '—'} · início{' '}
        {formatDateTimeShort(job.startedAt)}
      </p>
      <p className="flex items-center gap-2 text-xs text-ink-muted">
        <ColorSwatch hex={job.roll.colorHex} className="size-3" />
        {job.roll.code} · {job.roll.materialName} · {job.plannedQuantity} peça(s) · ~
        {formatGrams(job.estimatedGrams)}
      </p>
    </div>
  );
}
