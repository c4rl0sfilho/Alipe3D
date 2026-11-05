import { z } from 'zod';
import { optionalTrimmed, paginationQuerySchema, uuidSchema } from './common.js';

/** Ações registradas na auditoria. Novos módulos acrescentam suas ações aqui. */
export const AUDIT_ACTIONS = {
  'auth.login': 'Login realizado',
  'auth.login_failed': 'Tentativa de login falhou',
  'auth.logout': 'Logout',
  'auth.password_changed': 'Senha alterada',
  'auth.password_reset_requested': 'Recuperação de senha solicitada',
  'auth.password_reset': 'Senha redefinida por link',
  'auth.refresh_reuse_detected': 'Reuso de sessão detectado (sessões revogadas)',
  'user.created': 'Usuário criado',
  'user.updated': 'Usuário editado',
  'user.deactivated': 'Usuário desativado',
  'user.activated': 'Usuário reativado',
  'user.reset_link_generated': 'Link de redefinição de senha gerado',
  'role.created': 'Perfil criado',
  'role.updated': 'Perfil editado',
  'role.deleted': 'Perfil excluído',
  'category.created': 'Categoria criada',
  'category.updated': 'Categoria editada',
  'category.deleted': 'Categoria excluída',
  'product.created': 'Produto criado',
  'product.updated': 'Produto editado',
  'product.deleted': 'Produto excluído',
  'variant.created': 'Variação criada',
  'variant.updated': 'Variação editada',
  'variant.deleted': 'Variação excluída',
  'product.bom_updated': 'Ficha técnica alterada',
  'product.file_uploaded': 'Arquivo de produto enviado',
  'product.file_deleted': 'Arquivo de produto excluído',
  'supplier.created': 'Fornecedor criado',
  'supplier.updated': 'Fornecedor editado',
  'supplier.deleted': 'Fornecedor excluído',
  'material.created': 'Filamento cadastrado',
  'material.updated': 'Filamento editado',
  'material.deleted': 'Filamento excluído',
  'roll.updated': 'Rolo editado',
  'supply.created': 'Insumo cadastrado',
  'supply.updated': 'Insumo editado',
  'supply.deleted': 'Insumo excluído',
  'inventory.adjusted': 'Ajuste manual de estoque',
  'inventory.negative_authorized': 'Saldo negativo autorizado',
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  action: optionalTrimmed,
  userId: uuidSchema.optional().or(z.literal('').transform(() => undefined)),
  from: z.iso
    .date()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  to: z.iso
    .date()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export type ListAuditLogsQuery = z.input<typeof listAuditLogsQuerySchema>;

export interface AuditLogEntry {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}
