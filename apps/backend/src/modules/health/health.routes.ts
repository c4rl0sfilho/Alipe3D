import { Router } from 'express';
import { HealthController } from './health.controller.js';
import type { HealthService } from './health.service.js';

export function healthRoutes(service: HealthService): Router {
  const router = Router();
  const controller = new HealthController(service);

  router.get('/', controller.check);
  router.get('/live', controller.live);

  return router;
}
