import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/http-response.js';
import type { HealthService } from './health.service.js';

export class HealthController {
  constructor(private readonly service: HealthService) {}

  /** Verificação completa: API + banco. Retorna 503 quando algum serviço está fora. */
  check = async (_req: Request, res: Response) => {
    const health = await this.service.check();
    sendSuccess(res, health, health.status === 'ok' ? 200 : 503);
  };

  /** Liveness: confirma apenas que o processo da API está respondendo. */
  live = (_req: Request, res: Response) => {
    sendSuccess(res, { status: 'ok' as const });
  };
}
