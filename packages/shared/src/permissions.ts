/**
 * Catálogo de permissões do sistema (fonte única de verdade).
 * O seed sincroniza esta lista com a tabela `permissions`.
 *
 * - O perfil ADMIN possui todas as permissões implicitamente.
 * - Permissões `adminOnly` são administrativas e NUNCA podem ser atribuídas a outros perfis.
 */

export interface PermissionDefinition {
  code: string;
  module: PermissionModule;
  label: string;
  adminOnly: boolean;
}

export const PERMISSION_MODULES = {
  dashboard: 'Dashboard',
  products: 'Produtos',
  inventory: 'Estoque',
  production: 'Produção',
  printers: 'Impressoras',
  orders: 'Pedidos',
  finance: 'Financeiro',
  reports: 'Relatórios',
  administration: 'Administração',
} as const;

export type PermissionModule = keyof typeof PERMISSION_MODULES;

const define = <const C extends string>(
  code: C,
  module: PermissionModule,
  label: string,
  adminOnly = false,
) => ({ code, module, label, adminOnly });

export const PERMISSIONS = [
  define('dashboard:read', 'dashboard', 'Visualizar dashboard'),
  define('products:read', 'products', 'Visualizar produtos'),
  define('products:manage', 'products', 'Cadastrar e editar produtos'),
  define('inventory:read', 'inventory', 'Visualizar estoque'),
  define('inventory:manage', 'inventory', 'Registrar entradas e saídas de estoque'),
  define('inventory:adjust', 'inventory', 'Fazer ajustes manuais de estoque'),
  define('inventory:allow-negative', 'inventory', 'Autorizar saldo negativo de estoque', true),
  define('production:read', 'production', 'Visualizar ordens de produção'),
  define('production:manage', 'production', 'Criar e operar ordens de produção'),
  define('printers:read', 'printers', 'Visualizar impressoras'),
  define('printers:manage', 'printers', 'Gerenciar impressoras e manutenções'),
  define('orders:read', 'orders', 'Visualizar pedidos'),
  define('orders:manage', 'orders', 'Cadastrar e editar pedidos'),
  define('finance:read', 'finance', 'Visualizar financeiro'),
  define('finance:manage', 'finance', 'Lançar receitas e despesas'),
  define('reports:read', 'reports', 'Visualizar e exportar relatórios'),
  define('users:read', 'administration', 'Visualizar usuários', true),
  define('users:manage', 'administration', 'Gerenciar usuários', true),
  define('roles:manage', 'administration', 'Gerenciar perfis e permissões', true),
  define('audit:read', 'administration', 'Visualizar registro de auditoria', true),
] as const satisfies readonly PermissionDefinition[];

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];

export const PERMISSION_CODES = PERMISSIONS.map((p) => p.code) as PermissionCode[];

export const ASSIGNABLE_PERMISSION_CODES = PERMISSIONS.filter((p) => !p.adminOnly).map(
  (p) => p.code,
) as PermissionCode[];

export const SYSTEM_ROLES = {
  ADMIN: 'ADMIN',
  OPERACIONAL: 'OPERACIONAL',
} as const;

/** Permissões padrão do perfil OPERACIONAL (editáveis depois pelo administrador). */
export const DEFAULT_OPERATIONAL_PERMISSIONS: PermissionCode[] = [
  'dashboard:read',
  'products:read',
  'inventory:read',
  'inventory:manage',
  'production:read',
  'production:manage',
  'printers:read',
  'orders:read',
  'orders:manage',
];

export function isPermissionCode(value: string): value is PermissionCode {
  return (PERMISSION_CODES as string[]).includes(value);
}
