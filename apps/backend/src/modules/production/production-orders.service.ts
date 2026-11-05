import {
  cancelProductionOrderSchema,
  CLOSED_STATUSES,
  closeProductionOrderSchema,
  INSPECTION_STATUSES,
  inspectionInputSchema,
  listProductionOrdersQuerySchema,
  productionOrderInputSchema,
  QUEUE_STATUSES,
  type AuthUser,
  type CancelProductionOrderInput,
  type CloseProductionOrderInput,
  type InspectionInput,
  type ListProductionOrdersQuery,
  type Paginated,
  type ProductionOrderDetail,
  type ProductionOrderInput,
  type ProductionOrderSummary,
  type UserOption,
} from '@alipe3d/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/app-error.js';
import { dec, fmt } from '../../utils/decimal.js';
import { paginated, paginationArgs } from '../../utils/pagination.js';
import type { RequestContext } from '../../utils/request-context.js';
import type { AuditService } from '../audit/audit.service.js';
import type { MovementsService } from '../inventory/movements.service.js';
import { ACTIVE_JOB_STATUSES } from '../printers/printers.service.js';
import { variantLabel } from '../products/variant-label.js';
import type { PrintJobsService } from './print-jobs.service.js';
import {
  dateOnly,
  dueState,
  isClosedStatus,
  pendingInspection,
  remainingToPrint,
  resolveIdleStatus,
  todayInSaoPaulo,
} from './production-rules.js';

export const INSPECTION_REFERENCE = 'QUALITY_INSPECTION';

const orderInclude = {
  variant: {
    select: {
      id: true,
      sku: true,
      isDefault: true,
      color: true,
      material: true,
      size: true,
      model: true,
      estimatedWeightGrams: true,
      estimatedPrintMinutes: true,
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          estimatedWeightGrams: true,
          estimatedPrintMinutes: true,
        },
      },
    },
  },
  material: { select: { id: true, name: true, type: true, color: true, colorHex: true } },
  printer: { select: { id: true, code: true, name: true } },
  responsible: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  printJobs: {
    where: { status: { in: [...ACTIVE_JOB_STATUSES] } },
    take: 1,
    select: { id: true, status: true, startedAt: true },
  },
  _count: { select: { printJobs: { where: { status: 'FAILED' } } } },
} satisfies Prisma.ProductionOrderInclude;

type OrderRow = Prisma.ProductionOrderGetPayload<{ include: typeof orderInclude }>;

/** Peso e tempo por peça da variação (próprios ou herdados do produto). */
function unitEstimates(variant: OrderRow['variant']) {
  return {
    minutes: variant.estimatedPrintMinutes ?? variant.product.estimatedPrintMinutes,
    grams: variant.estimatedWeightGrams ?? variant.product.estimatedWeightGrams,
  };
}

function toSummary(order: OrderRow, today: string): ProductionOrderSummary {
  const job = order.printJobs[0];
  const closed = isClosedStatus(order.status);
  const due = order.dueDate ? dateOnly(order.dueDate) : null;
  return {
    id: order.id,
    code: order.code,
    status: order.status,
    priority: order.priority,
    quantity: order.quantity,
    producedQuantity: order.producedQuantity,
    approvedQuantity: order.approvedQuantity,
    rejectedQuantity: order.rejectedQuantity,
    waivedQuantity: order.waivedQuantity,
    remainingToPrint: closed ? 0 : remainingToPrint(order),
    pendingInspection: pendingInspection(order),
    product: {
      id: order.variant.product.id,
      name: order.variant.product.name,
      sku: order.variant.product.sku,
    },
    variant: {
      id: order.variant.id,
      sku: order.variant.sku,
      label: variantLabel(order.variant),
      isDefault: order.variant.isDefault,
    },
    material: order.material,
    printer: order.printer,
    estimatedMinutes: order.estimatedMinutes,
    estimatedWeightGrams: fmt(order.estimatedWeightGrams),
    dueDate: due,
    // Prazo só importa enquanto a ordem está aberta
    dueState: closed ? null : dueState(due, today),
    responsible: order.responsible,
    createdBy: order.createdBy,
    failedJobs: order._count.printJobs,
    activeJob: job
      ? {
          id: job.id,
          status: job.status as 'IN_PROGRESS' | 'PAUSED',
          startedAt: job.startedAt.toISOString(),
        }
      : null,
    notes: order.notes,
    cancelReason: order.cancelReason,
    createdAt: order.createdAt.toISOString(),
    closedAt: order.closedAt?.toISOString() ?? null,
  };
}

export class ProductionOrdersService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly movements: MovementsService,
    private readonly jobs: PrintJobsService,
  ) {}

  // ---------------------------------------------------------------- consultas

  async list(rawQuery: ListProductionOrdersQuery): Promise<Paginated<ProductionOrderSummary>> {
    const query = listProductionOrdersQuerySchema.parse(rawQuery);
    const viewStatuses = {
      queue: [...QUEUE_STATUSES],
      inspection: [...INSPECTION_STATUSES],
      closed: [...CLOSED_STATUSES],
      all: null,
    }[query.view];

    const where: Prisma.ProductionOrderWhereInput = {
      ...(query.status
        ? { status: query.status }
        : viewStatuses
          ? { status: { in: viewStatuses } }
          : {}),
      ...(query.materialId ? { materialId: query.materialId } : {}),
      ...(query.color ? { material: { color: { equals: query.color, mode: 'insensitive' } } } : {}),
      ...(query.printerId === 'none'
        ? { printerId: null }
        : query.printerId
          ? { printerId: query.printerId }
          : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { variant: { sku: { contains: query.search, mode: 'insensitive' } } },
              { variant: { product: { name: { contains: query.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    // Fila: prioridade, depois o prazo mais próximo, depois a mais antiga
    const orderBy: Prisma.ProductionOrderOrderByWithRelationInput[] =
      query.view === 'closed'
        ? [{ closedAt: 'desc' }, { createdAt: 'desc' }]
        : query.view === 'all'
          ? [{ createdAt: 'desc' }]
          : [
              { priority: 'desc' },
              { dueDate: { sort: 'asc', nulls: 'last' } },
              { createdAt: 'asc' },
            ];

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.productionOrder.findMany({
        where,
        include: orderInclude,
        orderBy,
        ...paginationArgs(query.page, query.pageSize),
      }),
      this.prisma.productionOrder.count({ where }),
    ]);
    const today = todayInSaoPaulo();
    return paginated(
      rows.map((row) => toSummary(row, today)),
      total,
      query.page,
      query.pageSize,
    );
  }

  async get(id: string): Promise<ProductionOrderDetail> {
    const order = await this.load(id);
    const [jobs, inspections, supplies] = await Promise.all([
      this.jobs.forOrder(id),
      this.prisma.qualityInspection.findMany({
        where: { productionOrderId: id },
        include: { inspectedBy: { select: { id: true, name: true } } },
        orderBy: { inspectedAt: 'desc' },
      }),
      this.prisma.productMaterial.findMany({
        where: { variantId: order.variantId, supplyItemId: { not: null } },
        include: { supplyItem: { select: { id: true, name: true, unit: true } } },
        orderBy: { id: 'asc' },
      }),
    ]);
    const unit = unitEstimates(order.variant);
    return {
      ...toSummary(order, todayInSaoPaulo()),
      unitMinutes: unit.minutes,
      unitWeightGrams: fmt(unit.grams),
      supplies: supplies.flatMap((line) =>
        line.supplyItem
          ? [
              {
                id: line.supplyItem.id,
                name: line.supplyItem.name,
                unit: line.supplyItem.unit,
                quantityPerUnit: fmt(line.quantity, 3),
              },
            ]
          : [],
      ),
      jobs,
      inspections: inspections.map((i) => ({
        id: i.id,
        approvedQuantity: i.approvedQuantity,
        rejectedQuantity: i.rejectedQuantity,
        notes: i.notes,
        inspectedAt: i.inspectedAt.toISOString(),
        inspectedBy: i.inspectedBy,
      })),
    };
  }

  /** Pessoas que podem ser responsáveis por uma ordem (usuários ativos). */
  async responsibles(): Promise<UserOption[]> {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  // ---------------------------------------------------------------- cadastro

  async create(raw: ProductionOrderInput, actor: AuthUser, context: RequestContext) {
    const input = productionOrderInputSchema.parse(raw);
    const variant = await this.loadVariant(input.variantId);
    const materialId = input.materialId ?? (await this.mainFilament(variant.id));
    await this.assertReferences({ ...input, materialId });
    const unit = unitEstimates(variant);

    const id = await this.prisma.$transaction(async (tx) => {
      const order = await tx.productionOrder.create({
        data: {
          variantId: variant.id,
          quantity: input.quantity,
          materialId,
          printerId: input.printerId ?? null,
          priority: input.priority,
          dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null,
          estimatedMinutes: input.estimatedMinutes ?? unit.minutes * input.quantity,
          estimatedWeightGrams: input.estimatedWeightGrams
            ? dec(input.estimatedWeightGrams)
            : unit.grams.times(input.quantity),
          notes: input.notes ?? null,
          status: input.printerId ? 'PLANNED' : 'PENDING',
          responsibleId: input.responsibleId ?? actor.id,
          createdById: actor.id,
        },
      });
      await this.audit.record(
        {
          action: 'production.created',
          actorId: actor.id,
          entity: 'production_order',
          entityId: order.id,
          metadata: {
            code: order.code,
            product: variant.product.name,
            variant: variantLabel(variant),
            quantity: order.quantity,
          },
          context,
        },
        tx,
      );
      return order.id;
    });
    return this.get(id);
  }

  /** Edição permitida enquanto a ordem está na fila e sem impressão em andamento. */
  async update(id: string, raw: ProductionOrderInput, actor: AuthUser, context: RequestContext) {
    const input = productionOrderInputSchema.parse(raw);
    const current = await this.load(id);
    if (current.status !== 'PENDING' && current.status !== 'PLANNED') {
      throw AppError.conflict(
        'Só ordens pendentes ou planejadas (sem impressão em andamento) podem ser editadas.',
      );
    }
    const jobCount = await this.prisma.printJob.count({ where: { productionOrderId: id } });
    const hasHistory = current.producedQuantity > 0 || jobCount > 0;
    if (input.variantId !== current.variantId && hasHistory) {
      throw AppError.badRequest('Esta ordem já tem impressões. O produto não pode ser trocado.');
    }
    const minimum = current.producedQuantity - current.rejectedQuantity;
    if (input.quantity < minimum) {
      throw AppError.badRequest(`Já foram impressas ${minimum} peça(s) boas nesta ordem.`, [
        { field: 'quantity', message: `Mínimo: ${minimum}` },
      ]);
    }
    const variant =
      input.variantId === current.variantId
        ? current.variant
        : await this.loadVariant(input.variantId);
    await this.assertReferences(input);
    const unit = unitEstimates(variant);
    const printerId = input.printerId ?? null;
    const counters = { ...current, quantity: input.quantity, printerId };
    const status = resolveIdleStatus(counters);

    const changes: Record<string, { from: string; to: string }> = {};
    const track = (field: string, from: unknown, to: unknown) => {
      if (String(from ?? '') !== String(to ?? '')) {
        changes[field] = { from: String(from ?? '—'), to: String(to ?? '—') };
      }
    };
    track('quantity', current.quantity, input.quantity);
    track('printerId', current.printerId, printerId);
    track('priority', current.priority, input.priority);
    track('dueDate', current.dueDate ? dateOnly(current.dueDate) : null, input.dueDate);
    track('status', current.status, status);

    await this.prisma.$transaction(async (tx) => {
      await tx.productionOrder.update({
        where: { id },
        data: {
          variantId: variant.id,
          quantity: input.quantity,
          materialId: input.materialId ?? null,
          printerId,
          priority: input.priority,
          dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00Z`) : null,
          estimatedMinutes: input.estimatedMinutes ?? unit.minutes * input.quantity,
          estimatedWeightGrams: input.estimatedWeightGrams
            ? dec(input.estimatedWeightGrams)
            : unit.grams.times(input.quantity),
          notes: input.notes ?? null,
          responsibleId: input.responsibleId ?? current.responsibleId,
          status,
          closedAt: isClosedStatus(status) ? new Date() : null,
        },
      });
      await this.audit.record(
        {
          action: 'production.updated',
          actorId: actor.id,
          entity: 'production_order',
          entityId: id,
          metadata: { code: current.code, ...changes },
          context,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Cancela uma ordem que ainda não teve peças impressas. */
  async cancel(
    id: string,
    raw: CancelProductionOrderInput,
    actor: AuthUser,
    context: RequestContext,
  ) {
    const input = cancelProductionOrderSchema.parse(raw);
    const order = await this.load(id);
    if (order.status !== 'PENDING' && order.status !== 'PLANNED') {
      throw AppError.conflict('Só ordens pendentes ou planejadas podem ser canceladas.');
    }
    if (order.producedQuantity > 0) {
      throw AppError.conflict(
        'Esta ordem já tem peças impressas. Use "Encerrar produção" para fechá-la com o que foi feito.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.productionOrder.update({
        where: { id },
        data: { status: 'CANCELLED', cancelReason: input.reason, closedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'production.cancelled',
          actorId: actor.id,
          entity: 'production_order',
          entityId: id,
          metadata: { code: order.code, reason: input.reason },
          context,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Encerra a produção com o que já foi impresso: o que falta é dispensado. */
  async close(
    id: string,
    raw: CloseProductionOrderInput,
    actor: AuthUser,
    context: RequestContext,
  ) {
    const input = closeProductionOrderSchema.parse(raw);
    const order = await this.load(id);
    if (order.status !== 'PENDING' && order.status !== 'PLANNED') {
      throw AppError.conflict(
        'Só ordens na fila, sem impressão em andamento, podem ser encerradas.',
      );
    }
    if (order.producedQuantity === 0) {
      throw AppError.conflict('Nenhuma peça foi impressa. Cancele a ordem em vez de encerrá-la.');
    }
    const remaining = remainingToPrint(order);
    const counters = { ...order, waivedQuantity: order.waivedQuantity + remaining };
    const status = resolveIdleStatus(counters);
    await this.prisma.$transaction(async (tx) => {
      await tx.productionOrder.update({
        where: { id },
        data: {
          waivedQuantity: counters.waivedQuantity,
          status,
          cancelReason: input.reason,
          closedAt: isClosedStatus(status) ? new Date() : null,
        },
      });
      await this.audit.record(
        {
          action: 'production.closed_short',
          actorId: actor.id,
          entity: 'production_order',
          entityId: id,
          metadata: { code: order.code, waived: remaining, reason: input.reason },
          context,
        },
        tx,
      );
    });
    return this.get(id);
  }

  // ---------------------------------------------------------------- inspeção

  /** Marca que as peças estão sendo inspecionadas (acabamento, conferência). */
  async startInspection(id: string) {
    const order = await this.load(id);
    if (order.status !== 'COMPLETED') {
      throw AppError.conflict('Só ordens com impressão concluída entram em inspeção.');
    }
    await this.prisma.productionOrder.update({ where: { id }, data: { status: 'INSPECTION' } });
    return this.get(id);
  }

  /**
   * Registra a inspeção das peças impressas. Numa única transação:
   * as aprovadas entram no estoque de produto acabado, os insumos da ficha técnica são baixados
   * e a ordem avança (ou volta para a fila, se for preciso refazer as reprovadas).
   */
  async inspect(id: string, raw: InspectionInput, actor: AuthUser, context: RequestContext) {
    const input = inspectionInputSchema.parse(raw);
    if (input.allowNegative && !actor.permissions.includes('inventory:allow-negative')) {
      throw AppError.forbidden('Somente um administrador pode autorizar saldo negativo.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM production_orders WHERE id = ${id}::uuid FOR UPDATE`;
      const order = await tx.productionOrder.findUnique({
        where: { id },
        include: {
          variant: { select: { id: true, stockItem: { select: { id: true, deletedAt: true } } } },
          printJobs: { where: { status: { in: [...ACTIVE_JOB_STATUSES] } }, select: { id: true } },
        },
      });
      if (!order) throw AppError.notFound('Ordem de produção não encontrada.');
      if (isClosedStatus(order.status)) throw AppError.conflict('Esta ordem já foi encerrada.');
      const pending = pendingInspection(order);
      const inspected = input.approvedQuantity + input.rejectedQuantity;
      if (pending === 0) throw AppError.conflict('Não há peças aguardando inspeção nesta ordem.');
      if (inspected > pending) {
        throw AppError.badRequest(`Há ${pending} peça(s) aguardando inspeção.`, [
          { field: 'approvedQuantity', message: `Aprovadas + reprovadas: no máximo ${pending}` },
        ]);
      }

      const inspection = await tx.qualityInspection.create({
        data: {
          productionOrderId: id,
          approvedQuantity: input.approvedQuantity,
          rejectedQuantity: input.rejectedQuantity,
          notes: input.notes ?? null,
          inspectedById: actor.id,
        },
      });

      if (input.approvedQuantity > 0) {
        const stockItem = order.variant.stockItem;
        if (!stockItem || stockItem.deletedAt) {
          throw AppError.conflict('O produto desta ordem foi excluído e não recebe estoque.');
        }
        const reason = `${order.code} — ${input.approvedQuantity} peça(s) aprovada(s) na inspeção`;
        await this.movements.apply(tx, {
          target: { stockItemId: stockItem.id },
          type: 'PRODUCTION_IN',
          delta: dec(input.approvedQuantity),
          reason,
          userId: actor.id,
          referenceType: INSPECTION_REFERENCE,
          referenceId: inspection.id,
        });
        await this.consumeSupplies(tx, {
          variantId: order.variant.id,
          units: input.approvedQuantity,
          reason,
          inspectionId: inspection.id,
          allowNegative: input.allowNegative,
          actor,
          context,
        });
      }

      const counters = {
        ...order,
        approvedQuantity: order.approvedQuantity + input.approvedQuantity,
        rejectedQuantity: order.rejectedQuantity + input.rejectedQuantity,
        waivedQuantity: order.waivedQuantity + (input.reprintRejected ? 0 : input.rejectedQuantity),
      };
      const status = order.printJobs.length > 0 ? order.status : resolveIdleStatus(counters);
      await tx.productionOrder.update({
        where: { id },
        data: {
          approvedQuantity: counters.approvedQuantity,
          rejectedQuantity: counters.rejectedQuantity,
          waivedQuantity: counters.waivedQuantity,
          status,
          closedAt: isClosedStatus(status) ? new Date() : null,
        },
      });
      await this.audit.record(
        {
          action: 'production.inspected',
          actorId: actor.id,
          entity: 'production_order',
          entityId: id,
          metadata: {
            code: order.code,
            approved: input.approvedQuantity,
            rejected: input.rejectedQuantity,
            reprintRejected: input.reprintRejected,
          },
          context,
        },
        tx,
      );
    });
    return this.get(id);
  }

  // ---------------------------------------------------------------- apoio

  private async consumeSupplies(
    tx: Prisma.TransactionClient,
    args: {
      variantId: string;
      units: number;
      reason: string;
      inspectionId: string;
      allowNegative: boolean;
      actor: AuthUser;
      context: RequestContext;
    },
  ) {
    const lines = await tx.productMaterial.findMany({
      where: { variantId: args.variantId, supplyItemId: { not: null } },
      include: { supplyItem: { select: { id: true, name: true, deletedAt: true } } },
    });
    for (const line of lines) {
      if (!line.supplyItem || line.supplyItem.deletedAt) continue;
      const delta = line.quantity.times(args.units).negated();
      try {
        const applied = await this.movements.apply(tx, {
          target: { stockItemId: line.supplyItem.id },
          type: 'PRODUCTION_OUT',
          delta,
          reason: args.reason,
          userId: args.actor.id,
          allowNegative: args.allowNegative,
          referenceType: INSPECTION_REFERENCE,
          referenceId: args.inspectionId,
        });
        if (applied.negativeAuthorized) {
          await this.audit.record(
            {
              action: 'inventory.negative_authorized',
              actorId: args.actor.id,
              entity: 'inventory_movement',
              entityId: applied.id,
              metadata: {
                stockItemId: line.supplyItem.id,
                quantity: delta.toString(),
                balanceAfter: applied.balanceAfter.toString(),
                reason: args.reason,
              },
              context: args.context,
            },
            tx,
          );
        }
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 409) {
          throw AppError.conflict(
            `Insumo "${line.supplyItem.name}" da ficha técnica: ${error.message}`,
          );
        }
        throw error;
      }
    }
  }

  private async load(id: string): Promise<OrderRow> {
    const order = await this.prisma.productionOrder.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (!order) throw AppError.notFound('Ordem de produção não encontrada.');
    return order;
  }

  private async loadVariant(id: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id, deletedAt: null, product: { deletedAt: null } },
      select: orderInclude.variant.select,
    });
    if (!variant) {
      throw AppError.badRequest('Produto ou variação não encontrado.', [
        { field: 'variantId', message: 'Escolha um produto' },
      ]);
    }
    return variant;
  }

  /** Filamento com mais gramas na ficha técnica da variação (sugestão para a ordem). */
  private async mainFilament(variantId: string): Promise<string | null> {
    const line = await this.prisma.productMaterial.findFirst({
      where: { variantId, materialId: { not: null }, material: { deletedAt: null } },
      orderBy: [{ quantity: 'desc' }, { id: 'asc' }],
      select: { materialId: true },
    });
    return line?.materialId ?? null;
  }

  private async assertReferences(input: {
    materialId?: string | null;
    printerId?: string | null;
    responsibleId?: string | null;
  }) {
    if (input.materialId) {
      const material = await this.prisma.material.findFirst({
        where: { id: input.materialId, deletedAt: null },
        select: { id: true },
      });
      if (!material) {
        throw AppError.badRequest('Filamento inválido.', [
          { field: 'materialId', message: 'Filamento não encontrado' },
        ]);
      }
    }
    if (input.printerId) {
      const printer = await this.prisma.printer.findFirst({
        where: { id: input.printerId, deletedAt: null },
        select: { status: true },
      });
      if (!printer) {
        throw AppError.badRequest('Impressora inválida.', [
          { field: 'printerId', message: 'Impressora não encontrada' },
        ]);
      }
      if (printer.status === 'INACTIVE') {
        throw AppError.badRequest('Esta impressora está inativa.', [
          { field: 'printerId', message: 'Escolha uma impressora ativa' },
        ]);
      }
    }
    if (input.responsibleId) {
      const user = await this.prisma.user.findFirst({
        where: { id: input.responsibleId, isActive: true },
        select: { id: true },
      });
      if (!user) {
        throw AppError.badRequest('Responsável inválido.', [
          { field: 'responsibleId', message: 'Usuário não encontrado ou inativo' },
        ]);
      }
    }
  }
}
