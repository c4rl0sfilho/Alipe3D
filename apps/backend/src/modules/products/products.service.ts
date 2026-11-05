import {
  billOfMaterialsSchema,
  CLOSED_STATUSES,
  listProductsQuerySchema,
  productInputSchema,
  variantInputSchema,
  type AuthUser,
  type BillOfMaterialsInput,
  type ListProductsQuery,
  type Paginated,
  type ProductDetail,
  type ProductInput,
  type ProductListItem,
  type VariantDetail,
  type VariantInput,
} from '@alipe3d/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { DbClient } from '../../prisma/types.js';
import { AppError } from '../../utils/app-error.js';
import { dec, fmt, fmtOrNull, ZERO } from '../../utils/decimal.js';
import { paginated, paginationArgs } from '../../utils/pagination.js';
import type { RequestContext } from '../../utils/request-context.js';
import type { AuditService } from '../audit/audit.service.js';
import { finishedGoodName, variantLabel } from './variant-label.js';

const detailInclude = {
  category: { select: { id: true, name: true } },
  variants: {
    where: { deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: {
      stockItem: { select: { id: true, quantity: true } },
      billOfMaterials: {
        // Filamentos primeiro, depois insumos; ordem estável mesmo com linhas criadas juntas
        orderBy: [{ materialId: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
        include: {
          material: { select: { id: true, name: true, type: true, color: true, colorHex: true } },
          supplyItem: { select: { id: true, name: true, unit: true } },
        },
      },
    },
  },
  files: {
    orderBy: [{ isCover: 'desc' }, { createdAt: 'asc' }],
    include: { uploadedBy: { select: { id: true, name: true } } },
  },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;
type VariantRow = ProductRow['variants'][number];

function toVariantDetail(product: ProductRow, v: VariantRow): VariantDetail {
  return {
    id: v.id,
    sku: v.sku,
    label: variantLabel(v),
    isDefault: v.isDefault,
    isActive: v.isActive,
    color: v.color,
    material: v.material,
    size: v.size,
    model: v.model,
    overrides: {
      salePrice: fmtOrNull(v.salePrice),
      estimatedWeightGrams: fmtOrNull(v.estimatedWeightGrams),
      estimatedPrintMinutes: v.estimatedPrintMinutes,
      minStock: fmtOrNull(v.minStock, 3),
    },
    salePrice: fmt(v.salePrice ?? product.salePrice),
    estimatedWeightGrams: fmt(v.estimatedWeightGrams ?? product.estimatedWeightGrams),
    estimatedPrintMinutes: v.estimatedPrintMinutes ?? product.estimatedPrintMinutes,
    minStock: fmt(v.minStock ?? product.minStock, 3),
    stockQuantity: fmt(v.stockItem?.quantity ?? ZERO, 3),
    stockItemId: v.stockItem?.id ?? null,
    billOfMaterials: v.billOfMaterials.map((line) => ({
      id: line.id,
      quantity: fmt(line.quantity, 3),
      notes: line.notes,
      material: line.material,
      supply: line.supplyItem,
    })),
  };
}

function toDetail(product: ProductRow): ProductDetail {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    status: product.status,
    category: product.category,
    salePrice: fmt(product.salePrice),
    estimatedWeightGrams: fmt(product.estimatedWeightGrams),
    estimatedPrintMinutes: product.estimatedPrintMinutes,
    minStock: fmt(product.minStock, 3),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    variants: product.variants.map((v) => toVariantDetail(product, v)),
    files: product.files.map((f) => ({
      id: f.id,
      kind: f.kind,
      originalName: f.originalName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      isCover: f.isCover,
      createdAt: f.createdAt.toISOString(),
      uploadedBy: f.uploadedBy,
    })),
  };
}

export class ProductsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- produtos

  async list(rawQuery: ListProductsQuery): Promise<Paginated<ProductListItem>> {
    const query = listProductsQuerySchema.parse(rawQuery);
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status !== 'all' ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
              {
                variants: {
                  some: { deletedAt: null, sku: { contains: query.search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: [{ [query.sort]: query.order }, { id: 'asc' }],
        ...paginationArgs(query.page, query.pageSize),
        include: {
          category: { select: { id: true, name: true } },
          variants: {
            where: { deletedAt: null },
            select: { stockItem: { select: { quantity: true } } },
          },
          files: { where: { isCover: true }, select: { id: true }, take: 1 },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return paginated(
      rows.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        status: p.status,
        salePrice: fmt(p.salePrice),
        estimatedWeightGrams: fmt(p.estimatedWeightGrams),
        estimatedPrintMinutes: p.estimatedPrintMinutes,
        category: p.category,
        variantCount: p.variants.length,
        stockQuantity: fmt(
          p.variants.reduce((sum, v) => sum.plus(v.stockItem?.quantity ?? ZERO), ZERO),
          3,
        ),
        coverFileId: p.files[0]?.id ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async get(id: string): Promise<ProductDetail> {
    return toDetail(await this.load(id));
  }

  /** Cria o produto, a variação padrão e o item de produto acabado no estoque. */
  async create(
    raw: ProductInput,
    actor: AuthUser,
    context: RequestContext,
  ): Promise<ProductDetail> {
    const input = productInputSchema.parse(raw);
    await this.assertSkuAvailable(input.sku);
    if (input.categoryId) await this.assertCategory(input.categoryId);

    const id = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          sku: input.sku,
          name: input.name,
          description: input.description ?? null,
          categoryId: input.categoryId ?? null,
          status: input.status,
          salePrice: dec(input.salePrice),
          estimatedWeightGrams: dec(input.estimatedWeightGrams),
          estimatedPrintMinutes: input.estimatedPrintMinutes,
          minStock: dec(input.minStock),
        },
      });
      const variant = await tx.productVariant.create({
        data: { productId: product.id, sku: input.sku, isDefault: true },
      });
      await tx.inventoryItem.create({
        data: {
          kind: 'FINISHED_GOOD',
          name: finishedGoodName(product.name, variant),
          sku: variant.sku,
          productVariantId: variant.id,
        },
      });
      await this.audit.record(
        {
          action: 'product.created',
          actorId: actor.id,
          entity: 'product',
          entityId: product.id,
          metadata: { sku: product.sku, name: product.name },
          context,
        },
        tx,
      );
      return product.id;
    });
    return this.get(id);
  }

  async update(id: string, raw: ProductInput, actor: AuthUser, context: RequestContext) {
    const input = productInputSchema.parse(raw);
    const current = await this.load(id);
    if (input.sku !== current.sku) await this.assertSkuAvailable(input.sku, id);
    if (input.categoryId) await this.assertCategory(input.categoryId);

    const changes: Record<string, { from: string; to: string }> = {};
    const track = (field: string, from: string | null, to: string | null) => {
      if ((from ?? '') !== (to ?? '')) changes[field] = { from: from ?? '—', to: to ?? '—' };
    };
    track('sku', current.sku, input.sku);
    track('name', current.name, input.name);
    track('status', current.status, input.status);
    track('salePrice', fmt(current.salePrice), fmt(dec(input.salePrice)));

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          sku: input.sku,
          name: input.name,
          description: input.description ?? null,
          categoryId: input.categoryId ?? null,
          status: input.status,
          salePrice: dec(input.salePrice),
          estimatedWeightGrams: dec(input.estimatedWeightGrams),
          estimatedPrintMinutes: input.estimatedPrintMinutes,
          minStock: dec(input.minStock),
        },
      });
      // O SKU da variação padrão acompanha o do produto
      const defaultVariant = current.variants.find((v) => v.isDefault);
      if (defaultVariant && input.sku !== current.sku) {
        await tx.productVariant.update({
          where: { id: defaultVariant.id },
          data: { sku: input.sku },
        });
      }
      await this.syncFinishedGoodNames(tx, id, input.name);
      await this.audit.record(
        {
          action: 'product.updated',
          actorId: actor.id,
          entity: 'product',
          entityId: id,
          metadata: changes,
          context,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Exclusão lógica. Exige estoque acabado zerado para não "sumir" com mercadoria. */
  async remove(id: string, actor: AuthUser, context: RequestContext) {
    const product = await this.load(id);
    const withStock = product.variants.filter((v) => v.stockItem && !v.stockItem.quantity.isZero());
    if (withStock.length > 0) {
      throw AppError.conflict(
        'Há estoque deste produto. Zere o estoque das variações antes de excluí-lo.',
      );
    }
    await this.assertNoOpenProduction({ variant: { productId: id } });
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: { deletedAt: now } });
      await tx.productVariant.updateMany({
        where: { productId: id, deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.inventoryItem.updateMany({
        where: { productVariant: { productId: id }, deletedAt: null },
        data: { deletedAt: now },
      });
      await this.audit.record(
        {
          action: 'product.deleted',
          actorId: actor.id,
          entity: 'product',
          entityId: id,
          metadata: { sku: product.sku, name: product.name },
          context,
        },
        tx,
      );
    });
  }

  // ---------------------------------------------------------------- variações

  async createVariant(
    productId: string,
    raw: VariantInput,
    actor: AuthUser,
    context: RequestContext,
  ) {
    const input = variantInputSchema.parse(raw);
    const product = await this.load(productId);
    await this.assertSkuAvailable(input.sku);

    await this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.create({
        data: { productId, ...this.variantData(input) },
      });
      await tx.inventoryItem.create({
        data: {
          kind: 'FINISHED_GOOD',
          name: finishedGoodName(product.name, variant),
          sku: variant.sku,
          productVariantId: variant.id,
        },
      });
      await this.audit.record(
        {
          action: 'variant.created',
          actorId: actor.id,
          entity: 'product_variant',
          entityId: variant.id,
          metadata: { product: product.name, sku: variant.sku, label: variantLabel(variant) },
          context,
        },
        tx,
      );
    });
    return this.get(productId);
  }

  async updateVariant(
    variantId: string,
    raw: VariantInput,
    actor: AuthUser,
    context: RequestContext,
  ) {
    const input = variantInputSchema.parse(raw);
    const variant = await this.loadVariant(variantId);
    if (variant.isDefault) {
      throw AppError.badRequest('A variação padrão é editada pelos dados do produto.');
    }
    if (input.sku !== variant.sku) await this.assertSkuAvailable(input.sku);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.productVariant.update({
        where: { id: variantId },
        data: this.variantData(input),
      });
      await tx.inventoryItem.updateMany({
        where: { productVariantId: variantId },
        data: { name: finishedGoodName(variant.product.name, updated), sku: updated.sku },
      });
      await this.audit.record(
        {
          action: 'variant.updated',
          actorId: actor.id,
          entity: 'product_variant',
          entityId: variantId,
          metadata: {
            product: variant.product.name,
            sku: updated.sku,
            label: variantLabel(updated),
          },
          context,
        },
        tx,
      );
    });
    return this.get(variant.productId);
  }

  async removeVariant(variantId: string, actor: AuthUser, context: RequestContext) {
    const variant = await this.loadVariant(variantId);
    if (variant.isDefault) throw AppError.badRequest('A variação padrão não pode ser excluída.');
    if (variant.stockItem && !variant.stockItem.quantity.isZero()) {
      throw AppError.conflict('Há estoque desta variação. Zere o estoque antes de excluí-la.');
    }
    await this.assertNoOpenProduction({ variantId });
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.productVariant.update({
        where: { id: variantId },
        data: { deletedAt: now, isActive: false },
      });
      await tx.inventoryItem.updateMany({
        where: { productVariantId: variantId },
        data: { deletedAt: now },
      });
      await this.audit.record(
        {
          action: 'variant.deleted',
          actorId: actor.id,
          entity: 'product_variant',
          entityId: variantId,
          metadata: {
            product: variant.product.name,
            sku: variant.sku,
            label: variantLabel(variant),
          },
          context,
        },
        tx,
      );
    });
    return this.get(variant.productId);
  }

  // ---------------------------------------------------------------- ficha técnica

  /** Substitui a ficha técnica inteira da variação. */
  async setBillOfMaterials(
    variantId: string,
    raw: BillOfMaterialsInput,
    actor: AuthUser,
    context: RequestContext,
  ) {
    const input = billOfMaterialsSchema.parse(raw);
    const variant = await this.loadVariant(variantId);

    const materialIds = input.items.flatMap((i) => (i.materialId ? [i.materialId] : []));
    const supplyIds = input.items.flatMap((i) => (i.supplyItemId ? [i.supplyItemId] : []));
    if (
      new Set(materialIds).size !== materialIds.length ||
      new Set(supplyIds).size !== supplyIds.length
    ) {
      throw AppError.badRequest(
        'Cada filamento ou insumo pode aparecer só uma vez na ficha técnica.',
      );
    }
    const [materials, supplies] = await Promise.all([
      this.prisma.material.count({ where: { id: { in: materialIds }, deletedAt: null } }),
      this.prisma.inventoryItem.count({
        where: { id: { in: supplyIds }, kind: 'SUPPLY', deletedAt: null },
      }),
    ]);
    if (materials !== materialIds.length || supplies !== supplyIds.length) {
      throw AppError.badRequest('A ficha técnica tem filamento ou insumo inexistente.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productMaterial.deleteMany({ where: { variantId } });
      if (input.items.length > 0) {
        await tx.productMaterial.createMany({
          data: input.items.map((item) => ({
            variantId,
            materialId: item.materialId ?? null,
            supplyItemId: item.supplyItemId ?? null,
            quantity: dec(item.quantity),
            notes: item.notes ?? null,
          })),
        });
      }
      await this.audit.record(
        {
          action: 'product.bom_updated',
          actorId: actor.id,
          entity: 'product_variant',
          entityId: variantId,
          metadata: {
            product: variant.product.name,
            label: variantLabel(variant),
            items: input.items.length,
          },
          context,
        },
        tx,
      );
    });
    return this.get(variant.productId);
  }

  // ---------------------------------------------------------------- apoio

  /** Carrega um produto não excluído (usado também pelo serviço de arquivos). */
  async load(id: string): Promise<ProductRow> {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: detailInclude,
    });
    if (!product) throw AppError.notFound('Produto não encontrado.');
    return product;
  }

  private async loadVariant(id: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id, deletedAt: null, product: { deletedAt: null } },
      include: {
        product: { select: { id: true, name: true } },
        stockItem: { select: { quantity: true } },
      },
    });
    if (!variant) throw AppError.notFound('Variação não encontrada.');
    return variant;
  }

  private variantData(input: ReturnType<typeof variantInputSchema.parse>) {
    return {
      sku: input.sku,
      color: input.color ?? null,
      material: input.material ?? null,
      size: input.size ?? null,
      model: input.model ?? null,
      isActive: input.isActive,
      salePrice: input.salePrice ? dec(input.salePrice) : null,
      estimatedWeightGrams: input.estimatedWeightGrams ? dec(input.estimatedWeightGrams) : null,
      estimatedPrintMinutes: input.estimatedPrintMinutes,
      minStock: input.minStock ? dec(input.minStock) : null,
    };
  }

  private async syncFinishedGoodNames(db: DbClient, productId: string, productName: string) {
    const variants = await db.productVariant.findMany({ where: { productId, deletedAt: null } });
    for (const variant of variants) {
      await db.inventoryItem.updateMany({
        where: { productVariantId: variant.id },
        data: { name: finishedGoodName(productName, variant), sku: variant.sku },
      });
    }
  }

  /** O SKU é único entre todas as variações (a padrão usa o SKU do produto). */
  private async assertSkuAvailable(sku: string, ownProductId?: string) {
    const existing = await this.prisma.productVariant.findUnique({
      where: { sku },
      select: { productId: true, isDefault: true },
    });
    if (existing && !(ownProductId && existing.productId === ownProductId && existing.isDefault)) {
      throw AppError.conflict(`O SKU ${sku} já está em uso (inclusive em produtos excluídos).`);
    }
    const product = await this.prisma.product.findUnique({ where: { sku }, select: { id: true } });
    if (product && product.id !== ownProductId) {
      throw AppError.conflict(`O SKU ${sku} já está em uso (inclusive em produtos excluídos).`);
    }
  }

  /** Ordens de produção abertas impedem a exclusão (o histórico precisa do produto). */
  private async assertNoOpenProduction(where: Prisma.ProductionOrderWhereInput) {
    const open = await this.prisma.productionOrder.count({
      where: { ...where, status: { notIn: [...CLOSED_STATUSES] } },
    });
    if (open > 0) {
      throw AppError.conflict(
        `Há ${open} ordem(ns) de produção em aberto para este item. Conclua ou cancele-as antes.`,
      );
    }
  }

  private async assertCategory(id: string) {
    const category = await this.prisma.productCategory.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!category) {
      throw AppError.badRequest('Categoria inválida.', [
        { field: 'categoryId', message: 'Categoria não encontrada' },
      ]);
    }
  }
}
