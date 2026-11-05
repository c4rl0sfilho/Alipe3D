import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from '@alipe3d/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../utils/app-error.js';
import { sendSuccess } from '../../utils/http-response.js';
import { getAuthUser, getRequestContext } from '../../utils/request-context.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
  type CookieConfig,
} from './auth.cookies.js';
import type { AuthService, SessionResult } from './auth.service.js';

export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly cookies: CookieConfig,
  ) {}

  login = async (req: Request, res: Response) => {
    const input = loginSchema.parse(req.body);
    const result = await this.service.login(input, getRequestContext(req));
    this.respondWithSession(res, result);
  };

  refresh = async (req: Request, res: Response) => {
    try {
      const result = await this.service.refresh(readRefreshCookie(req), getRequestContext(req));
      this.respondWithSession(res, result);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 401) {
        clearRefreshCookie(res, this.cookies);
      }
      throw error;
    }
  };

  logout = async (req: Request, res: Response) => {
    await this.service.logout(readRefreshCookie(req), getRequestContext(req));
    clearRefreshCookie(res, this.cookies);
    res.status(204).end();
  };

  me = (req: Request, res: Response) => {
    sendSuccess(res, getAuthUser(req));
  };

  changePassword = async (req: Request, res: Response) => {
    const input = changePasswordSchema.parse(req.body);
    const result = await this.service.changePassword(
      getAuthUser(req).id,
      input,
      getRequestContext(req),
    );
    this.respondWithSession(res, result);
  };

  forgotPassword = async (req: Request, res: Response) => {
    const input = forgotPasswordSchema.parse(req.body);
    await this.service.forgotPassword(input, getRequestContext(req));
    sendSuccess(res, {
      message:
        'Se o e-mail estiver cadastrado, você receberá as instruções. Se não receber, peça ao administrador um link de redefinição.',
    });
  };

  resetPassword = async (req: Request, res: Response) => {
    const input = resetPasswordSchema.parse(req.body);
    await this.service.resetPassword(input, getRequestContext(req));
    sendSuccess(res, { message: 'Senha redefinida. Faça login com a nova senha.' });
  };

  private respondWithSession(res: Response, result: SessionResult) {
    setRefreshCookie(res, result.refreshToken, this.cookies);
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, result.session);
  }
}
