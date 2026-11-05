import { z } from 'zod';
import { optionalTrimmed, paginationQuerySchema, uuidSchema } from './common.js';
import { decimalString, gramsSchema, moneySchema } from './decimal.js';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'Texto muito longo')
    .transform((v) => v || null)
    .nullable()
    .optional();

const optionalUuid = uuidSchema
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));

const optionalDate = z.iso
  .date('Data inválida')
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));

/** Data e hora com fuso (ex.: 2026-11-05T14:30:00-03:00). Ausente = agora. */
const optionalDateTime = z.iso
  .datetime({ offset: true, error: 'Data e hora inválidas' })
  .optional()
  .or(z.literal('').transform(() => undefined));

const wholeNumber = (label: string, min: number, max: number) =>
  z.coerce
    .number({ error: `${label}: informe um número` })
    .int(`${label}: use um número inteiro`)
    .min(min, `${label}: o mínimo é ${min}`)
    .max(max, `${label}: valor acima do permitido`);

// ---------------------------------------------------------------------------
// Impressoras
// ---------------------------------------------------------------------------

/** Situação operacional cadastrada. "Imprimindo" e "Pausada" vêm da impressão em andamento. */
export const PRINTER_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'INACTIVE'] as const;
export type PrinterStatus = (typeof PRINTER_STATUSES)[number];
export const PRINTER_STATUS_LABELS: Record<PrinterStatus, string> = {
  AVAILABLE: 'Disponível',
  MAINTENANCE: 'Em manutenção',
  INACTIVE: 'Inativa',
};

/** Situação exibida: a cadastrada ou a da impressão em andamento. */
export type PrinterActivity = PrinterStatus | 'PRINTING' | 'PAUSED';
export const PRINTER_ACTIVITY_LABELS: Record<PrinterActivity, string> = {
  ...PRINTER_STATUS_LABELS,
  PRINTING: 'Imprimindo',
  PAUSED: 'Impressão pausada',
};

export const MAINTENANCE_TYPES = [
  'PREVENTIVE',
  'CORRECTIVE',
  'CLEANING',
  'CALIBRATION',
  'PART_REPLACEMENT',
  'FIRMWARE',
  'OTHER',
] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];
export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  PREVENTIVE: 'Preventiva',
  CORRECTIVE: 'Corretiva',
  CLEANING: 'Limpeza',
  CALIBRATION: 'Calibração',
  PART_REPLACEMENT: 'Troca de peças',
  FIRMWARE: 'Atualização de firmware',
  OTHER: 'Outra',
};

/** Manutenção prevista para os próximos N dias gera alerta. */
export const MAINTENANCE_ALERT_DAYS = 7;

export const printerCodeSchema = z
  .string({ error: 'Informe a identificação' })
  .trim()
  .toUpperCase()
  .min(2, 'Use ao menos 2 caracteres')
  .max(40, 'Identificação muito longa')
  .regex(/^[A-Z0-9][A-Z0-9._-]*$/, 'Use apenas letras, números, ponto, hífen e sublinhado');

export const printerInputSchema = z.object({
  code: printerCodeSchema,
  name: optionalText(80),
  model: z.string().trim().min(2, 'Informe o modelo').max(80, 'Modelo muito longo'),
  serialNumber: optionalText(80),
  acquiredAt: optionalDate,
  /** Horas já registradas no contador da impressora quando ela foi cadastrada. */
  initialHours: decimalString({ scale: 1, min: 0, max: 1_000_000, label: 'Horas iniciais' }),
  notes: optionalText(1000),
});
export type PrinterInput = z.input<typeof printerInputSchema>;

export const printerStatusInputSchema = z.object({
  status: z.enum(PRINTER_STATUSES, { error: 'Escolha a situação' }),
  reason: optionalText(300),
});
export type PrinterStatusInput = z.input<typeof printerStatusInputSchema>;

export const maintenanceInputSchema = z
  .object({
    printerId: uuidSchema,
    type: z.enum(MAINTENANCE_TYPES, { error: 'Escolha o tipo' }),
    description: z.string().trim().min(3, 'Descreva o que foi feito').max(500, 'Texto muito longo'),
    performedAt: z.iso.date('Data inválida'),
    responsibleName: z.string().trim().min(2, 'Informe o responsável').max(120, 'Nome muito longo'),
    partsReplaced: optionalText(500),
    cost: moneySchema('Custo'),
    nextMaintenanceAt: optionalDate,
  })
  .refine((v) => !v.nextMaintenanceAt || v.nextMaintenanceAt > v.performedAt, {
    message: 'A próxima manutenção deve ser depois da data desta',
    path: ['nextMaintenanceAt'],
  });
export type MaintenanceInput = z.input<typeof maintenanceInputSchema>;

export const listMaintenanceQuerySchema = paginationQuerySchema.extend({
  printerId: uuidSchema.optional().or(z.literal('').transform(() => undefined)),
});
export type ListMaintenanceQuery = z.input<typeof listMaintenanceQuerySchema>;

export interface PrinterActiveJob {
  id: string;
  status: 'IN_PROGRESS' | 'PAUSED';
  startedAt: string;
  pausedAt: string | null;
  pausedSeconds: number;
  plannedQuantity: number;
  estimatedMinutes: number;
  order: { id: string; code: string; productName: string; variantLabel: string };
  roll: { id: string; code: string; materialName: string; colorHex: string | null };
}

export interface PrinterSummary {
  id: string;
  code: string;
  name: string | null;
  model: string;
  serialNumber: string | null;
  acquiredAt: string | null;
  status: PrinterStatus;
  activity: PrinterActivity;
  notes: string | null;
  initialHours: string;
  /** Horas iniciais + tempo de todas as impressões finalizadas no sistema. */
  totalHours: string;
  stats: { jobs: number; failedJobs: number; printedHours: string };
  activeJob: PrinterActiveJob | null;
  /** Ordens abertas atribuídas à impressora (fila dela). */
  queuedOrders: number;
  lastMaintenanceAt: string | null;
  nextMaintenanceAt: string | null;
  maintenanceDue: 'overdue' | 'soon' | null;
}

export interface MaintenanceEntry {
  id: string;
  printer: { id: string; code: string; name: string | null };
  type: MaintenanceType;
  description: string;
  performedAt: string;
  responsibleName: string;
  partsReplaced: string | null;
  cost: string;
  nextMaintenanceAt: string | null;
  createdBy: { id: string; name: string };
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Ordens de produção
// ---------------------------------------------------------------------------

export const PRODUCTION_STATUSES = [
  'PENDING',
  'PLANNED',
  'IN_PROGRESS',
  'PAUSED',
  'FAILED',
  'COMPLETED',
  'INSPECTION',
  'APPROVED',
  'CANCELLED',
] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];
export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  PENDING: 'Pendente',
  PLANNED: 'Planejada',
  IN_PROGRESS: 'Em produção',
  PAUSED: 'Pausada',
  FAILED: 'Falhou',
  COMPLETED: 'Impressão concluída',
  INSPECTION: 'Em inspeção',
  APPROVED: 'Aprovada',
  CANCELLED: 'Cancelada',
};

/** Ordens na fila de produção (ainda há impressão a fazer ou em andamento). */
export const QUEUE_STATUSES = [
  'PENDING',
  'PLANNED',
  'IN_PROGRESS',
  'PAUSED',
] as const satisfies readonly ProductionStatus[];
/** Impressão concluída, aguardando inspeção. */
export const INSPECTION_STATUSES = [
  'COMPLETED',
  'INSPECTION',
] as const satisfies readonly ProductionStatus[];
/** Ordens encerradas. */
export const CLOSED_STATUSES = [
  'APPROVED',
  'FAILED',
  'CANCELLED',
] as const satisfies readonly ProductionStatus[];

export const PRODUCTION_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type ProductionPriority = (typeof PRODUCTION_PRIORITIES)[number];
export const PRODUCTION_PRIORITY_LABELS: Record<ProductionPriority, string> = {
  LOW: 'Baixa',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

/** Prazo nos próximos N dias aparece como "vence em breve". */
export const DUE_SOON_DAYS = 2;
export type DueState = 'overdue' | 'today' | 'soon' | 'ok';

export const productionOrderInputSchema = z.object({
  variantId: uuidSchema,
  quantity: wholeNumber('Quantidade', 1, 10_000),
  /** Filamento planejado. Vazio = definido ao iniciar a impressão. */
  materialId: optionalUuid,
  /** Impressora planejada. Com impressora a ordem fica "Planejada"; sem, "Pendente". */
  printerId: optionalUuid,
  priority: z.enum(PRODUCTION_PRIORITIES).default('NORMAL'),
  dueDate: optionalDate,
  /** Vazio = o próprio usuário. */
  responsibleId: optionalUuid,
  /** Estimativas da ordem inteira. Vazio = calculado pela variação × quantidade. */
  estimatedMinutes: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    wholeNumber('Tempo estimado', 0, 60 * 24 * 60).nullable(),
  ),
  estimatedWeightGrams: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    decimalString({ scale: 2, min: 0, max: 1_000_000, label: 'Peso estimado' }).nullable(),
  ),
  notes: optionalText(1000),
});
export type ProductionOrderInput = z.input<typeof productionOrderInputSchema>;

export const listProductionOrdersQuerySchema = paginationQuerySchema.extend({
  view: z.enum(['queue', 'inspection', 'closed', 'all']).default('all'),
  status: z
    .enum(PRODUCTION_STATUSES)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  materialId: uuidSchema.optional().or(z.literal('').transform(() => undefined)),
  /** Cor do filamento planejado (sem diferenciar maiúsculas). */
  color: optionalTrimmed,
  /** Id da impressora ou "none" para ordens sem impressora. */
  printerId: z
    .union([uuidSchema, z.literal('none')])
    .optional()
    .or(z.literal('').transform(() => undefined)),
  priority: z
    .enum(PRODUCTION_PRIORITIES)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  /** Código da ordem, nome do produto ou SKU. */
  search: optionalTrimmed,
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListProductionOrdersQuery = z.input<typeof listProductionOrdersQuerySchema>;

export const cancelProductionOrderSchema = z.object({
  reason: z.string().trim().min(3, 'Informe o motivo').max(300, 'Texto muito longo'),
});
export type CancelProductionOrderInput = z.input<typeof cancelProductionOrderSchema>;

export const closeProductionOrderSchema = cancelProductionOrderSchema;
export type CloseProductionOrderInput = z.input<typeof closeProductionOrderSchema>;

export interface ProductionOrderSummary {
  id: string;
  code: string;
  status: ProductionStatus;
  priority: ProductionPriority;
  quantity: number;
  producedQuantity: number;
  approvedQuantity: number;
  rejectedQuantity: number;
  /** Peças que ainda precisam ser impressas. */
  remainingToPrint: number;
  /** Peças impressas que ainda não passaram pela inspeção. */
  pendingInspection: number;
  /** Peças dispensadas: reprovadas sem refabricação, falhas sem refazer ou o que faltava ao encerrar. */
  waivedQuantity: number;
  product: { id: string; name: string; sku: string };
  variant: { id: string; sku: string; label: string; isDefault: boolean };
  material: {
    id: string;
    name: string;
    type: string;
    color: string;
    colorHex: string | null;
  } | null;
  printer: { id: string; code: string; name: string | null } | null;
  estimatedMinutes: number;
  estimatedWeightGrams: string;
  dueDate: string | null;
  dueState: DueState | null;
  responsible: { id: string; name: string };
  createdBy: { id: string; name: string };
  failedJobs: number;
  activeJob: { id: string; status: 'IN_PROGRESS' | 'PAUSED'; startedAt: string } | null;
  notes: string | null;
  cancelReason: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface ProductionOrderDetail extends ProductionOrderSummary {
  /** Valores por peça da variação (para sugerir as próximas impressões). */
  unitMinutes: number;
  unitWeightGrams: string;
  /** Insumos da ficha técnica, baixados quando as peças aprovadas entram no estoque. */
  supplies: { id: string; name: string; unit: string; quantityPerUnit: string }[];
  jobs: PrintJobEntry[];
  inspections: InspectionEntry[];
}

// ---------------------------------------------------------------------------
// Impressões (PrintJob) e falhas
// ---------------------------------------------------------------------------

export const PRINT_JOB_STATUSES = ['IN_PROGRESS', 'PAUSED', 'SUCCEEDED', 'FAILED'] as const;
export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[number];
export const PRINT_JOB_STATUS_LABELS: Record<PrintJobStatus, string> = {
  IN_PROGRESS: 'Imprimindo',
  PAUSED: 'Pausada',
  SUCCEEDED: 'Concluída',
  FAILED: 'Falhou',
};

export const FAILURE_REASONS = [
  'BED_ADHESION',
  'NOZZLE_CLOG',
  'FILAMENT_RUNOUT',
  'FILAMENT_TANGLE',
  'LAYER_SHIFT',
  'WARPING',
  'SPAGHETTI',
  'POWER_OUTAGE',
  'SLICING_ERROR',
  'OPERATOR_CANCELLED',
  'OTHER',
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];
export const FAILURE_REASON_LABELS: Record<FailureReason, string> = {
  BED_ADHESION: 'Falta de aderência na mesa',
  NOZZLE_CLOG: 'Bico entupido',
  FILAMENT_RUNOUT: 'Filamento acabou',
  FILAMENT_TANGLE: 'Filamento enroscado ou quebrado',
  LAYER_SHIFT: 'Deslocamento de camada',
  WARPING: 'Empenamento (warping)',
  SPAGHETTI: 'Peça soltou (espaguete)',
  POWER_OUTAGE: 'Queda de energia',
  SLICING_ERROR: 'Erro no fatiamento ou no arquivo',
  OPERATOR_CANCELLED: 'Cancelada pelo operador',
  OTHER: 'Outro motivo',
};

export const startPrintJobSchema = z.object({
  printerId: uuidSchema,
  rollId: uuidSchema,
  plannedQuantity: wholeNumber('Quantidade', 1, 10_000),
  /** Filamento estimado para esta impressão (gramas). */
  estimatedGrams: gramsSchema('Peso estimado'),
  /** Tempo estimado desta impressão (minutos). */
  estimatedMinutes: wholeNumber('Tempo estimado', 0, 60 * 24 * 14),
  /** Ausente = agora. Permite registrar uma impressão iniciada há pouco. */
  startedAt: optionalDateTime,
  notes: optionalText(1000),
});
export type StartPrintJobInput = z.input<typeof startPrintJobSchema>;

const consumptionLineSchema = z.object({
  rollId: uuidSchema,
  grams: decimalString({ scale: 2, min: 0, max: 100_000, label: 'Gramas' }),
});

const finishBase = {
  finishedAt: optionalDateTime,
  notes: optionalText(1000),
  /** Autoriza saldo negativo do rolo. Exige permissão administrativa e fica auditado. */
  allowNegative: z.boolean().default(false),
};

export const finishPrintJobSchema = z.discriminatedUnion('result', [
  z
    .object({
      result: z.literal('SUCCESS'),
      producedQuantity: wholeNumber('Peças produzidas', 1, 10_000),
      /** Filamento realmente consumido, por rolo (troca de rolo ou multicor). */
      consumption: z
        .array(consumptionLineSchema)
        .min(1, 'Informe o filamento consumido')
        .max(8, 'Rolos demais'),
      ...finishBase,
    })
    .refine((v) => v.consumption.some((line) => Number(line.grams) > 0), {
      message: 'Informe o peso real consumido',
      path: ['consumption'],
    }),
  z.object({
    result: z.literal('FAILED'),
    failureReason: z.enum(FAILURE_REASONS, { error: 'Escolha o motivo da falha' }),
    failureNotes: optionalText(500),
    /** Filamento desperdiçado, por rolo. Pode ser zero (falha antes de extrudar). */
    consumption: z.array(consumptionLineSchema).max(8, 'Rolos demais').default([]),
    /** Tempo de máquina perdido (minutos). Vazio = duração da impressão. */
    lostMinutes: z.preprocess(
      (v) => (v === '' || v === undefined ? null : v),
      wholeNumber('Tempo perdido', 0, 60 * 24 * 14).nullable(),
    ),
    /** true = a ordem volta para a fila; false = segue sem refazer. */
    needsReprint: z.boolean(),
    ...finishBase,
  }),
]);
export type FinishPrintJobInput = z.input<typeof finishPrintJobSchema>;

export const listPrintJobsQuerySchema = paginationQuerySchema.extend({
  printerId: uuidSchema.optional().or(z.literal('').transform(() => undefined)),
  productionOrderId: uuidSchema.optional().or(z.literal('').transform(() => undefined)),
  status: z
    .enum([...PRINT_JOB_STATUSES, 'active', 'finished'])
    .optional()
    .or(z.literal('').transform(() => undefined)),
  failureReason: z
    .enum(FAILURE_REASONS)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  from: z.iso
    .date()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  to: z.iso
    .date()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type ListPrintJobsQuery = z.input<typeof listPrintJobsQuerySchema>;

export interface PrintJobConsumption {
  rollId: string;
  rollCode: string;
  materialName: string;
  colorHex: string | null;
  /** Gramas (positivo) baixadas do rolo. */
  grams: string;
  cost: string | null;
  type: 'PRODUCTION_OUT' | 'WASTE';
}

export interface PrintJobEntry {
  id: string;
  status: PrintJobStatus;
  printer: { id: string; code: string; name: string | null };
  order: {
    id: string;
    code: string;
    productName: string;
    variantLabel: string;
  };
  roll: { id: string; code: string; materialName: string; colorHex: string | null };
  plannedQuantity: number;
  producedQuantity: number;
  estimatedGrams: string;
  estimatedMinutes: number;
  /** Filamento consumido em peças (impressões concluídas). */
  consumedGrams: string;
  /** Filamento desperdiçado (impressões com falha). */
  wastedGrams: string;
  materialCost: string;
  startedAt: string;
  finishedAt: string | null;
  pausedAt: string | null;
  pausedSeconds: number;
  /** Tempo efetivo de impressão (sem pausas), em minutos. Só para impressões finalizadas. */
  durationMinutes: number | null;
  failureReason: FailureReason | null;
  failureNotes: string | null;
  lostMinutes: number | null;
  needsReprint: boolean;
  notes: string | null;
  startedBy: { id: string; name: string };
  finishedBy: { id: string; name: string } | null;
  consumption: PrintJobConsumption[];
}

// ---------------------------------------------------------------------------
// Inspeção de qualidade
// ---------------------------------------------------------------------------

export const inspectionInputSchema = z
  .object({
    approvedQuantity: wholeNumber('Aprovadas', 0, 10_000),
    rejectedQuantity: wholeNumber('Reprovadas', 0, 10_000),
    notes: optionalText(1000),
    /** Peças reprovadas voltam para a fila de impressão. */
    reprintRejected: z.boolean().default(true),
    /** Autoriza saldo negativo dos insumos da ficha técnica (administrativo, auditado). */
    allowNegative: z.boolean().default(false),
  })
  .refine((v) => v.approvedQuantity + v.rejectedQuantity > 0, {
    message: 'Informe ao menos uma peça inspecionada',
    path: ['approvedQuantity'],
  });
export type InspectionInput = z.input<typeof inspectionInputSchema>;

export interface InspectionEntry {
  id: string;
  approvedQuantity: number;
  rejectedQuantity: number;
  notes: string | null;
  inspectedAt: string;
  inspectedBy: { id: string; name: string };
}

export interface UserOption {
  id: string;
  name: string;
}

export interface FinishPrintJobResult {
  id: string;
  /** Situação da ordem depois da impressão. */
  orderStatus: ProductionStatus;
}
