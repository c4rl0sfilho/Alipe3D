import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AppConfig } from '../app.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { createServices, type AppServices } from '../container.js';
import { prisma } from '../prisma/client.js';
import type { Mailer } from '../services/mailer.js';

export const testConfig: AppConfig = {
  CORS_ORIGINS: ['http://localhost:5173'],
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX: 10_000,
  SWAGGER_ENABLED: true,
  TRUST_PROXY: false,
  COOKIE_SECURE: false,
  AUTH_RATE_LIMIT_MAX: 10_000,
};

/** Mailer de teste: guarda as mensagens em memória em vez de enviá-las. */
export class InMemoryMailer implements Mailer {
  readonly isConfigured = true;
  readonly sent: Parameters<Mailer['send']>[0][] = [];
  async send(message: Parameters<Mailer['send']>[0]) {
    this.sent.push(message);
  }
}

/**
 * Monta o app com os serviços reais, permitindo substituir alguns deles.
 * Uploads vão para uma pasta temporária própria de cada execução.
 */
export function buildTestApp(overrides: Partial<AppServices> = {}) {
  const mailer = new InMemoryMailer();
  const uploadDir = join(tmpdir(), `alipe3d-test-uploads-${process.pid}`);
  const services = {
    ...createServices({
      prisma,
      config: { ...env, UPLOAD_DIR: uploadDir },
      logger,
      version: '0.0.0-test',
      mailer,
    }),
    ...overrides,
  };
  return {
    app: createApp({ config: testConfig, version: '0.0.0-test', services }),
    mailer,
    prisma,
    services,
  };
}
