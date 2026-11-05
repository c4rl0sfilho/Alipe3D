import {
  DUE_SOON_DAYS,
  MAINTENANCE_ALERT_DAYS,
  type DueState,
  type ProductionStatus,
} from '@alipe3d/shared';

/** Contadores de uma ordem usados para decidir a situação dela. */
export interface OrderCounters {
  quantity: number;
  producedQuantity: number;
  approvedQuantity: number;
  rejectedQuantity: number;
  /** Peças dispensadas (não serão refeitas). */
  waivedQuantity: number;
}

/** Peças que ainda precisam ser impressas (reprovadas contam como não feitas, salvo dispensadas). */
export function remainingToPrint(order: OrderCounters): number {
  const good = order.producedQuantity - order.rejectedQuantity;
  return Math.max(0, order.quantity - order.waivedQuantity - good);
}

/** Peças impressas que ainda não passaram pela inspeção. */
export function pendingInspection(order: OrderCounters): number {
  return order.producedQuantity - order.approvedQuantity - order.rejectedQuantity;
}

/**
 * Situação da ordem quando NÃO há impressão em andamento, a partir dos contadores:
 * - falta imprimir → volta para a fila (Planejada com impressora, Pendente sem);
 * - tudo impresso, mas há peças sem inspeção → Impressão concluída (ou mantém "Em inspeção");
 * - nada pendente → Aprovada, ou Falhou se nenhuma peça foi aprovada.
 */
export function resolveIdleStatus(
  order: OrderCounters & { status: ProductionStatus; printerId: string | null },
): ProductionStatus {
  if (remainingToPrint(order) > 0) return order.printerId ? 'PLANNED' : 'PENDING';
  if (pendingInspection(order) > 0) {
    return order.status === 'INSPECTION' ? 'INSPECTION' : 'COMPLETED';
  }
  return order.approvedQuantity > 0 ? 'APPROVED' : 'FAILED';
}

export const isClosedStatus = (status: ProductionStatus) =>
  status === 'APPROVED' || status === 'FAILED' || status === 'CANCELLED';

const TIME_ZONE = 'America/Sao_Paulo';

/** Data de hoje em São Paulo (AAAA-MM-DD). */
export function todayInSaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now);
}

/** Soma dias a uma data AAAA-MM-DD. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Converte uma coluna DATE do Prisma (meia-noite UTC) para AAAA-MM-DD. */
export const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

/** Situação do prazo de uma ordem ainda aberta. */
export function dueState(dueDate: string | null, today: string): DueState | null {
  if (!dueDate) return null;
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  if (dueDate <= addDays(today, DUE_SOON_DAYS)) return 'soon';
  return 'ok';
}

/** Manutenção vencida ou prevista para os próximos dias. */
export function maintenanceDue(next: string | null, today: string): 'overdue' | 'soon' | null {
  if (!next) return null;
  if (next < today) return 'overdue';
  if (next <= addDays(today, MAINTENANCE_ALERT_DAYS)) return 'soon';
  return null;
}

/** Tempo efetivo de impressão (sem pausas), em segundos. */
export function netPrintSeconds(job: {
  startedAt: Date;
  finishedAt: Date;
  pausedSeconds: number;
}): number {
  const total = Math.round((job.finishedAt.getTime() - job.startedAt.getTime()) / 1000);
  return Math.max(0, total - job.pausedSeconds);
}
