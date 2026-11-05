import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../prisma/client.js';
import { buildTestApp } from '../../test/app.js';
import { createUser, login, resetDatabase } from '../../test/factories.js';

const { app, services } = buildTestApp();

beforeAll(() => services.storage.init());
beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

type Auth = Record<string, string>;

async function session(role: 'ADMIN' | 'OPERACIONAL') {
  const user = await createUser({ role });
  const { accessToken } = await login(app, user.email);
  return { user, auth: { Authorization: `Bearer ${accessToken}` } as Auth };
}

const api = {
  get: (auth: Auth, url: string) => request(app).get(`/api/v1${url}`).set(auth),
  post: (auth: Auth, url: string, body: object = {}) =>
    request(app).post(`/api/v1${url}`).set(auth).send(body),
  put: (auth: Auth, url: string, body: object) =>
    request(app).put(`/api/v1${url}`).set(auth).send(body),
  patch: (auth: Auth, url: string, body: object) =>
    request(app).patch(`/api/v1${url}`).set(auth).send(body),
};

async function createPrinter(auth: Auth, code = 'ALIPE-PRINTER-01') {
  const res = await api
    .post(auth, '/printers', { code, model: 'Bambu Lab A1', initialHours: '10' })
    .expect(201);
  return res.body.data as { id: string; code: string };
}

async function createMaterial(auth: Auth) {
  const res = await api
    .post(auth, '/materials', {
      name: 'PLA Basic Preto',
      manufacturer: 'Bambu Lab',
      type: 'PLA',
      color: 'Preto',
      minStockGrams: '0',
    })
    .expect(201);
  return res.body.data.id as string;
}

async function createRoll(auth: Auth, materialId: string, grams = '1000') {
  const res = await api
    .post(auth, '/materials/rolls', {
      materialId,
      initialWeightGrams: grams,
      spoolWeightGrams: '250',
      purchaseCost: '120',
      purchasedAt: '2026-11-01',
    })
    .expect(201);
  return res.body.data[0] as { id: string; code: string };
}

/** Produto com ficha técnica: 40 g do filamento + 1 embalagem por peça. */
async function setup(auth: Auth, options: { supplyStock?: string } = {}) {
  const printer = await createPrinter(auth);
  const materialId = await createMaterial(auth);
  const roll = await createRoll(auth, materialId);
  const supply = await api
    .post(auth, '/inventory/supplies', {
      name: 'Caixa P',
      category: 'PACKAGING',
      unit: 'UN',
      minQuantity: '0',
    })
    .expect(201);
  const supplyId = supply.body.data.id as string;
  if (options.supplyStock !== '0') {
    await api
      .post(auth, '/inventory/movements', {
        stockItemId: supplyId,
        type: 'PURCHASE_IN',
        quantity: options.supplyStock ?? '10',
        unitCost: '1.50',
        reason: 'Compra inicial',
      })
      .expect(201);
  }
  const product = await api
    .post(auth, '/products', {
      sku: 'SUP-HEADSET',
      name: 'Suporte de headset',
      salePrice: '49.90',
      estimatedWeightGrams: '40',
      estimatedPrintMinutes: 90,
      minStock: '0',
      status: 'ACTIVE',
    })
    .expect(201);
  const variantId = product.body.data.variants[0].id as string;
  await api
    .put(auth, `/products/variants/${variantId}/bill-of-materials`, {
      items: [
        { materialId, quantity: '40' },
        { supplyItemId: supplyId, quantity: '1' },
      ],
    })
    .expect(200);
  return { printer, materialId, roll, supplyId, variantId, productId: product.body.data.id };
}

async function createOrder(auth: Auth, body: object) {
  const res = await api.post(auth, '/production/orders', body).expect(201);
  return res.body.data as {
    id: string;
    code: string;
    status: string;
    estimatedMinutes: number;
    estimatedWeightGrams: string;
    material: { id: string } | null;
  };
}

const startJob = (auth: Auth, orderId: string, body: object) =>
  api.post(auth, `/production/orders/${orderId}/jobs`, {
    plannedQuantity: 1,
    estimatedGrams: '40',
    estimatedMinutes: 90,
    ...body,
  });

const finish = (auth: Auth, jobId: string, body: object) =>
  api.post(auth, `/production/jobs/${jobId}/finish`, body);

const getOrder = async (auth: Auth, id: string) =>
  (await api.get(auth, `/production/orders/${id}`).expect(200)).body.data;

const rollBalance = async (id: string) =>
  (await prisma.materialRoll.findUniqueOrThrow({ where: { id } })).remainingWeightGrams.toString();

describe('impressoras', () => {
  it('cadastra impressora e calcula horas acumuladas', async () => {
    const { auth } = await session('ADMIN');
    const printer = await createPrinter(auth);

    const list = await api.get(auth, '/printers').expect(200);
    expect(list.body.data[0]).toMatchObject({
      code: 'ALIPE-PRINTER-01',
      status: 'AVAILABLE',
      activity: 'AVAILABLE',
      totalHours: '10.0',
      stats: { jobs: 0, failedJobs: 0 },
    });

    const duplicate = await api.post(auth, '/printers', {
      code: 'alipe-printer-01',
      model: 'Bambu Lab A1',
      initialHours: '0',
    });
    expect(duplicate.status).toBe(409);
    expect(printer.code).toBe('ALIPE-PRINTER-01');
  });

  it('manutenção registra histórico e gera alerta de próxima manutenção', async () => {
    const { auth } = await session('ADMIN');
    const printer = await createPrinter(auth);
    const today = new Date().toISOString().slice(0, 10);

    await api
      .post(auth, '/maintenance', {
        printerId: printer.id,
        type: 'CLEANING',
        description: 'Limpeza do bico e da mesa',
        performedAt: '2026-10-01',
        responsibleName: 'Equipe',
        cost: '0',
        nextMaintenanceAt: today,
      })
      .expect(201);
    const future = await api.post(auth, '/maintenance', {
      printerId: printer.id,
      type: 'CLEANING',
      description: 'Data errada',
      performedAt: '2099-01-01',
      responsibleName: 'Equipe',
      cost: '0',
    });
    expect(future.status).toBe(400);

    const detail = await api.get(auth, `/printers/${printer.id}`).expect(200);
    expect(detail.body.data.lastMaintenanceAt).toBe('2026-10-01');
    expect(['soon', 'overdue']).toContain(detail.body.data.maintenanceDue);
    const alerts = await api.get(auth, '/alerts').expect(200);
    expect(alerts.body.data.some((a: { kind: string }) => a.kind === 'MAINTENANCE_DUE')).toBe(true);
  });

  it('perfil operacional opera a produção, mas não cadastra impressoras nem manutenções', async () => {
    const admin = await session('ADMIN');
    const printer = await createPrinter(admin.auth);
    const { auth } = await session('OPERACIONAL');

    await api.get(auth, '/printers').expect(200);
    await api.post(auth, '/printers', { code: 'X-1', model: 'A1', initialHours: '0' }).expect(403);
    await api.patch(auth, `/printers/${printer.id}/status`, { status: 'MAINTENANCE' }).expect(403);
    await api
      .post(auth, '/maintenance', {
        printerId: printer.id,
        type: 'OTHER',
        description: 'Teste',
        performedAt: '2026-10-01',
        responsibleName: 'X',
        cost: '0',
      })
      .expect(403);
  });
});

describe('ordens de produção', () => {
  it('calcula estimativas pela variação e sugere o filamento da ficha técnica', async () => {
    const { auth } = await session('ADMIN');
    const { variantId, materialId, printer } = await setup(auth);

    const pending = await createOrder(auth, { variantId, quantity: 3 });
    expect(pending.code).toMatch(/^OP-\d{4}$/);
    expect(pending.status).toBe('PENDING');
    expect(pending.estimatedMinutes).toBe(270);
    expect(pending.estimatedWeightGrams).toBe('120.00');
    expect(pending.material?.id).toBe(materialId);

    const planned = await createOrder(auth, { variantId, quantity: 1, printerId: printer.id });
    expect(planned.status).toBe('PLANNED');

    const queue = await api.get(auth, '/production/orders?view=queue').expect(200);
    expect(queue.body.data).toHaveLength(2);
  });

  it('fluxo completo: imprimir, baixar filamento, inspecionar e dar entrada no estoque', async () => {
    const { auth } = await session('ADMIN');
    const { variantId, printer, roll, supplyId } = await setup(auth);
    const order = await createOrder(auth, { variantId, quantity: 3, printerId: printer.id });

    // Início: ocupa a impressora e o rolo passa a "em uso"
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
    const started = await startJob(auth, order.id, {
      printerId: printer.id,
      rollId: roll.id,
      plannedQuantity: 3,
      estimatedGrams: '120',
      startedAt: twoHoursAgo,
    }).expect(201);
    const jobId = started.body.data.id as string;
    expect((await getOrder(auth, order.id)).status).toBe('IN_PROGRESS');
    const busy = await api.get(auth, `/printers/${printer.id}`).expect(200);
    expect(busy.body.data.activity).toBe('PRINTING');
    expect(busy.body.data.activeJob.order.code).toBe(order.code);
    expect((await prisma.materialRoll.findUniqueOrThrow({ where: { id: roll.id } })).status).toBe(
      'IN_USE',
    );
    // Nada é baixado no início
    expect(await rollBalance(roll.id)).toBe('1000');

    // A impressora ocupada não aceita outra impressão
    const other = await createOrder(auth, { variantId, quantity: 1 });
    const conflict = await startJob(auth, other.id, { printerId: printer.id, rollId: roll.id });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.message).toContain(order.code);

    // Pausa e retomada
    await api.post(auth, `/production/jobs/${jobId}/pause`).expect(200);
    expect((await getOrder(auth, order.id)).status).toBe('PAUSED');
    await api.post(auth, `/production/jobs/${jobId}/resume`).expect(200);

    // Finalização: baixa o peso real informado
    const done = await finish(auth, jobId, {
      result: 'SUCCESS',
      producedQuantity: 3,
      consumption: [{ rollId: roll.id, grams: '126,5' }],
    }).expect(200);
    expect(done.body.data.orderStatus).toBe('COMPLETED');
    expect(await rollBalance(roll.id)).toBe('873.5');
    const movements = await prisma.inventoryMovement.findMany({
      where: { referenceType: 'PRINT_JOB', referenceId: jobId },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: 'PRODUCTION_OUT' });
    expect(movements[0]?.totalCost?.toString()).toBe('15.18'); // 126,5 g × R$ 0,12

    // Finalizar de novo não baixa duas vezes
    const again = await finish(auth, jobId, {
      result: 'SUCCESS',
      producedQuantity: 3,
      consumption: [{ rollId: roll.id, grams: '126.5' }],
    });
    expect(again.status).toBe(409);
    expect(await rollBalance(roll.id)).toBe('873.5');

    // Horas da impressora: ~2 h de impressão + 10 h iniciais
    const free = (await api.get(auth, `/printers/${printer.id}`).expect(200)).body.data;
    expect(free.activity).toBe('AVAILABLE');
    expect(free.stats.jobs).toBe(1);
    expect(Number(free.totalHours)).toBeCloseTo(12, 0);

    // Inspeção: 2 aprovadas, 1 reprovada para refazer
    await api.post(auth, `/production/orders/${order.id}/start-inspection`).expect(200);
    const inspected = await api
      .post(auth, `/production/orders/${order.id}/inspections`, {
        approvedQuantity: 2,
        rejectedQuantity: 1,
        reprintRejected: true,
      })
      .expect(201);
    expect(inspected.body.data).toMatchObject({
      status: 'PLANNED',
      approvedQuantity: 2,
      rejectedQuantity: 1,
      remainingToPrint: 1,
      pendingInspection: 0,
    });
    const finished = await prisma.inventoryItem.findFirstOrThrow({
      where: { productVariantId: variantId },
    });
    expect(finished.quantity.toString()).toBe('2');
    const supply = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: supplyId } });
    expect(supply.quantity.toString()).toBe('8'); // 10 − 2 caixas

    // Refabricação da peça reprovada e aprovação final
    const second = await startJob(auth, order.id, {
      printerId: printer.id,
      rollId: roll.id,
      plannedQuantity: 1,
    }).expect(201);
    await finish(auth, second.body.data.id, {
      result: 'SUCCESS',
      producedQuantity: 1,
      consumption: [{ rollId: roll.id, grams: '41' }],
    }).expect(200);
    const final = await api
      .post(auth, `/production/orders/${order.id}/inspections`, {
        approvedQuantity: 1,
        rejectedQuantity: 0,
      })
      .expect(201);
    expect(final.body.data.status).toBe('APPROVED');
    expect(final.body.data.closedAt).not.toBeNull();
    expect(final.body.data.jobs).toHaveLength(2);
    expect(
      (
        await prisma.inventoryItem.findFirstOrThrow({ where: { productVariantId: variantId } })
      ).quantity.toString(),
    ).toBe('3');
  });

  it('falha registra desperdício e devolve a ordem para a fila quando é preciso refazer', async () => {
    const { auth } = await session('ADMIN');
    const { variantId, printer, roll } = await setup(auth);
    const order = await createOrder(auth, { variantId, quantity: 1, printerId: printer.id });

    const job = await startJob(auth, order.id, { printerId: printer.id, rollId: roll.id }).expect(
      201,
    );
    const failed = await finish(auth, job.body.data.id, {
      result: 'FAILED',
      failureReason: 'BED_ADHESION',
      failureNotes: 'Soltou na camada 12',
      consumption: [{ rollId: roll.id, grams: '18' }],
      lostMinutes: 35,
      needsReprint: true,
    }).expect(200);
    expect(failed.body.data.orderStatus).toBe('PLANNED');
    expect(await rollBalance(roll.id)).toBe('982');

    const detail = await getOrder(auth, order.id);
    expect(detail.failedJobs).toBe(1);
    expect(detail.jobs[0]).toMatchObject({
      status: 'FAILED',
      failureReason: 'BED_ADHESION',
      wastedGrams: '18.00',
      lostMinutes: 35,
      needsReprint: true,
    });
    const waste = await prisma.inventoryMovement.findFirstOrThrow({
      where: { referenceId: job.body.data.id },
    });
    expect(waste.type).toBe('WASTE');

    const history = await api
      .get(auth, `/production/jobs?printerId=${printer.id}&status=FAILED`)
      .expect(200);
    expect(history.body.data).toHaveLength(1);

    // Nova tentativa falha e a ordem não será refeita: encerra como "Falhou"
    const retry = await startJob(auth, order.id, { printerId: printer.id, rollId: roll.id }).expect(
      201,
    );
    const closed = await finish(auth, retry.body.data.id, {
      result: 'FAILED',
      failureReason: 'NOZZLE_CLOG',
      needsReprint: false,
    }).expect(200);
    expect(closed.body.data.orderStatus).toBe('FAILED');
  });

  it('finalizações simultâneas da mesma impressão baixam o filamento uma única vez', async () => {
    const { auth } = await session('ADMIN');
    const { variantId, printer, roll } = await setup(auth);
    const order = await createOrder(auth, { variantId, quantity: 1, printerId: printer.id });
    const job = await startJob(auth, order.id, { printerId: printer.id, rollId: roll.id }).expect(
      201,
    );

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        finish(auth, job.body.data.id, {
          result: 'SUCCESS',
          producedQuantity: 1,
          consumption: [{ rollId: roll.id, grams: '40' }],
        }),
      ),
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await rollBalance(roll.id)).toBe('960');
    expect(await prisma.inventoryMovement.count({ where: { referenceId: job.body.data.id } })).toBe(
      1,
    );
  });

  it('bloqueia saldo negativo do rolo, salvo autorização do administrador (auditada)', async () => {
    const { auth } = await session('ADMIN');
    const { variantId, printer, materialId } = await setup(auth);
    const small = await createRoll(auth, materialId, '30');
    const order = await createOrder(auth, { variantId, quantity: 1, printerId: printer.id });
    const job = await startJob(auth, order.id, { printerId: printer.id, rollId: small.id }).expect(
      201,
    );
    const body = {
      result: 'SUCCESS',
      producedQuantity: 1,
      consumption: [{ rollId: small.id, grams: '40' }],
    };

    const blocked = await finish(auth, job.body.data.id, body);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toContain(small.code);
    // Nada mudou: a impressão continua em andamento
    expect((await getOrder(auth, order.id)).status).toBe('IN_PROGRESS');

    await finish(auth, job.body.data.id, { ...body, allowNegative: true }).expect(200);
    expect(await rollBalance(small.id)).toBe('-10');
    expect(
      await prisma.auditLog.count({ where: { action: 'inventory.negative_authorized' } }),
    ).toBe(1);
  });

  it('inspeção é recusada por falta de insumo, sem alterar nada', async () => {
    const { auth } = await session('ADMIN');
    const { variantId, printer, roll } = await setup(auth, { supplyStock: '0' });
    const order = await createOrder(auth, { variantId, quantity: 1, printerId: printer.id });
    const job = await startJob(auth, order.id, { printerId: printer.id, rollId: roll.id }).expect(
      201,
    );
    await finish(auth, job.body.data.id, {
      result: 'SUCCESS',
      producedQuantity: 1,
      consumption: [{ rollId: roll.id, grams: '40' }],
    }).expect(200);

    const res = await api.post(auth, `/production/orders/${order.id}/inspections`, {
      approvedQuantity: 1,
      rejectedQuantity: 0,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('Caixa P');
    expect(await prisma.qualityInspection.count()).toBe(0);
    expect(
      (
        await prisma.inventoryItem.findFirstOrThrow({ where: { productVariantId: variantId } })
      ).quantity.toString(),
    ).toBe('0');
    expect((await getOrder(auth, order.id)).status).toBe('COMPLETED');
  });

  it('impressora em manutenção não inicia impressões e não muda de situação enquanto imprime', async () => {
    const { auth } = await session('ADMIN');
    const { variantId, printer, roll } = await setup(auth);
    const order = await createOrder(auth, { variantId, quantity: 2, printerId: printer.id });

    await api.patch(auth, `/printers/${printer.id}/status`, { status: 'MAINTENANCE' }).expect(200);
    const blocked = await startJob(auth, order.id, { printerId: printer.id, rollId: roll.id });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toContain('em manutenção');

    await api.patch(auth, `/printers/${printer.id}/status`, { status: 'AVAILABLE' }).expect(200);
    await startJob(auth, order.id, { printerId: printer.id, rollId: roll.id }).expect(201);
    await api.patch(auth, `/printers/${printer.id}/status`, { status: 'MAINTENANCE' }).expect(409);
  });

  it('cancelar só sem peças impressas; encerrar dispensa o que falta', async () => {
    const { auth } = await session('ADMIN');
    const { variantId, printer, roll, productId } = await setup(auth);
    const order = await createOrder(auth, { variantId, quantity: 5, printerId: printer.id });

    // Produto com ordem aberta não pode ser excluído
    // Nada impresso ainda: encerrar não faz sentido (o caminho é cancelar)
    await api
      .post(auth, `/production/orders/${order.id}/close`, { reason: 'Encerrar agora' })
      .expect(409);
    const del = await request(app).delete(`/api/v1/products/${productId}`).set(auth);
    expect(del.status).toBe(409);

    const job = await startJob(auth, order.id, {
      printerId: printer.id,
      rollId: roll.id,
      plannedQuantity: 2,
    }).expect(201);
    await finish(auth, job.body.data.id, {
      result: 'SUCCESS',
      producedQuantity: 2,
      consumption: [{ rollId: roll.id, grams: '80' }],
    }).expect(200);
    expect((await getOrder(auth, order.id)).status).toBe('PLANNED');

    await api
      .post(auth, `/production/orders/${order.id}/cancel`, { reason: 'Pedido cancelado' })
      .expect(409);
    const closed = await api
      .post(auth, `/production/orders/${order.id}/close`, { reason: 'Cliente quer só 2' })
      .expect(200);
    expect(closed.body.data).toMatchObject({
      status: 'COMPLETED',
      waivedQuantity: 3,
      remainingToPrint: 0,
      pendingInspection: 2,
    });

    const fresh = await createOrder(auth, { variantId, quantity: 1 });
    const cancelled = await api
      .post(auth, `/production/orders/${fresh.id}/cancel`, { reason: 'Duplicada' })
      .expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
  });

  it('alerta de ordem atrasada e filtros da fila', async () => {
    const { auth } = await session('ADMIN');
    const { variantId, printer } = await setup(auth);
    await createOrder(auth, { variantId, quantity: 1, dueDate: '2026-01-10', priority: 'URGENT' });
    await createOrder(auth, { variantId, quantity: 1, printerId: printer.id, priority: 'LOW' });

    const alerts = await api.get(auth, '/alerts').expect(200);
    expect(alerts.body.data[0]).toMatchObject({ kind: 'PRODUCTION_OVERDUE', severity: 'critical' });

    const queue = await api.get(auth, '/production/orders?view=queue').expect(200);
    expect(queue.body.data.map((o: { priority: string }) => o.priority)).toEqual(['URGENT', 'LOW']);
    expect(queue.body.data[0].dueState).toBe('overdue');
    const unassigned = await api
      .get(auth, '/production/orders?view=queue&printerId=none')
      .expect(200);
    expect(unassigned.body.data).toHaveLength(1);
    const byColor = await api.get(auth, '/production/orders?color=preto').expect(200);
    expect(byColor.body.data).toHaveLength(2);
  });
});
