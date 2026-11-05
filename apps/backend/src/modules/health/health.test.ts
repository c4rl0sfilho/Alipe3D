import { healthStatusSchema } from '@alipe3d/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../../test/app.js';
import { HealthService, type DatabaseProbe } from './health.service.js';

function buildApp(database: DatabaseProbe) {
  const health = new HealthService({
    database,
    version: '0.0.0-test',
    environment: 'test',
    databaseTimeoutMs: 100,
  });
  return buildTestApp({ health }).app;
}

describe('GET /api/v1/health', () => {
  it('retorna 200 e status ok quando o banco responde', async () => {
    const app = buildApp({ ping: async () => {} });

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = healthStatusSchema.parse(res.body.data);
    expect(data.status).toBe('ok');
    expect(data.services.database.status).toBe('up');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('retorna 503 e status degraded quando o banco falha', async () => {
    const app = buildApp({
      ping: async () => {
        throw new Error('connection refused');
      },
    });

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.services.database).toEqual({ status: 'down', latencyMs: null });
  });

  it('considera o banco indisponível quando excede o tempo limite', async () => {
    const app = buildApp({ ping: () => new Promise(() => {}) });

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.data.services.database.status).toBe('down');
  });
});

describe('GET /api/v1/health/live', () => {
  it('responde sem consultar o banco', async () => {
    const app = buildApp({
      ping: async () => {
        throw new Error('não deveria ser chamado');
      },
    });

    const res = await request(app).get('/api/v1/health/live');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
  });
});

describe('tratamento padronizado de erros', () => {
  const app = buildApp({ ping: async () => {} });

  it('retorna 404 em JSON para rota inexistente', async () => {
    const res = await request(app).get('/api/v1/nao-existe');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('retorna 400 para JSON malformado', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"invalido":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('retorna 422 com detalhes por campo quando a validação falha', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'x' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(
      expect.arrayContaining(['email', 'password']),
    );
  });

  it('bloqueia rotas protegidas sem token', async () => {
    const res = await request(app).get('/api/v1/users');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('aplica cabeçalhos de segurança do Helmet', async () => {
    const res = await request(app).get('/api/v1/health/live');

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('expõe a documentação OpenAPI', async () => {
    const res = await request(app).get('/api/docs.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
  });
});
