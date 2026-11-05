import type { ApiErrorCode, ApiErrorDetail } from '@alipe3d/shared';

/**
 * Erro de domínio/aplicação com status HTTP e código estável.
 * Lançado pelos services; convertido em resposta JSON pelo error handler.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: ApiErrorDetail[]) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Autenticação necessária.') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Você não tem permissão para executar esta ação.') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Recurso não encontrado.') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string) {
    return new AppError(409, 'CONFLICT', message);
  }
}
