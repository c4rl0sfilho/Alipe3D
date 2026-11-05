import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import type { Env } from './config/env.js';
import { logger } from './config/logger.js';
import type { AppServices } from './container.js';
import { buildOpenApiDocument } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { createRateLimiter } from './middlewares/rate-limit.js';
import { createV1Router } from './routes/index.js';

export type AppConfig = Pick<
  Env,
  | 'CORS_ORIGINS'
  | 'RATE_LIMIT_WINDOW_MS'
  | 'RATE_LIMIT_MAX'
  | 'SWAGGER_ENABLED'
  | 'TRUST_PROXY'
  | 'COOKIE_SECURE'
  | 'AUTH_RATE_LIMIT_MAX'
>;

export interface AppOptions {
  config: AppConfig;
  version: string;
  services: AppServices;
}

/** Monta a aplicação Express. Dependências são injetadas para facilitar testes. */
export function createApp({ config, version, services }: AppOptions): Express {
  const app = express();

  app.disable('x-powered-by');
  if (config.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGINS,
      credentials: true,
      exposedHeaders: ['X-Request-Id'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  app.use(
    '/api',
    createRateLimiter(
      config.RATE_LIMIT_WINDOW_MS,
      config.RATE_LIMIT_MAX,
      'Muitas requisições em pouco tempo. Aguarde alguns instantes e tente novamente.',
    ),
  );

  if (config.SWAGGER_ENABLED) {
    const document = buildOpenApiDocument(version);
    app.get('/api/docs.json', (_req, res) => {
      res.json(document);
    });
    app.use(
      '/api/docs',
      swaggerUi.serve,
      swaggerUi.setup(document, {
        customSiteTitle: 'Alipe3D API',
        swaggerOptions: { persistAuthorization: false },
      }),
    );
  }

  app.use(
    '/api/v1',
    createV1Router({
      services,
      cookieSecure: config.COOKIE_SECURE,
      authRateLimitMax: config.AUTH_RATE_LIMIT_MAX,
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
