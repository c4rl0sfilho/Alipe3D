import type { HealthStatus } from '@alipe3d/shared';

/** Abstração mínima do banco, para que o service não dependa diretamente do Prisma. */
export interface DatabaseProbe {
  ping(): Promise<void>;
}

export interface HealthServiceOptions {
  database: DatabaseProbe;
  version: string;
  environment: string;
  /** Tempo máximo de espera pelo banco antes de considerá-lo indisponível. */
  databaseTimeoutMs?: number;
}

export class HealthService {
  private readonly timeoutMs: number;

  constructor(private readonly options: HealthServiceOptions) {
    this.timeoutMs = options.databaseTimeoutMs ?? 3000;
  }

  async check(): Promise<HealthStatus> {
    const database = await this.checkDatabase();
    return {
      status: database.status === 'up' ? 'ok' : 'degraded',
      version: this.options.version,
      environment: this.options.environment,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      services: {
        api: { status: 'up' },
        database,
      },
    };
  }

  private async checkDatabase(): Promise<HealthStatus['services']['database']> {
    const startedAt = performance.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.options.database.ping(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Tempo limite excedido')), this.timeoutMs);
        }),
      ]);
      return { status: 'up', latencyMs: Math.round(performance.now() - startedAt) };
    } catch {
      return { status: 'down', latencyMs: null };
    } finally {
      clearTimeout(timer);
    }
  }
}
