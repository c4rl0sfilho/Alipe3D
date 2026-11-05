import type { AuthUser } from '@alipe3d/shared';

declare global {
  namespace Express {
    interface Request {
      /** Preenchido pelo middleware `authenticate`. */
      auth?: {
        user: AuthUser;
      };
    }
  }
}

export {};
