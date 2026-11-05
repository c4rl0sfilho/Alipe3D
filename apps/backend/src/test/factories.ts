import { SYSTEM_ROLES } from '@alipe3d/shared';
import bcrypt from 'bcrypt';
import type { Express } from 'express';
import request from 'supertest';
import { prisma } from '../prisma/client.js';

export const DEFAULT_PASSWORD = 'Senha123';

let sequence = 0;

export async function createUser(
  options: {
    role?: string;
    password?: string;
    isActive?: boolean;
    mustChangePassword?: boolean;
  } = {},
) {
  const n = ++sequence;
  const role = await prisma.role.findUniqueOrThrow({
    where: { code: options.role ?? SYSTEM_ROLES.OPERACIONAL },
  });
  return prisma.user.create({
    data: {
      name: `Usuário ${n}`,
      email: `usuario${n}-${Date.now()}@teste.com`,
      passwordHash: await bcrypt.hash(options.password ?? DEFAULT_PASSWORD, 4),
      roleId: role.id,
      isActive: options.isActive ?? true,
      mustChangePassword: options.mustChangePassword ?? false,
    },
  });
}

/** Faz login e devolve o access token e o cookie de sessão. */
export async function login(app: Express, email: string, password = DEFAULT_PASSWORD) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200)
    throw new Error(`Login falhou (${res.status}): ${JSON.stringify(res.body)}`);
  const cookie = extractRefreshCookie(res.headers['set-cookie']);
  return { accessToken: res.body.data.accessToken as string, cookie, body: res.body };
}

export function extractRefreshCookie(header: string | string[] | undefined): string {
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const found = cookies.find((c) => c.startsWith('alipe3d_rt='));
  if (!found) throw new Error('Cookie de sessão não encontrado');
  return found.split(';')[0] ?? '';
}

export async function resetDatabase() {
  // Ordem respeita as chaves estrangeiras (movimentações antes de itens e usuários)
  await prisma.qualityInspection.deleteMany();
  await prisma.printJob.deleteMany();
  await prisma.productionOrder.deleteMany();
  await prisma.printerMaintenance.deleteMany();
  await prisma.printer.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.productMaterial.deleteMany();
  await prisma.productFile.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.materialRoll.deleteMany();
  await prisma.material.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany({ where: { isSystem: false } });
}
