import {
  printerInputSchema,
  printerStatusInputSchema,
  QUEUE_STATUSES,
  type AuthUser,
  type PrinterActiveJob,
  type PrinterInput,
  type PrinterStatusInput,
  type PrinterSummary,
} from '@alipe3d/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/app-error.js';
import { dec, fmt } from '../../utils/decimal.js';
import type { RequestContext } from '../../utils/request-context.js';
import type { AuditService } from '../audit/audit.service.js';
import { variantLabel } from '../products/variant-label.js';
import { dateOnly, maintenanceDue, todayInSaoPaulo } from '../production/production-rules.js';

export const ACTIVE_JOB_STATUSES = ['IN_PROGRESS', 'PAUSED'] as const;

const printerInclude = {
  printJobs: {
    where: { status: { in: [...ACTIVE_JOB_STATUSES] } },
    take: 1,
    include: {
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
      roll: {
        select: { id: true, code: true, material: { select: { name: true, colorHex: true } } },
      },
    },
  },
  maintenances: {
    orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
    take: 1,
    select: { performedAt: true, nextMaintenanceAt: true },
  },
  _count: {
    select: { productionOrders: { where: { status: { in: [...QUEUE_STATUSES] } } } },
  },
} satisfies Prisma.PrinterInclude;

type PrinterRow = Prisma.PrinterGetPayload<{ include: typeof printerInclude }>;

interface PrinterStats {
  jobs: number;
  failed: number;
  seconds: number;
}

export class PrintersService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<PrinterSummary[]> {
    const printers = await this.prisma.printer.findMany({
      where: { deletedAt: null },
      include: printerInclude,
      orderBy: { code: 'asc' },
    });
    const stats = await this.stats(printers.map((p) => p.id));
    return printers.map((p) => this.toSummary(p, stats.get(p.id)));
  }

  async get(id: string): Promise<PrinterSummary> {
    const printer = await this.prisma.printer.findFirst({
      where: { id, deletedAt: null },
      include: printerInclude,
    });
    if (!printer) throw AppError.notFound('Impressora não encontrada.');
    const stats = await this.stats([id]);
    return this.toSummary(printer, stats.get(id));
  }

  async create(raw: PrinterInput, actor: AuthUser, context: RequestContext) {
    const input = printerInputSchema.parse(raw);
    await this.assertCodeAvailable(input.code);
    const id = await this.prisma.$transaction(async (tx) => {
      const printer = await tx.printer.create({ data: this.toData(input) });
      await this.audit.record(
        {
          action: 'printer.created',
          actorId: actor.id,
          entity: 'printer',
          entityId: printer.id,
          metadata: { code: printer.code, model: printer.model },
          context,
        },
        tx,
      );
      return printer.id;
    });
    return this.get(id);
  }

  async update(id: string, raw: PrinterInput, actor: AuthUser, context: RequestContext) {
    const input = printerInputSchema.parse(raw);
    const current = await this.load(id);
    if (input.code !== current.code) await this.assertCodeAvailable(input.code);
    await this.prisma.$transaction(async (tx) => {
      await tx.printer.update({ where: { id }, data: this.toData(input) });
      await this.audit.record(
        {
          action: 'printer.updated',
          actorId: actor.id,
          entity: 'printer',
          entityId: id,
          metadata: {
            code: input.code,
            ...(input.code !== current.code ? { previousCode: current.code } : {}),
            ...(input.initialHours !== fmt(current.initialHours, 1)
              ? { initialHours: { from: fmt(current.initialHours, 1), to: input.initialHours } }
              : {}),
          },
          context,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Disponível, em manutenção ou inativa. Não muda enquanto houver impressão em andamento. */
  async setStatus(id: string, raw: PrinterStatusInput, actor: AuthUser, context: RequestContext) {
    const input = printerStatusInputSchema.parse(raw);
    const printer = await this.load(id);
    if (printer.status === input.status) return this.get(id);
    await this.assertIdle(id, 'mudar a situação');

    await this.prisma.$transaction(async (tx) => {
      await tx.printer.update({ where: { id }, data: { status: input.status } });
      await this.audit.record(
        {
          action: 'printer.status_changed',
          actorId: actor.id,
          entity: 'printer',
          entityId: id,
          metadata: {
            code: printer.code,
            from: printer.status,
            to: input.status,
            ...(input.reason ? { reason: input.reason } : {}),
          },
          context,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Exclusão lógica. O histórico de impressões e manutenções é preservado. */
  async remove(id: string, actor: AuthUser, context: RequestContext) {
    const printer = await this.load(id);
    await this.assertIdle(id, 'excluir');
    const queued = await this.prisma.productionOrder.count({
      where: { printerId: id, status: { in: [...QUEUE_STATUSES] } },
    });
    if (queued > 0) {
      throw AppError.conflict(
        `Há ${queued} ordem(ns) de produção planejada(s) nesta impressora. Mude-as de impressora antes.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.printer.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(
        {
          action: 'printer.deleted',
          actorId: actor.id,
          entity: 'printer',
          entityId: id,
          metadata: { code: printer.code },
          context,
        },
        tx,
      );
    });
  }

  /** Impressora existente (não excluída). Usado também pela produção. */
  async load(id: string) {
    const printer = await this.prisma.printer.findFirst({ where: { id, deletedAt: null } });
    if (!printer) throw AppError.notFound('Impressora não encontrada.');
    return printer;
  }

  private async assertIdle(id: string, action: string) {
    const active = await this.prisma.printJob.count({
      where: { printerId: id, status: { in: [...ACTIVE_JOB_STATUSES] } },
    });
    if (active > 0) {
      throw AppError.conflict(
        `Há uma impressão em andamento nesta impressora. Finalize-a antes de ${action}.`,
      );
    }
  }

  private async assertCodeAvailable(code: string) {
    const existing = await this.prisma.printer.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existing) {
      throw AppError.conflict(
        `A identificação ${code} já está em uso (inclusive em impressoras excluídas).`,
      );
    }
  }

  private toData(input: ReturnType<typeof printerInputSchema.parse>) {
    return {
      code: input.code,
      name: input.name ?? null,
      model: input.model,
      serialNumber: input.serialNumber ?? null,
      acquiredAt: input.acquiredAt ? new Date(`${input.acquiredAt}T00:00:00Z`) : null,
      initialHours: dec(input.initialHours),
      notes: input.notes ?? null,
    };
  }

  /** Impressões finalizadas por impressora: quantidade, falhas e tempo efetivo (sem pausas). */
  private async stats(printerIds: string[]): Promise<Map<string, PrinterStats>> {
    if (printerIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      { printer_id: string; jobs: number; failed: number; seconds: number }[]
    >`
      SELECT printer_id::text AS printer_id,
             COUNT(*)::int AS jobs,
             (COUNT(*) FILTER (WHERE status = 'FAILED'))::int AS failed,
             COALESCE(SUM(GREATEST(EXTRACT(EPOCH FROM finished_at - started_at) - paused_seconds, 0)), 0)::float8 AS seconds
        FROM print_jobs
       WHERE finished_at IS NOT NULL
         AND printer_id = ANY(${printerIds}::uuid[])
       GROUP BY printer_id`;
    return new Map(
      rows.map((r) => [r.printer_id, { jobs: r.jobs, failed: r.failed, seconds: r.seconds }]),
    );
  }

  private toSummary(p: PrinterRow, stats: PrinterStats | undefined): PrinterSummary {
    const job = p.printJobs[0];
    const activeJob: PrinterActiveJob | null = job
      ? {
          id: job.id,
          status: job.status as PrinterActiveJob['status'],
          startedAt: job.startedAt.toISOString(),
          pausedAt: job.pausedAt?.toISOString() ?? null,
          pausedSeconds: job.pausedSeconds,
          plannedQuantity: job.plannedQuantity,
          estimatedMinutes: job.estimatedMinutes,
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
        }
      : null;

    const printedHours = dec((stats?.seconds ?? 0) / 3600);
    const last = p.maintenances[0];
    const next = last?.nextMaintenanceAt ? dateOnly(last.nextMaintenanceAt) : null;

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      model: p.model,
      serialNumber: p.serialNumber,
      acquiredAt: p.acquiredAt ? dateOnly(p.acquiredAt) : null,
      status: p.status,
      activity: activeJob ? (activeJob.status === 'PAUSED' ? 'PAUSED' : 'PRINTING') : p.status,
      notes: p.notes,
      initialHours: fmt(p.initialHours, 1),
      totalHours: fmt(p.initialHours.plus(printedHours), 1),
      stats: {
        jobs: stats?.jobs ?? 0,
        failedJobs: stats?.failed ?? 0,
        printedHours: fmt(printedHours, 1),
      },
      activeJob,
      queuedOrders: p._count.productionOrders,
      lastMaintenanceAt: last ? dateOnly(last.performedAt) : null,
      nextMaintenanceAt: next,
      maintenanceDue: maintenanceDue(next, todayInSaoPaulo()),
    };
  }
}
