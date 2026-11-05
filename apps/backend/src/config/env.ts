import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// Fora do Docker, carrega o .env da raiz do monorepo. Variáveis já definidas têm prioridade.
const rootEnvPath = resolve(import.meta.dirname, '../../../../.env');
if (process.env.NODE_ENV !== 'test' && existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL é obrigatória')
    .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
      message: 'DATABASE_URL deve ser uma URL PostgreSQL',
    }),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  SWAGGER_ENABLED: booleanFromString,
  TRUST_PROXY: booleanFromString,

  // ---------- Autenticação ----------
  JWT_ACCESS_SECRET: z
    .string({ error: 'JWT_ACCESS_SECRET é obrigatória' })
    .min(32, 'JWT_ACCESS_SECRET deve ter ao menos 32 caracteres'),
  /** Validade do access token, em segundos. */
  JWT_ACCESS_TTL: z.coerce.number().int().min(60).max(3600).default(900),
  /** Validade da sessão (refresh token), em dias. Renovada a cada uso. */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  /** Cookies só por HTTPS. Use true em produção com HTTPS. */
  COOKIE_SECURE: booleanFromString,
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  /** Endereço público da interface (usado nos links de redefinição de senha). */
  APP_URL: z.url('APP_URL deve ser uma URL válida').default('http://localhost:5173'),

  // ---------- Arquivos ----------
  /** Pasta dos arquivos enviados (fotos, STL, 3MF...). Padrão: apps/backend/uploads. */
  UPLOAD_DIR: z
    .string()
    .optional()
    .transform((value) => value?.trim() || resolve(import.meta.dirname, '../../uploads')),

  // ---------- E-mail (opcional) ----------
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanFromString,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('Alipe3D Manager <nao-responda@alipe3d.local>'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`Variáveis de ambiente inválidas:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
