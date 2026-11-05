import type { CookieOptions, Request, Response } from 'express';
import type { IssuedRefreshToken } from './token.service.js';

export const REFRESH_COOKIE = 'alipe3d_rt';

export interface CookieConfig {
  secure: boolean;
}

function baseOptions(config: CookieConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: 'strict',
    // O cookie só é enviado às rotas de autenticação, nunca ao resto da API.
    path: '/api/v1/auth',
  };
}

export function setRefreshCookie(res: Response, token: IssuedRefreshToken, config: CookieConfig) {
  res.cookie(REFRESH_COOKIE, token.token, { ...baseOptions(config), expires: token.expiresAt });
}

export function clearRefreshCookie(res: Response, config: CookieConfig) {
  res.clearCookie(REFRESH_COOKIE, baseOptions(config));
}

export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : undefined;
}
