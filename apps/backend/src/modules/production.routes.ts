import {
  idParamSchema,
  type CancelProductionOrderInput,
  type CloseProductionOrderInput,
  type FinishPrintJobInput,
  type InspectionInput,
  type ListMaintenanceQuery,
  type ListPrintJobsQuery,
  type ListProductionOrdersQuery,
  type MaintenanceInput,
  type PrinterInput,
  type PrinterStatusInput,
  type ProductionOrderInput,
  type StartPrintJobInput,
} from '@alipe3d/shared';
import { Router } from 'express';
import {
  requireAnyPermission,
  requirePermission,
  type Authenticate,
} from '../middlewares/authenticate.js';
import { sendSuccess } from '../utils/http-response.js';
import { getAuthUser, getRequestContext } from '../utils/request-context.js';
import type { AlertsService } from './alerts/alerts.service.js';
import type { MaintenanceService } from './printers/maintenance.service.js';
import type { PrintersService } from './printers/printers.service.js';
import type { PrintJobsService } from './production/print-jobs.service.js';
import type { ProductionOrdersService } from './production/production-orders.service.js';

export interface ProductionRoutesDeps {
  authenticate: Authenticate;
  printers: PrintersService;
  maintenance: MaintenanceService;
  orders: ProductionOrdersService;
  jobs: PrintJobsService;
  alerts: AlertsService;
}

const printersRead = requireAnyPermission('printers:read', 'production:read');
const printersManage = requirePermission('printers:manage');
const productionRead = requirePermission('production:read');
const productionManage = requirePermission('production:manage');

export function printersRoutes({ authenticate, printers }: ProductionRoutesDeps) {
  const router = Router();
  router.use(authenticate());

  // A lista também é usada para planejar a produção
  router.get('/', printersRead, async (_req, res) => {
    sendSuccess(res, await printers.list());
  });
  router.post('/', printersManage, async (req, res) => {
    sendSuccess(
      res,
      await printers.create(req.body as PrinterInput, getAuthUser(req), getRequestContext(req)),
      201,
    );
  });
  router.get('/:id', requirePermission('printers:read'), async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await printers.get(id));
  });
  router.put('/:id', printersManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(
      res,
      await printers.update(id, req.body as PrinterInput, getAuthUser(req), getRequestContext(req)),
    );
  });
  router.patch('/:id/status', printersManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(
      res,
      await printers.setStatus(
        id,
        req.body as PrinterStatusInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
    );
  });
  router.delete('/:id', printersManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await printers.remove(id, getAuthUser(req), getRequestContext(req));
    res.status(204).end();
  });
  return router;
}

export function maintenanceRoutes({ authenticate, maintenance }: ProductionRoutesDeps) {
  const router = Router();
  router.use(authenticate());

  router.get('/', requirePermission('printers:read'), async (req, res) => {
    const result = await maintenance.list(req.query as ListMaintenanceQuery);
    sendSuccess(res, result.items, 200, result.meta);
  });
  router.post('/', printersManage, async (req, res) => {
    sendSuccess(
      res,
      await maintenance.create(
        req.body as MaintenanceInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
      201,
    );
  });
  router.put('/:id', printersManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(
      res,
      await maintenance.update(
        id,
        req.body as MaintenanceInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
    );
  });
  router.delete('/:id', printersManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    await maintenance.remove(id, getAuthUser(req), getRequestContext(req));
    res.status(204).end();
  });
  return router;
}

export function productionRoutes({ authenticate, orders, jobs }: ProductionRoutesDeps) {
  const router = Router();
  router.use(authenticate());

  router.get('/responsibles', productionRead, async (_req, res) => {
    sendSuccess(res, await orders.responsibles());
  });

  // ------------------------------------------------------------ ordens
  router.get('/orders', productionRead, async (req, res) => {
    const result = await orders.list(req.query as ListProductionOrdersQuery);
    sendSuccess(res, result.items, 200, result.meta);
  });
  router.post('/orders', productionManage, async (req, res) => {
    sendSuccess(
      res,
      await orders.create(
        req.body as ProductionOrderInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
      201,
    );
  });
  router.get('/orders/:id', productionRead, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await orders.get(id));
  });
  router.put('/orders/:id', productionManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(
      res,
      await orders.update(
        id,
        req.body as ProductionOrderInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
    );
  });
  router.post('/orders/:id/cancel', productionManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(
      res,
      await orders.cancel(
        id,
        req.body as CancelProductionOrderInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
    );
  });
  router.post('/orders/:id/close', productionManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(
      res,
      await orders.close(
        id,
        req.body as CloseProductionOrderInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
    );
  });
  router.post('/orders/:id/start-inspection', productionManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await orders.startInspection(id));
  });
  router.post('/orders/:id/inspections', productionManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(
      res,
      await orders.inspect(
        id,
        req.body as InspectionInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
      201,
    );
  });
  router.post('/orders/:id/jobs', productionManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await jobs.start(id, req.body as StartPrintJobInput, getAuthUser(req)), 201);
  });

  // ------------------------------------------------------------ impressões
  router.get(
    '/jobs',
    requireAnyPermission('production:read', 'printers:read'),
    async (req, res) => {
      const result = await jobs.list(req.query as ListPrintJobsQuery);
      sendSuccess(res, result.items, 200, result.meta);
    },
  );
  router.post('/jobs/:id/pause', productionManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await jobs.pause(id));
  });
  router.post('/jobs/:id/resume', productionManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await jobs.resume(id));
  });
  router.post('/jobs/:id/finish', productionManage, async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(
      res,
      await jobs.finish(
        id,
        req.body as FinishPrintJobInput,
        getAuthUser(req),
        getRequestContext(req),
      ),
    );
  });
  return router;
}

export function alertsRoutes({ authenticate, alerts }: ProductionRoutesDeps) {
  const router = Router();
  router.use(authenticate());
  router.get('/', async (req, res) => {
    sendSuccess(res, await alerts.forUser(getAuthUser(req)));
  });
  return router;
}
