import {
  categoryInputSchema,
  type AuthUser,
  type CategoryInput,
  type CategorySummary,
} from '@alipe3d/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/app-error.js';
import type { RequestContext } from '../../utils/request-context.js';
import type { AuditService } from '../audit/audit.service.js';

export class CategoriesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<CategorySummary[]> {
    const rows = await this.prisma.productCategory.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      productCount: c._count.products,
    }));
  }

  async create(raw: CategoryInput, actor: AuthUser, context: RequestContext) {
    const input = categoryInputSchema.parse(raw);
    await this.assertNameAvailable(input.name);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.productCategory.create({
        data: { name: input.name, description: input.description ?? null },
      });
      await this.audit.record(
        {
          action: 'category.created',
          actorId: actor.id,
          entity: 'category',
          entityId: category.id,
          metadata: { name: category.name },
          context,
        },
        tx,
      );
      return { ...category, productCount: 0 };
    });
  }

  async update(id: string, raw: CategoryInput, actor: AuthUser, context: RequestContext) {
    const input = categoryInputSchema.parse(raw);
    const current = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('Categoria não encontrada.');
    await this.assertNameAvailable(input.name, id);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.productCategory.update({
        where: { id },
        data: { name: input.name, description: input.description ?? null },
      });
      await this.audit.record(
        {
          action: 'category.updated',
          actorId: actor.id,
          entity: 'category',
          entityId: id,
          metadata:
            current.name !== category.name
              ? { name: { from: current.name, to: category.name } }
              : { name: category.name },
          context,
        },
        tx,
      );
      return category;
    });
  }

  async remove(id: string, actor: AuthUser, context: RequestContext) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
    if (!category) throw AppError.notFound('Categoria não encontrada.');
    if (category._count.products > 0) {
      throw AppError.conflict(
        `Esta categoria tem ${category._count.products} produto(s). Mova-os para outra categoria antes de excluir.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      // Produtos já excluídos perdem a referência (SetNull) — o histórico deles não depende dela.
      await tx.productCategory.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'category.deleted',
          actorId: actor.id,
          entity: 'category',
          entityId: id,
          metadata: { name: category.name },
          context,
        },
        tx,
      );
    });
  }

  private async assertNameAvailable(name: string, ignoreId?: string) {
    const existing = await this.prisma.productCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing && existing.id !== ignoreId) {
      throw AppError.conflict('Já existe uma categoria com este nome.');
    }
  }
}
