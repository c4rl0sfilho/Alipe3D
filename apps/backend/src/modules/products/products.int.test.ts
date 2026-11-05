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

const baseProduct = {
  sku: 'sup-headset',
  name: 'Suporte de headset',
  status: 'ACTIVE',
  salePrice: '59,90',
  estimatedWeightGrams: '85',
  estimatedPrintMinutes: 200,
  minStock: '3',
};

async function createProduct(auth: Record<string, string>, overrides = {}) {
  const res = await request(app)
    .post('/api/v1/products')
    .set(auth)
    .send({ ...baseProduct, ...overrides })
    .expect(201);
  return res.body.data;
}

// PNG 1×1 válido
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('produtos', () => {
  it('cria produto com variação padrão e item de estoque acabado', async () => {
    const { auth } = await session('ADMIN');

    const product = await createProduct(auth);

    expect(product.sku).toBe('SUP-HEADSET');
    expect(product.salePrice).toBe('59.90');
    expect(product.variants).toHaveLength(1);
    expect(product.variants[0]).toMatchObject({
      sku: 'SUP-HEADSET',
      isDefault: true,
      label: 'Padrão',
      salePrice: '59.90',
      estimatedPrintMinutes: 200,
      stockQuantity: '0.000',
    });
    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: { productVariantId: product.variants[0].id },
    });
    expect(item).toMatchObject({ kind: 'FINISHED_GOOD', name: 'Suporte de headset' });
  });

  it('impede SKU repetido, inclusive em variações', async () => {
    const { auth } = await session('ADMIN');
    const product = await createProduct(auth);
    await request(app)
      .post(`/api/v1/products/${product.id}/variants`)
      .set(auth)
      .send({ sku: 'SUP-HEADSET-BR', color: 'Branco' })
      .expect(201);

    const sameProduct = await request(app).post('/api/v1/products').set(auth).send(baseProduct);
    const sameAsVariant = await request(app)
      .post('/api/v1/products')
      .set(auth)
      .send({ ...baseProduct, sku: 'sup-headset-br' });

    expect(sameProduct.status).toBe(409);
    expect(sameAsVariant.status).toBe(409);
  });

  it('variação herda valores do produto e pode ter os próprios', async () => {
    const { auth } = await session('ADMIN');
    const product = await createProduct(auth);

    const res = await request(app)
      .post(`/api/v1/products/${product.id}/variants`)
      .set(auth)
      .send({
        sku: 'SUP-HEADSET-G',
        color: 'Rosa',
        size: 'G',
        salePrice: '69,90',
        estimatedWeightGrams: '',
      })
      .expect(201);

    const variant = res.body.data.variants.find((v: { sku: string }) => v.sku === 'SUP-HEADSET-G');
    expect(variant).toMatchObject({
      label: 'Rosa · G',
      salePrice: '69.90',
      estimatedWeightGrams: '85.00',
      overrides: { salePrice: '69.90', estimatedWeightGrams: null },
    });
  });

  it('impede variação com atributos repetidos e exclusão da variação padrão', async () => {
    const { auth } = await session('ADMIN');
    const product = await createProduct(auth);
    await request(app)
      .post(`/api/v1/products/${product.id}/variants`)
      .set(auth)
      .send({ sku: 'V1', color: 'Preto' })
      .expect(201);

    const duplicate = await request(app)
      .post(`/api/v1/products/${product.id}/variants`)
      .set(auth)
      .send({ sku: 'V2', color: 'preto' });
    const removeDefault = await request(app)
      .delete(`/api/v1/products/variants/${product.variants[0].id}`)
      .set(auth);

    expect(duplicate.status).toBe(409);
    expect(removeDefault.status).toBe(400);
  });

  it('não exclui produto com estoque', async () => {
    const { auth } = await session('ADMIN');
    const product = await createProduct(auth);
    await request(app)
      .post('/api/v1/inventory/movements')
      .set(auth)
      .send({
        stockItemId: (
          await prisma.inventoryItem.findFirstOrThrow({
            where: { productVariantId: product.variants[0].id },
          })
        ).id,
        type: 'ADJUSTMENT',
        direction: 'IN',
        quantity: '4',
        reason: 'Contagem inicial',
      })
      .expect(201);

    const res = await request(app).delete(`/api/v1/products/${product.id}`).set(auth);

    expect(res.status).toBe(409);
  });

  it('perfil sem permissão de cadastro não cria produtos', async () => {
    const { auth } = await session('OPERACIONAL');

    const list = await request(app).get('/api/v1/products').set(auth);
    const create = await request(app).post('/api/v1/products').set(auth).send(baseProduct);

    expect(list.status).toBe(200);
    expect(create.status).toBe(403);
  });

  it('busca por nome ou SKU de variação', async () => {
    const { auth } = await session('ADMIN');
    const product = await createProduct(auth);
    await createProduct(auth, { sku: 'CHAVEIRO', name: 'Chaveiro coração' });
    await request(app)
      .post(`/api/v1/products/${product.id}/variants`)
      .set(auth)
      .send({ sku: 'HS-AZUL', color: 'Azul' })
      .expect(201);

    const res = await request(app).get('/api/v1/products?search=hs-azul').set(auth).expect(200);

    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(['Suporte de headset']);
  });
});

describe('ficha técnica', () => {
  it('define filamentos (g) e insumos (un) por variação', async () => {
    const { auth } = await session('ADMIN');
    const product = await createProduct(auth);
    const material = await request(app)
      .post('/api/v1/materials')
      .set(auth)
      .send({
        name: 'PLA Preto',
        manufacturer: 'Bambu Lab',
        type: 'PLA',
        color: 'Preto',
        minStockGrams: '0',
      })
      .expect(201);
    const supply = await request(app)
      .post('/api/v1/inventory/supplies')
      .set(auth)
      .send({ name: 'Caixa', category: 'PACKAGING', unit: 'UN', minQuantity: '0' })
      .expect(201);

    const res = await request(app)
      .put(`/api/v1/products/variants/${product.variants[0].id}/bill-of-materials`)
      .set(auth)
      .send({
        items: [
          { materialId: material.body.data.id, quantity: '85' },
          { supplyItemId: supply.body.data.id, quantity: '1' },
        ],
      })
      .expect(200);

    const bom = res.body.data.variants[0].billOfMaterials;
    expect(bom).toHaveLength(2);
    expect(bom[0].material.name).toBe('PLA Preto');
    expect(bom[1].supply.name).toBe('Caixa');
  });

  it('recusa item repetido e item sem filamento nem insumo', async () => {
    const { auth } = await session('ADMIN');
    const product = await createProduct(auth);
    const material = await request(app)
      .post('/api/v1/materials')
      .set(auth)
      .send({ name: 'PLA', manufacturer: 'X', type: 'PLA', color: 'Branco', minStockGrams: '0' })
      .expect(201);
    const url = `/api/v1/products/variants/${product.variants[0].id}/bill-of-materials`;

    const repeated = await request(app)
      .put(url)
      .set(auth)
      .send({
        items: [
          { materialId: material.body.data.id, quantity: '10' },
          { materialId: material.body.data.id, quantity: '5' },
        ],
      });
    const empty = await request(app)
      .put(url)
      .set(auth)
      .send({ items: [{ quantity: '5' }] });

    expect(repeated.status).toBe(400);
    expect(empty.status).toBe(422);
  });
});

describe('arquivos do produto', () => {
  it('aceita imagem válida, define como capa e permite baixar', async () => {
    const { auth } = await session('ADMIN');
    const product = await createProduct(auth);

    const upload = await request(app)
      .post(`/api/v1/products/${product.id}/files`)
      .set(auth)
      .attach('file', PNG, { filename: 'foto ção.png', contentType: 'image/png' })
      .expect(201);

    const file = upload.body.data.files[0];
    expect(file).toMatchObject({
      kind: 'IMAGE',
      isCover: true,
      mimeType: 'image/png',
      originalName: 'foto ção.png',
    });

    const download = await request(app)
      .get(`/api/v1/products/${product.id}/files/${file.id}`)
      .set(auth)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.compare(download.body as Buffer, PNG)).toBe(0);
    expect(download.headers['content-disposition']).toMatch(/^attachment;/);
    expect(download.headers['content-disposition']).toContain(
      "filename*=UTF-8''foto%20%C3%A7%C3%A3o.png",
    );
  });

  it('recusa arquivo cujo conteúdo não corresponde à extensão', async () => {
    const { auth } = await session('ADMIN');
    const product = await createProduct(auth);

    const res = await request(app)
      .post(`/api/v1/products/${product.id}/files`)
      .set(auth)
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'foto.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('não corresponde');
  });

  it('recusa extensões não permitidas', async () => {
    const { auth } = await session('ADMIN');
    const product = await createProduct(auth);

    const res = await request(app)
      .post(`/api/v1/products/${product.id}/files`)
      .set(auth)
      .attach('file', Buffer.from('MZ'), { filename: 'programa.exe' });

    expect(res.status).toBe(400);
  });

  it('aceita STL binário e exige permissão para baixar', async () => {
    const { auth } = await session('ADMIN');
    const product = await createProduct(auth);
    const stl = Buffer.alloc(84 + 50);
    stl.writeUInt32LE(1, 80);

    const upload = await request(app)
      .post(`/api/v1/products/${product.id}/files`)
      .set(auth)
      .attach('file', stl, { filename: 'suporte.stl' })
      .expect(201);
    const fileId = upload.body.data.files[0].id;

    const anonymous = await request(app).get(`/api/v1/products/${product.id}/files/${fileId}`);
    expect(upload.body.data.files[0].kind).toBe('MODEL_STL');
    expect(anonymous.status).toBe(401);
  });
});
