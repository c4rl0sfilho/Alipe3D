import {
  changePasswordSchema,
  createUserSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  roleInputSchema,
  setUserStatusSchema,
  updateUserSchema,
} from '@alipe3d/shared';
import { z } from 'zod';
import { catalogInventoryPaths, catalogInventoryTags } from './openapi-catalog-inventory.js';
import { productionPaths, productionTags } from './openapi-production.js';

/**
 * Documento OpenAPI 3.1 da API. Os corpos das requisições são gerados a partir dos mesmos
 * schemas Zod usados na validação, para a documentação nunca divergir do código.
 */

type Schema = Record<string, unknown>;

const body = (schema: z.ZodType) => ({
  required: true,
  content: { 'application/json': { schema: z.toJSONSchema(schema, { io: 'input' }) } },
});

const ok = (description: string, data: Schema = { type: 'object' }, paginated = false) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { const: true },
          data: paginated ? { type: 'array', items: data } : data,
          ...(paginated ? { meta: { $ref: '#/components/schemas/PaginationMeta' } } : {}),
        },
      },
    },
  },
});

const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const secured = [{ bearerAuth: [] }];
const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  {
    name: 'pageSize',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
];
const commonErrors = {
  '401': error('Não autenticado ou sessão expirada'),
  '403': error('Sem permissão'),
};

export function buildOpenApiDocument(version: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Alipe3D Manager API',
      version,
      description:
        'API REST do Alipe3D Manager.\n\n' +
        '**Autenticação:** faça `POST /auth/login` e use o `accessToken` retornado no botão *Authorize* ' +
        '(cabeçalho `Authorization: Bearer <token>`). A sessão longa fica em cookie httpOnly e é renovada em `POST /auth/refresh`.',
    },
    servers: [{ url: '/api/v1' }],
    tags: [
      { name: 'Sistema', description: 'Saúde e disponibilidade' },
      { name: 'Autenticação', description: 'Login, sessão e senha' },
      { name: 'Usuários', description: 'Cadastro e acesso de usuários (administração)' },
      { name: 'Perfis', description: 'Perfis de acesso e permissões (administração)' },
      { name: 'Auditoria', description: 'Registro de operações (administração)' },
      ...catalogInventoryTags,
      ...productionTags,
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Sistema'],
          summary: 'Saúde da API e do banco de dados',
          responses: {
            '200': ok('Todos os serviços operacionais', ref('HealthStatus')),
            '503': ok('Algum serviço está indisponível', ref('HealthStatus')),
          },
        },
      },
      '/health/live': {
        get: {
          tags: ['Sistema'],
          summary: 'Liveness: confirma que o processo responde',
          responses: { '200': ok('API ativa') },
        },
      },
      '/auth/login': {
        post: {
          tags: ['Autenticação'],
          summary: 'Login com e-mail e senha',
          description: 'Bloqueia a conta por 15 minutos após 5 tentativas erradas.',
          requestBody: body(loginSchema),
          responses: {
            '200': ok('Sessão criada (cookie de sessão enviado)', ref('AuthSession')),
            '401': error('E-mail ou senha inválidos'),
            '403': error('Usuário desativado'),
            '423': error('Conta bloqueada temporariamente'),
            '429': error('Excesso de tentativas a partir deste IP'),
          },
        },
      },
      '/auth/refresh': {
        post: {
          tags: ['Autenticação'],
          summary: 'Renova a sessão a partir do cookie (rotação de token)',
          responses: {
            '200': ok('Nova sessão', ref('AuthSession')),
            '401': error('Sessão expirada'),
          },
        },
      },
      '/auth/logout': {
        post: {
          tags: ['Autenticação'],
          summary: 'Encerra a sessão atual',
          responses: { '204': { description: 'Sessão encerrada' } },
        },
      },
      '/auth/me': {
        get: {
          tags: ['Autenticação'],
          summary: 'Usuário autenticado e suas permissões',
          security: secured,
          responses: { '200': ok('Usuário', ref('AuthUser')), ...commonErrors },
        },
      },
      '/auth/change-password': {
        post: {
          tags: ['Autenticação'],
          summary: 'Troca a própria senha (encerra as outras sessões)',
          security: secured,
          requestBody: body(changePasswordSchema),
          responses: {
            '200': ok('Senha alterada; nova sessão', ref('AuthSession')),
            '400': error('Senha atual incorreta'),
            '422': error('Nova senha não atende à política'),
            ...commonErrors,
          },
        },
      },
      '/auth/forgot-password': {
        post: {
          tags: ['Autenticação'],
          summary: 'Solicita link de redefinição por e-mail',
          description: 'Sempre responde 200, exista ou não o e-mail. Requer SMTP configurado.',
          requestBody: body(forgotPasswordSchema),
          responses: { '200': ok('Solicitação registrada') },
        },
      },
      '/auth/reset-password': {
        post: {
          tags: ['Autenticação'],
          summary: 'Define nova senha com o token do link',
          requestBody: body(resetPasswordSchema),
          responses: { '200': ok('Senha redefinida'), '400': error('Link inválido ou expirado') },
        },
      },
      '/users': {
        get: {
          tags: ['Usuários'],
          summary: 'Lista usuários',
          security: secured,
          parameters: [
            ...pageParams,
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'roleId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'status', in: 'query', schema: { enum: ['all', 'active', 'inactive'] } },
            {
              name: 'sort',
              in: 'query',
              schema: { enum: ['name', 'email', 'createdAt', 'lastLoginAt'] },
            },
            { name: 'order', in: 'query', schema: { enum: ['asc', 'desc'] } },
          ],
          responses: { '200': ok('Página de usuários', ref('UserSummary'), true), ...commonErrors },
        },
        post: {
          tags: ['Usuários'],
          summary: 'Cria usuário com senha provisória',
          security: secured,
          requestBody: body(createUserSchema),
          responses: {
            '201': ok('Usuário criado', ref('UserSummary')),
            '409': error('E-mail já cadastrado'),
            '422': error('Dados inválidos'),
            ...commonErrors,
          },
        },
      },
      '/users/{id}': {
        get: {
          tags: ['Usuários'],
          summary: 'Detalha usuário',
          security: secured,
          parameters: [idParam],
          responses: {
            '200': ok('Usuário', ref('UserSummary')),
            '404': error('Não encontrado'),
            ...commonErrors,
          },
        },
        put: {
          tags: ['Usuários'],
          summary: 'Edita nome, e-mail e perfil',
          security: secured,
          parameters: [idParam],
          requestBody: body(updateUserSchema),
          responses: {
            '200': ok('Usuário atualizado', ref('UserSummary')),
            '400': error('Regra violada (ex.: alterar o próprio perfil)'),
            '409': error('E-mail já cadastrado'),
            ...commonErrors,
          },
        },
      },
      '/users/{id}/status': {
        patch: {
          tags: ['Usuários'],
          summary: 'Ativa ou desativa usuário (desativar encerra as sessões)',
          security: secured,
          parameters: [idParam],
          requestBody: body(setUserStatusSchema),
          responses: {
            '200': ok('Situação alterada', ref('UserSummary')),
            '400': error('Regra violada (ex.: último administrador)'),
            ...commonErrors,
          },
        },
      },
      '/users/{id}/reset-link': {
        post: {
          tags: ['Usuários'],
          summary: 'Gera link de redefinição de senha (válido por 24 h, uso único)',
          security: secured,
          parameters: [idParam],
          responses: {
            '201': ok('Link gerado', {
              type: 'object',
              properties: {
                url: { type: 'string' },
                expiresAt: { type: 'string', format: 'date-time' },
              },
            }),
            ...commonErrors,
          },
        },
      },
      '/roles': {
        get: {
          tags: ['Perfis'],
          summary: 'Lista perfis com permissões',
          security: secured,
          responses: {
            '200': ok('Perfis', { type: 'array', items: ref('RoleSummary') }),
            ...commonErrors,
          },
        },
        post: {
          tags: ['Perfis'],
          summary: 'Cria perfil',
          security: secured,
          requestBody: body(roleInputSchema),
          responses: {
            '201': ok('Perfil criado', ref('RoleSummary')),
            '409': error('Nome em uso'),
            ...commonErrors,
          },
        },
      },
      '/roles/{id}': {
        put: {
          tags: ['Perfis'],
          summary: 'Edita perfil e permissões (o perfil Administrador não é editável)',
          security: secured,
          parameters: [idParam],
          requestBody: body(roleInputSchema),
          responses: { '200': ok('Perfil atualizado', ref('RoleSummary')), ...commonErrors },
        },
        delete: {
          tags: ['Perfis'],
          summary: 'Exclui perfil personalizado sem usuários',
          security: secured,
          parameters: [idParam],
          responses: {
            '204': { description: 'Excluído' },
            '409': error('Perfil em uso'),
            ...commonErrors,
          },
        },
      },
      ...catalogInventoryPaths,
      ...productionPaths,
      '/audit-logs': {
        get: {
          tags: ['Auditoria'],
          summary: 'Lista registros de auditoria',
          security: secured,
          parameters: [
            ...pageParams,
            { name: 'action', in: 'query', schema: { type: 'string' } },
            { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: {
            '200': ok('Página de registros', ref('AuditLogEntry'), true),
            ...commonErrors,
          },
        },
      },
    },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { const: false },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string' },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { field: { type: 'string' }, message: { type: 'string' } },
                  },
                },
                requestId: { type: 'string' },
              },
            },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            totalItems: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
        HealthStatus: {
          type: 'object',
          properties: {
            status: { enum: ['ok', 'degraded'] },
            version: { type: 'string' },
            environment: { type: 'string' },
            uptimeSeconds: { type: 'number' },
            timestamp: { type: 'string', format: 'date-time' },
            services: { type: 'object' },
          },
        },
        RoleRef: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            code: { type: 'string' },
            name: { type: 'string' },
          },
        },
        AuthUser: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            email: { type: 'string' },
            mustChangePassword: { type: 'boolean' },
            role: ref('RoleRef'),
            permissions: { type: 'array', items: { type: 'string' } },
          },
        },
        AuthSession: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            expiresIn: { type: 'integer', description: 'Segundos' },
            user: ref('AuthUser'),
          },
        },
        UserSummary: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            email: { type: 'string' },
            isActive: { type: 'boolean' },
            mustChangePassword: { type: 'boolean' },
            lastLoginAt: { type: ['string', 'null'], format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            role: ref('RoleRef'),
          },
        },
        RoleSummary: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            code: { type: 'string' },
            name: { type: 'string' },
            description: { type: ['string', 'null'] },
            isSystem: { type: 'boolean' },
            isAdmin: { type: 'boolean' },
            permissions: { type: 'array', items: { type: 'string' } },
            userCount: { type: 'integer' },
          },
        },
        AuditLogEntry: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            action: { type: 'string' },
            entity: { type: ['string', 'null'] },
            entityId: { type: ['string', 'null'] },
            metadata: { type: ['object', 'null'] },
            ip: { type: ['string', 'null'] },
            createdAt: { type: 'string', format: 'date-time' },
            user: { oneOf: [{ type: 'null' }, { type: 'object' }] },
          },
        },
      },
    },
  };
}
