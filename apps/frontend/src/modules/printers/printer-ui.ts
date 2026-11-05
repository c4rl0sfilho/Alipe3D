import {
  MAINTENANCE_TYPE_LABELS,
  PRINTER_ACTIVITY_LABELS,
  type MaintenanceType,
  type PrinterActivity,
} from '@alipe3d/shared';
import type { StatusTone } from '@/components/ui/StatusBadge';

const ACTIVITY_TONES: Record<PrinterActivity, StatusTone> = {
  AVAILABLE: 'success',
  PRINTING: 'success',
  PAUSED: 'warning',
  MAINTENANCE: 'warning',
  INACTIVE: 'neutral',
};

export const printerActivityBadge = (activity: PrinterActivity) => ({
  tone: ACTIVITY_TONES[activity],
  label: PRINTER_ACTIVITY_LABELS[activity],
});

export const maintenanceTypeLabel = (type: MaintenanceType) => MAINTENANCE_TYPE_LABELS[type];

/** Nome de exibição: "ALIPE-PRINTER-01" ou "ALIPE-PRINTER-01 · Apelido". */
export const printerLabel = (printer: { code: string; name: string | null }) =>
  printer.name ? `${printer.code} · ${printer.name}` : printer.code;
