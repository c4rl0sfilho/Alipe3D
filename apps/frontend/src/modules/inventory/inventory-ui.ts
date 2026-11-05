import {
  ROLL_STATUS_LABELS,
  STOCK_UNIT_LABELS,
  type RollStatus,
  type StockUnit,
} from '@alipe3d/shared';
import { useQueryClient } from '@tanstack/react-query';
import type { StatusTone } from '@/components/ui/StatusBadge';
import { formatGrams, formatNumber } from '@/utils/format';
import { inventoryKeys } from './inventory.api';

export const ROLL_STATUS_TONES: Record<RollStatus, StatusTone> = {
  IN_STOCK: 'neutral',
  IN_USE: 'success',
  EMPTY: 'warning',
  DISCARDED: 'neutral',
};

export function rollStatusBadge(status: RollStatus) {
  return { tone: ROLL_STATUS_TONES[status], label: ROLL_STATUS_LABELS[status] };
}

/** Quantidade com unidade: gramas para rolos, unidade do item para os demais. */
export function formatStock(value: string | number, unit: StockUnit | 'g'): string {
  if (unit === 'g') return formatGrams(value);
  const n = Number(value);
  const label = STOCK_UNIT_LABELS[unit];
  return `${formatNumber(n, 3)} ${Math.abs(n) === 1 || unit === 'KG' || unit === 'M' || unit === 'L' ? label : `${label}s`}`;
}

/** Depois de qualquer alteração de estoque, tudo que depende de saldo é recarregado. */
export function useInvalidateStock() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    await queryClient.invalidateQueries({ queryKey: ['products'] });
    await queryClient.invalidateQueries({ queryKey: ['product'] });
    await queryClient.invalidateQueries({ queryKey: ['alerts'] });
  };
}
