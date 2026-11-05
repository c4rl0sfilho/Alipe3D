import { z } from 'zod';

interface DecimalOptions {
  /** Casas decimais permitidas. */
  scale: number;
  min?: number;
  max?: number;
  /** Mensagem do campo (ex.: "Peso"). */
  label?: string;
}

/**
 * Número decimal recebido como texto ou número e normalizado para string ("12.5").
 * Aceita vírgula como separador decimal ("12,5"), como o usuário brasileiro digita.
 * Valores monetários e pesos trafegam como string para nunca perder precisão.
 */
export function decimalString({
  scale,
  min = 0,
  max = 9_999_999_999,
  label = 'Valor',
}: DecimalOptions) {
  const pattern = new RegExp(`^-?\\d+(\\.\\d{1,${scale}})?$`);
  return z
    .union([z.string(), z.number()], { error: `${label}: informe um número` })
    .transform((value) =>
      typeof value === 'number' ? String(value) : value.trim().replace(',', '.'),
    )
    .refine((value) => value !== '', `${label}: campo obrigatório`)
    .refine((value) => pattern.test(value), `${label}: use no máximo ${scale} casas decimais`)
    .refine(
      (value) => Number(value) >= min,
      `${label}: o mínimo é ${String(min).replace('.', ',')}`,
    )
    .refine((value) => Number(value) <= max, `${label}: valor acima do permitido`);
}

/** Versão opcional: string vazia, null ou ausente viram null. */
export function optionalDecimalString(options: DecimalOptions) {
  return z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    decimalString(options).nullable(),
  );
}

export const gramsSchema = (label = 'Peso') =>
  decimalString({ scale: 2, min: 0, max: 100_000, label });

export const moneySchema = (label = 'Valor') =>
  decimalString({ scale: 2, min: 0, max: 10_000_000, label });

/** Quantidade de estoque (insumos e produtos acabados). */
export const quantitySchema = (label = 'Quantidade') =>
  decimalString({ scale: 3, min: 0, max: 10_000_000, label });
