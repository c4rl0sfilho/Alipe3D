import { randomUUID } from 'node:crypto';
import {
  idParamSchema,
  type BillOfMaterialsInput,
  type CategoryInput,
  type ListProductsQuery,
  type ProductInput,
  type VariantInput,
  uuidSchema,
} from '@alipe3d/shared';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requirePermission, type Authenticate } from '../middlewares/authenticate.js';
import type { FileStorage } from '../services/file-storage.js';
import { sendSuccess } from '../utils/http-response.js';
import { getAuthUser, getRequestContext } from '../utils/request-context.js';
import type { CategoriesService } from './categories/categories.service.js';
import type { ProductFilesService } from './products/product-files.service.js';
import type { ProductsService } from './products/products.service.js';

const fileParams = z.object({ id: uuidSchema, fileId: uuidSchema });
const variantParams = z.object({ variantId: uuidSchema });

/** Content-Disposition com nome UTF-8 (RFC 6266), sem permitir quebra de cabeçalho. */
function contentDisposition(type: 'inline' | 'attachment', name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export interface CatalogRoutesDeps {
  authenticate: Authenticate;
  categories: CategoriesService;
  products: ProductsService;
  files: ProductFilesService;
  storage: FileStorage;
}

export function categoriesRoutes({ authenticate, categories }: CatalogRoutesDeps) {
  const router = Router();
  router.use(authenticate());

  router.get('/', requirePermission('products:read'), async (_req, res) => {
    sendSuccess(res, await categories.list());
  });
  router.post('/', requirePermission('products:manage'), async (req, res) => {
    const category = await categories.create(
      req.body as CategoryInput,
      getAuthUser(req),
      getRequestContext(req),
    );
    sendSuccess(res, category, 201);
  });
  router.put('/:id', requirePermission('products:manage'), async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(
      res,
      await categories.update(
        id,
        req.body as CategoryInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
    );
  });
  router.delete('/:id', requirePermission('products:manage'), async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await categories.remove(id, getAuthUser(req), getRequestContext(req));
    res.status(204).end();
  });
  return router;
}

export function productsRoutes({ authenticate, products, files, storage }: CatalogRoutesDeps) {
  const router = Router();
  const canRead = requirePermission('products:read');
  const canManage = requirePermission('products:manage');

  // Upload em disco temporário, com nome aleatório; validação e destino final no serviço.
  const upload = multer({
    storage: multer.diskStorage({
      destination: storage.tempDir,
      filename: (_req, _file, cb) => cb(null, `${randomUUID()}.upload`),
    }),
    limits: { fileSize: 150 * 1024 * 1024, files: 1, fields: 5 },
  });

  router.use(authenticate());

  router.get('/', canRead, async (req, res) => {
    const result = await products.list(req.query as ListProductsQuery);
    sendSuccess(res, result.items, 200, result.meta);
  });
  router.post('/', canManage, async (req, res) => {
    const product = await products.create(
      req.body as ProductInput,
      getAuthUser(req),
      getRequestContext(req),
    );
    sendSuccess(res, product, 201);
  });

  // Rotas de variação antes de "/:id" para não serem capturadas por ele
  router.put('/variants/:variantId', canManage, async (req, res) => {
    const { variantId } = variantParams.parse(req.params);
    sendSuccess(
      res,
      await products.updateVariant(
        variantId,
        req.body as VariantInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
    );
  });
  router.delete('/variants/:variantId', canManage, async (req, res) => {
    const { variantId } = variantParams.parse(req.params);
    sendSuccess(
      res,
      await products.removeVariant(variantId, getAuthUser(req), getRequestContext(req)),
    );
  });
  router.put('/variants/:variantId/bill-of-materials', canManage, async (req, res) => {
    const { variantId } = variantParams.parse(req.params);
    sendSuccess(
      res,
      await products.setBillOfMaterials(
        variantId,
        req.body as BillOfMaterialsInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
    );
  });

  router.get('/:id', canRead, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await products.get(id));
  });
  router.put('/:id', canManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(
      res,
      await products.update(id, req.body as ProductInput, getAuthUser(req), getRequestContext(req)),
    );
  });
  router.delete('/:id', canManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await products.remove(id, getAuthUser(req), getRequestContext(req));
    res.status(204).end();
  });
  router.post('/:id/variants', canManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(
      res,
      await products.createVariant(
        id,
        req.body as VariantInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
      201,
    );
  });

  // ---- Arquivos
  router.post(
    '/:id/files',
    canManage,
    upload.single('file'),
    async (req: Request, res: Response) => {
      const { id } = idParamSchema.parse(req.params);
      await files.upload(
        id,
        req.file,
        (req.body as { kind?: unknown } | undefined)?.kind,
        getAuthUser(req),
        getRequestContext(req),
      );
      sendSuccess(res, await products.get(id), 201);
    },
  );
  router.get('/:id/files/:fileId', canRead, async (req, res) => {
    const { id, fileId } = fileParams.parse(req.params);
    const file = await files.getForDownload(id, fileId);
    // Exibição inline só para imagens (miniaturas); demais arquivos sempre como download
    const inline = req.query.inline === '1' && file.kind === 'IMAGE';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.sizeBytes));
    res.setHeader(
      'Content-Disposition',
      contentDisposition(inline ? 'inline' : 'attachment', file.originalName),
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    const stream = files.stream(file.storedName);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
  router.patch('/:id/files/:fileId/cover', canManage, async (req, res) => {
    const { id, fileId } = fileParams.parse(req.params);
    await files.setCover(id, fileId);
    sendSuccess(res, await products.get(id));
  });
  router.delete('/:id/files/:fileId', canManage, async (req, res) => {
    const { id, fileId } = fileParams.parse(req.params);
    await files.remove(id, fileId, getAuthUser(req), getRequestContext(req));
    sendSuccess(res, await products.get(id));
  });

  return router;
}
