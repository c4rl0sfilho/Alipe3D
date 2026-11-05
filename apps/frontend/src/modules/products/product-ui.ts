import { PRODUCT_STATUS_LABELS, type ProductStatus } from '@alipe3d/shared';
import type { StatusTone } from '@/components/ui/StatusBadge';

export const PRODUCT_STATUS_TONES: Record<ProductStatus, StatusTone> = {
  ACTIVE: 'success',
  DRAFT: 'warning',
  INACTIVE: 'neutral',
};

export function productStatusBadge(status: ProductStatus) {
  return { tone: PRODUCT_STATUS_TONES[status], label: PRODUCT_STATUS_LABELS[status] };
}

/** Converte valor da API ("59.90") para o campo do formulário ("59,90"). */
export function toInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(Number(value)).replace('.', ',');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
