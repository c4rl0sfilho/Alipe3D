import type { Request } from 'express';

/** Origem da requisição, registrada em sessões e na auditoria. */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

export function getRequestContext(req: Request): RequestContext {
  return {
    ip: req.ip?.slice(0, 64) ?? null,
    userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
  };
}

/** Usuário autenticado da requisição. Use apenas em rotas protegidas por `authenticate`. */
export function getAuthUser(req: Request) {
  if (!req.auth) throw new Error('getAuthUser chamado em rota sem autenticação');
  return req.auth.user;
}
