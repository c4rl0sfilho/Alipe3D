import { Prisma } from '../generated/prisma/client.js';

export type Decimal = Prisma.Decimal;
export const Decimal = Prisma.Decimal;

/** Cria um Decimal a partir de string/número vindos da API (já validados pelo Zod). */
export function dec(value: string | number | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export const ZERO = new Prisma.Decimal(0);

/** Serializa para a API com escala fixa (dinheiro e gramas = 2, quantidades = 3). */
export function fmt(value: Prisma.Decimal | null | undefined, scale = 2): string {
  return (value ?? ZERO).toFixed(scale);
}

export function fmtOrNull(value: Prisma.Decimal | null | undefined, scale = 2): string | null {
  return value === null || value === undefined ? null : value.toFixed(scale);
}
