import {
  ALLOWED_MOVEMENTS,
  listMovementsQuerySchema,
  MOVEMENT_DIRECTION,
  MOVEMENT_TYPE_LABELS,
  STOCK_UNIT_LABELS,
  type AuthUser,
  type ListMovementsQuery,
  type MovementEntry,
  type MovementType,
  type Paginated,
  type RegisterMovementInput,
  registerMovementSchema,
} from '@alipe3d/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/app-error.js';
import { dec, Decimal, fmt, fmtOrNull, ZERO } from '../../utils/decimal.js';
import { paginated, paginationArgs } from '../../utils/pagination.js';
import type { RequestContext } from '../../utils/request-context.js';
import type { AuditService } from '../audit/audit.service.js';

type Tx = Prisma.TransactionClient;

export type MovementTarget = { rollId: string } | { stockItemId: string };

export interface ApplyMovementInput {
  target: MovementTarget;
  type: MovementType;
  /** Quantidade com sinal (positiva = entrada). */
  delta: Decimal;
  reason: string;
  userId: string;
  occurredAt?: Date;
  /** Custo unitário da entrada (compra de insumo). */
  unitCost?: Decimal | null;
  /** Saldo negativo autorizado (a permissão já deve ter sido conferida pelo chamador). */
  allowNegative?: boolean;
  referenceType?: string;
  referenceId?: string;
}

export interface AppliedMovement {
  id: string;
  balanceAfter: Decimal;
  negativeAuthorized: boolean;
}

/**
 * Único ponto do sistema que altera saldos de estoque.
 * Todas as entradas e saídas (manuais e, nas próximas fases, de produção e pedidos) passam por aqui.
 */
export class MovementsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  /**
   * Aplica uma movimentação dentro de uma transação existente.
   * A linha do rolo/item é travada (SELECT ... FOR UPDATE) para que lançamentos simultâneos
   * não leiam o mesmo saldo e o deixem inconsistente.
   */
  async apply(tx: Tx, input: ApplyMovementInput): Promise<AppliedMovement> {
    if (input.delta.isZero()) throw AppError.badRequest('A quantidade deve ser diferente de zero.');
    const occurredAt = input.occurredAt ?? new Date();

    if ('rollId' in input.target) {
      const rollId = input.target.rollId;
      await tx.$executeRaw`SELECT 1 FROM material_rolls WHERE id = ${rollId}::uuid FOR UPDATE`;
      const roll = await tx.materialRoll.findUnique({ where: { id: rollId } });
      if (!roll) throw AppError.notFound('Rolo não encontrado.');
      if (roll.status === 'DISCARDED') {
        throw AppError.badRequest('Este rolo foi descartado e não recebe movimentações.');
      }

      const balanceAfter = roll.remainingWeightGrams.plus(input.delta);
      const negative = this.checkNegative(
        balanceAfter,
        roll.remainingWeightGrams,
        'g',
        input.allowNegative,
      );
      const costPerGram = roll.purchaseCost.dividedBy(roll.initialWeightGrams);

      const status = balanceAfter.lessThanOrEqualTo(0)
        ? 'EMPTY'
        : roll.status === 'EMPTY' || (roll.status === 'IN_STOCK' && input.delta.isNegative())
          ? 'IN_USE'
          : roll.status;

      await tx.materialRoll.update({
        where: { id: rollId },
        data: { remainingWeightGrams: balanceAfter, status },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          type: input.type,
          materialRollId: rollId,
          quantity: input.delta,
          balanceAfter,
          unitCost: costPerGram,
          totalCost: input.delta.abs().times(costPerGram).toDecimalPlaces(2),
          reason: input.reason,
          negativeAuthorized: negative,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          userId: input.userId,
          occurredAt,
        },
      });
      return { id: movement.id, balanceAfter, negativeAuthorized: negative };
    }

    const itemId = input.target.stockItemId;
    await tx.$executeRaw`SELECT 1 FROM inventory_items WHERE id = ${itemId}::uuid FOR UPDATE`;
    const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item || item.deletedAt) throw AppError.notFound('Item de estoque não encontrado.');

    const balanceAfter = item.quantity.plus(input.delta);
    const negative = this.checkNegative(
      balanceAfter,
      item.quantity,
      STOCK_UNIT_LABELS[item.unit],
      input.allowNegative,
    );

    // Custo médio ponderado: só entradas com custo informado alteram a média.
    let averageUnitCost = item.averageUnitCost;
    let unitCost: Decimal | null = item.averageUnitCost;
    if (input.delta.isPositive() && input.unitCost) {
      unitCost = input.unitCost;
      const currentQty = Decimal.max(item.quantity, ZERO);
      const currentValue = currentQty.times(item.averageUnitCost ?? input.unitCost);
      averageUnitCost = currentValue
        .plus(input.delta.times(input.unitCost))
        .dividedBy(currentQty.plus(input.delta))
        .toDecimalPlaces(6);
    }

    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { quantity: balanceAfter, averageUnitCost },
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        type: input.type,
        inventoryItemId: itemId,
        quantity: input.delta,
        balanceAfter,
        unitCost,
        totalCost: unitCost ? input.delta.abs().times(unitCost).toDecimalPlaces(2) : null,
        reason: input.reason,
        negativeAuthorized: negative,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        userId: input.userId,
        occurredAt,
      },
    });
    return { id: movement.id, balanceAfter, negativeAuthorized: negative };
  }

  /** Lançamento manual feito pela tela de estoque. */
  async register(raw: RegisterMovementInput, actor: AuthUser, context: RequestContext) {
    const input = registerMovementSchema.parse(raw);

    if (input.type === 'ADJUSTMENT' && !actor.permissions.includes('inventory:adjust')) {
      throw AppError.forbidden(
        'Ajustes manuais exigem a permissão "Fazer ajustes manuais de estoque".',
      );
    }
    if (input.allowNegative && !actor.permissions.includes('inventory:allow-negative')) {
      throw AppError.forbidden('Somente um administrador pode autorizar saldo negativo.');
    }

    const targetKind = input.rollId ? 'ROLL' : await this.itemKind(input.stockItemId ?? '');
    if (!ALLOWED_MOVEMENTS[targetKind].includes(input.type)) {
      throw AppError.badRequest(`"${MOVEMENT_TYPE_LABELS[input.type]}" não se aplica a este item.`);
    }
    if (input.unitCost && input.type !== 'PURCHASE_IN') {
      throw AppError.badRequest('O custo unitário só é informado em entradas por compra.');
    }

    const direction =
      input.type === 'ADJUSTMENT'
        ? input.direction === 'IN'
          ? 1
          : -1
        : MOVEMENT_DIRECTION[input.type];
    const delta = dec(input.quantity).times(direction);
    const target: MovementTarget = input.rollId
      ? { rollId: input.rollId }
      : { stockItemId: input.stockItemId ?? '' };

    return this.prisma.$transaction(async (tx) => {
      const applied = await this.apply(tx, {
        target,
        type: input.type,
        delta,
        reason: input.reason,
        userId: actor.id,
        occurredAt: input.occurredAt ? new Date(`${input.occurredAt}T12:00:00-03:00`) : new Date(),
        unitCost: input.unitCost ? dec(input.unitCost) : null,
        allowNegative: input.allowNegative,
      });

      const targetMeta = { ...target, quantity: delta.toString(), reason: input.reason };
      if (input.type === 'ADJUSTMENT') {
        await this.audit.record(
          {
            action: 'inventory.adjusted',
            actorId: actor.id,
            entity: 'inventory_movement',
            entityId: applied.id,
            metadata: targetMeta,
            context,
          },
          tx,
        );
      }
      if (applied.negativeAuthorized) {
        await this.audit.record(
          {
            action: 'inventory.negative_authorized',
            actorId: actor.id,
            entity: 'inventory_movement',
            entityId: applied.id,
            metadata: { ...targetMeta, balanceAfter: applied.balanceAfter.toString() },
            context,
          },
          tx,
        );
      }
      return { id: applied.id, balanceAfter: applied.balanceAfter.toString() };
    });
  }

  async list(rawQuery: ListMovementsQuery): Promise<Paginated<MovementEntry>> {
    const query = listMovementsQuerySchema.parse(rawQuery);
    const occurredAt: Prisma.DateTimeFilter = {};
    if (query.from) occurredAt.gte = new Date(`${query.from}T00:00:00-03:00`);
    if (query.to) occurredAt.lte = new Date(`${query.to}T23:59:59.999-03:00`);

    const where: Prisma.InventoryMovementWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.rollId ? { materialRollId: query.rollId } : {}),
      ...(query.stockItemId ? { inventoryItemId: query.stockItemId } : {}),
      ...(query.materialId ? { materialRoll: { materialId: query.materialId } } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.from || query.to ? { occurredAt } : {}),
      ...(query.target === 'ROLL' ? { materialRollId: { not: null } } : {}),
      ...(query.target === 'SUPPLY' || query.target === 'FINISHED_GOOD'
        ? { inventoryItem: { kind: query.target } }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        orderBy: [{ occurredAt: query.order }, { createdAt: query.order }],
        ...paginationArgs(query.page, query.pageSize),
        include: {
          user: { select: { id: true, name: true } },
          materialRoll: { select: { id: true, code: true, material: { select: { name: true } } } },
          inventoryItem: { select: { id: true, kind: true, name: true, unit: true } },
        },
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return paginated(
      rows.map((row): MovementEntry => {
        const isRoll = !!row.materialRoll;
        return {
          id: row.id,
          type: row.type,
          quantity: fmt(row.quantity, isRoll ? 2 : 3),
          balanceAfter: fmt(row.balanceAfter, isRoll ? 2 : 3),
          unit: isRoll ? 'g' : (row.inventoryItem?.unit ?? 'UN'),
          unitCost: fmtOrNull(row.unitCost, 6),
          totalCost: fmtOrNull(row.totalCost, 2),
          reason: row.reason,
          negativeAuthorized: row.negativeAuthorized,
          occurredAt: row.occurredAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
          target: row.materialRoll
            ? {
                kind: 'ROLL',
                id: row.materialRoll.id,
                label: `${row.materialRoll.code} · ${row.materialRoll.material.name}`,
              }
            : {
                kind: row.inventoryItem?.kind ?? 'SUPPLY',
                id: row.inventoryItem?.id ?? '',
                label: row.inventoryItem?.name ?? '',
              },
          user: row.user,
        };
      }),
      total,
      query.page,
      query.pageSize,
    );
  }

  private checkNegative(
    balanceAfter: Decimal,
    current: Decimal,
    unit: string,
    allowNegative = false,
  ): boolean {
    if (!balanceAfter.isNegative()) return false;
    if (!allowNegative) {
      throw AppError.conflict(
        `Saldo insuficiente: disponível ${current.toString().replace('.', ',')} ${unit}. ` +
          'Confira a quantidade ou registre a entrada que está faltando.',
      );
    }
    return true;
  }

  private async itemKind(id: string): Promise<'SUPPLY' | 'FINISHED_GOOD'> {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      select: { kind: true, deletedAt: true },
    });
    if (!item || item.deletedAt) throw AppError.notFound('Item de estoque não encontrado.');
    return item.kind;
  }
}
