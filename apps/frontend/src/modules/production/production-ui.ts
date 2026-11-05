import {
  PRINT_JOB_STATUS_LABELS,
  PRODUCTION_PRIORITY_LABELS,
  PRODUCTION_STATUS_LABELS,
  type DueState,
  type PrintJobStatus,
  type ProductionPriority,
  type ProductionStatus,
} from '@alipe3d/shared';
import type { StatusTone } from '@/components/ui/StatusBadge';

const STATUS_TONES: Record<ProductionStatus, StatusTone> = {
  PENDING: 'neutral',
  PLANNED: 'neutral',
  IN_PROGRESS: 'success',
  PAUSED: 'warning',
  FAILED: 'danger',
  COMPLETED: 'warning',
  INSPECTION: 'warning',
  APPROVED: 'success',
  CANCELLED: 'neutral',
};

export const orderStatusBadge = (status: ProductionStatus) => ({
  tone: STATUS_TONES[status],
  label: PRODUCTION_STATUS_LABELS[status],
});

const JOB_TONES: Record<PrintJobStatus, StatusTone> = {
  IN_PROGRESS: 'success',
  PAUSED: 'warning',
  SUCCEEDED: 'neutral',
  FAILED: 'danger',
};

export const jobStatusBadge = (status: PrintJobStatus) => ({
  tone: JOB_TONES[status],
  label: PRINT_JOB_STATUS_LABELS[status],
});

/** Classes do selo de prioridade (só Alta e Urgente chamam atenção). */
export const PRIORITY_CLASSES: Record<ProductionPriority, string> = {
  LOW: 'text-ink-muted',
  NORMAL: 'text-ink-muted',
  HIGH: 'text-warning',
  URGENT: 'text-danger font-semibold',
};

export const priorityLabel = (priority: ProductionPriority) => PRODUCTION_PRIORITY_LABELS[priority];

export const DUE_LABELS: Record<DueState, string> = {
  overdue: 'Atrasada',
  today: 'Vence hoje',
  soon: 'Vence em breve',
  ok: 'No prazo',
};

export const DUE_TONES: Record<DueState, StatusTone> = {
  overdue: 'danger',
  today: 'warning',
  soon: 'warning',
  ok: 'neutral',
};

/** Rótulo curto do produto da ordem: "Suporte de headset · Preto". */
export function orderProductLabel(order: {
  product: { name: string };
  variant: { label: string; isDefault: boolean };
}): string {
  return order.variant.isDefault || order.variant.label === 'Padrão'
    ? order.product.name
    : `${order.product.name} · ${order.variant.label}`;
}
