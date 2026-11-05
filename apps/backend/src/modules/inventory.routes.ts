import {
  idParamSchema,
  type CreateRollInput,
  type ListMovementsQuery,
  type ListRollsQuery,
  type ListStockItemsQuery,
  type MaterialInput,
  type RegisterMovementInput,
  type SupplierInput,
  type SupplyInput,
  type UpdateRollInput,
  type WeighRollInput,
} from '@alipe3d/shared';
import { Router } from 'express';
import {
  requireAnyPermission,
  requirePermission,
  type Authenticate,
} from '../middlewares/authenticate.js';
import { sendSuccess } from '../utils/http-response.js';
import { getAuthUser, getRequestContext } from '../utils/request-context.js';
import type { MovementsService } from './inventory/movements.service.js';
import type { StockItemsService } from './inventory/stock-items.service.js';
import type { MaterialsService } from './materials/materials.service.js';
import type { SuppliersService } from './suppliers/suppliers.service.js';

export interface InventoryRoutesDeps {
  authenticate: Authenticate;
  suppliers: SuppliersService;
  materials: MaterialsService;
  stockItems: StockItemsService;
  movements: MovementsService;
}

const canRead = requirePermission('inventory:read');
const canManage = requirePermission('inventory:manage');

export function suppliersRoutes({ authenticate, suppliers }: InventoryRoutesDeps) {
  const router = Router();
  router.use(authenticate());

  router.get('/', canRead, async (req, res) => {
    sendSuccess(
      res,
      await suppliers.list(typeof req.query.search === 'string' ? req.query.search : undefined),
    );
  });
  router.post('/', canManage, async (req, res) => {
    sendSuccess(
      res,
      await suppliers.create(req.body as SupplierInput, getAuthUser(req), getRequestContext(req)),
      201,
    );
  });
  router.put('/:id', canManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(
      res,
      await suppliers.update(
        id,
        req.body as SupplierInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
    );
  });
  router.delete('/:id', canManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await suppliers.remove(id, getAuthUser(req), getRequestContext(req));
    res.status(204).end();
  });
  return router;
}

export function materialsRoutes({ authenticate, materials }: InventoryRoutesDeps) {
  const router = Router();
  router.use(authenticate());

  // A lista de filamentos também é usada na ficha técnica dos produtos e na produção
  router.get(
    '/',
    requireAnyPermission('inventory:read', 'products:read', 'production:read'),
    async (_req, res) => {
      sendSuccess(res, await materials.list());
    },
  );
  router.post('/', canManage, async (req, res) => {
    const id = await materials.create(
      req.body as MaterialInput,
      getAuthUser(req),
      getRequestContext(req),
    );
    sendSuccess(res, { id }, 201);
  });

  // Os rolos também são escolhidos ao iniciar e finalizar impressões
  router.get(
    '/rolls',
    requireAnyPermission('inventory:read', 'production:read'),
    async (req, res) => {
      const result = await materials.listRolls(req.query as ListRollsQuery);
      sendSuccess(res, result.items, 200, result.meta);
    },
  );
  router.post('/rolls', canManage, async (req, res) => {
    sendSuccess(
      res,
      await materials.createRolls(req.body as CreateRollInput, getAuthUser(req)),
      201,
    );
  });
  router.put('/rolls/:id', canManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(
      res,
      await materials.updateRoll(
        id,
        req.body as UpdateRollInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
    );
  });
  router.post('/rolls/:id/weigh', canManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(
      res,
      await materials.weighRoll(
        id,
        req.body as WeighRollInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
    );
  });

  router.put('/:id', canManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await materials.update(id, req.body as MaterialInput, getAuthUser(req), getRequestContext(req));
    sendSuccess(res, { id });
  });
  router.delete('/:id', canManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await materials.remove(id, getAuthUser(req), getRequestContext(req));
    res.status(204).end();
  });
  return router;
}

export function inventoryRoutes({ authenticate, stockItems, movements }: InventoryRoutesDeps) {
  const router = Router();
  router.use(authenticate());

  router.get('/alerts', canRead, async (_req, res) => {
    sendSuccess(res, await stockItems.alerts());
  });

  // Insumos e produtos acabados (insumos também aparecem na ficha técnica dos produtos)
  router.get(
    '/items',
    requireAnyPermission('inventory:read', 'products:read'),
    async (req, res) => {
      const result = await stockItems.list(req.query as ListStockItemsQuery);
      sendSuccess(res, result.items, 200, result.meta);
    },
  );
  router.post('/supplies', canManage, async (req, res) => {
    sendSuccess(
      res,
      await stockItems.createSupply(
        req.body as SupplyInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
      201,
    );
  });
  router.put('/supplies/:id', canManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(
      res,
      await stockItems.updateSupply(
        id,
        req.body as SupplyInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
    );
  });
  router.delete('/supplies/:id', canManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await stockItems.removeSupply(id, getAuthUser(req), getRequestContext(req));
    res.status(204).end();
  });

  router.get('/movements', canRead, async (req, res) => {
    const result = await movements.list(req.query as ListMovementsQuery);
    sendSuccess(res, result.items, 200, result.meta);
  });
  // Ajustes exigem também inventory:adjust (conferido no serviço, conforme o tipo)
  router.post('/movements', canManage, async (req, res) => {
    sendSuccess(
      res,
      await movements.register(
        req.body as RegisterMovementInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
      201,
    );
  });
  return router;
}
