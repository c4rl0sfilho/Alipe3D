import { z } from 'zod';

export const uuidSchema = z.uuid('Identificador inválido');

export const idParamSchema = z.object({ id: uuidSchema });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  meta: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

/** Converte string vazia em undefined (útil para filtros vindos de formulários). */
export const optionalTrimmed = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .optional();
