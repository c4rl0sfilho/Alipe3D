import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bell, OctagonAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { inventoryKeys, stockApi } from '@/modules/inventory/inventory.api';
import { cn } from '@/utils/cn';

/** Notificações do cabeçalho: alertas reais de reposição de estoque. */
export function AlertsBell() {
  const { can } = useAuth();
  const enabled = can('inventory:read');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const alerts = useQuery({
    queryKey: inventoryKeys.alerts,
    queryFn: stockApi.alerts,
    enabled,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !ref.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!enabled) return null;
  const items = alerts.data ?? [];
  const critical = items.some((a) => a.severity === 'critical');

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-ink-muted hover:bg-canvas hover:text-ink"
        aria-label={
          items.length ? `${items.length} alertas de estoque` : 'Nenhum alerta de estoque'
        }
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {items.length > 0 && (
          <span
            className={cn(
              'absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold text-white',
              critical ? 'bg-danger' : 'bg-warning',
            )}
          >
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface shadow-lg">
          <p className="border-b border-line px-4 py-3 text-sm font-semibold">Alertas de estoque</p>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">
              Nenhum alerta no momento.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {items.slice(0, 8).map((alert, index) => {
                const Icon = alert.severity === 'critical' ? OctagonAlert : AlertTriangle;
                return (
                  <li key={index}>
                    <Link
                      to={alert.link}
                      onClick={() => setOpen(false)}
                      className="flex gap-3 px-4 py-3 hover:bg-canvas"
                    >
                      <Icon
                        className={cn(
                          'mt-0.5 size-4 shrink-0',
                          alert.severity === 'critical' ? 'text-danger' : 'text-warning',
                        )}
                        aria-hidden="true"
                      />
                      <span>
                        <span className="block text-sm font-medium">{alert.title}</span>
                        <span className="block text-xs text-ink-muted">{alert.detail}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            to="/estoque"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-canvas"
          >
            Ver estoque
          </Link>
        </div>
      )}
    </div>
  );
}
