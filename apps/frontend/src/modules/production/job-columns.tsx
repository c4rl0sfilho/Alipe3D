import { FAILURE_REASON_LABELS, type PrintJobEntry } from '@alipe3d/shared';
import { Link } from 'react-router-dom';
import { ColorSwatch } from '@/components/ui/ColorSwatch';
import type { Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { printerLabel } from '@/modules/printers/printer-ui';
import { formatCurrency, formatDateTimeShort, formatGrams, formatMinutes } from '@/utils/format';
import { jobStatusBadge } from './production-ui';

export interface JobColumnsOptions {
  showOrder?: boolean;
  showPrinter?: boolean;
}

/** Colunas do histórico de impressões (reutilizadas na ordem, na impressora e no histórico). */
export function jobColumns({
  showOrder = true,
  showPrinter = true,
}: JobColumnsOptions = {}): Column<PrintJobEntry>[] {
  const columns: Column<PrintJobEntry>[] = [
    {
      key: 'started',
      header: 'Início',
      cell: (j) => (
        <div className="text-xs whitespace-nowrap">
          <p className="text-sm">{formatDateTimeShort(j.startedAt)}</p>
          <p className="text-ink-muted">{j.startedBy.name}</p>
        </div>
      ),
    },
  ];
  if (showOrder) {
    columns.push({
      key: 'order',
      header: 'Ordem',
      cell: (j) => (
        <Link to={`/producao/ordens/${j.order.id}`} className="group block">
          <p className="font-mono text-sm font-semibold whitespace-nowrap group-hover:text-brand-700">
            {j.order.code}
          </p>
          <p className="text-xs text-ink-muted">
            {j.order.productName}
            {j.order.variantLabel !== 'Padrão' && ` · ${j.order.variantLabel}`}
          </p>
        </Link>
      ),
    });
  }
  if (showPrinter) {
    columns.push({
      key: 'printer',
      header: 'Impressora',
      cell: (j) => <span className="text-sm whitespace-nowrap">{printerLabel(j.printer)}</span>,
      hideOnMobile: true,
    });
  }
  columns.push(
    {
      key: 'material',
      header: 'Filamento',
      cell: (j) => {
        const grams = j.status === 'FAILED' ? j.wastedGrams : j.consumedGrams;
        return (
          <div className="flex items-center gap-2">
            <ColorSwatch hex={j.roll.colorHex} className="size-4" />
            <div className="text-xs">
              <p className="text-sm whitespace-nowrap">
                {j.finishedAt ? formatGrams(grams) : `~${formatGrams(j.estimatedGrams)}`}
                {j.status === 'FAILED' && Number(grams) > 0 && (
                  <span className="ml-1 text-danger">desperdício</span>
                )}
              </p>
              <p className="text-ink-muted">
                {j.consumption.length > 1
                  ? `${j.consumption.length} rolos`
                  : (j.consumption[0]?.rollCode ?? j.roll.code)}
                {Number(j.materialCost) > 0 && ` · ${formatCurrency(j.materialCost)}`}
              </p>
            </div>
          </div>
        );
      },
      hideOnMobile: true,
    },
    {
      key: 'pieces',
      header: 'Peças',
      cell: (j) => (
        <span className="text-sm tabular-nums">
          {j.finishedAt ? `${j.producedQuantity} de ${j.plannedQuantity}` : j.plannedQuantity}
        </span>
      ),
    },
    {
      key: 'duration',
      header: 'Duração',
      cell: (j) => (
        <span className="text-sm whitespace-nowrap">
          {j.durationMinutes !== null
            ? formatMinutes(j.durationMinutes)
            : `est. ${formatMinutes(j.estimatedMinutes)}`}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Resultado',
      cell: (j) => (
        <div className="space-y-1">
          <StatusBadge {...jobStatusBadge(j.status)} />
          {j.failureReason && (
            <p className="max-w-48 text-xs text-ink-muted">
              {FAILURE_REASON_LABELS[j.failureReason]}
              {j.lostMinutes ? ` · ${formatMinutes(j.lostMinutes)} perdidos` : ''}
              {j.needsReprint ? ' · refazer' : ''}
            </p>
          )}
        </div>
      ),
    },
  );
  return columns;
}
