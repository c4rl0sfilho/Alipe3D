import {
  FAILURE_REASON_LABELS,
  finishPrintJobSchema,
  listPrintJobsQuerySchema,
  startPrintJobSchema,
  type AuthUser,
  type FinishPrintJobInput,
  type ListPrintJobsQuery,
  type Paginated,
  type PrintJobConsumption,
  type PrintJobEntry,
  type StartPrintJobInput,
} from '@alipe3d/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/app-error.js';
import { dec, fmt, ZERO } from '../../utils/decimal.js';
import { paginated, paginationArgs } from '../../utils/pagination.js';
import type { RequestContext } from '../../utils/request-context.js';
import type { AuditService } from '../audit/audit.service.js';
import type { MovementsService } from '../inventory/movements.service.js';
import { ACTIVE_JOB_STATUSES } from '../printers/printers.service.js';
import { variantLabel } from '../products/variant-label.js';
import {
  isClosedStatus,
  netPrintSeconds,
  remainingToPrint,
  resolveIdleStatus,
} from './production-rules.js';

type Tx = Prisma.TransactionClient;

export const PRINT_JOB_REFERENCE = 'PRINT_JOB';

/** Tolerância para relógios levemente adiantados no navegador. */
const CLOCK_TOLERANCE_MS = 2 * 60_000;

const jobInclude = {
  printer: { select: { id: true, code: true, name: true } },
  productionOrder: {
    select: {
      id: true,
      code: true,
      variant: {
        select: {
          isDefault: true,
          color: true,
          material: true,
          size: true,
          model: true,
          product: { select: { name: true } },
        },
      },
    },
  },
  roll: { select: { id: true, code: true, material: { select: { name: true, colorHex: true } } } },
  startedBy: { select: { id: true, name: true } },
  finishedBy: { select: { id: true, name: true } },
} satisfies Prisma.PrintJobInclude;

type JobRow = Prisma.PrintJobGetPayload<{ include: typeof jobInclude }>;

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';

const lockOrder = (tx: Tx, id: string) =>
  tx.$executeRaw`SELECT 1 FROM production_orders WHERE id = ${id}::uuid FOR UPDATE`;

/**
 * Impressões: início, pausa e finalização.
 * A baixa de filamento acontece só ao finalizar, numa transação com a linha da impressão travada.
 * O índice único do livro-razão (impressão + tipo + rolo) impede uma segunda baixa.
 */
export class PrintJobsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly movements: MovementsService,
  ) {}

  // ---------------------------------------------------------------- consultas

  async list(rawQuery: ListPrintJobsQuery): Promise<Paginated<PrintJobEntry>> {
    const query = listPrintJobsQuerySchema.parse(rawQuery);
    const startedAt: Prisma.DateTimeFilter = {};
    if (query.from) startedAt.gte = new Date(`${query.from}T00:00:00-03:00`);
    if (query.to) startedAt.lte = new Date(`${query.to}T23:59:59.999-03:00`);

    const where: Prisma.PrintJobWhereInput = {
      ...(query.printerId ? { printerId: query.printerId } : {}),
      ...(query.productionOrderId ? { productionOrderId: query.productionOrderId } : {}),
      ...(query.status === 'active'
        ? { status: { in: [...ACTIVE_JOB_STATUSES] } }
        : query.status === 'finished'
          ? { status: { in: ['SUCCEEDED', 'FAILED'] } }
          : query.status
            ? { status: query.status }
            : {}),
      ...(query.failureReason ? { failureReason: query.failureReason } : {}),
      ...(query.from || query.to ? { startedAt } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.printJob.findMany({
        where,
        include: jobInclude,
        orderBy: [{ startedAt: query.order }, { id: query.order }],
        ...paginationArgs(query.page, query.pageSize),
      }),
      this.prisma.printJob.count({ where }),
    ]);
    return paginated(await this.toEntries(rows), total, query.page, query.pageSize);
  }

  /** Todas as impressões de uma ordem (detalhe da ordem). */
  async forOrder(productionOrderId: string): Promise<PrintJobEntry[]> {
    const rows = await this.prisma.printJob.findMany({
      where: { productionOrderId },
      include: jobInclude,
      orderBy: { startedAt: 'desc' },
    });
    return this.toEntries(rows);
  }

  // ---------------------------------------------------------------- operação

  /** Inicia uma impressão da ordem: atribui a impressora e ocupa a máquina. */
  async start(orderId: string, raw: StartPrintJobInput, actor: AuthUser) {
    const input = startPrintJobSchema.parse(raw);
    const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
    if (startedAt.getTime() > Date.now() + CLOCK_TOLERANCE_MS) {
      throw AppError.badRequest('O início não pode estar no futuro.', [
        { field: 'startedAt', message: 'Use um horário até agora' },
      ]);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockOrder(tx, orderId);
        const order = await tx.productionOrder.findUnique({ where: { id: orderId } });
        if (!order) throw AppError.notFound('Ordem de produção não encontrada.');
        if (order.status === 'IN_PROGRESS' || order.status === 'PAUSED') {
          throw AppError.conflict('Esta ordem já tem uma impressão em andamento.');
        }
        if (order.status !== 'PENDING' && order.status !== 'PLANNED') {
          throw AppError.conflict('Esta ordem não está na fila de produção.');
        }
        const remaining = remainingToPrint(order);
        if (input.plannedQuantity > remaining) {
          throw AppError.badRequest(
            `Faltam ${remaining} peça(s) nesta ordem. Ajuste a quantidade da impressão.`,
            [{ field: 'plannedQuantity', message: `Máximo: ${remaining}` }],
          );
        }

        // Trava a impressora: duas impressões não começam ao mesmo tempo na mesma máquina
        await tx.$executeRaw`SELECT 1 FROM printers WHERE id = ${input.printerId}::uuid FOR UPDATE`;
        const printer = await tx.printer.findFirst({
          where: { id: input.printerId, deletedAt: null },
        });
        if (!printer) throw AppError.badRequest('Impressora não encontrada.');
        if (printer.status !== 'AVAILABLE') {
          throw AppError.conflict(
            `A impressora ${printer.code} está ${printer.status === 'MAINTENANCE' ? 'em manutenção' : 'inativa'}.`,
          );
        }
        const busy = await tx.printJob.findFirst({
          where: { printerId: printer.id, status: { in: [...ACTIVE_JOB_STATUSES] } },
          select: { productionOrder: { select: { code: true } } },
        });
        if (busy) {
          throw AppError.conflict(
            `A impressora ${printer.code} já está imprimindo a ordem ${busy.productionOrder.code}.`,
          );
        }

        const roll = await tx.materialRoll.findUnique({ where: { id: input.rollId } });
        if (!roll) throw AppError.badRequest('Rolo não encontrado.');
        if (roll.status === 'EMPTY' || roll.status === 'DISCARDED') {
          throw AppError.badRequest(`O rolo ${roll.code} está vazio ou descartado.`);
        }

        const job = await tx.printJob.create({
          data: {
            productionOrderId: orderId,
            printerId: printer.id,
            rollId: roll.id,
            plannedQuantity: input.plannedQuantity,
            estimatedGrams: dec(input.estimatedGrams),
            estimatedMinutes: input.estimatedMinutes,
            startedAt,
            notes: input.notes ?? null,
            startedById: actor.id,
          },
        });
        await tx.productionOrder.update({
          where: { id: orderId },
          data: {
            status: 'IN_PROGRESS',
            printerId: printer.id,
            materialId: order.materialId ?? roll.materialId,
          },
        });
        // O rolo carregado na impressora deixa de ser "lacrado"
        if (roll.status === 'IN_STOCK') {
          await tx.materialRoll.update({ where: { id: roll.id }, data: { status: 'IN_USE' } });
        }
        return { id: job.id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict(
          'A impressora ou a ordem acabou de receber outra impressão. Atualize a tela.',
        );
      }
      throw error;
    }
  }

  async pause(jobId: string) {
    return this.prisma.$transaction(async (tx) => {
      const job = await this.lockJob(tx, jobId);
      if (job.status !== 'IN_PROGRESS') {
        throw AppError.conflict('Só uma impressão em andamento pode ser pausada.');
      }
      await tx.printJob.update({
        where: { id: jobId },
        data: { status: 'PAUSED', pausedAt: new Date() },
      });
      await tx.productionOrder.update({
        where: { id: job.productionOrderId },
        data: { status: 'PAUSED' },
      });
      return { id: jobId };
    });
  }

  async resume(jobId: string) {
    return this.prisma.$transaction(async (tx) => {
      const job = await this.lockJob(tx, jobId);
      if (job.status !== 'PAUSED' || !job.pausedAt) {
        throw AppError.conflict('Esta impressão não está pausada.');
      }
      const pausedFor = Math.max(0, Math.round((Date.now() - job.pausedAt.getTime()) / 1000));
      await tx.printJob.update({
        where: { id: jobId },
        data: {
          status: 'IN_PROGRESS',
          pausedAt: null,
          pausedSeconds: job.pausedSeconds + pausedFor,
        },
      });
      await tx.productionOrder.update({
        where: { id: job.productionOrderId },
        data: { status: 'IN_PROGRESS' },
      });
      return { id: jobId };
    });
  }

  /**
   * Finaliza a impressão com sucesso ou falha, numa única transação:
   * baixa o filamento real (ou desperdiçado) dos rolos, atualiza a ordem e libera a impressora.
   */
  async finish(jobId: string, raw: FinishPrintJobInput, actor: AuthUser, context: RequestContext) {
    const input = finishPrintJobSchema.parse(raw);
    if (input.allowNegative && !actor.permissions.includes('inventory:allow-negative')) {
      throw AppError.forbidden('Somente um administrador pode autorizar saldo negativo.');
    }
    const rollIds = input.consumption.map((line) => line.rollId);
    if (new Set(rollIds).size !== rollIds.length) {
      throw AppError.badRequest('Cada rolo pode aparecer só uma vez no consumo.');
    }
    const finishedAt = input.finishedAt ? new Date(input.finishedAt) : new Date();
    if (finishedAt.getTime() > Date.now() + CLOCK_TOLERANCE_MS) {
      throw AppError.badRequest('O término não pode estar no futuro.', [
        { field: 'finishedAt', message: 'Use um horário até agora' },
      ]);
    }

    return this.prisma.$transaction(async (tx) => {
      const job = await this.lockJob(tx, jobId);
      if (job.status !== 'IN_PROGRESS' && job.status !== 'PAUSED') {
        throw AppError.conflict('Esta impressão já foi finalizada. Nada foi baixado novamente.');
      }
      if (finishedAt < job.startedAt) {
        throw AppError.badRequest('O término não pode ser antes do início da impressão.', [
          { field: 'finishedAt', message: 'Confira o horário' },
        ]);
      }
      await lockOrder(tx, job.productionOrderId);
      const order = await tx.productionOrder.findUniqueOrThrow({
        where: { id: job.productionOrderId },
      });

      const success = input.result === 'SUCCESS';
      if (success && input.producedQuantity > job.plannedQuantity) {
        throw AppError.badRequest(
          `Esta impressão foi iniciada para ${job.plannedQuantity} peça(s).`,
          [{ field: 'producedQuantity', message: `Máximo: ${job.plannedQuantity}` }],
        );
      }

      const pausedSeconds =
        job.status === 'PAUSED' && job.pausedAt
          ? job.pausedSeconds +
            Math.max(0, Math.round((finishedAt.getTime() - job.pausedAt.getTime()) / 1000))
          : job.pausedSeconds;
      const netMinutes = Math.round(
        netPrintSeconds({ startedAt: job.startedAt, finishedAt, pausedSeconds }) / 60,
      );

      // Baixa do filamento, um lançamento por rolo
      const reason = success
        ? `${order.code} — impressão concluída (${input.producedQuantity} peça(s))`
        : `${order.code} — falha: ${FAILURE_REASON_LABELS[input.failureReason]}`;
      let gramsTotal = ZERO;
      for (const line of input.consumption) {
        const grams = dec(line.grams);
        if (grams.isZero()) continue;
        gramsTotal = gramsTotal.plus(grams);
        const roll = await tx.materialRoll.findUnique({
          where: { id: line.rollId },
          select: { code: true },
        });
        if (!roll) throw AppError.badRequest('Rolo do consumo não encontrado.');
        try {
          const applied = await this.movements.apply(tx, {
            target: { rollId: line.rollId },
            type: success ? 'PRODUCTION_OUT' : 'WASTE',
            delta: grams.negated(),
            reason,
            userId: actor.id,
            occurredAt: finishedAt,
            allowNegative: input.allowNegative,
            referenceType: PRINT_JOB_REFERENCE,
            referenceId: jobId,
          });
          if (applied.negativeAuthorized) {
            await this.audit.record(
              {
                action: 'inventory.negative_authorized',
                actorId: actor.id,
                entity: 'inventory_movement',
                entityId: applied.id,
                metadata: {
                  rollId: line.rollId,
                  code: roll.code,
                  quantity: grams.negated().toString(),
                  balanceAfter: applied.balanceAfter.toString(),
                  reason,
                },
                context,
              },
              tx,
            );
          }
        } catch (error) {
          if (error instanceof AppError && error.statusCode === 409) {
            throw AppError.conflict(`Rolo ${roll.code}: ${error.message}`);
          }
          throw error;
        }
      }

      const notes = [job.notes, input.notes].filter(Boolean).join('\n') || null;
      await tx.printJob.update({
        where: { id: jobId },
        data: {
          status: success ? 'SUCCEEDED' : 'FAILED',
          finishedAt,
          pausedAt: null,
          pausedSeconds,
          producedQuantity: success ? input.producedQuantity : 0,
          notes,
          finishedById: actor.id,
          ...(success
            ? {}
            : {
                failureReason: input.failureReason,
                failureNotes: input.failureNotes ?? null,
                lostMinutes: input.lostMinutes ?? netMinutes,
                needsReprint: input.needsReprint,
              }),
        },
      });

      // Contadores da ordem e próxima situação
      const counters = {
        ...order,
        producedQuantity: order.producedQuantity + (success ? input.producedQuantity : 0),
      };
      if (!success && !input.needsReprint) {
        // Sem refazer: as peças desta impressão saem da conta do que falta imprimir
        counters.waivedQuantity += Math.min(job.plannedQuantity, remainingToPrint(order));
      }
      const status = resolveIdleStatus(counters);
      await tx.productionOrder.update({
        where: { id: order.id },
        data: {
          producedQuantity: counters.producedQuantity,
          waivedQuantity: counters.waivedQuantity,
          status,
          closedAt: isClosedStatus(status) ? finishedAt : null,
        },
      });

      if (!success) {
        await this.audit.record(
          {
            action: 'production.job_failed',
            actorId: actor.id,
            entity: 'print_job',
            entityId: jobId,
            metadata: {
              order: order.code,
              reason: input.failureReason,
              wastedGrams: gramsTotal.toString(),
              needsReprint: input.needsReprint,
            },
            context,
          },
          tx,
        );
      }
      return { id: jobId, orderStatus: status };
    });
  }

  // ---------------------------------------------------------------- apoio

  private async lockJob(tx: Tx, jobId: string) {
    await tx.$executeRaw`SELECT 1 FROM print_jobs WHERE id = ${jobId}::uuid FOR UPDATE`;
    const job = await tx.printJob.findUnique({ where: { id: jobId } });
    if (!job) throw AppError.notFound('Impressão não encontrada.');
    return job;
  }

  private async toEntries(rows: JobRow[]): Promise<PrintJobEntry[]> {
    if (rows.length === 0) return [];
    const movements = await this.prisma.inventoryMovement.findMany({
      where: { referenceType: PRINT_JOB_REFERENCE, referenceId: { in: rows.map((r) => r.id) } },
      include: {
        materialRoll: {
          select: { code: true, material: { select: { name: true, colorHex: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((job): PrintJobEntry => {
      const consumption: PrintJobConsumption[] = movements
        .filter((m) => m.referenceId === job.id && m.materialRollId)
        .map((m) => ({
          rollId: m.materialRollId ?? '',
          rollCode: m.materialRoll?.code ?? '',
          materialName: m.materialRoll?.material.name ?? '',
          colorHex: m.materialRoll?.material.colorHex ?? null,
          grams: fmt(m.quantity.abs()),
          cost: m.totalCost ? fmt(m.totalCost) : null,
          type: m.type === 'WASTE' ? 'WASTE' : 'PRODUCTION_OUT',
        }));
      const sum = (type: PrintJobConsumption['type']) =>
        consumption.filter((c) => c.type === type).reduce((s, c) => s.plus(c.grams), ZERO);

      return {
        id: job.id,
        status: job.status,
        printer: job.printer,
        order: {
          id: job.productionOrder.id,
          code: job.productionOrder.code,
          productName: job.productionOrder.variant.product.name,
          variantLabel: variantLabel(job.productionOrder.variant),
        },
        roll: {
          id: job.roll.id,
          code: job.roll.code,
          materialName: job.roll.material.name,
          colorHex: job.roll.material.colorHex,
        },
        plannedQuantity: job.plannedQuantity,
        producedQuantity: job.producedQuantity,
        estimatedGrams: fmt(job.estimatedGrams),
        estimatedMinutes: job.estimatedMinutes,
        consumedGrams: fmt(sum('PRODUCTION_OUT')),
        wastedGrams: fmt(sum('WASTE')),
        materialCost: fmt(consumption.reduce((s, c) => s.plus(c.cost ?? 0), ZERO)),
        startedAt: job.startedAt.toISOString(),
        finishedAt: job.finishedAt?.toISOString() ?? null,
        pausedAt: job.pausedAt?.toISOString() ?? null,
        pausedSeconds: job.pausedSeconds,
        durationMinutes: job.finishedAt
          ? Math.round(
              netPrintSeconds({
                startedAt: job.startedAt,
                finishedAt: job.finishedAt,
                pausedSeconds: job.pausedSeconds,
              }) / 60,
            )
          : null,
        failureReason: job.failureReason,
        failureNotes: job.failureNotes,
        lostMinutes: job.lostMinutes,
        needsReprint: job.needsReprint,
        notes: job.notes,
        startedBy: job.startedBy,
        finishedBy: job.finishedBy,
        consumption,
      };
    });
  }
}
