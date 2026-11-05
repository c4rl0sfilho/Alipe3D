import { Router } from 'express';
import type { AppServices } from '../container.js';
import { auditRoutes } from '../modules/audit/audit.routes.js';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { categoriesRoutes, productsRoutes } from '../modules/catalog.routes.js';
import { inventoryRoutes, materialsRoutes, suppliersRoutes } from '../modules/inventory.routes.js';
import { healthRoutes } from '../modules/health/health.routes.js';
import {
  alertsRoutes,
  maintenanceRoutes,
  printersRoutes,
  productionRoutes,
} from '../modules/production.routes.js';
import { rolesRoutes } from '../modules/roles/roles.routes.js';
import { usersRoutes } from '../modules/users/users.routes.js';

export interface RouterOptions {
  services: AppServices;
  cookieSecure: boolean;
  authRateLimitMax: number;
}

/** Roteador da versão 1 da API, montado em /api/v1. Novos módulos são registrados aqui. */
export function createV1Router({
  services,
  cookieSecure,
  authRateLimitMax,
}: RouterOptions): Router {
  const router = Router();
  const { authenticate } = services;

  router.use('/health', healthRoutes(services.health));
  router.use(
    '/auth',
    authRoutes({
      service: services.auth,
      authenticate,
      cookies: { secure: cookieSecure },
      rateLimitMax: authRateLimitMax,
    }),
  );
  router.use('/users', usersRoutes(services.users, authenticate));
  router.use('/roles', rolesRoutes(services.roles, authenticate));
  router.use('/audit-logs', auditRoutes(services.audit, authenticate));

  const catalog = {
    authenticate,
    categories: services.categories,
    products: services.products,
    files: services.productFiles,
    storage: services.storage,
  };
  router.use('/categories', categoriesRoutes(catalog));
  router.use('/products', productsRoutes(catalog));

  const inventory = {
    authenticate,
    suppliers: services.suppliers,
    materials: services.materials,
    stockItems: services.stockItems,
    movements: services.movements,
  };
  router.use('/suppliers', suppliersRoutes(inventory));
  router.use('/materials', materialsRoutes(inventory));
  router.use('/inventory', inventoryRoutes(inventory));

  const production = {
    authenticate,
    printers: services.printers,
    maintenance: services.maintenance,
    orders: services.productionOrders,
    jobs: services.printJobs,
    alerts: services.alerts,
  };
  router.use('/printers', printersRoutes(production));
  router.use('/maintenance', maintenanceRoutes(production));
  router.use('/production', productionRoutes(production));
  router.use('/alerts', alertsRoutes(production));

  return router;
}
