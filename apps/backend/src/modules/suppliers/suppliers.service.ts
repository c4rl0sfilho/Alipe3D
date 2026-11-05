import {
  supplierInputSchema,
  type AuthUser,
  type SupplierInput,
  type SupplierSummary,
} from '@alipe3d/shared';
import type { PrismaClient, Supplier } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/app-error.js';
import type { RequestContext } from '../../utils/request-context.js';
import type { AuditService } from '../audit/audit.service.js';

function toSummary(s: Supplier): SupplierSummary {
  return {
    id: s.id,
    name: s.name,
    document: s.document,
    contactName: s.contactName,
    email: s.email,
    phone: s.phone,
    website: s.website,
    notes: s.notes,
  };
}

export class SuppliersService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(search?: string): Promise<SupplierSummary[]> {
    const term = search?.trim();
    const rows = await this.prisma.supplier.findMany({
      where: {
        deletedAt: null,
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { document: { contains: term } },
                { contactName: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
    });
    return rows.map(toSummary);
  }

  async create(raw: SupplierInput, actor: AuthUser, context: RequestContext) {
    const input = supplierInputSchema.parse(raw);
    await this.assertNameAvailable(input.name);
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({ data: input });
      await this.audit.record(
        {
          action: 'supplier.created',
          actorId: actor.id,
          entity: 'supplier',
          entityId: supplier.id,
          metadata: { name: supplier.name },
          context,
        },
        tx,
      );
      return toSummary(supplier);
    });
  }

  async update(id: string, raw: SupplierInput, actor: AuthUser, context: RequestContext) {
    const input = supplierInputSchema.parse(raw);
    await this.get(id);
    await this.assertNameAvailable(input.name, id);
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.update({ where: { id }, data: input });
      await this.audit.record(
        {
          action: 'supplier.updated',
          actorId: actor.id,
          entity: 'supplier',
          entityId: id,
          metadata: { name: supplier.name },
          context,
        },
        tx,
      );
      return toSummary(supplier);
    });
  }

  /** Exclusão lógica: rolos e insumos antigos continuam mostrando o fornecedor. */
  async remove(id: string, actor: AuthUser, context: RequestContext) {
    const supplier = await this.get(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(
        {
          action: 'supplier.deleted',
          actorId: actor.id,
          entity: 'supplier',
          entityId: id,
          metadata: { name: supplier.name },
          context,
        },
        tx,
      );
    });
  }

  private async get(id: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!supplier) throw AppError.notFound('Fornecedor não encontrado.');
    return supplier;
  }

  private async assertNameAvailable(name: string, ignoreId?: string) {
    const existing = await this.prisma.supplier.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, deletedAt: null },
      select: { id: true },
    });
    if (existing && existing.id !== ignoreId) {
      throw AppError.conflict('Já existe um fornecedor com este nome.');
    }
  }
}
