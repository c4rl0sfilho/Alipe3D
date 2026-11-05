import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import pg from 'pg';

/**
 * Recria o banco de integração do zero, aplica as migrations e roda o seed essencial.
 * O nome precisa terminar em "_test" — proteção contra apagar o banco principal por engano.
 */
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  const database = url.pathname.slice(1);
  if (!database.endsWith('_test')) {
    throw new Error(`Banco de teste deve terminar em "_test" (recebido: "${database}").`);
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  adminUrl.search = '';
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Não foi possível conectar ao PostgreSQL para os testes de integração. Rode "npm run db:up". (${String(error)})`,
      { cause: error },
    );
  }
  const quoted = `"${database.replace(/"/g, '""')}"`;
  await client.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${quoted}`);
  await client.end();

  const cwd = resolve(import.meta.dirname, '../..');
  // SEED_ADMIN_* vazios: o banco de teste nunca recebe o administrador do .env.
  const env = {
    ...process.env,
    DATABASE_URL: url.toString(),
    SEED_ADMIN_EMAIL: '',
    SEED_ADMIN_PASSWORD: '',
  };
  execSync('npx prisma migrate deploy', { cwd, env, stdio: 'pipe' });
  execSync('npx tsx src/prisma/seed.ts', { cwd, env, stdio: 'pipe' });
}
