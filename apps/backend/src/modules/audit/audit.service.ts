import {
  listAuditLogsQuerySchema,
  type AuditAction,
  type AuditLogEntry,
  type ListAuditLogsQuery,
  type Paginated,
} from '@alipe3d/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { DbClient } from '../../prisma/types.js';
import { paginated, paginationArgs } from '../../utils/pagination.js';
import type { RequestContext } from '../../utils/request-context.js';

export interface AuditEntry {
  action: AuditAction;
  actorId?: string | null;
  entity?: string;
  entityId?: string;
  /** Nunca inclua senhas, hashes ou tokens. */
  metadata?: Prisma.InputJsonValue;
  context?: RequestContext;
}

export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Registra uma operação. Passe `db` para gravar dentro de uma transação existente. */
  async record(entry: AuditEntry, db: DbClient = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        action: entry.action,
        userId: entry.actorId ?? null,
        entity: entry.entity ?? null,
        entityId: entry.entityId ?? null,
        ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
        ip: entry.context?.ip ?? null,
        userAgent: entry.context?.userAgent ?? null,
      },
    });
  }

  async list(rawQuery: ListAuditLogsQuery): Promise<Paginated<AuditLogEntry>> {
    const query = listAuditLogsQuerySchema.parse(rawQuery);

    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) createdAt.gte = new Date(`${query.from}T00:00:00-03:00`);
    if (query.to) createdAt.lte = new Date(`${query.to}T23:59:59.999-03:00`);

    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.from || query.to ? { createdAt } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: query.order },
        ...paginationArgs(query.page, query.pageSize),
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginated(
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
        ip: row.ip,
        createdAt: row.createdAt.toISOString(),
        user: row.user,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }
}
