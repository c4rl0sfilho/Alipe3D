import { z } from 'zod';
import { optionalTrimmed, paginationQuerySchema, uuidSchema } from './common.js';
import { gramsSchema, moneySchema, optionalDecimalString, quantitySchema } from './decimal.js';

// ---------------------------------------------------------------------------
// Enumerações e rótulos em português
// ---------------------------------------------------------------------------

export const PRODUCT_STATUSES = ['ACTIVE', 'DRAFT', 'INACTIVE'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  ACTIVE: 'Ativo',
  DRAFT: 'Em desenvolvimento',
  INACTIVE: 'Inativo',
};

export const PRODUCT_FILE_KINDS = [
  'IMAGE',
  'MODEL_STL',
  'MODEL_3MF',
  'PRINT_PROFILE',
  'DOCUMENT',
] as const;
export type ProductFileKind = (typeof PRODUCT_FILE_KINDS)[number];
export const PRODUCT_FILE_KIND_LABELS: Record<ProductFileKind, string> = {
  IMAGE: 'Imagem',
  MODEL_STL: 'Modelo STL',
  MODEL_3MF: 'Projeto 3MF',
  PRINT_PROFILE: 'Perfil de impressão',
  DOCUMENT: 'Documentação técnica',
};

/** Extensões aceitas e tamanho máximo (MB) por tipo de arquivo. */
export const PRODUCT_FILE_RULES: Record<ProductFileKind, { extensions: string[]; maxMb: number }> =
  {
    IMAGE: { extensions: ['.jpg', '.jpeg', '.png', '.webp'], maxMb: 10 },
    MODEL_STL: { extensions: ['.stl'], maxMb: 150 },
    MODEL_3MF: { extensions: ['.3mf'], maxMb: 150 },
    PRINT_PROFILE: { extensions: ['.json', '.ini', '.bbscfg', '.3mf'], maxMb: 20 },
    DOCUMENT: { extensions: ['.pdf', '.txt', '.md'], maxMb: 20 },
  };

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2, 'Informe ao menos 2 caracteres').max(80, 'Nome muito longo'),
  description: z
    .string()
    .trim()
    .max(240, 'Descrição muito longa')
    .transform((v) => v || null)
    .nullable()
    .optional(),
});
export type CategoryInput = z.input<typeof categoryInputSchema>;

export interface CategorySummary {
  id: string;
  name: string;
  description: string | null;
  productCount: number;
}

// ---------------------------------------------------------------------------
// Produtos e variações
// ---------------------------------------------------------------------------

export const skuSchema = z
  .string({ error: 'Informe o SKU' })
  .trim()
  .toUpperCase()
  .min(2, 'O SKU deve ter ao menos 2 caracteres')
  .max(40, 'SKU muito longo')
  .regex(/^[A-Z0-9][A-Z0-9._-]*$/, 'Use apenas letras, números, ponto, hífen e sublinhado');

const minutesSchema = z.coerce
  .number({ error: 'Informe o tempo em minutos' })
  .int('Use minutos inteiros')
  .min(0, 'O tempo não pode ser negativo')
  .max(60 * 24 * 14, 'Tempo acima do permitido');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'Texto muito longo')
    .transform((v) => v || null)
    .nullable()
    .optional();

export const productInputSchema = z.object({
  sku: skuSchema,
  name: z.string().trim().min(2, 'Informe o nome do produto').max(120, 'Nome muito longo'),
  description: optionalText(4000),
  categoryId: uuidSchema
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  status: z.enum(PRODUCT_STATUSES).default('DRAFT'),
  salePrice: moneySchema('Preço de venda'),
  estimatedWeightGrams: gramsSchema('Peso estimado'),
  estimatedPrintMinutes: minutesSchema,
  minStock: quantitySchema('Estoque mínimo'),
});
export type ProductInput = z.input<typeof productInputSchema>;

export const variantInputSchema = z
  .object({
    sku: skuSchema,
    color: optionalText(40),
    material: optionalText(40),
    size: optionalText(40),
    model: optionalText(60),
    /** Valores próprios da variação. Vazio = usa o valor do produto. */
    salePrice: optionalDecimalString({ scale: 2, max: 10_000_000, label: 'Preço' }),
    estimatedWeightGrams: optionalDecimalString({ scale: 2, max: 100_000, label: 'Peso' }),
    estimatedPrintMinutes: z.preprocess(
      (v) => (v === '' || v === undefined ? null : v),
      minutesSchema.nullable(),
    ),
    minStock: optionalDecimalString({ scale: 3, max: 10_000_000, label: 'Estoque mínimo' }),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.color || v.material || v.size || v.model, {
    message: 'Informe ao menos um atributo (cor, material, tamanho ou modelo)',
    path: ['color'],
  });
export type VariantInput = z.input<typeof variantInputSchema>;

export const listProductsQuerySchema = paginationQuerySchema.extend({
  search: optionalTrimmed,
  categoryId: uuidSchema.optional().or(z.literal('').transform(() => undefined)),
  status: z.enum([...PRODUCT_STATUSES, 'all']).default('all'),
  sort: z.enum(['name', 'sku', 'createdAt', 'salePrice']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type ListProductsQuery = z.input<typeof listProductsQuerySchema>;

/** Ficha técnica de uma variação: filamentos (gramas) e insumos (unidades) por peça. */
export const billOfMaterialsSchema = z.object({
  items: z
    .array(
      z
        .object({
          materialId: uuidSchema.nullable().optional(),
          supplyItemId: uuidSchema.nullable().optional(),
          quantity: quantitySchema('Quantidade'),
          notes: optionalText(200),
        })
        .refine((i) => !!i.materialId !== !!i.supplyItemId, {
          message: 'Escolha um filamento ou um insumo',
          path: ['materialId'],
        })
        .refine((i) => Number(i.quantity) > 0, {
          message: 'A quantidade deve ser maior que zero',
          path: ['quantity'],
        }),
    )
    .max(30, 'Itens demais na ficha técnica'),
});
export type BillOfMaterialsInput = z.input<typeof billOfMaterialsSchema>;

// ---------------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------------

export interface ProductListItem {
  id: string;
  sku: string;
  name: string;
  status: ProductStatus;
  salePrice: string;
  estimatedWeightGrams: string;
  estimatedPrintMinutes: number;
  category: { id: string; name: string } | null;
  variantCount: number;
  /** Soma do estoque acabado de todas as variações. */
  stockQuantity: string;
  coverFileId: string | null;
  createdAt: string;
}

export interface BillOfMaterialsLine {
  id: string;
  quantity: string;
  notes: string | null;
  material: {
    id: string;
    name: string;
    type: string;
    color: string;
    colorHex: string | null;
  } | null;
  supply: { id: string; name: string; unit: string } | null;
}

export interface VariantDetail {
  id: string;
  sku: string;
  label: string;
  isDefault: boolean;
  isActive: boolean;
  color: string | null;
  material: string | null;
  size: string | null;
  model: string | null;
  /** Valores próprios (null = herda do produto). */
  overrides: {
    salePrice: string | null;
    estimatedWeightGrams: string | null;
    estimatedPrintMinutes: number | null;
    minStock: string | null;
  };
  /** Valores efetivos (próprios ou herdados). */
  salePrice: string;
  estimatedWeightGrams: string;
  estimatedPrintMinutes: number;
  minStock: string;
  stockQuantity: string;
  stockItemId: string | null;
  billOfMaterials: BillOfMaterialsLine[];
}

export interface ProductFileInfo {
  id: string;
  kind: ProductFileKind;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  isCover: boolean;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
}

export interface ProductDetail {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  category: { id: string; name: string } | null;
  salePrice: string;
  estimatedWeightGrams: string;
  estimatedPrintMinutes: number;
  minStock: string;
  createdAt: string;
  updatedAt: string;
  variants: VariantDetail[];
  files: ProductFileInfo[];
}
