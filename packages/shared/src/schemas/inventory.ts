import { z } from 'zod';
import { emailSchema } from './auth.js';
import { optionalTrimmed, paginationQuerySchema, uuidSchema } from './common.js';
import { gramsSchema, moneySchema, quantitySchema, decimalString } from './decimal.js';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'Texto muito longo')
    .transform((v) => v || null)
    .nullable()
    .optional();

// ---------------------------------------------------------------------------
// Enumerações e rótulos
// ---------------------------------------------------------------------------

export const MATERIAL_TYPES = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PC', 'PA', 'OTHER'] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];
export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  PLA: 'PLA',
  PETG: 'PETG',
  ABS: 'ABS',
  ASA: 'ASA',
  TPU: 'TPU',
  PC: 'PC',
  PA: 'PA (Nylon)',
  OTHER: 'Outro',
};

export const ROLL_STATUSES = ['IN_STOCK', 'IN_USE', 'EMPTY', 'DISCARDED'] as const;
export type RollStatus = (typeof ROLL_STATUSES)[number];
export const ROLL_STATUS_LABELS: Record<RollStatus, string> = {
  IN_STOCK: 'Lacrado',
  IN_USE: 'Em uso',
  EMPTY: 'Vazio',
  DISCARDED: 'Descartado',
};

export const SUPPLY_CATEGORIES = [
  'PACKAGING',
  'LABEL',
  'NOZZLE',
  'BUILD_PLATE',
  'COMPONENT',
  'OTHER',
] as const;
export type SupplyCategory = (typeof SUPPLY_CATEGORIES)[number];
export const SUPPLY_CATEGORY_LABELS: Record<SupplyCategory, string> = {
  PACKAGING: 'Embalagem',
  LABEL: 'Etiqueta',
  NOZZLE: 'Bico',
  BUILD_PLATE: 'Placa de impressão',
  COMPONENT: 'Componente',
  OTHER: 'Outros consumíveis',
};

export const STOCK_UNITS = ['UN', 'PCT', 'CX', 'M', 'ROLO', 'KG', 'L'] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];
export const STOCK_UNIT_LABELS: Record<StockUnit, string> = {
  UN: 'unidade',
  PCT: 'pacote',
  CX: 'caixa',
  M: 'metro',
  ROLO: 'rolo',
  KG: 'kg',
  L: 'litro',
};

export const MOVEMENT_TYPES = [
  'PURCHASE_IN',
  'PRODUCTION_OUT',
  'PRODUCTION_IN',
  'ADJUSTMENT',
  'LOSS',
  'WASTE',
  'RETURN_IN',
  'RETURN_OUT',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];
export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  PURCHASE_IN: 'Entrada por compra',
  PRODUCTION_OUT: 'Saída por fabricação',
  PRODUCTION_IN: 'Entrada de produção',
  ADJUSTMENT: 'Ajuste manual',
  LOSS: 'Perda',
  WASTE: 'Desperdício',
  RETURN_IN: 'Devolução (entrada)',
  RETURN_OUT: 'Devolução ao fornecedor',
};

/** Sentido fixo de cada tipo. ADJUSTMENT aceita os dois sentidos. */
export const MOVEMENT_DIRECTION: Record<MovementType, 1 | -1 | 0> = {
  PURCHASE_IN: 1,
  PRODUCTION_OUT: -1,
  PRODUCTION_IN: 1,
  ADJUSTMENT: 0,
  LOSS: -1,
  WASTE: -1,
  RETURN_IN: 1,
  RETURN_OUT: -1,
};

/** Tipos que o usuário registra manualmente. PRODUCTION_* ficam para o módulo de produção. */
export const MANUAL_MOVEMENT_TYPES = [
  'PURCHASE_IN',
  'PRODUCTION_OUT',
  'ADJUSTMENT',
  'LOSS',
  'WASTE',
  'RETURN_IN',
  'RETURN_OUT',
] as const satisfies readonly MovementType[];
export type ManualMovementType = (typeof MANUAL_MOVEMENT_TYPES)[number];

export type StockTargetKind = 'ROLL' | 'SUPPLY' | 'FINISHED_GOOD';

/**
 * Movimentações manuais permitidas por tipo de item.
 * - Rolos entram no estoque pelo cadastro do rolo (que gera a entrada por compra).
 * - Produtos acabados entram pela produção (Fase 4); até lá, por ajuste manual.
 */
export const ALLOWED_MOVEMENTS: Record<StockTargetKind, readonly ManualMovementType[]> = {
  ROLL: ['PRODUCTION_OUT', 'ADJUSTMENT', 'LOSS', 'WASTE', 'RETURN_IN', 'RETURN_OUT'],
  SUPPLY: ['PURCHASE_IN', 'PRODUCTION_OUT', 'ADJUSTMENT', 'LOSS', 'WASTE', 'RETURN_OUT'],
  FINISHED_GOOD: ['ADJUSTMENT', 'LOSS', 'RETURN_IN'],
};

/** Rolo com menos que isto (gramas) gera alerta de "filamento próximo do fim". */
export const LOW_ROLL_THRESHOLD_GRAMS = 100;

// ---------------------------------------------------------------------------
// Fornecedores
// ---------------------------------------------------------------------------

export const supplierInputSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do fornecedor').max(120, 'Nome muito longo'),
  document: optionalText(20),
  contactName: optionalText(120),
  email: z
    .union([emailSchema, z.literal('')])
    .transform((v) => v || null)
    .nullable()
    .optional(),
  phone: optionalText(30),
  website: optionalText(200),
  notes: optionalText(1000),
});
export type SupplierInput = z.input<typeof supplierInputSchema>;

export interface SupplierSummary {
  id: string;
  name: string;
  document: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Filamentos (materiais) e rolos
// ---------------------------------------------------------------------------

export const materialInputSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(120, 'Nome muito longo'),
  manufacturer: z.string().trim().min(1, 'Informe o fabricante').max(80, 'Nome muito longo'),
  type: z.enum(MATERIAL_TYPES, { error: 'Escolha o tipo' }),
  color: z.string().trim().min(1, 'Informe a cor').max(40, 'Nome muito longo'),
  colorHex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  minStockGrams: gramsSchema('Estoque mínimo'),
  notes: optionalText(1000),
});
export type MaterialInput = z.input<typeof materialInputSchema>;

export const createRollSchema = z
  .object({
    materialId: uuidSchema,
    supplierId: uuidSchema
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    /** Peso líquido de filamento do rolo novo (ex.: 1000 g). */
    initialWeightGrams: gramsSchema('Peso inicial'),
    /** Peso do carretel vazio, para conferências por pesagem. */
    spoolWeightGrams: gramsSchema('Peso do carretel'),
    purchaseCost: moneySchema('Custo de aquisição'),
    purchasedAt: z.iso.date('Data inválida'),
    lotNumber: optionalText(60),
    notes: optionalText(500),
    quantity: z.coerce.number().int().min(1).max(50).default(1),
  })
  .refine((v) => Number(v.initialWeightGrams) > 0, {
    message: 'O peso inicial deve ser maior que zero',
    path: ['initialWeightGrams'],
  });
export type CreateRollInput = z.input<typeof createRollSchema>;

export const updateRollSchema = z.object({
  supplierId: uuidSchema
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  spoolWeightGrams: gramsSchema('Peso do carretel'),
  lotNumber: optionalText(60),
  notes: optionalText(500),
  status: z.enum(['IN_STOCK', 'IN_USE', 'DISCARDED']).optional(),
});
export type UpdateRollInput = z.input<typeof updateRollSchema>;

/** Conferência por pesagem: peso bruto na balança (filamento + carretel). */
export const weighRollSchema = z.object({
  grossWeightGrams: gramsSchema('Peso na balança'),
  notes: optionalText(300),
});
export type WeighRollInput = z.input<typeof weighRollSchema>;

export const listRollsQuerySchema = paginationQuerySchema.extend({
  materialId: uuidSchema.optional().or(z.literal('').transform(() => undefined)),
  status: z.enum([...ROLL_STATUSES, 'available', 'all']).default('available'),
  search: optionalTrimmed,
});
export type ListRollsQuery = z.input<typeof listRollsQuerySchema>;

export interface MaterialSummary {
  id: string;
  name: string;
  manufacturer: string;
  type: MaterialType;
  color: string;
  colorHex: string | null;
  minStockGrams: string;
  notes: string | null;
  availableGrams: string;
  /** Rolos com saldo (lacrados + em uso). */
  activeRolls: number;
  /** Custo médio ponderado por grama dos rolos com saldo. */
  averageCostPerGram: string | null;
  isBelowMinimum: boolean;
}

export interface RollSummary {
  id: string;
  code: string;
  status: RollStatus;
  material: {
    id: string;
    name: string;
    type: MaterialType;
    color: string;
    colorHex: string | null;
  };
  supplier: { id: string; name: string } | null;
  initialWeightGrams: string;
  remainingWeightGrams: string;
  spoolWeightGrams: string;
  purchaseCost: string;
  costPerGram: string;
  purchasedAt: string;
  lotNumber: string | null;
  notes: string | null;
  isLow: boolean;
}

// ---------------------------------------------------------------------------
// Itens de estoque: insumos e produtos acabados
// ---------------------------------------------------------------------------

export const supplyInputSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(120, 'Nome muito longo'),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .max(40, 'Código muito longo')
    .transform((v) => v || null)
    .nullable()
    .optional(),
  category: z.enum(SUPPLY_CATEGORIES, { error: 'Escolha a categoria' }),
  unit: z.enum(STOCK_UNITS, { error: 'Escolha a unidade' }),
  minQuantity: quantitySchema('Estoque mínimo'),
  supplierId: uuidSchema
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  notes: optionalText(1000),
});
export type SupplyInput = z.input<typeof supplyInputSchema>;

export const listStockItemsQuerySchema = paginationQuerySchema.extend({
  kind: z.enum(['SUPPLY', 'FINISHED_GOOD']),
  search: optionalTrimmed,
  category: z
    .enum(SUPPLY_CATEGORIES)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  lowOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type ListStockItemsQuery = z.input<typeof listStockItemsQuerySchema>;

export interface StockItemSummary {
  id: string;
  kind: 'SUPPLY' | 'FINISHED_GOOD';
  name: string;
  sku: string | null;
  category: SupplyCategory | null;
  unit: StockUnit;
  quantity: string;
  minQuantity: string;
  averageUnitCost: string | null;
  supplier: { id: string; name: string } | null;
  notes: string | null;
  /** Apenas produtos acabados. */
  variant: { id: string; productId: string; productName: string; label: string } | null;
  isBelowMinimum: boolean;
}

// ---------------------------------------------------------------------------
// Movimentações
// ---------------------------------------------------------------------------

export const registerMovementSchema = z
  .object({
    rollId: uuidSchema.optional(),
    stockItemId: uuidSchema.optional(),
    type: z.enum(MANUAL_MOVEMENT_TYPES, { error: 'Escolha o tipo de movimentação' }),
    /** Quantidade sempre positiva; o sentido vem do tipo (ou de `direction` no ajuste). */
    quantity: decimalString({ scale: 3, min: 0, max: 10_000_000, label: 'Quantidade' }),
    direction: z.enum(['IN', 'OUT']).optional(),
    /** Custo unitário pago (entrada por compra de insumo). */
    unitCost: z.preprocess(
      (v) => (v === '' || v === undefined ? null : v),
      decimalString({ scale: 6, label: 'Custo unitário' }).nullable(),
    ),
    reason: z
      .string()
      .trim()
      .min(3, 'Descreva o motivo (mínimo 3 caracteres)')
      .max(300, 'Texto muito longo'),
    occurredAt: z.iso.date('Data inválida').optional(),
    /** Autoriza saldo negativo. Exige permissão administrativa e fica auditado. */
    allowNegative: z.boolean().default(false),
  })
  .refine((v) => !!v.rollId !== !!v.stockItemId, {
    message: 'Informe o rolo ou o item de estoque',
    path: ['rollId'],
  })
  .refine((v) => Number(v.quantity) > 0, {
    message: 'A quantidade deve ser maior que zero',
    path: ['quantity'],
  })
  .refine((v) => v.type !== 'ADJUSTMENT' || !!v.direction, {
    message: 'Informe se o ajuste é de entrada ou de saída',
    path: ['direction'],
  });
export type RegisterMovementInput = z.input<typeof registerMovementSchema>;

export const listMovementsQuerySchema = paginationQuerySchema.extend({
  type: z
    .enum(MOVEMENT_TYPES)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  target: z.enum(['all', 'ROLL', 'SUPPLY', 'FINISHED_GOOD']).default('all'),
  rollId: uuidSchema.optional().or(z.literal('').transform(() => undefined)),
  stockItemId: uuidSchema.optional().or(z.literal('').transform(() => undefined)),
  materialId: uuidSchema.optional().or(z.literal('').transform(() => undefined)),
  userId: uuidSchema.optional().or(z.literal('').transform(() => undefined)),
  from: z.iso
    .date()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  to: z.iso
    .date()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type ListMovementsQuery = z.input<typeof listMovementsQuerySchema>;

export interface MovementEntry {
  id: string;
  type: MovementType;
  /** Quantidade com sinal: positiva = entrada, negativa = saída. */
  quantity: string;
  balanceAfter: string;
  unit: string;
  unitCost: string | null;
  totalCost: string | null;
  reason: string;
  negativeAuthorized: boolean;
  occurredAt: string;
  createdAt: string;
  target:
    | { kind: 'ROLL'; id: string; label: string }
    | { kind: 'SUPPLY' | 'FINISHED_GOOD'; id: string; label: string };
  user: { id: string; name: string };
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

export type StockAlertKind = 'MATERIAL_LOW' | 'ROLL_LOW' | 'SUPPLY_LOW' | 'FINISHED_GOOD_LOW';

export interface StockAlert {
  kind: StockAlertKind;
  severity: 'warning' | 'critical';
  title: string;
  detail: string;
  /** Rota da interface onde o item é tratado. */
  link: string;
}
