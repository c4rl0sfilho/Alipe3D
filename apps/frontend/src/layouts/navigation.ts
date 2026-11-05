import type { PermissionCode } from '@alipe3d/shared';
import {
  Activity,
  Banknote,
  Boxes,
  ChartColumn,
  Factory,
  House,
  Package,
  Printer,
  ScrollText,
  ShieldCheck,
  ShoppingBag,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Necessária para ver o item. Sem permissão: item oculto. */
  permission?: PermissionCode;
  /** Módulo ainda não implementado: aparece desabilitado com a fase prevista. */
  plannedPhase?: number;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    title: 'Principal',
    items: [{ label: 'Início', to: '/', icon: House }],
  },
  {
    title: 'Operação',
    items: [
      {
        label: 'Produtos',
        to: '/produtos',
        icon: Package,
        permission: 'products:read',
      },
      {
        label: 'Estoque',
        to: '/estoque',
        icon: Boxes,
        permission: 'inventory:read',
      },
      {
        label: 'Produção',
        to: '/producao',
        icon: Factory,
        permission: 'production:read',
        plannedPhase: 4,
      },
      {
        label: 'Impressoras',
        to: '/impressoras',
        icon: Printer,
        permission: 'printers:read',
        plannedPhase: 4,
      },
      {
        label: 'Pedidos',
        to: '/pedidos',
        icon: ShoppingBag,
        permission: 'orders:read',
        plannedPhase: 5,
      },
    ],
  },
  {
    title: 'Gestão',
    items: [
      {
        label: 'Financeiro',
        to: '/financeiro',
        icon: Banknote,
        permission: 'finance:read',
        plannedPhase: 6,
      },
      {
        label: 'Relatórios',
        to: '/relatorios',
        icon: ChartColumn,
        permission: 'reports:read',
        plannedPhase: 6,
      },
    ],
  },
  {
    title: 'Administração',
    items: [
      { label: 'Usuários', to: '/usuarios', icon: Users, permission: 'users:read' },
      { label: 'Perfis de acesso', to: '/perfis', icon: ShieldCheck, permission: 'roles:manage' },
      { label: 'Auditoria', to: '/auditoria', icon: ScrollText, permission: 'audit:read' },
      { label: 'Status do sistema', to: '/status', icon: Activity },
    ],
  },
];

/** Título da página atual, a partir da navegação. */
export function titleForPath(pathname: string): string {
  if (pathname === '/perfil') return 'Meu perfil';
  for (const section of NAVIGATION) {
    for (const item of section.items) {
      if (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)) return item.label;
    }
  }
  return 'Alipe3D Manager';
}
