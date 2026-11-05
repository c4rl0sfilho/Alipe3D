import {
  listMaintenanceQuerySchema,
  maintenanceInputSchema,
  type AuthUser,
  type ListMaintenanceQuery,
  type MaintenanceEntry,
  type MaintenanceInput,
  type Paginated,
} from '@alipe3d/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/app-error.js';
import { dec, fmt } from '../../utils/decimal.js';
import { paginated, paginationArgs } from '../../utils/pagination.js';
import type { RequestContext } from '../../utils/request-context.js';
import type { AuditService } from '../audit/audit.service.js';
import { dateOnly, todayInSaoPaulo } from '../production/production-rules.js';
import type { PrintersService } from './printers.service.js';

const include = {
  printer: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.PrinterMaintenanceInclude;

type Row = Prisma.PrinterMaintenanceGetPayload<{ include: typeof include }>;

function toEntry(row: Row): MaintenanceEntry {
  return {
    id: row.id,
    printer: row.printer,
    type: row.type,
    description: row.description,
    performedAt: dateOnly(row.performedAt),
    responsibleName: row.responsibleName,
    partsReplaced: row.partsReplaced,
    cost: fmt(row.cost),
    nextMaintenanceAt: row.nextMaintenanceAt ? dateOnly(row.nextMaintenanceAt) : null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Histórico de manutenção das impressoras. O custo entra no financeiro na Fase 6. */
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly printers: PrintersService,
  ) {}

  async list(rawQuery: ListMaintenanceQuery): Promise<Paginated<MaintenanceEntry>> {
    const query = listMaintenanceQuerySchema.parse(rawQuery);
    const where: Prisma.PrinterMaintenanceWhereInput = query.printerId
      ? { printerId: query.printerId }
      : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.printerMaintenance.findMany({
        where,
        include,
        orderBy: [{ performedAt: query.order }, { createdAt: query.order }],
        ...paginationArgs(query.page, query.pageSize),
      }),
      this.prisma.printerMaintenance.count({ where }),
    ]);
    return paginated(rows.map(toEntry), total, query.page, query.pageSize);
  }

  async create(raw: MaintenanceInput, actor: AuthUser, context: RequestContext) {
    const input = this.parse(raw);
    const printer = await this.printers.load(input.printerId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.printerMaintenance.create({
        data: { ...this.toData(input), createdById: actor.id },
        include,
      });
      await this.audit.record(
        {
          action: 'maintenance.created',
          actorId: actor.id,
          entity: 'printer_maintenance',
          entityId: row.id,
          metadata: {
            printer: printer.code,
            type: input.type,
            performedAt: input.performedAt,
            cost: input.cost,
          },
          context,
        },
        tx,
      );
      return toEntry(row);
    });
  }

  async update(id: string, raw: MaintenanceInput, actor: AuthUser, context: RequestContext) {
    const input = this.parse(raw);
    const current = await this.prisma.printerMaintenance.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('Manutenção não encontrada.');
    const printer = await this.printers.load(input.printerId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.printerMaintenance.update({
        where: { id },
        data: this.toData(input),
        include,
      });
      await this.audit.record(
        {
          action: 'maintenance.updated',
          actorId: actor.id,
          entity: 'printer_maintenance',
          entityId: id,
          metadata: { printer: printer.code, type: input.type, cost: input.cost },
          context,
        },
        tx,
      );
      return toEntry(row);
    });
  }

  async remove(id: string, actor: AuthUser, context: RequestContext) {
    const current = await this.prisma.printerMaintenance.findUnique({ where: { id }, include });
    if (!current) throw AppError.notFound('Manutenção não encontrada.');
    await this.prisma.$transaction(async (tx) => {
      await tx.printerMaintenance.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'maintenance.deleted',
          actorId: actor.id,
          entity: 'printer_maintenance',
          entityId: id,
          metadata: {
            printer: current.printer.code,
            type: current.type,
            performedAt: dateOnly(current.performedAt),
            description: current.description,
          },
          context,
        },
        tx,
      );
    });
  }

  private parse(raw: MaintenanceInput) {
    const input = maintenanceInputSchema.parse(raw);
    if (input.performedAt > todayInSaoPaulo()) {
      throw AppError.badRequest('A data da manutenção não pode estar no futuro.', [
        { field: 'performedAt', message: 'Use a data em que a manutenção foi feita' },
      ]);
    }
    return input;
  }

  private toData(input: ReturnType<typeof maintenanceInputSchema.parse>) {
    return {
      printerId: input.printerId,
      type: input.type,
      description: input.description,
      performedAt: new Date(`${input.performedAt}T00:00:00Z`),
      responsibleName: input.responsibleName,
      partsReplaced: input.partsReplaced ?? null,
      cost: dec(input.cost),
      nextMaintenanceAt: input.nextMaintenanceAt
        ? new Date(`${input.nextMaintenanceAt}T00:00:00Z`)
        : null,
    };
  }
}
