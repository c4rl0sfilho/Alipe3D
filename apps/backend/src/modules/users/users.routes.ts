import { Router } from 'express';
import { requirePermission, type Authenticate } from '../../middlewares/authenticate.js';
import { UsersController } from './users.controller.js';
import type { UsersService } from './users.service.js';

export function usersRoutes(service: UsersService, authenticate: Authenticate) {
  const router = Router();
  const controller = new UsersController(service);
  const canRead = requirePermission('users:read');
  const canManage = requirePermission('users:manage');

  router.use(authenticate());
  router.get('/', canRead, controller.list);
  router.get('/:id', canRead, controller.get);
  router.post('/', canManage, controller.create);
  router.put('/:id', canManage, controller.update);
  router.patch('/:id/status', canManage, controller.setStatus);
  router.post('/:id/reset-link', canManage, controller.resetLink);

  return router;
}
