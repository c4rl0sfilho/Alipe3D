import {
  createRollSchema,
  listRollsQuerySchema,
  LOW_ROLL_THRESHOLD_GRAMS,
  materialInputSchema,
  updateRollSchema,
  weighRollSchema,
  type AuthUser,
  type CreateRollInput,
  type ListRollsQuery,
  type MaterialInput,
  type MaterialSummary,
  type MaterialType,
  type Paginated,
  type RollSummary,
  type UpdateRollInput,
  type WeighRollInput,
} from '@alipe3d/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/app-error.js';
import { dec, fmt, ZERO } from '../../utils/decimal.js';
import { paginated, paginationArgs } from '../../utils/pagination.js';
import type { RequestContext } from '../../utils/request-context.js';
import type { AuditService } from '../audit/audit.service.js';
import type { MovementsService } from '../inventory/movements.service.js';

/** Rolos que contam como estoque disponível. */
export const AVAILABLE_ROLL_STATUSES = ['IN_STOCK', 'IN_USE'] as const;

const rollInclude = {
  material: { select: { id: true, name: true, type: true, color: true, colorHex: true } },
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.MaterialRollInclude;

type RollRow = Prisma.MaterialRollGetPayload<{ include: typeof rollInclude }>;

function toRollSummary(roll: RollRow): RollSummary {
  return {
    id: roll.id,
    code: roll.code,
    status: roll.status,
    material: roll.material,
    supplier: roll.supplier,
    initialWeightGrams: fmt(roll.initialWeightGrams),
    remainingWeightGrams: fmt(roll.remainingWeightGrams),
    spoolWeightGrams: fmt(roll.spoolWeightGrams),
    purchaseCost: fmt(roll.purchaseCost),
    costPerGram: fmt(roll.purchaseCost.dividedBy(roll.initialWeightGrams), 6),
    purchasedAt: roll.purchasedAt.toISOString().slice(0, 10),
    lotNumber: roll.lotNumber,
    notes: roll.notes,
    isLow:
      AVAILABLE_ROLL_STATUSES.includes(roll.status as (typeof AVAILABLE_ROLL_STATUSES)[number]) &&
      roll.remainingWeightGrams.greaterThan(0) &&
      roll.remainingWeightGrams.lessThan(LOW_ROLL_THRESHOLD_GRAMS),
  };
}

export class MaterialsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly movements: MovementsService,
  ) {}

  // ---------------------------------------------------------------- filamentos

  async list(): Promise<MaterialSummary[]> {
    const [materials, rolls] = await Promise.all([
      this.prisma.material.findMany({
        where: { deletedAt: null },
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.materialRoll.findMany({
        where: { status: { in: [...AVAILABLE_ROLL_STATUSES] }, material: { deletedAt: null } },
        select: {
          materialId: true,
          remainingWeightGrams: true,
          purchaseCost: true,
          initialWeightGrams: true,
        },
      }),
    ]);

    return materials.map((material) => {
      const own = rolls.filter(
        (r) => r.materialId === material.id && r.remainingWeightGrams.greaterThan(0),
      );
      const available = own.reduce((sum, r) => sum.plus(r.remainingWeightGrams), ZERO);
      // Custo médio ponderado pelo saldo de cada rolo
      const value = own.reduce(
        (sum, r) =>
          sum.plus(r.remainingWeightGrams.times(r.purchaseCost.dividedBy(r.initialWeightGrams))),
        ZERO,
      );
      return {
        id: material.id,
        name: material.name,
        manufacturer: material.manufacturer,
        type: material.type,
        color: material.color,
        colorHex: material.colorHex,
        minStockGrams: fmt(material.minStockGrams),
        notes: material.notes,
        availableGrams: fmt(available),
        activeRolls: own.length,
        averageCostPerGram: available.greaterThan(0) ? fmt(value.dividedBy(available), 6) : null,
        isBelowMinimum:
          material.minStockGrams.greaterThan(0) && available.lessThan(material.minStockGrams),
      };
    });
  }

  async create(raw: MaterialInput, actor: AuthUser, context: RequestContext) {
    const input = materialInputSchema.parse(raw);
    await this.assertUnique(input);
    return this.prisma.$transaction(async (tx) => {
      const material = await tx.material.create({
        data: {
          ...input,
          colorHex: input.colorHex ?? null,
          minStockGrams: dec(input.minStockGrams),
        },
      });
      await this.audit.record(
        {
          action: 'material.created',
          actorId: actor.id,
          entity: 'material',
          entityId: material.id,
          metadata: { name: material.name, type: material.type, color: material.color },
          context,
        },
        tx,
      );
      return material.id;
    });
  }

  async update(id: string, raw: MaterialInput, actor: AuthUser, context: RequestContext) {
    const input = materialInputSchema.parse(raw);
    await this.getMaterial(id);
    await this.assertUnique(input, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.material.update({
        where: { id },
        data: {
          ...input,
          colorHex: input.colorHex ?? null,
          minStockGrams: dec(input.minStockGrams),
        },
      });
      await this.audit.record(
        {
          action: 'material.updated',
          actorId: actor.id,
          entity: 'material',
          entityId: id,
          metadata: { name: input.name },
          context,
        },
        tx,
      );
    });
  }

  async remove(id: string, actor: AuthUser, context: RequestContext) {
    const material = await this.getMaterial(id);
    const withStock = await this.prisma.materialRoll.count({
      where: {
        materialId: id,
        status: { in: [...AVAILABLE_ROLL_STATUSES] },
        remainingWeightGrams: { gt: 0 },
      },
    });
    if (withStock > 0) {
      throw AppError.conflict(
        `Este filamento ainda tem ${withStock} rolo(s) com saldo. Zere ou descarte-os antes.`,
      );
    }
    const usages = await this.prisma.productMaterial.count({
      where: { materialId: id, variant: { deletedAt: null, product: { deletedAt: null } } },
    });
    if (usages > 0) {
      throw AppError.conflict(
        `Este filamento está na ficha técnica de ${usages} produto(s). Remova-o das fichas antes.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.material.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(
        {
          action: 'material.deleted',
          actorId: actor.id,
          entity: 'material',
          entityId: id,
          metadata: { name: material.name },
          context,
        },
        tx,
      );
    });
  }

  // ---------------------------------------------------------------- rolos

  async listRolls(rawQuery: ListRollsQuery): Promise<Paginated<RollSummary>> {
    const query = listRollsQuerySchema.parse(rawQuery);
    const where: Prisma.MaterialRollWhereInput = {
      material: { deletedAt: null },
      ...(query.materialId ? { materialId: query.materialId } : {}),
      ...(query.status === 'available'
        ? { status: { in: [...AVAILABLE_ROLL_STATUSES] } }
        : query.status !== 'all'
          ? { status: query.status }
          : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { lotNumber: { contains: query.search, mode: 'insensitive' } },
              { material: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.materialRoll.findMany({
        where,
        include: rollInclude,
        // Em uso primeiro, depois os de menor saldo (os próximos a acabar)
        orderBy: [{ status: 'desc' }, { remainingWeightGrams: 'asc' }, { code: 'asc' }],
        ...paginationArgs(query.page, query.pageSize),
      }),
      this.prisma.materialRoll.count({ where }),
    ]);
    return paginated(rows.map(toRollSummary), total, query.page, query.pageSize);
  }

  /** Cadastra um ou mais rolos iguais (mesma compra). Cada rolo gera sua entrada por compra. */
  async createRolls(raw: CreateRollInput, actor: AuthUser): Promise<RollSummary[]> {
    const input = createRollSchema.parse(raw);
    await this.getMaterial(input.materialId);
    if (input.supplierId) await this.assertSupplier(input.supplierId);

    const initial = dec(input.initialWeightGrams);
    return this.prisma.$transaction(async (tx) => {
      const created: RollSummary[] = [];
      for (let i = 0; i < input.quantity; i++) {
        const roll = await tx.materialRoll.create({
          data: {
            materialId: input.materialId,
            supplierId: input.supplierId ?? null,
            initialWeightGrams: initial,
            remainingWeightGrams: ZERO,
            spoolWeightGrams: dec(input.spoolWeightGrams),
            purchaseCost: dec(input.purchaseCost),
            purchasedAt: new Date(`${input.purchasedAt}T00:00:00Z`),
            lotNumber: input.lotNumber ?? null,
            notes: input.notes ?? null,
          },
        });
        await this.movements.apply(tx, {
          target: { rollId: roll.id },
          type: 'PURCHASE_IN',
          delta: initial,
          reason: 'Entrada do rolo no estoque',
          userId: actor.id,
          occurredAt: new Date(`${input.purchasedAt}T12:00:00-03:00`),
        });
        const fresh = await tx.materialRoll.findUniqueOrThrow({
          where: { id: roll.id },
          include: rollInclude,
        });
        created.push(toRollSummary(fresh));
      }
      return created;
    });
  }

  async updateRoll(id: string, raw: UpdateRollInput, actor: AuthUser, context: RequestContext) {
    const input = updateRollSchema.parse(raw);
    const roll = await this.prisma.materialRoll.findUnique({ where: { id } });
    if (!roll) throw AppError.notFound('Rolo não encontrado.');
    if (input.supplierId) await this.assertSupplier(input.supplierId);
    if (
      input.status &&
      input.status !== 'DISCARDED' &&
      roll.remainingWeightGrams.lessThanOrEqualTo(0)
    ) {
      throw AppError.badRequest('Um rolo sem saldo não pode voltar a "lacrado" ou "em uso".');
    }
    if (input.status === 'DISCARDED' && roll.remainingWeightGrams.greaterThan(0)) {
      throw AppError.badRequest(
        'Antes de descartar, registre o saldo restante como perda ou desperdício, para manter o estoque correto.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.materialRoll.update({
        where: { id },
        data: {
          supplierId: input.supplierId ?? null,
          spoolWeightGrams: dec(input.spoolWeightGrams),
          lotNumber: input.lotNumber ?? null,
          notes: input.notes ?? null,
          ...(input.status ? { status: input.status } : {}),
        },
        include: rollInclude,
      });
      await this.audit.record(
        {
          action: 'roll.updated',
          actorId: actor.id,
          entity: 'material_roll',
          entityId: id,
          metadata: {
            code: roll.code,
            ...(input.status && input.status !== roll.status
              ? { status: { from: roll.status, to: input.status } }
              : {}),
          },
          context,
        },
        tx,
      );
      return toRollSummary(updated);
    });
  }

  /**
   * Conferência por pesagem: com o peso na balança (filamento + carretel) e o peso do carretel vazio,
   * calcula o filamento real e lança a diferença como ajuste.
   */
  async weighRoll(id: string, raw: WeighRollInput, actor: AuthUser, context: RequestContext) {
    const input = weighRollSchema.parse(raw);
    const roll = await this.prisma.materialRoll.findUnique({ where: { id } });
    if (!roll) throw AppError.notFound('Rolo não encontrado.');

    const gross = dec(input.grossWeightGrams);
    const net = gross.minus(roll.spoolWeightGrams);
    if (net.isNegative()) {
      throw AppError.badRequest(
        `O peso informado é menor que o do carretel vazio (${roll.spoolWeightGrams.toString().replace('.', ',')} g). Confira a pesagem.`,
      );
    }
    const delta = net.minus(roll.remainingWeightGrams);
    if (delta.isZero())
      return { changed: false, difference: '0.00', remainingWeightGrams: fmt(net) };

    return this.prisma.$transaction(async (tx) => {
      const applied = await this.movements.apply(tx, {
        target: { rollId: id },
        type: 'ADJUSTMENT',
        delta,
        reason:
          `Conferência por pesagem: ${gross.toString().replace('.', ',')} g na balança` +
          (input.notes ? ` — ${input.notes}` : ''),
        userId: actor.id,
      });
      await this.audit.record(
        {
          action: 'inventory.adjusted',
          actorId: actor.id,
          entity: 'inventory_movement',
          entityId: applied.id,
          metadata: { rollId: id, code: roll.code, quantity: delta.toString(), reason: 'pesagem' },
          context,
        },
        tx,
      );
      return {
        changed: true,
        difference: fmt(delta),
        remainingWeightGrams: fmt(applied.balanceAfter),
      };
    });
  }

  private async getMaterial(id: string) {
    const material = await this.prisma.material.findFirst({ where: { id, deletedAt: null } });
    if (!material) throw AppError.notFound('Filamento não encontrado.');
    return material;
  }

  private async assertSupplier(id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!supplier)
      throw AppError.badRequest('Fornecedor inválido.', [
        { field: 'supplierId', message: 'Fornecedor não encontrado' },
      ]);
  }

  private async assertUnique(
    input: { manufacturer: string; type: MaterialType; color: string },
    ignoreId?: string,
  ) {
    const existing = await this.prisma.material.findFirst({
      where: {
        deletedAt: null,
        manufacturer: { equals: input.manufacturer, mode: 'insensitive' },
        type: input.type,
        color: { equals: input.color, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existing && existing.id !== ignoreId) {
      throw AppError.conflict('Já existe um filamento deste fabricante, tipo e cor.');
    }
  }
}
