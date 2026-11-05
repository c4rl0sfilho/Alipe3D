import type { PrinterActiveJob, PrinterSummary } from '@alipe3d/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Plus, Printer, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ColorSwatch } from '@/components/ui/ColorSwatch';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { useNow } from '@/hooks/use-now';
import { cn } from '@/utils/cn';
import { elapsedSeconds, formatDateOnly, formatDuration, formatHours } from '@/utils/format';
import { PrinterFormModal } from './PrinterFormModal';
import { printerActivityBadge } from './printer-ui';
import { printerKeys, printersApi } from './printers.api';

export function PrintersPage() {
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);
  const printers = useQuery({
    queryKey: printerKeys.list,
    queryFn: printersApi.list,
    refetchInterval: 60_000,
  });

  return (
    <>
      <PageHeader
        title="Impressoras"
        description="Situação de cada máquina, impressão em andamento, horas de uso e manutenção."
        actions={
          can('printers:manage') && (
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Cadastrar impressora
            </Button>
          )
        }
      />
      {printers.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="h-56 animate-pulse bg-canvas" />
          <Card className="h-56 animate-pulse bg-canvas" />
        </div>
      ) : printers.data?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {printers.data.map((printer) => (
            <PrinterCard key={printer.id} printer={printer} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={Printer}
            title="Nenhuma impressora cadastrada"
            description="Cadastre as impressoras para planejar a produção e acompanhar horas e manutenções."
          />
        </Card>
      )}
      <PrinterFormModal open={creating} printer={null} onClose={() => setCreating(false)} />
    </>
  );
}

function PrinterCard({ printer }: { printer: PrinterSummary }) {
  return (
    <Link to={`/impressoras/${printer.id}`} className="group">
      <Card className="flex h-full flex-col p-5 transition-colors group-hover:border-brand-300">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Printer className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-mono text-sm font-semibold">{printer.code}</p>
              <p className="text-xs text-ink-muted">
                {printer.name ? `${printer.name} · ` : ''}
                {printer.model}
              </p>
            </div>
          </div>
          <StatusBadge {...printerActivityBadge(printer.activity)} />
        </div>

        <div className="mt-4 flex-1">
          {printer.activeJob ? (
            <ActiveJobSummary job={printer.activeJob} />
          ) : (
            <p className="rounded-lg bg-canvas px-4 py-3 text-sm text-ink-muted">
              {printer.status === 'AVAILABLE'
                ? printer.queuedOrders > 0
                  ? `Livre · ${printer.queuedOrders} ordem(ns) planejada(s) para esta impressora`
                  : 'Livre · nenhuma ordem planejada'
                : printer.status === 'MAINTENANCE'
                  ? 'Em manutenção: não recebe novas impressões.'
                  : 'Inativa: fora de operação.'}
            </p>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-center">
          <div>
            <dt className="text-xs text-ink-muted">Horas</dt>
            <dd className="text-sm font-semibold tabular-nums">
              {formatHours(printer.totalHours)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Impressões</dt>
            <dd className="text-sm font-semibold tabular-nums">{printer.stats.jobs}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Falhas</dt>
            <dd
              className={cn(
                'text-sm font-semibold tabular-nums',
                printer.stats.failedJobs > 0 && 'text-danger',
              )}
            >
              {printer.stats.failedJobs}
            </dd>
          </div>
        </dl>
        <MaintenanceLine printer={printer} />
      </Card>
    </Link>
  );
}

export function MaintenanceLine({ printer }: { printer: PrinterSummary }) {
  const due = printer.maintenanceDue;
  return (
    <p
      className={cn(
        'mt-3 flex items-center gap-2 text-xs',
        due === 'overdue' ? 'text-danger' : due === 'soon' ? 'text-warning' : 'text-ink-muted',
      )}
    >
      {due ? (
        <CalendarClock className="size-3.5" aria-hidden="true" />
      ) : (
        <Wrench className="size-3.5" aria-hidden="true" />
      )}
      {printer.nextMaintenanceAt
        ? `${due === 'overdue' ? 'Manutenção atrasada' : 'Próxima manutenção'}: ${formatDateOnly(printer.nextMaintenanceAt)}`
        : printer.lastMaintenanceAt
          ? `Última manutenção: ${formatDateOnly(printer.lastMaintenanceAt)}`
          : 'Nenhuma manutenção registrada'}
    </p>
  );
}

/** Impressão em andamento com cronômetro e progresso estimado. */
export function ActiveJobSummary({ job }: { job: PrinterActiveJob }) {
  const now = useNow();
  // Pausada: o tempo para de correr no momento da pausa
  const reference = job.pausedAt ? new Date(job.pausedAt).getTime() : now;
  const elapsed = elapsedSeconds(job.startedAt, reference, job.pausedSeconds);
  const estimated = job.estimatedMinutes * 60;
  const percent = estimated > 0 ? Math.min(100, (elapsed / estimated) * 100) : 0;
  const overdue = estimated > 0 && elapsed > estimated;

  return (
    <div className="rounded-lg border border-line px-4 py-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0">
          <span className="font-mono font-semibold">{job.order.code}</span>{' '}
          <span className="text-ink-muted">
            · {job.order.productName}
            {job.order.variantLabel !== 'Padrão' && ` · ${job.order.variantLabel}`}
          </span>
        </span>
        <span className="shrink-0 text-xs text-ink-muted">{job.plannedQuantity} peça(s)</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas">
        <div
          className={cn(
            'h-full rounded-full',
            job.status === 'PAUSED' ? 'bg-warning' : overdue ? 'bg-danger' : 'bg-success',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-ink-muted">
        <span>
          {job.status === 'PAUSED' ? 'Pausada · ' : ''}
          {formatDuration(elapsed)} de {estimated > 0 ? formatDuration(estimated) : '—'}
          {overdue && job.status !== 'PAUSED' && (
            <span className="text-danger"> · passou da estimativa</span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <ColorSwatch hex={job.roll.colorHex} className="size-3" />
          {job.roll.code}
        </span>
      </div>
    </div>
  );
}
