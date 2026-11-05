import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../prisma/client.js';
import { buildTestApp } from '../../test/app.js';
import { createUser, login, resetDatabase } from '../../test/factories.js';

const { app, services } = buildTestApp();

beforeAll(() => services.storage.init());
beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function session(role: 'ADMIN' | 'OPERACIONAL') {
  const user = await createUser({ role });
  const { accessToken } = await login(app, user.email);
  return { user, auth: { Authorization: `Bearer ${accessToken}` } };
}

async function createMaterial(auth: Record<string, string>, minStockGrams = '0') {
  const res = await request(app)
    .post('/api/v1/materials')
    .set(auth)
    .send({
      name: 'PLA Preto',
      manufacturer: 'Bambu Lab',
      type: 'PLA',
      color: 'Preto',
      colorHex: '#111111',
      minStockGrams,
    })
    .expect(201);
  return res.body.data.id as string;
}

async function createRoll(auth: Record<string, string>, materialId: string, overrides = {}) {
  const res = await request(app)
    .post('/api/v1/materials/rolls')
    .set(auth)
    .send({
      materialId,
      initialWeightGrams: '1000',
      spoolWeightGrams: '250',
      purchaseCost: '120,00',
      purchasedAt: '2026-11-01',
      ...overrides,
    })
    .expect(201);
  return res.body.data[0] as {
    id: string;
    code: string;
    remainingWeightGrams: string;
    status: string;
  };
}

const consume = (auth: Record<string, string>, rollId: string, quantity: string, extra = {}) =>
  request(app)
    .post('/api/v1/inventory/movements')
    .set(auth)
    .send({ rollId, type: 'PRODUCTION_OUT', quantity, reason: 'Impressão avulsa', ...extra });

describe('rolos de filamento', () => {
  it('cadastrar rolo gera entrada por compra com código sequencial', async () => {
    const { auth } = await session('ADMIN');
    const materialId = await createMaterial(auth);

    const roll = await createRoll(auth, materialId);

    expect(roll.code).toMatch(/^R-\d{4}$/);
    expect(roll.remainingWeightGrams).toBe('1000.00');
    expect(roll.status).toBe('IN_STOCK');
    const movements = await prisma.inventoryMovement.findMany({
      where: { materialRollId: roll.id },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]?.type).toBe('PURCHASE_IN');
    expect(movements[0]?.totalCost?.toString()).toBe('120');
  });

  it('cadastra vários rolos da mesma compra de uma vez', async () => {
    const { auth } = await session('ADMIN');
    const materialId = await createMaterial(auth);
    const res = await request(app)
      .post('/api/v1/materials/rolls')
      .set(auth)
      .send({
        materialId,
        initialWeightGrams: '1000',
        spoolWeightGrams: '250',
        purchaseCost: '99.90',
        purchasedAt: '2026-11-01',
        quantity: 3,
      })
      .expect(201);

    expect(res.body.data).toHaveLength(3);
    const list = await request(app).get(`/api/v1/materials`).set(auth);
    expect(list.body.data[0]).toMatchObject({ availableGrams: '3000.00', activeRolls: 3 });
  });

  it('consumo reduz o saldo, muda para "em uso" e grava o custo pelo custo por grama', async () => {
    const { auth } = await session('ADMIN');
    const roll = await createRoll(auth, await createMaterial(auth));

    const res = await consume(auth, roll.id, '85,5');

    expect(res.status).toBe(201);
    const updated = await prisma.materialRoll.findUniqueOrThrow({ where: { id: roll.id } });
    expect(updated.remainingWeightGrams.toString()).toBe('914.5');
    expect(updated.status).toBe('IN_USE');
    const movement = await prisma.inventoryMovement.findUniqueOrThrow({
      where: { id: res.body.data.id },
    });
    expect(movement.quantity.toString()).toBe('-85.5');
    expect(movement.totalCost?.toString()).toBe('10.26'); // 85,5 g × R$ 0,12/g
  });

  it('impede saldo negativo e informa o disponível', async () => {
    const { auth } = await session('ADMIN');
    const roll = await createRoll(auth, await createMaterial(auth));

    const res = await consume(auth, roll.id, '1000.01');

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('Saldo insuficiente');
  });

  it('saldo negativo só com autorização do administrador, e fica auditado', async () => {
    const admin = await session('ADMIN');
    const operator = await session('OPERACIONAL');
    const roll = await createRoll(admin.auth, await createMaterial(admin.auth));

    const denied = await consume(operator.auth, roll.id, '1200', { allowNegative: true });
    const allowed = await consume(admin.auth, roll.id, '1200', { allowNegative: true });

    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(201);
    expect(allowed.body.data.balanceAfter).toBe('-200');
    const movement = await prisma.inventoryMovement.findUniqueOrThrow({
      where: { id: allowed.body.data.id },
    });
    expect(movement.negativeAuthorized).toBe(true);
    expect(
      await prisma.auditLog.count({ where: { action: 'inventory.negative_authorized' } }),
    ).toBe(1);
  });

  it('lançamentos simultâneos não corrompem o saldo', async () => {
    const { auth } = await session('ADMIN');
    const roll = await createRoll(auth, await createMaterial(auth));

    const results = await Promise.all(
      Array.from({ length: 5 }, () => consume(auth, roll.id, '300')),
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    const updated = await prisma.materialRoll.findUniqueOrThrow({ where: { id: roll.id } });
    expect(updated.remainingWeightGrams.toString()).toBe('100');
  });

  it('pesagem calcula o filamento real e lança a diferença como ajuste', async () => {
    const { auth } = await session('ADMIN');
    const roll = await createRoll(auth, await createMaterial(auth));

    const res = await request(app)
      .post(`/api/v1/materials/rolls/${roll.id}/weigh`)
      .set(auth)
      .send({ grossWeightGrams: '600' })
      .expect(200);

    // 600 g na balança − 250 g de carretel = 350 g de filamento (estava 1000)
    expect(res.body.data).toEqual({
      changed: true,
      difference: '-650.00',
      remainingWeightGrams: '350.00',
    });
    const last = await prisma.inventoryMovement.findFirstOrThrow({
      where: { materialRollId: roll.id, type: 'ADJUSTMENT' },
    });
    expect(last.reason).toContain('pesagem');
  });

  it('pesagem menor que o carretel vazio é recusada', async () => {
    const { auth } = await session('ADMIN');
    const roll = await createRoll(auth, await createMaterial(auth));

    const res = await request(app)
      .post(`/api/v1/materials/rolls/${roll.id}/weigh`)
      .set(auth)
      .send({ grossWeightGrams: '100' });

    expect(res.status).toBe(400);
  });

  it('não descarta rolo com saldo nem aceita entrada por compra manual em rolo', async () => {
    const { auth } = await session('ADMIN');
    const roll = await createRoll(auth, await createMaterial(auth));

    const discard = await request(app)
      .put(`/api/v1/materials/rolls/${roll.id}`)
      .set(auth)
      .send({ spoolWeightGrams: '250', status: 'DISCARDED' });
    const purchase = await request(app)
      .post('/api/v1/inventory/movements')
      .set(auth)
      .send({ rollId: roll.id, type: 'PURCHASE_IN', quantity: '100', reason: 'Teste' });

    expect(discard.status).toBe(400);
    expect(purchase.status).toBe(400);
  });

  it('ajuste manual exige a permissão de ajuste', async () => {
    const admin = await session('ADMIN');
    const operator = await session('OPERACIONAL');
    const roll = await createRoll(admin.auth, await createMaterial(admin.auth));

    const res = await request(app).post('/api/v1/inventory/movements').set(operator.auth).send({
      rollId: roll.id,
      type: 'ADJUSTMENT',
      direction: 'OUT',
      quantity: '10',
      reason: 'Correção',
    });

    expect(res.status).toBe(403);
  });
});

describe('insumos', () => {
  it('compra atualiza o custo médio ponderado', async () => {
    const { auth } = await session('ADMIN');
    const created = await request(app)
      .post('/api/v1/inventory/supplies')
      .set(auth)
      .send({ name: 'Caixa 15x15', category: 'PACKAGING', unit: 'UN', minQuantity: '20' })
      .expect(201);
    const id = created.body.data.id as string;
    const buy = (quantity: string, unitCost: string) =>
      request(app)
        .post('/api/v1/inventory/movements')
        .set(auth)
        .send({ stockItemId: id, type: 'PURCHASE_IN', quantity, unitCost, reason: 'Compra' })
        .expect(201);

    await buy('10', '2,00');
    await buy('10', '4.00');

    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id } });
    expect(item.quantity.toString()).toBe('20');
    expect(item.averageUnitCost?.toString()).toBe('3');
  });

  it('não exclui insumo com saldo', async () => {
    const { auth } = await session('ADMIN');
    const created = await request(app)
      .post('/api/v1/inventory/supplies')
      .set(auth)
      .send({ name: 'Etiqueta', category: 'LABEL', unit: 'UN', minQuantity: '0' })
      .expect(201);
    await request(app)
      .post('/api/v1/inventory/movements')
      .set(auth)
      .send({
        stockItemId: created.body.data.id,
        type: 'PURCHASE_IN',
        quantity: '5',
        reason: 'Compra',
      })
      .expect(201);

    const res = await request(app)
      .delete(`/api/v1/inventory/supplies/${created.body.data.id}`)
      .set(auth);

    expect(res.status).toBe(409);
  });
});

describe('alertas e histórico', () => {
  it('avisa filamento abaixo do mínimo, rolo no fim e insumo zerado', async () => {
    const { auth } = await session('ADMIN');
    const materialId = await createMaterial(auth, '2000');
    const roll = await createRoll(auth, materialId);
    await consume(auth, roll.id, '950').expect(201);
    await request(app)
      .post('/api/v1/inventory/supplies')
      .set(auth)
      .send({ name: 'Saco plástico', category: 'PACKAGING', unit: 'PCT', minQuantity: '2' })
      .expect(201);

    const res = await request(app).get('/api/v1/inventory/alerts').set(auth).expect(200);
    const kinds = res.body.data.map((a: { kind: string }) => a.kind);

    expect(kinds).toEqual(expect.arrayContaining(['MATERIAL_LOW', 'ROLL_LOW', 'SUPPLY_LOW']));
    expect(res.body.data[0].severity).toBe('critical'); // insumo zerado vem primeiro
  });

  it('histórico registra responsável, saldo após cada lançamento e permite filtrar', async () => {
    const { auth, user } = await session('ADMIN');
    const roll = await createRoll(auth, await createMaterial(auth));
    await consume(auth, roll.id, '100').expect(201);
    await request(app)
      .post('/api/v1/inventory/movements')
      .set(auth)
      .send({ rollId: roll.id, type: 'WASTE', quantity: '20', reason: 'Falha na primeira camada' })
      .expect(201);

    const res = await request(app)
      .get(`/api/v1/inventory/movements?rollId=${roll.id}&order=asc`)
      .set(auth)
      .expect(200);

    expect(res.body.data.map((m: { type: string }) => m.type)).toEqual([
      'PURCHASE_IN',
      'PRODUCTION_OUT',
      'WASTE',
    ]);
    expect(res.body.data.map((m: { balanceAfter: string }) => m.balanceAfter)).toEqual([
      '1000.00',
      '900.00',
      '880.00',
    ]);
    expect(res.body.data[2].user.id).toBe(user.id);
    expect(res.body.meta.totalItems).toBe(3);
  });
});
