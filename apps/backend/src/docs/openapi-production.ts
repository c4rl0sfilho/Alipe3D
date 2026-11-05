import {
  cancelProductionOrderSchema,
  finishPrintJobSchema,
  inspectionInputSchema,
  maintenanceInputSchema,
  printerInputSchema,
  printerStatusInputSchema,
  productionOrderInputSchema,
  startPrintJobSchema,
} from '@alipe3d/shared';
import { z } from 'zod';

/** Rotas de impressoras, manutenção, produção e alertas (Fase 4) para o documento OpenAPI. */

const body = (schema: z.ZodType) => ({
  required: true,
  content: { 'application/json': { schema: z.toJSONSchema(schema, { io: 'input' }) } },
});
const errors = {
  '401': { description: 'Não autenticado' },
  '403': { description: 'Sem permissão' },
};
const id = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const query = (name: string, schema: object) => ({ name, in: 'query', schema });

const op = (
  tag: string,
  summary: string,
  extra: Record<string, unknown> = {},
  success = '200',
) => ({
  tags: [tag],
  summary,
  security: [{ bearerAuth: [] }],
  responses: {
    [success]: { description: 'Sucesso' },
    ...errors,
    ...((extra.responses as object) ?? {}),
  },
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'responses')),
});

const conflict = (description: string) => ({ responses: { '409': { description } } });

export const productionTags = [
  { name: 'Impressoras', description: 'Equipamentos, situação, horas e manutenção' },
  { name: 'Produção', description: 'Ordens de produção, fila, impressões, falhas e inspeção' },
];

export const productionPaths = {
  '/printers': {
    get: op('Impressoras', 'Lista impressoras com situação, impressão atual e horas'),
    post: op(
      'Impressoras',
      'Cadastra impressora',
      { requestBody: body(printerInputSchema) },
      '201',
    ),
  },
  '/printers/{id}': {
    get: op('Impressoras', 'Detalha impressora', { parameters: [id] }),
    put: op('Impressoras', 'Edita impressora', {
      parameters: [id],
      requestBody: body(printerInputSchema),
    }),
    delete: op(
      'Impressoras',
      'Exclui impressora (lógico; sem impressão em andamento nem fila)',
      { parameters: [id] },
      '204',
    ),
  },
  '/printers/{id}/status': {
    patch: op('Impressoras', 'Muda a situação (disponível, manutenção, inativa)', {
      parameters: [id],
      requestBody: body(printerStatusInputSchema),
      ...conflict('Impressão em andamento'),
    }),
  },
  '/maintenance': {
    get: op('Impressoras', 'Histórico de manutenções', {
      parameters: [query('printerId', { type: 'string', format: 'uuid' })],
    }),
    post: op(
      'Impressoras',
      'Registra manutenção',
      { requestBody: body(maintenanceInputSchema) },
      '201',
    ),
  },
  '/maintenance/{id}': {
    put: op('Impressoras', 'Edita manutenção', {
      parameters: [id],
      requestBody: body(maintenanceInputSchema),
    }),
    delete: op('Impressoras', 'Exclui manutenção', { parameters: [id] }, '204'),
  },
  '/production/orders': {
    get: op('Produção', 'Lista ordens (fila, inspeção, encerradas) com filtros', {
      parameters: [
        query('view', { enum: ['queue', 'inspection', 'closed', 'all'] }),
        query('materialId', { type: 'string', format: 'uuid' }),
        query('color', { type: 'string' }),
        query('printerId', { type: 'string', description: 'uuid ou "none"' }),
        query('priority', { enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] }),
        query('search', { type: 'string' }),
      ],
    }),
    post: op(
      'Produção',
      'Cria ordem de produção',
      { requestBody: body(productionOrderInputSchema) },
      '201',
    ),
  },
  '/production/orders/{id}': {
    get: op('Produção', 'Detalha ordem com impressões e inspeções', { parameters: [id] }),
    put: op('Produção', 'Edita ordem pendente ou planejada', {
      parameters: [id],
      requestBody: body(productionOrderInputSchema),
    }),
  },
  '/production/orders/{id}/cancel': {
    post: op('Produção', 'Cancela ordem sem peças impressas', {
      parameters: [id],
      requestBody: body(cancelProductionOrderSchema),
    }),
  },
  '/production/orders/{id}/close': {
    post: op('Produção', 'Encerra a produção com o que já foi impresso', {
      parameters: [id],
      requestBody: body(cancelProductionOrderSchema),
    }),
  },
  '/production/orders/{id}/start-inspection': {
    post: op('Produção', 'Marca a ordem como em inspeção', { parameters: [id] }),
  },
  '/production/orders/{id}/inspections': {
    post: op(
      'Produção',
      'Registra inspeção (aprovadas entram no estoque; baixa os insumos da ficha técnica)',
      {
        parameters: [id],
        requestBody: body(inspectionInputSchema),
        ...conflict('Insumo insuficiente'),
      },
      '201',
    ),
  },
  '/production/orders/{id}/jobs': {
    post: op(
      'Produção',
      'Inicia impressão (ocupa a impressora)',
      {
        parameters: [id],
        requestBody: body(startPrintJobSchema),
        ...conflict('Impressora ocupada, em manutenção ou ordem fora da fila'),
      },
      '201',
    ),
  },
  '/production/jobs': {
    get: op('Produção', 'Histórico de impressões e falhas', {
      parameters: [
        query('printerId', { type: 'string', format: 'uuid' }),
        query('productionOrderId', { type: 'string', format: 'uuid' }),
        query('status', { enum: ['IN_PROGRESS', 'PAUSED', 'SUCCEEDED', 'FAILED', 'active'] }),
      ],
    }),
  },
  '/production/jobs/{id}/pause': { post: op('Produção', 'Pausa impressão', { parameters: [id] }) },
  '/production/jobs/{id}/resume': {
    post: op('Produção', 'Retoma impressão', { parameters: [id] }),
  },
  '/production/jobs/{id}/finish': {
    post: op('Produção', 'Finaliza impressão (sucesso ou falha) e baixa o filamento', {
      parameters: [id],
      requestBody: body(finishPrintJobSchema),
      ...conflict('Já finalizada (nada é baixado de novo) ou saldo do rolo insuficiente'),
    }),
  },
  '/production/responsibles': {
    get: op('Produção', 'Usuários ativos que podem ser responsáveis por ordens'),
  },
  '/alerts': {
    get: op('Produção', 'Alertas do cabeçalho conforme as permissões do usuário'),
  },
};
