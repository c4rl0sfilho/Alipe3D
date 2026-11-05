import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../prisma/client.js';
import { buildTestApp } from '../../test/app.js';
import { createUser, login, resetDatabase } from '../../test/factories.js';

const { app } = buildTestApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function adminSession() {
  const admin = await createUser({ role: 'ADMIN' });
  const { accessToken, cookie } = await login(app, admin.email);
  return { admin, auth: { Authorization: `Bearer ${accessToken}` }, cookie };
}

async function roleId(code: string) {
  return (await prisma.role.findUniqueOrThrow({ where: { code } })).id;
}

describe('controle de acesso', () => {
  it('impede o perfil operacional de acessar a administração', async () => {
    const operator = await createUser({ role: 'OPERACIONAL' });
    const { accessToken } = await login(app, operator.email);
    const auth = { Authorization: `Bearer ${accessToken}` };

    expect((await request(app).get('/api/v1/users').set(auth)).status).toBe(403);
    expect((await request(app).get('/api/v1/audit-logs').set(auth)).status).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/v1/users')
          .set(auth)
          .send({ name: 'X', email: 'x@teste.com', password: 'Senha123', roleId: operator.roleId })
      ).status,
    ).toBe(403);
  });

  it('recusa token adulterado', async () => {
    const res = await request(app).get('/api/v1/users').set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
  });

  it('desativar um usuário invalida o acesso dele imediatamente', async () => {
    const { auth } = await adminSession();
    const operator = await createUser();
    const session = await login(app, operator.email);

    await request(app)
      .patch(`/api/v1/users/${operator.id}/status`)
      .set(auth)
      .send({ isActive: false })
      .expect(200);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`);
    const refresh = await request(app).post('/api/v1/auth/refresh').set('Cookie', session.cookie);
    expect(me.status).toBe(401);
    expect(refresh.status).toBe(401);
  });
});

describe('cadastro de usuários', () => {
  it('cria usuário com senha provisória e registra auditoria', async () => {
    const { auth, admin } = await adminSession();

    const res = await request(app)
      .post('/api/v1/users')
      .set(auth)
      .send({
        name: 'Maria Operadora',
        email: 'Maria@Alipe3D.com',
        password: 'Provisoria1',
        roleId: await roleId('OPERACIONAL'),
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      email: 'maria@alipe3d.com',
      mustChangePassword: true,
      isActive: true,
    });
    expect(res.body.data).not.toHaveProperty('passwordHash');
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.created' } });
    expect(log.userId).toBe(admin.id);
    expect(JSON.stringify(log.metadata)).not.toContain('Provisoria1');
  });

  it('impede e-mail duplicado', async () => {
    const { auth } = await adminSession();
    const existing = await createUser();

    const res = await request(app).post('/api/v1/users').set(auth).send({
      name: 'Duplicado',
      email: existing.email,
      password: 'Senha1234',
      roleId: existing.roleId,
    });

    expect(res.status).toBe(409);
  });

  it('lista com busca e paginação', async () => {
    const { auth } = await adminSession();
    await Promise.all([createUser(), createUser(), createUser()]);

    const res = await request(app).get('/api/v1/users?pageSize=2&page=1').set(auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 2, totalItems: 4, totalPages: 2 });
  });
});

describe('proteções do administrador', () => {
  it('não permite se desativar nem alterar o próprio perfil', async () => {
    const { auth, admin } = await adminSession();

    const deactivate = await request(app)
      .patch(`/api/v1/users/${admin.id}/status`)
      .set(auth)
      .send({ isActive: false });
    const demote = await request(app)
      .put(`/api/v1/users/${admin.id}`)
      .set(auth)
      .send({ name: admin.name, email: admin.email, roleId: await roleId('OPERACIONAL') });

    expect(deactivate.status).toBe(400);
    expect(demote.status).toBe(400);
  });

  it('desativar invalida links de redefinição pendentes, mesmo após reativar', async () => {
    const { auth } = await adminSession();
    const operator = await createUser();
    const link = await request(app).post(`/api/v1/users/${operator.id}/reset-link`).set(auth);
    const token = new URL(link.body.data.url).searchParams.get('token');

    await request(app)
      .patch(`/api/v1/users/${operator.id}/status`)
      .set(auth)
      .send({ isActive: false })
      .expect(200);
    await request(app)
      .patch(`/api/v1/users/${operator.id}/status`)
      .set(auth)
      .send({ isActive: true })
      .expect(200);
    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'NovaSenha123' });

    expect(reset.status).toBe(400);
  });

  it('gera link de redefinição para outro usuário', async () => {
    const { auth } = await adminSession();
    const operator = await createUser();

    const res = await request(app).post(`/api/v1/users/${operator.id}/reset-link`).set(auth);

    expect(res.status).toBe(201);
    expect(res.body.data.url).toMatch(/\/redefinir-senha\?token=/);
  });
});

describe('perfis e permissões', () => {
  it('não permite atribuir permissões administrativas a outros perfis', async () => {
    const { auth } = await adminSession();

    const res = await request(app)
      .post('/api/v1/roles')
      .set(auth)
      .send({ name: 'Expedição', permissions: ['orders:read', 'users:manage'] });

    expect(res.status).toBe(422);
  });

  it('não permite editar o perfil Administrador', async () => {
    const { auth } = await adminSession();

    const res = await request(app)
      .put(`/api/v1/roles/${await roleId('ADMIN')}`)
      .set(auth)
      .send({ name: 'Administrador', permissions: [] });

    expect(res.status).toBe(403);
  });

  it('mudança de permissões vale na hora para quem já está logado', async () => {
    const { auth } = await adminSession();
    const created = await request(app)
      .post('/api/v1/roles')
      .set(auth)
      .send({ name: 'Expedição', permissions: ['orders:read'] })
      .expect(201);
    const operator = await createUser({ role: created.body.data.code });
    const session = await login(app, operator.email);
    expect(session.body.data.user.permissions).toEqual(['orders:read']);

    await request(app)
      .put(`/api/v1/roles/${created.body.data.id}`)
      .set(auth)
      .send({ name: 'Expedição', permissions: ['orders:read', 'orders:manage'] })
      .expect(200);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`);
    expect(me.body.data.permissions).toEqual(
      expect.arrayContaining(['orders:read', 'orders:manage']),
    );
  });

  it('não exclui perfil em uso', async () => {
    const { auth } = await adminSession();
    const created = await request(app)
      .post('/api/v1/roles')
      .set(auth)
      .send({ name: 'Temporário', permissions: [] })
      .expect(201);
    await createUser({ role: created.body.data.code });

    const res = await request(app).delete(`/api/v1/roles/${created.body.data.id}`).set(auth);

    expect(res.status).toBe(409);
  });
});
