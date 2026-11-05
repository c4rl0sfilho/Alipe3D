import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDateTime } from '@/utils/format';
import { SystemHealthCards } from './SystemHealthCards';
import { useHealth } from './use-health';

export function SystemStatusPage() {
  const { data, isFetching, refetch } = useHealth();

  return (
    <>
      <PageHeader
        title="Status do sistema"
        description="Comunicação entre a interface, a API e o banco de dados. Atualiza a cada 15 segundos."
        actions={
          <Button
            variant="secondary"
            onClick={() => void refetch()}
            disabled={isFetching}
            icon={<RefreshCw className={isFetching ? 'size-4 animate-spin' : 'size-4'} />}
          >
            Atualizar
          </Button>
        }
      />
      <div className="space-y-4">
        <SystemHealthCards />
        {data && (
          <Card className="p-5">
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <InfoItem label="Situação geral">
                <StatusBadge
                  tone={data.status === 'ok' ? 'success' : 'warning'}
                  label={data.status === 'ok' ? 'Todos os serviços operacionais' : 'Degradado'}
                />
              </InfoItem>
              <InfoItem label="Versão / ambiente">
                {data.version} · {data.environment}
              </InfoItem>
              <InfoItem label="Última verificação">{formatDateTime(data.timestamp)}</InfoItem>
            </dl>
          </Card>
        )}
      </div>
    </>
  );
}

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}
