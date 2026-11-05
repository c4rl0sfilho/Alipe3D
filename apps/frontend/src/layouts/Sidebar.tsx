import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { BrandMark } from '@/components/BrandMark';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/cn';
import { NAVIGATION, type NavItem } from './navigation';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const { can } = useAuth();

  const sections = NAVIGATION.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || can(item.permission)),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      {/* Fundo escurecido do menu no celular */}
      <div
        className={cn(
          'fixed inset-0 z-30 bg-ink/40 transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed && 'lg:w-[68px]',
        )}
        aria-label="Menu principal"
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-4">
          <BrandMark
            className={cn(collapsed && 'lg:mx-auto')}
            textClassName={collapsed ? 'lg:hidden' : undefined}
          />
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-md p-1 text-ink-muted hover:bg-canvas lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.title}>
              <p
                className={cn(
                  'mb-1.5 px-2 text-[11px] font-semibold tracking-wider text-ink-muted/80 uppercase',
                  collapsed && 'lg:sr-only',
                )}
              >
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <SidebarLink item={item} collapsed={collapsed} onNavigate={onCloseMobile} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="hidden border-t border-line p-3 lg:block">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-ink-muted hover:bg-canvas hover:text-ink"
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? (
              <ChevronsRight className="mx-auto size-4" />
            ) : (
              <>
                <ChevronsLeft className="size-4" />
                Recolher menu
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}

function SidebarLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  const base = 'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors';

  if (item.plannedPhase) {
    return (
      <span
        className={cn(base, 'cursor-default text-ink-muted/60', collapsed && 'lg:justify-center')}
        title={`${item.label} — disponível na Fase ${item.plannedPhase}`}
        aria-disabled="true"
      >
        <Icon className="size-[18px] shrink-0" aria-hidden="true" />
        <span className={cn('flex-1 truncate', collapsed && 'lg:sr-only')}>{item.label}</span>
        <span
          className={cn(
            'rounded bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-ink-muted',
            collapsed && 'lg:hidden',
          )}
        >
          Em breve
        </span>
      </span>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          base,
          collapsed && 'lg:justify-center',
          isActive
            ? 'bg-brand-50 font-medium text-brand-700'
            : 'text-ink-muted hover:bg-canvas hover:text-ink',
        )
      }
    >
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      <span className={cn('truncate', collapsed && 'lg:sr-only')}>{item.label}</span>
    </NavLink>
  );
}
