/**
 * Seed de dados ESSENCIAIS do sistema (não são dados de demonstração):
 *  - sincroniza o catálogo de permissões com o banco;
 *  - garante os perfis ADMIN e OPERACIONAL;
 *  - cadastra as duas impressoras da empresa (ALIPE-PRINTER-01 e 02), se ainda não existirem;
 *  - cria o primeiro administrador, se ainda não existir nenhum, a partir de SEED_ADMIN_*.
 *
 * Idempotente: pode ser executado quantas vezes for preciso (npm run db:seed).
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_OPERATIONAL_PERMISSIONS,
  emailSchema,
  PERMISSIONS,
  passwordSchema,
  SYSTEM_ROLES,
} from '@alipe3d/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client.js';

const rootEnv = resolve(import.meta.dirname, '../../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const log = (message: string) => console.warn(`[seed] ${message}`);

/** As duas Bambu Lab A1 da Alipe3D (escopo do projeto, módulo Impressoras). */
const INITIAL_PRINTERS = ['ALIPE-PRINTER-01', 'ALIPE-PRINTER-02'];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL não definida');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    // 1. Permissões
    for (const permission of PERMISSIONS) {
      await prisma.permission.upsert({
        where: { code: permission.code },
        create: permission,
        update: {
          module: permission.module,
          label: permission.label,
          adminOnly: permission.adminOnly,
        },
      });
    }
    const removed = await prisma.permission.deleteMany({
      where: { code: { notIn: PERMISSIONS.map((p) => p.code) } },
    });
    // Permissões administrativas nunca ficam atribuídas a perfis que não sejam ADMIN.
    await prisma.rolePermission.deleteMany({ where: { permission: { adminOnly: true } } });
    log(`${PERMISSIONS.length} permissões sincronizadas (${removed.count} obsoletas removidas).`);

    // 2. Perfis do sistema
    await prisma.role.upsert({
      where: { code: SYSTEM_ROLES.ADMIN },
      create: {
        code: SYSTEM_ROLES.ADMIN,
        name: 'Administrador',
        description: 'Acesso completo a todos os módulos e à administração do sistema.',
        isSystem: true,
      },
      update: { isSystem: true },
    });

    const operational = await prisma.role.findUnique({ where: { code: SYSTEM_ROLES.OPERACIONAL } });
    if (!operational) {
      const permissions = await prisma.permission.findMany({
        where: { code: { in: DEFAULT_OPERATIONAL_PERMISSIONS } },
      });
      await prisma.role.create({
        data: {
          code: SYSTEM_ROLES.OPERACIONAL,
          name: 'Operacional',
          description: 'Acesso aos módulos operacionais conforme as permissões atribuídas.',
          isSystem: true,
          permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
        },
      });
      log('Perfil Operacional criado com as permissões padrão.');
    }

    // 3. Impressoras da empresa (definidas no escopo do projeto). Criadas uma única vez:
    //    depois disso são editadas ou excluídas pela tela, e o seed não as recria.
    for (const code of INITIAL_PRINTERS) {
      const exists = await prisma.printer.findUnique({ where: { code }, select: { id: true } });
      if (!exists) {
        await prisma.printer.create({ data: { code, model: 'Bambu Lab A1', status: 'AVAILABLE' } });
        log(`Impressora ${code} cadastrada.`);
      }
    }

    // 4. Primeiro administrador
    const adminCount = await prisma.user.count({ where: { role: { code: SYSTEM_ROLES.ADMIN } } });
    if (adminCount > 0) {
      log('Administrador já existe. Nenhum usuário criado.');
      return;
    }

    const { SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
    if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
      log(
        'Nenhum administrador cadastrado. Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no .env e rode o seed novamente.',
      );
      return;
    }
    const email = emailSchema.parse(SEED_ADMIN_EMAIL);
    const password = passwordSchema.safeParse(SEED_ADMIN_PASSWORD);
    if (!password.success) {
      throw new Error(`SEED_ADMIN_PASSWORD inválida: ${password.error.issues[0]?.message}`);
    }

    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: SYSTEM_ROLES.ADMIN } });
    const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
    await prisma.user.create({
      data: {
        name: SEED_ADMIN_NAME?.trim() || 'Administrador',
        email,
        passwordHash: await bcrypt.hash(password.data, rounds),
        roleId: adminRole.id,
        // A senha do .env é provisória: será trocada no primeiro acesso.
        mustChangePassword: true,
      },
    });
    log(`Administrador ${email} criado. A senha deverá ser trocada no primeiro acesso.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[seed] Falhou:', error instanceof Error ? error.message : error);
  process.exit(1);
});
