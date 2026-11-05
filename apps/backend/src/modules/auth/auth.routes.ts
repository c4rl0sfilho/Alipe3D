import { Router } from 'express';
import type { Authenticate } from '../../middlewares/authenticate.js';
import { createRateLimiter } from '../../middlewares/rate-limit.js';
import type { CookieConfig } from './auth.cookies.js';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export interface AuthRoutesOptions {
  service: AuthService;
  authenticate: Authenticate;
  cookies: CookieConfig;
  /** Tentativas de login/recuperação por IP a cada 15 minutos. */
  rateLimitMax: number;
}

export function authRoutes({ service, authenticate, cookies, rateLimitMax }: AuthRoutesOptions) {
  const router = Router();
  const controller = new AuthController(service, cookies);

  const loginLimiter = createRateLimiter(
    FIFTEEN_MINUTES,
    rateLimitMax,
    'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
    { skipSuccessfulRequests: true },
  );
  const recoveryLimiter = createRateLimiter(
    FIFTEEN_MINUTES,
    rateLimitMax,
    'Muitas solicitações de recuperação. Aguarde alguns minutos e tente novamente.',
  );

  router.post('/login', loginLimiter, controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.post('/forgot-password', recoveryLimiter, controller.forgotPassword);
  router.post('/reset-password', recoveryLimiter, controller.resetPassword);

  const allowPending = authenticate({ allowPendingPasswordChange: true });
  router.get('/me', allowPending, controller.me);
  router.post('/change-password', allowPending, controller.changePassword);

  return router;
}
