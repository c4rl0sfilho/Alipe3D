import type { StockAlert, StockAlertKind } from './inventory.js';

/** Alertas do sino do cabeçalho: estoque, manutenção de impressoras e prazos de produção. */
export type AppAlertKind = StockAlertKind | 'MAINTENANCE_DUE' | 'PRODUCTION_OVERDUE';

export interface AppAlert extends Omit<StockAlert, 'kind'> {
  kind: AppAlertKind;
  area: 'inventory' | 'printers' | 'production';
}
