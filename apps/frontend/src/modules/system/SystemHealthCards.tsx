import type { ServiceStatus } from '@alipe3d/shared';
import { Database, LoaderCircle, Server, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDuration } from '@/utils/format';
import { useHealth } from './use-health';

const serviceLabel: Record<ServiceStatus, string> = { up: 'Operacional', down: 'Indisponível' };

/** Cartões de situação da API e do banco, com dados reais do health check. */
export function SystemHealthCards() {
  const { data, error, isPending } = useHealth();

  if (isPending) {
    return (
      <Card className="flex items-center gap-3 p-5 text-sm text-ink-muted">
        <LoaderCircle className="size-5 animate-spin text-brand-500" aria-hidden="true" />
        Verificando serviços...
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card className="flex items-start gap-3 border-danger/30 p-5" role="alert">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
        <div>
          <p className="font-medium">API indisponível</p>
          <p className="mt-1 text-sm text-ink-muted">{error.message}</p>
        </div>
      </Card>
    );
  }

  if (!data) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ServiceCard
        icon={<Server className="size-5" aria-hidden="true" />}
        title="API"
        status={data.services.api.status}
        detail={`Ativa há ${formatDuration(data.uptimeSeconds)}`}
      />
      <ServiceCard
        icon={<Database className="size-5" aria-hidden="true" />}
        title="Banco de dados"
        status={data.services.database.status}
        detail={
          data.services.database.latencyMs === null
            ? 'Sem resposta do PostgreSQL'
            : `PostgreSQL respondeu em ${data.services.database.latencyMs} ms`
        }
      />
    </div>
  );
}

function ServiceCard({
  icon,
  title,
  status,
  detail,
}: {
  icon: ReactNode;
  title: string;
  status: ServiceStatus;
  detail: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            {icon}
          </span>
          <div>
            <p className="font-medium">{title}</p>
            <p className="text-sm text-ink-muted">{detail}</p>
          </div>
        </div>
        <StatusBadge tone={status === 'up' ? 'success' : 'danger'} label={serviceLabel[status]} />
      </div>
    </Card>
  );
}
