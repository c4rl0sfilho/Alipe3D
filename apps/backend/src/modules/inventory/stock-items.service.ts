import {
  listStockItemsQuerySchema,
  LOW_ROLL_THRESHOLD_GRAMS,
  supplyInputSchema,
  type AuthUser,
  type ListStockItemsQuery,
  type Paginated,
  type StockAlert,
  type StockItemSummary,
  type SupplyInput,
} from '@alipe3d/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/app-error.js';
import { dec, fmt, fmtOrNull } from '../../utils/decimal.js';
import { paginated, paginationArgs } from '../../utils/pagination.js';
import type { RequestContext } from '../../utils/request-context.js';
import type { AuditService } from '../audit/audit.service.js';
import type { MaterialsService } from '../materials/materials.service.js';
import { variantLabel } from '../products/variant-label.js';

const itemInclude = {
  supplier: { select: { id: true, name: true } },
  productVariant: {
    select: {
      id: true,
      productId: true,
      color: true,
      material: true,
      size: true,
      model: true,
      isDefault: true,
      minStock: true,
      product: { select: { name: true, minStock: true } },
    },
  },
} satisfies Prisma.InventoryItemInclude;

type ItemRow = Prisma.InventoryItemGetPayload<{ include: typeof itemInclude }>;

/** Estoque mínimo efetivo: produtos acabados usam o da variação (ou o herdado do produto). */
function minimumOf(item: ItemRow) {
  if (item.kind === 'FINISHED_GOOD' && item.productVariant) {
    return item.productVariant.minStock ?? item.productVariant.product.minStock;
  }
  return item.minQuantity;
}

function toSummary(item: ItemRow): StockItemSummary {
  const minimum = minimumOf(item);
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    sku: item.sku,
    category: item.category,
    unit: item.unit,
    quantity: fmt(item.quantity, 3),
    minQuantity: fmt(minimum, 3),
    averageUnitCost: fmtOrNull(item.averageUnitCost, 6),
    supplier: item.supplier,
    notes: item.notes,
    variant: item.productVariant
      ? {
          id: item.productVariant.id,
          productId: item.productVariant.productId,
          productName: item.productVariant.product.name,
          label: variantLabel(item.productVariant),
        }
      : null,
    isBelowMinimum: minimum.greaterThan(0) && item.quantity.lessThan(minimum),
  };
}

export class StockItemsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly materials: MaterialsService,
  ) {}

  async list(rawQuery: ListStockItemsQuery): Promise<Paginated<StockItemSummary>> {
    const query = listStockItemsQuerySchema.parse(rawQuery);
    const where: Prisma.InventoryItemWhereInput = {
      kind: query.kind,
      deletedAt: null,
      ...(query.kind === 'FINISHED_GOOD'
        ? { productVariant: { deletedAt: null, product: { deletedAt: null } } }
        : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // "Somente abaixo do mínimo" depende do mínimo efetivo: filtra em memória (volume pequeno)
    if (query.lowOnly) {
      const all = (
        await this.prisma.inventoryItem.findMany({
          where,
          include: itemInclude,
          orderBy: { name: 'asc' },
        })
      )
        .map(toSummary)
        .filter((i) => i.isBelowMinimum);
      const start = (query.page - 1) * query.pageSize;
      return paginated(
        all.slice(start, start + query.pageSize),
        all.length,
        query.page,
        query.pageSize,
      );
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryItem.findMany({
        where,
        include: itemInclude,
        orderBy: { name: 'asc' },
        ...paginationArgs(query.page, query.pageSize),
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);
    return paginated(rows.map(toSummary), total, query.page, query.pageSize);
  }

  async createSupply(raw: SupplyInput, actor: AuthUser, context: RequestContext) {
    const input = supplyInputSchema.parse(raw);
    await this.assertSupplyUnique(input.name, input.sku ?? null);
    if (input.supplierId) await this.assertSupplier(input.supplierId);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          kind: 'SUPPLY',
          name: input.name,
          sku: input.sku ?? null,
          category: input.category,
          unit: input.unit,
          minQuantity: dec(input.minQuantity),
          supplierId: input.supplierId ?? null,
          notes: input.notes ?? null,
        },
        include: itemInclude,
      });
      await this.audit.record(
        {
          action: 'supply.created',
          actorId: actor.id,
          entity: 'inventory_item',
          entityId: item.id,
          metadata: { name: item.name },
          context,
        },
        tx,
      );
      return toSummary(item);
    });
  }

  async updateSupply(id: string, raw: SupplyInput, actor: AuthUser, context: RequestContext) {
    const input = supplyInputSchema.parse(raw);
    const current = await this.getSupply(id);
    await this.assertSupplyUnique(input.name, input.sku ?? null, id);
    if (input.supplierId) await this.assertSupplier(input.supplierId);
    if (input.unit !== current.unit && !current.quantity.isZero()) {
      throw AppError.badRequest('A unidade só pode ser alterada com o saldo zerado.');
    }
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.update({
        where: { id },
        data: {
          name: input.name,
          sku: input.sku ?? null,
          category: input.category,
          unit: input.unit,
          minQuantity: dec(input.minQuantity),
          supplierId: input.supplierId ?? null,
          notes: input.notes ?? null,
        },
        include: itemInclude,
      });
      await this.audit.record(
        {
          action: 'supply.updated',
          actorId: actor.id,
          entity: 'inventory_item',
          entityId: id,
          metadata: { name: item.name },
          context,
        },
        tx,
      );
      return toSummary(item);
    });
  }

  async removeSupply(id: string, actor: AuthUser, context: RequestContext) {
    const item = await this.getSupply(id);
    if (!item.quantity.isZero()) {
      throw AppError.conflict(
        'Zere o saldo do insumo (baixa por perda ou devolução) antes de excluí-lo.',
      );
    }
    const usages = await this.prisma.productMaterial.count({
      where: { supplyItemId: id, variant: { deletedAt: null, product: { deletedAt: null } } },
    });
    if (usages > 0) {
      throw AppError.conflict(
        `Este insumo está na ficha técnica de ${usages} produto(s). Remova-o das fichas antes.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(
        {
          action: 'supply.deleted',
          actorId: actor.id,
          entity: 'inventory_item',
          entityId: id,
          metadata: { name: item.name },
          context,
        },
        tx,
      );
    });
  }

  /** Alertas de reposição calculados com os saldos atuais. */
  async alerts(): Promise<StockAlert[]> {
    const alerts: StockAlert[] = [];
    const fmtBr = (value: string) =>
      Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

    for (const material of await this.materials.list()) {
      if (!material.isBelowMinimum) continue;
      const empty = Number(material.availableGrams) <= 0;
      alerts.push({
        kind: 'MATERIAL_LOW',
        severity: empty ? 'critical' : 'warning',
        title: `${material.name}: ${empty ? 'sem estoque' : 'abaixo do mínimo'}`,
        detail: `${fmtBr(material.availableGrams)} g disponíveis (mínimo ${fmtBr(material.minStockGrams)} g). Necessário repor.`,
        link: '/estoque/filamentos',
      });
    }

    const lowRolls = await this.prisma.materialRoll.findMany({
      where: {
        status: { in: ['IN_STOCK', 'IN_USE'] },
        remainingWeightGrams: { gt: 0, lt: LOW_ROLL_THRESHOLD_GRAMS },
        material: { deletedAt: null },
      },
      include: { material: { select: { name: true } } },
      orderBy: { remainingWeightGrams: 'asc' },
    });
    for (const roll of lowRolls) {
      alerts.push({
        kind: 'ROLL_LOW',
        severity: 'warning',
        title: `Rolo ${roll.code} próximo do fim`,
        detail: `${roll.material.name}: restam ${fmtBr(roll.remainingWeightGrams.toString())} g.`,
        link: '/estoque/rolos',
      });
    }

    const items = await this.prisma.inventoryItem.findMany({
      where: {
        deletedAt: null,
        OR: [
          { kind: 'SUPPLY' },
          { productVariant: { deletedAt: null, product: { deletedAt: null } } },
        ],
      },
      include: itemInclude,
    });
    for (const item of items.map(toSummary).filter((i) => i.isBelowMinimum)) {
      const isSupply = item.kind === 'SUPPLY';
      alerts.push({
        kind: isSupply ? 'SUPPLY_LOW' : 'FINISHED_GOOD_LOW',
        severity: isSupply && Number(item.quantity) <= 0 ? 'critical' : 'warning',
        title: `${item.name}: abaixo do mínimo`,
        detail: `Saldo ${fmtBr(item.quantity)} (mínimo ${fmtBr(item.minQuantity)}).`,
        link: isSupply ? '/estoque/insumos' : '/estoque/produtos-acabados',
      });
    }

    return alerts.sort((a, b) =>
      a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1,
    );
  }

  private async getSupply(id: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, kind: 'SUPPLY', deletedAt: null },
    });
    if (!item) throw AppError.notFound('Insumo não encontrado.');
    return item;
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

  private async assertSupplyUnique(name: string, sku: string | null, ignoreId?: string) {
    const existing = await this.prisma.inventoryItem.findFirst({
      where: {
        kind: 'SUPPLY',
        deletedAt: null,
        OR: [{ name: { equals: name, mode: 'insensitive' } }, ...(sku ? [{ sku }] : [])],
      },
      select: { id: true },
    });
    if (existing && existing.id !== ignoreId) {
      throw AppError.conflict('Já existe um insumo com este nome ou código.');
    }
  }
}
