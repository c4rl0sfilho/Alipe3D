import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../prisma/client.js';
import { buildTestApp } from '../../test/app.js';
import {
  createUser,
  DEFAULT_PASSWORD,
  extractRefreshCookie,
  login,
  resetDatabase,
} from '../../test/factories.js';

const { app, mailer } = buildTestApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('login', () => {
  it('autentica, devolve o usuário com permissões e grava cookie httpOnly', async () => {
    const user = await createUser({ role: 'ADMIN' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email.toUpperCase(), password: DEFAULT_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTypeOf('string');
    expect(res.body.data.user).toMatchObject({ id: user.id, email: user.email });
    expect(res.body.data.user.permissions).toContain('users:manage');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/alipe3d_rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);

    const stored = await prisma.refreshToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(cookie).not.toContain(stored.tokenHash);
    expect(await prisma.auditLog.count({ where: { action: 'auth.login', userId: user.id } })).toBe(
      1,
    );
  });

  it('responde com a mesma mensagem para e-mail inexistente e senha errada', async () => {
    const user = await createUser();

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'Errada123' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ninguem@teste.com', password: 'Errada123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('bloqueia a conta após 5 tentativas erradas, mesmo com a senha certa depois', async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'Errada123' });
    }

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: DEFAULT_PASSWORD });

    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('recusa usuário desativado', async () => {
    const user = await createUser({ isActive: false });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: DEFAULT_PASSWORD });

    expect(res.status).toBe(403);
  });
});

describe('sessão (refresh token)', () => {
  it('rotaciona o token a cada renovação', async () => {
    const user = await createUser();
    const { cookie } = await login(app, user.email);

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(200);
    const newCookie = extractRefreshCookie(res.headers['set-cookie']);
    expect(newCookie).not.toBe(cookie);
    expect(res.body.data.user.id).toBe(user.id);
  });

  it('detecta reuso de token antigo e encerra a sessão inteira', async () => {
    const user = await createUser();
    const { cookie: original } = await login(app, user.email);
    const first = await request(app).post('/api/v1/auth/refresh').set('Cookie', original);
    const rotated = extractRefreshCookie(first.headers['set-cookie']);

    // Simula o token antigo sendo reapresentado depois da janela de tolerância
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, rotatedAt: { not: null } },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });
    const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', original);
    const afterReuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', rotated);

    expect(reuse.status).toBe(401);
    expect(afterReuse.status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: 'auth.refresh_reuse_detected' } })).toBe(
      1,
    );
  });

  it('logout revoga a sessão', async () => {
    const user = await createUser();
    const { cookie } = await login(app, user.email);

    const logout = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    const refresh = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);

    expect(logout.status).toBe(204);
    expect(refresh.status).toBe(401);
  });

  it('sem cookie, refresh retorna 401', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });
});

describe('troca de senha obrigatória', () => {
  it('bloqueia a API até a troca e libera depois', async () => {
    const user = await createUser({ role: 'ADMIN', mustChangePassword: true });
    const { accessToken } = await login(app, user.email);

    const blocked = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);

    const changed = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'NovaSenha456' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.user.mustChangePassword).toBe(false);

    const allowed = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${changed.body.data.accessToken}`);
    expect(allowed.status).toBe(200);
  });

  it('recusa senha atual incorreta e senha fraca', async () => {
    const user = await createUser();
    const { accessToken } = await login(app, user.email);
    const auth = { Authorization: `Bearer ${accessToken}` };

    const wrong = await request(app)
      .post('/api/v1/auth/change-password')
      .set(auth)
      .send({ currentPassword: 'Errada123', newPassword: 'NovaSenha456' });
    const weak = await request(app)
      .post('/api/v1/auth/change-password')
      .set(auth)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'curta' });

    expect(wrong.status).toBe(400);
    expect(weak.status).toBe(422);
  });
});

describe('recuperação de senha', () => {
  it('envia link de uso único que redefine a senha e encerra as sessões', async () => {
    const user = await createUser();
    const { cookie } = await login(app, user.email);
    mailer.sent.length = 0;

    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: user.email });
    expect(forgot.status).toBe(200);
    expect(mailer.sent).toHaveLength(1);

    const token = new URL(
      /https?:\/\/\S+/.exec(mailer.sent[0]?.text ?? '')?.[0] ?? '',
    ).searchParams.get('token');
    expect(token).toBeTruthy();

    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'Redefinida789' });
    expect(reset.status).toBe(200);

    const reused = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'OutraSenha789' });
    expect(reused.status).toBe(400);

    const oldSession = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(oldSession.status).toBe(401);

    await login(app, user.email, 'Redefinida789');
  });

  it('não revela se o e-mail existe', async () => {
    mailer.sent.length = 0;
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'inexistente@teste.com' });

    expect(res.status).toBe(200);
    expect(mailer.sent).toHaveLength(0);
  });
});
