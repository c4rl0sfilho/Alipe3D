import type { PermissionCode } from '@alipe3d/shared';
import type { RequestHandler } from 'express';
import type { AuthService } from '../modules/auth/auth.service.js';
import { AppError } from '../utils/app-error.js';

export interface AuthenticateOptions {
  /** Permite acesso mesmo com troca de senha pendente (rotas de perfil/troca de senha/logout). */
  allowPendingPasswordChange?: boolean;
}

/**
 * Exige um access token válido (Authorization: Bearer).
 * O usuário é recarregado do banco a cada requisição: desativação e mudanças de permissão valem na hora.
 */
export function createAuthenticate(authService: AuthService) {
  return (options: AuthenticateOptions = {}): RequestHandler =>
    async (req, _res, next) => {
      const header = req.get('authorization');
      const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
      if (!token) throw AppError.unauthorized();

      const user = await authService.resolveAccessToken(token);
      if (!user) throw AppError.unauthorized('Sessão inválida ou expirada.');

      if (user.mustChangePassword && !options.allowPendingPasswordChange) {
        throw new AppError(
          403,
          'PASSWORD_CHANGE_REQUIRED',
          'Defina uma nova senha antes de continuar.',
        );
      }

      req.auth = { user };
      next();
    };
}

export type Authenticate = ReturnType<typeof createAuthenticate>;

/** Exige AO MENOS UMA das permissões informadas. Use sempre depois de `authenticate`. */
export function requireAnyPermission(...permissions: PermissionCode[]): RequestHandler {
  return (req, _res, next) => {
    const granted = req.auth?.user.permissions ?? [];
    if (!permissions.some((permission) => granted.includes(permission))) {
      throw AppError.forbidden();
    }
    next();
  };
}

/** Exige TODAS as permissões informadas. Use sempre depois de `authenticate`. */
export function requirePermission(...permissions: PermissionCode[]): RequestHandler {
  return (req, _res, next) => {
    const granted = req.auth?.user.permissions ?? [];
    if (!permissions.every((permission) => granted.includes(permission))) {
      throw AppError.forbidden();
    }
    next();
  };
}
