import { rm } from 'node:fs/promises';
import { PRODUCT_FILE_KINDS, type AuthUser, type ProductFileKind } from '@alipe3d/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { inferFileKind, type FileStorage } from '../../services/file-storage.js';
import { AppError } from '../../utils/app-error.js';
import type { RequestContext } from '../../utils/request-context.js';
import type { AuditService } from '../audit/audit.service.js';
import type { ProductsService } from './products.service.js';

const MAX_FILES_PER_PRODUCT = 60;

export interface UploadedTempFile {
  path: string;
  originalname: string;
}

/** Remove caminhos e caracteres de controle do nome original (é só exibido, nunca usado no disco). */
function sanitizeName(raw: string): string {
  // O multer entrega o nome em latin1; convertemos para UTF-8 quando a conversão é válida ("ção")
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8');
  const name = utf8.includes('�') ? raw : utf8;
  const base = name.split(/[\\/]/).pop() ?? 'arquivo';
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) || 'arquivo';
}

export class ProductFilesService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: FileStorage,
    private readonly products: ProductsService,
    private readonly audit: AuditService,
  ) {}

  async upload(
    productId: string,
    file: UploadedTempFile | undefined,
    rawKind: unknown,
    actor: AuthUser,
    context: RequestContext,
  ) {
    if (!file) throw AppError.badRequest('Selecione um arquivo para enviar.');
    try {
      await this.products.load(productId);
      const count = await this.prisma.productFile.count({ where: { productId } });
      if (count >= MAX_FILES_PER_PRODUCT) {
        throw AppError.badRequest(
          `Limite de ${MAX_FILES_PER_PRODUCT} arquivos por produto atingido.`,
        );
      }
    } catch (error) {
      await rm(file.path, { force: true });
      throw error;
    }

    const originalName = sanitizeName(file.originalname);
    const kind: ProductFileKind | null =
      typeof rawKind === 'string' && rawKind !== ''
        ? (PRODUCT_FILE_KINDS as readonly string[]).includes(rawKind)
          ? (rawKind as ProductFileKind)
          : null
        : inferFileKind(originalName);
    if (!kind) {
      await rm(file.path, { force: true });
      throw AppError.badRequest(
        'Tipo de arquivo não aceito. Envie imagens, STL, 3MF, perfis de impressão ou PDF.',
      );
    }

    const stored = await this.storage.acceptUpload(file.path, originalName, kind);
    try {
      return await this.prisma.$transaction(async (tx) => {
        // A primeira imagem vira a capa automaticamente
        const hasCover =
          kind === 'IMAGE' &&
          (await tx.productFile.count({ where: { productId, isCover: true } })) > 0;
        const created = await tx.productFile.create({
          data: {
            productId,
            kind,
            originalName,
            storedName: stored.storedName,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            isCover: kind === 'IMAGE' && !hasCover,
            uploadedById: actor.id,
          },
        });
        await this.audit.record(
          {
            action: 'product.file_uploaded',
            actorId: actor.id,
            entity: 'product',
            entityId: productId,
            metadata: { name: originalName, kind, sizeBytes: stored.sizeBytes },
            context,
          },
          tx,
        );
        return created.id;
      });
    } catch (error) {
      await this.storage.remove(stored.storedName);
      throw error;
    }
  }

  /** Metadados para download; o controller faz o streaming. */
  async getForDownload(productId: string, fileId: string) {
    const file = await this.prisma.productFile.findFirst({
      where: { id: fileId, productId, product: { deletedAt: null } },
    });
    if (!file || !(await this.storage.exists(file.storedName))) {
      throw AppError.notFound('Arquivo não encontrado.');
    }
    return file;
  }

  stream(storedName: string) {
    return this.storage.stream(storedName);
  }

  async setCover(productId: string, fileId: string) {
    const file = await this.getForDownload(productId, fileId);
    if (file.kind !== 'IMAGE')
      throw AppError.badRequest('Somente imagens podem ser a capa do produto.');
    await this.prisma.$transaction([
      this.prisma.productFile.updateMany({ where: { productId }, data: { isCover: false } }),
      this.prisma.productFile.update({ where: { id: fileId }, data: { isCover: true } }),
    ]);
  }

  async remove(productId: string, fileId: string, actor: AuthUser, context: RequestContext) {
    const file = await this.prisma.productFile.findFirst({ where: { id: fileId, productId } });
    if (!file) throw AppError.notFound('Arquivo não encontrado.');
    await this.prisma.$transaction(async (tx) => {
      await tx.productFile.delete({ where: { id: fileId } });
      if (file.isCover) {
        const next = await tx.productFile.findFirst({
          where: { productId, kind: 'IMAGE' },
          orderBy: { createdAt: 'asc' },
        });
        if (next) await tx.productFile.update({ where: { id: next.id }, data: { isCover: true } });
      }
      await this.audit.record(
        {
          action: 'product.file_deleted',
          actorId: actor.id,
          entity: 'product',
          entityId: productId,
          metadata: { name: file.originalName, kind: file.kind },
          context,
        },
        tx,
      );
    });
    // Apaga do disco só depois do banco confirmar
    await this.storage.remove(file.storedName);
  }
}
