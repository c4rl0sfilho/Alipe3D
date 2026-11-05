import {
  createUserSchema,
  idParamSchema,
  setUserStatusSchema,
  updateUserSchema,
  type ListUsersQuery,
} from '@alipe3d/shared';
import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/http-response.js';
import { getAuthUser, getRequestContext } from '../../utils/request-context.js';
import type { UsersService } from './users.service.js';

export class UsersController {
  constructor(private readonly service: UsersService) {}

  list = async (req: Request, res: Response) => {
    const result = await this.service.list(req.query as ListUsersQuery);
    sendSuccess(res, result.items, 200, result.meta);
  };

  get = async (req: Request, res: Response) => {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await this.service.getById(id));
  };

  create = async (req: Request, res: Response) => {
    const input = createUserSchema.parse(req.body);
    const user = await this.service.create(input, getAuthUser(req), getRequestContext(req));
    sendSuccess(res, user, 201);
  };

  update = async (req: Request, res: Response) => {
    const { id } = idParamSchema.parse(req.params);
    const input = updateUserSchema.parse(req.body);
    sendSuccess(
      res,
      await this.service.update(id, input, getAuthUser(req), getRequestContext(req)),
    );
  };

  setStatus = async (req: Request, res: Response) => {
    const { id } = idParamSchema.parse(req.params);
    const { isActive } = setUserStatusSchema.parse(req.body);
    sendSuccess(
      res,
      await this.service.setActive(id, isActive, getAuthUser(req), getRequestContext(req)),
    );
  };

  resetLink = async (req: Request, res: Response) => {
    const { id } = idParamSchema.parse(req.params);
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(
      res,
      await this.service.generateResetLink(id, getAuthUser(req), getRequestContext(req)),
      201,
    );
  };
}
