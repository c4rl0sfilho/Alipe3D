import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { createServices } from './container.js';
import { prisma } from './prisma/client.js';

const version = process.env.npm_package_version ?? '0.2.0';

const services = createServices({ prisma, config: env, logger, version });
// Pastas de upload precisam existir antes de receber arquivos
await services.storage.init();
const app = createApp({ config: env, version, services });
const server = createServer(app);

server.listen(env.API_PORT, () => {
  logger.info(`API Alipe3D ouvindo em http://localhost:${env.API_PORT}/api/v1`);
  if (env.SWAGGER_ENABLED) logger.info(`Documentação em http://localhost:${env.API_PORT}/api/docs`);
  if (!services.mailer.isConfigured) {
    logger.warn(
      'SMTP não configurado: e-mails de recuperação de senha não serão enviados. Use "Gerar link de redefinição" na tela de usuários.',
    );
  }
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} recebido. Encerrando...`);

  const forceExit = setTimeout(() => {
    logger.error('Encerramento forçado após tempo limite.');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Encerrado com sucesso.');
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Promise rejeitada sem tratamento');
});
