import { useQuery } from '@tanstack/react-query';
import { Outlet } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { LinkTabs } from '@/components/ui/Tabs';
import { inventoryKeys, stockApi } from './inventory.api';

export function InventoryLayout() {
  const alerts = useQuery({ queryKey: inventoryKeys.alerts, queryFn: stockApi.alerts });
  const count = alerts.data?.length ?? 0;

  return (
    <>
      <PageHeader
        title="Estoque"
        description="Filamentos (em gramas), insumos e produtos acabados, com histórico de todas as movimentações."
      />
      <LinkTabs
        tabs={[
          {
            to: '/estoque',
            label: 'Visão geral',
            end: true,
            badge:
              count > 0 ? (
                <span className="rounded-full bg-warning-soft px-1.5 text-[11px] font-semibold text-warning">
                  {count}
                </span>
              ) : undefined,
          },
          { to: '/estoque/filamentos', label: 'Filamentos' },
          { to: '/estoque/rolos', label: 'Rolos' },
          { to: '/estoque/insumos', label: 'Insumos' },
          { to: '/estoque/produtos-acabados', label: 'Produtos acabados' },
          { to: '/estoque/movimentacoes', label: 'Movimentações' },
          { to: '/estoque/fornecedores', label: 'Fornecedores' },
        ]}
      />
      <Outlet />
    </>
  );
}
