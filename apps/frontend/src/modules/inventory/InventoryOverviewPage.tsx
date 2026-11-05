import type { StockAlert } from '@alipe3d/shared';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CircleCheck,
  Cylinder,
  Package,
  OctagonAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { cn } from '@/utils/cn';
import { formatGrams, formatNumber } from '@/utils/format';
import { inventoryKeys, materialsApi, stockApi } from './inventory.api';

export function InventoryOverviewPage() {
  const alerts = useQuery({ queryKey: inventoryKeys.alerts, queryFn: stockApi.alerts });
  const materials = useQuery({ queryKey: inventoryKeys.materials, queryFn: materialsApi.list });
  const supplies = useQuery({
    queryKey: inventoryKeys.items({ kind: 'SUPPLY', pageSize: 1 }),
    queryFn: () => stockApi.listItems({ kind: 'SUPPLY', pageSize: 1 }),
  });
  const finished = useQuery({
    queryKey: inventoryKeys.items({ kind: 'FINISHED_GOOD', pageSize: 100 }),
    queryFn: () => stockApi.listItems({ kind: 'FINISHED_GOOD', pageSize: 100 }),
  });

  const totalGrams = materials.data?.reduce((sum, m) => sum + Number(m.availableGrams), 0) ?? 0;
  const activeRolls = materials.data?.reduce((sum, m) => sum + m.activeRolls, 0) ?? 0;
  const finishedUnits = finished.data?.items.reduce((sum, i) => sum + Number(i.quantity), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Cylinder className="size-5" />}
          label="Filamento disponível"
          value={materials.data ? formatGrams(totalGrams) : '—'}
          detail={`${materials.data?.length ?? 0} filamentos cadastrados`}
          to="/estoque/filamentos"
        />
        <Stat
          icon={<Cylinder className="size-5" />}
          label="Rolos com saldo"
          value={materials.data ? String(activeRolls) : '—'}
          detail="Lacrados e em uso"
          to="/estoque/rolos"
        />
        <Stat
          icon={<Boxes className="size-5" />}
          label="Insumos cadastrados"
          value={supplies.data ? String(supplies.data.meta.totalItems) : '—'}
          detail="Embalagens, etiquetas, peças"
          to="/estoque/insumos"
        />
        <Stat
          icon={<Package className="size-5" />}
          label="Produtos acabados"
          value={finished.data ? `${formatNumber(finishedUnits, 0)} un` : '—'}
          detail="Prontos para expedição"
          to="/estoque/produtos-acabados"
        />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">Alertas de reposição</h2>
        {alerts.data && alerts.data.length === 0 ? (
          <Card className="flex items-center gap-3 p-5 text-sm">
            <CircleCheck className="size-5 text-success" aria-hidden="true" />
            Nenhum alerta. Os itens com estoque mínimo configurado estão acima do mínimo.
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {alerts.data?.map((alert, index) => (
                <AlertRow key={index} alert={alert} />
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

function AlertRow({ alert }: { alert: StockAlert }) {
  const critical = alert.severity === 'critical';
  const Icon = critical ? OctagonAlert : AlertTriangle;
  return (
    <li>
      <Link
        to={alert.link}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas/60"
      >
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            critical ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{alert.title}</span>
          <span className="block text-xs text-ink-muted">{alert.detail}</span>
        </span>
        <ArrowRight className="size-4 text-ink-muted" aria-hidden="true" />
      </Link>
    </li>
  );
}

function Stat({
  icon,
  label,
  value,
  detail,
  to,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  to: string;
}) {
  return (
    <Link to={to} className="group">
      <Card className="p-5 transition-colors group-hover:border-brand-300">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-muted">{label}</p>
          <span className="text-brand-500">{icon}</span>
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-ink-muted">{detail}</p>
      </Card>
    </Link>
  );
}
