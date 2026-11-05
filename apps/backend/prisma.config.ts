import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

// Carrega o .env da raiz do monorepo (fora do Docker). No container as variáveis vêm do compose.
const rootEnv = resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` não precisa de conexão; migrate/studio exigem DATABASE_URL válida.
    url: process.env.DATABASE_URL ?? '',
  },
});
