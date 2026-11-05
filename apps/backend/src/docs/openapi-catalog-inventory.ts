import {
  billOfMaterialsSchema,
  categoryInputSchema,
  createRollSchema,
  materialInputSchema,
  productInputSchema,
  registerMovementSchema,
  supplierInputSchema,
  supplyInputSchema,
  updateRollSchema,
  variantInputSchema,
  weighRollSchema,
} from '@alipe3d/shared';
import { z } from 'zod';

/** Rotas de catálogo e estoque (Fase 3) para o documento OpenAPI. */

const body = (schema: z.ZodType) => ({
  required: true,
  content: { 'application/json': { schema: z.toJSONSchema(schema, { io: 'input' }) } },
});
const ok = (description: string) => ({ description });
const errors = {
  '401': { description: 'Não autenticado' },
  '403': { description: 'Sem permissão' },
};
const secured = [{ bearerAuth: [] }];
const id = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const variantId = { ...id, name: 'variantId' };
const fileId = { ...id, name: 'fileId' };
const page = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
  { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
];

const op = (
  tag: string,
  summary: string,
  extra: Record<string, unknown> = {},
  success = '200',
) => ({
  tags: [tag],
  summary,
  security: secured,
  responses: { [success]: ok('Sucesso'), ...errors, ...((extra.responses as object) ?? {}) },
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'responses')),
});

export const catalogInventoryTags = [
  { name: 'Produtos', description: 'Produtos, variações, ficha técnica e arquivos' },
  { name: 'Estoque', description: 'Filamentos, rolos, insumos, movimentações e alertas' },
];

export const catalogInventoryPaths = {
  '/categories': {
    get: op('Produtos', 'Lista categorias'),
    post: op('Produtos', 'Cria categoria', { requestBody: body(categoryInputSchema) }, '201'),
  },
  '/categories/{id}': {
    put: op('Produtos', 'Edita categoria', {
      parameters: [id],
      requestBody: body(categoryInputSchema),
    }),
    delete: op('Produtos', 'Exclui categoria sem produtos', { parameters: [id] }, '204'),
  },
  '/products': {
    get: op('Produtos', 'Lista produtos (busca por nome/SKU, categoria, status)', {
      parameters: [
        ...page,
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'categoryId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'status', in: 'query', schema: { enum: ['ACTIVE', 'DRAFT', 'INACTIVE', 'all'] } },
      ],
    }),
    post: op(
      'Produtos',
      'Cria produto (com variação padrão e item de estoque acabado)',
      { requestBody: body(productInputSchema) },
      '201',
    ),
  },
  '/products/{id}': {
    get: op('Produtos', 'Detalha produto com variações, ficha técnica e arquivos', {
      parameters: [id],
    }),
    put: op('Produtos', 'Edita produto', {
      parameters: [id],
      requestBody: body(productInputSchema),
    }),
    delete: op(
      'Produtos',
      'Exclui produto (lógico; exige estoque zerado)',
      { parameters: [id] },
      '204',
    ),
  },
  '/products/{id}/variants': {
    post: op(
      'Produtos',
      'Cria variação',
      { parameters: [id], requestBody: body(variantInputSchema) },
      '201',
    ),
  },
  '/products/variants/{variantId}': {
    put: op('Produtos', 'Edita variação', {
      parameters: [variantId],
      requestBody: body(variantInputSchema),
    }),
    delete: op('Produtos', 'Exclui variação (exige estoque zerado)', { parameters: [variantId] }),
  },
  '/products/variants/{variantId}/bill-of-materials': {
    put: op('Produtos', 'Substitui a ficha técnica da variação', {
      parameters: [variantId],
      requestBody: body(billOfMaterialsSchema),
    }),
  },
  '/products/{id}/files': {
    post: op(
      'Produtos',
      'Envia arquivo (multipart: campo "file" e, opcional, "kind")',
      {
        parameters: [id],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  kind: { enum: ['IMAGE', 'MODEL_STL', 'MODEL_3MF', 'PRINT_PROFILE', 'DOCUMENT'] },
                  file: { type: 'string', format: 'binary' },
                },
                required: ['file'],
              },
            },
          },
        },
        responses: { '400': { description: 'Extensão, tamanho ou conteúdo inválido' } },
      },
      '201',
    ),
  },
  '/products/{id}/files/{fileId}': {
    get: op('Produtos', 'Baixa arquivo (inline=1 exibe imagens)', { parameters: [id, fileId] }),
    delete: op('Produtos', 'Exclui arquivo', { parameters: [id, fileId] }),
  },
  '/products/{id}/files/{fileId}/cover': {
    patch: op('Produtos', 'Define a imagem de capa', { parameters: [id, fileId] }),
  },
  '/suppliers': {
    get: op('Estoque', 'Lista fornecedores'),
    post: op('Estoque', 'Cria fornecedor', { requestBody: body(supplierInputSchema) }, '201'),
  },
  '/suppliers/{id}': {
    put: op('Estoque', 'Edita fornecedor', {
      parameters: [id],
      requestBody: body(supplierInputSchema),
    }),
    delete: op('Estoque', 'Exclui fornecedor (lógico)', { parameters: [id] }, '204'),
  },
  '/materials': {
    get: op('Estoque', 'Lista filamentos com saldo em gramas e custo médio'),
    post: op('Estoque', 'Cadastra filamento', { requestBody: body(materialInputSchema) }, '201'),
  },
  '/materials/{id}': {
    put: op('Estoque', 'Edita filamento', {
      parameters: [id],
      requestBody: body(materialInputSchema),
    }),
    delete: op(
      'Estoque',
      'Exclui filamento sem saldo e fora das fichas',
      { parameters: [id] },
      '204',
    ),
  },
  '/materials/rolls': {
    get: op('Estoque', 'Lista rolos', { parameters: page }),
    post: op(
      'Estoque',
      'Cadastra rolos (gera entrada por compra)',
      { requestBody: body(createRollSchema) },
      '201',
    ),
  },
  '/materials/rolls/{id}': {
    put: op('Estoque', 'Edita dados do rolo (o saldo só muda por movimentação)', {
      parameters: [id],
      requestBody: body(updateRollSchema),
    }),
  },
  '/materials/rolls/{id}/weigh': {
    post: op('Estoque', 'Conferência por pesagem (gera ajuste da diferença)', {
      parameters: [id],
      requestBody: body(weighRollSchema),
    }),
  },
  '/inventory/alerts': { get: op('Estoque', 'Alertas de reposição') },
  '/inventory/items': {
    get: op('Estoque', 'Lista insumos ou produtos acabados', {
      parameters: [
        ...page,
        {
          name: 'kind',
          in: 'query',
          required: true,
          schema: { enum: ['SUPPLY', 'FINISHED_GOOD'] },
        },
      ],
    }),
  },
  '/inventory/supplies': {
    post: op('Estoque', 'Cadastra insumo', { requestBody: body(supplyInputSchema) }, '201'),
  },
  '/inventory/supplies/{id}': {
    put: op('Estoque', 'Edita insumo', { parameters: [id], requestBody: body(supplyInputSchema) }),
    delete: op('Estoque', 'Exclui insumo com saldo zerado', { parameters: [id] }, '204'),
  },
  '/inventory/movements': {
    get: op('Estoque', 'Histórico de movimentações', { parameters: page }),
    post: op(
      'Estoque',
      'Registra movimentação manual',
      {
        requestBody: body(registerMovementSchema),
        responses: {
          '409': { description: 'Saldo insuficiente (sem autorização de saldo negativo)' },
        },
      },
      '201',
    ),
  },
};
