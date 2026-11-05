/**
 * Contrato padrão das respostas JSON da API (/api/v1).
 * Toda resposta tem o campo `success` para facilitar o tratamento no cliente.
 */

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorBody {
  /** Código estável para tratamento programático (ex.: VALIDATION_ERROR). */
  code: ApiErrorCode;
  /** Mensagem em português, segura para exibição ao usuário. */
  message: string;
  /** Detalhes opcionais (ex.: campos inválidos). Nunca contém dados sensíveis. */
  details?: ApiErrorDetail[];
  /** Identificador da requisição, útil para rastrear o erro nos logs. */
  requestId?: string;
}

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'ACCOUNT_LOCKED',
  'PASSWORD_CHANGE_REQUIRED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
