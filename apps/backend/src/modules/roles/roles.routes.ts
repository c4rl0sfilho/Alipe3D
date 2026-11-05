import { idParamSchema, roleInputSchema } from '@alipe3d/shared';
import { Router, type Request, type Response } from 'express';
import { requirePermission, type Authenticate } from '../../middlewares/authenticate.js';
import { sendSuccess } from '../../utils/http-response.js';
import { getAuthUser, getRequestContext } from '../../utils/request-context.js';
import type { RolesService } from './roles.service.js';

class RolesController {
  constructor(private readonly service: RolesService) {}

  list = async (_req: Request, res: Response) => {
    sendSuccess(res, await this.service.list());
  };

  create = async (req: Request, res: Response) => {
    const input = roleInputSchema.parse(req.body);
    sendSuccess(
      res,
      await this.service.create(input, getAuthUser(req), getRequestContext(req)),
      201,
    );
  };

  update = async (req: Request, res: Response) => {
    const { id } = idParamSchema.parse(req.params);
    const input = roleInputSchema.parse(req.body);
    sendSuccess(
      res,
      await this.service.update(id, input, getAuthUser(req), getRequestContext(req)),
    );
  };

  remove = async (req: Request, res: Response) => {
    const { id } = idParamSchema.parse(req.params);
    await this.service.remove(id, getAuthUser(req), getRequestContext(req));
    res.status(204).end();
  };
}

export function rolesRoutes(service: RolesService, authenticate: Authenticate) {
  const router = Router();
  const controller = new RolesController(service);

  router.use(authenticate());
  // A lista de perfis também é usada no formulário de usuários.
  router.get('/', requirePermission('users:read'), controller.list);
  router.post('/', requirePermission('roles:manage'), controller.create);
  router.put('/:id', requirePermission('roles:manage'), controller.update);
  router.delete('/:id', requirePermission('roles:manage'), controller.remove);

  return router;
}
