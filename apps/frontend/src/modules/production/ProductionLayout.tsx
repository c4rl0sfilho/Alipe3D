import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { CountBadge, LinkTabs } from '@/components/ui/Tabs';
import { useAuth } from '@/contexts/AuthContext';
import { productionApi, productionKeys } from './production.api';
import { ProductionOrderFormModal } from './ProductionOrderFormModal';

export function ProductionLayout() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const countQuery = (view: 'queue' | 'inspection') => ({ view, pageSize: 1 });
  const queue = useQuery({
    queryKey: productionKeys.orders(countQuery('queue')),
    queryFn: () => productionApi.listOrders(countQuery('queue')),
  });
  const inspection = useQuery({
    queryKey: productionKeys.orders(countQuery('inspection')),
    queryFn: () => productionApi.listOrders(countQuery('inspection')),
  });
  const count = (n: number | undefined) => (n ? <CountBadge value={n} /> : undefined);

  return (
    <>
      <PageHeader
        title="Produção"
        description="Ordens de produção, fila por prioridade e prazo, impressões, falhas e inspeção."
        actions={
          can('production:manage') && (
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Nova ordem
            </Button>
          )
        }
      />
      <LinkTabs
        tabs={[
          {
            to: '/producao',
            label: 'Fila',
            end: true,
            badge: count(queue.data?.meta.totalItems),
          },
          {
            to: '/producao/inspecao',
            label: 'Inspeção',
            badge: count(inspection.data?.meta.totalItems),
          },
          { to: '/producao/ordens', label: 'Todas as ordens' },
          { to: '/producao/impressoes', label: 'Impressões e falhas' },
        ]}
      />
      <Outlet />
      <ProductionOrderFormModal
        open={creating}
        order={null}
        onClose={() => setCreating(false)}
        onSaved={(order) => navigate(`/producao/ordens/${order.id}`)}
      />
    </>
  );
}
