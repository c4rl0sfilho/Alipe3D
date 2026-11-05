import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const rootEnv = resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/** Banco de integração: mesmo servidor do .env, banco "<nome>_test". Nunca o banco principal. */
function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = new URL(process.env.DATABASE_URL ?? 'postgresql://alipe3d@localhost:5432/alipe3d');
  base.pathname = `${base.pathname}_test`;
  return base.toString();
}

const TEST_DATABASE_URL = testDatabaseUrl();
// Lido pelo globalSetup, que roda no processo principal (fora do `env` dos workers).
process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;

const baseEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  JWT_ACCESS_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres-0123456789',
  BCRYPT_ROUNDS: '4',
  AUTH_RATE_LIMIT_MAX: '1000',
  APP_URL: 'http://localhost:5173',
};

export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.int.test.ts'],
          env: { ...baseEnv, DATABASE_URL: 'postgresql://test:test@localhost:5432/unused' },
        },
      },
      {
        // Requer o PostgreSQL rodando (npm run db:up). Usa um banco separado, recriado a cada execução.
        test: {
          name: 'integration',
          include: ['src/**/*.int.test.ts'],
          globalSetup: ['./src/test/global-setup.ts'],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
          env: { ...baseEnv, DATABASE_URL: TEST_DATABASE_URL },
        },
      },
    ],
  },
});
