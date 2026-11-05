import type { ApiFailure, ApiSuccess, AuthSession, Paginated } from '@alipe3d/shared';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

/**
 * Cliente HTTP único da aplicação. Em desenvolvimento, /api é encaminhado pelo proxy do Vite;
 * em produção, pelo nginx. Assim o frontend nunca precisa conhecer o host da API.
 */
export const api = axios.create({
  baseURL: '/api/v1',
  timeout: 15_000,
  withCredentials: true,
  headers: { Accept: 'application/json' },
});

// ---------------------------------------------------------------------------
// Sessão: o access token vive só em memória (nunca em localStorage).
// A sessão longa fica no cookie httpOnly, inacessível ao JavaScript.
// ---------------------------------------------------------------------------

let accessToken: string | null = null;
let refreshInFlight: Promise<AuthSession> | null = null;
let onSessionRenewed: ((session: AuthSession) => void) | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

/** O AuthProvider registra aqui como reagir a renovações e à expiração da sessão. */
export function registerSessionHandlers(handlers: {
  renewed: (session: AuthSession) => void;
  expired: () => void;
}) {
  onSessionRenewed = handlers.renewed;
  onSessionExpired = handlers.expired;
}

async function requestRefresh(): Promise<AuthSession> {
  const response = await axios.post<ApiSuccess<AuthSession>>('/api/v1/auth/refresh', null, {
    withCredentials: true,
    timeout: 15_000,
  });
  return response.data.data;
}

/**
 * Renova a sessão. Chamadas simultâneas compartilham a mesma requisição.
 * Uma segunda tentativa cobre a corrida entre abas que renovam ao mesmo tempo.
 */
export function refreshSession(): Promise<AuthSession> {
  refreshInFlight ??= (async () => {
    try {
      return await requestRefresh();
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 401) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        return requestRefresh();
      }
      throw error;
    }
  })()
    .then((session) => {
      setAccessToken(session.accessToken);
      onSessionRenewed?.(session);
      return session;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/logout'];

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!(error instanceof AxiosError) || !error.config) throw error;
  const config = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
  const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => config.url?.endsWith(path));

  if (error.response?.status === 401 && !config._retried && !isAuthEndpoint) {
    config._retried = true;
    try {
      const session = await refreshSession();
      config.headers.Authorization = `Bearer ${session.accessToken}`;
      return api(config);
    } catch {
      setAccessToken(null);
      onSessionExpired?.();
    }
  }
  throw error;
});

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/** Erro normalizado, com mensagem pronta para exibir ao usuário. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly code: string,
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export function toApiRequestError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) return error;
  if (error instanceof AxiosError) {
    const body = error.response?.data as Partial<ApiFailure> | undefined;
    if (body?.error) {
      const fieldErrors = Object.fromEntries(
        (body.error.details ?? []).map((detail) => [detail.field, detail.message]),
      );
      return new ApiRequestError(
        body.error.message,
        error.response?.status ?? null,
        body.error.code,
        fieldErrors,
      );
    }
    if (!error.response) {
      return new ApiRequestError(
        'Não foi possível conectar ao servidor. Verifique sua conexão.',
        null,
        'NETWORK_ERROR',
      );
    }
    return new ApiRequestError(
      'O servidor retornou uma resposta inesperada.',
      error.response.status,
      'UNKNOWN',
    );
  }
  return new ApiRequestError('Ocorreu um erro inesperado.', null, 'UNKNOWN');
}

/** Executa a requisição e devolve `data`, convertendo falhas em ApiRequestError. */
export async function request<T>(promise: Promise<{ data: ApiSuccess<T> }>): Promise<T> {
  try {
    return (await promise).data.data;
  } catch (error) {
    throw toApiRequestError(error);
  }
}

/** Igual a `request`, para listagens paginadas (dados + meta). */
export async function requestPage<T>(
  promise: Promise<{ data: ApiSuccess<T[]> }>,
): Promise<Paginated<T>> {
  try {
    const body = (await promise).data;
    return {
      items: body.data,
      meta: body.meta ?? {
        page: 1,
        pageSize: body.data.length,
        totalItems: body.data.length,
        totalPages: 1,
      },
    };
  } catch (error) {
    throw toApiRequestError(error);
  }
}
