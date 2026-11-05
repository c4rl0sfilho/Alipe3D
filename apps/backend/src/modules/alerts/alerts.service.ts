import { QUEUE_STATUSES, type AppAlert, type AuthUser, type PermissionCode } from '@alipe3d/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { StockItemsService } from '../inventory/stock-items.service.js';
import type { PrintersService } from '../printers/printers.service.js';
import { todayInSaoPaulo } from '../production/production-rules.js';

const formatDate = (iso: string) => iso.split('-').reverse().join('/');

/** Alertas do cabeçalho, conforme o que o usuário pode ver. Todos calculados na hora. */
export class AlertsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly stockItems: StockItemsService,
    private readonly printers: PrintersService,
  ) {}

  async forUser(user: AuthUser): Promise<AppAlert[]> {
    const can = (permission: PermissionCode) => user.permissions.includes(permission);
    const [production, printers, stock] = await Promise.all([
      can('production:read') ? this.productionAlerts() : [],
      can('printers:read') ? this.maintenanceAlerts() : [],
      can('inventory:read') ? this.stockItems.alerts() : [],
    ]);
    const all: AppAlert[] = [
      ...production,
      ...printers,
      ...stock.map((alert): AppAlert => ({ ...alert, area: 'inventory' })),
    ];
    return all.sort(
      (a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical'),
    );
  }

  private async maintenanceAlerts(): Promise<AppAlert[]> {
    const printers = await this.printers.list();
    return printers.flatMap((p): AppAlert[] =>
      p.maintenanceDue && p.nextMaintenanceAt && p.status !== 'INACTIVE'
        ? [
            {
              kind: 'MAINTENANCE_DUE',
              area: 'printers',
              severity: p.maintenanceDue === 'overdue' ? 'critical' : 'warning',
              title: `Manutenção ${p.maintenanceDue === 'overdue' ? 'atrasada' : 'próxima'}: ${p.code}`,
              detail: `Prevista para ${formatDate(p.nextMaintenanceAt)}`,
              link: `/impressoras/${p.id}`,
            },
          ]
        : [],
    );
  }

  private async productionAlerts(): Promise<AppAlert[]> {
    const today = todayInSaoPaulo();
    const overdue = await this.prisma.productionOrder.findMany({
      where: {
        status: { in: [...QUEUE_STATUSES] },
        dueDate: { lt: new Date(`${today}T00:00:00Z`) },
      },
      select: {
        id: true,
        code: true,
        dueDate: true,
        variant: { select: { product: { select: { name: true } } } },
      },
      orderBy: { dueDate: 'asc' },
      take: 20,
    });
    return overdue.map((order) => ({
      kind: 'PRODUCTION_OVERDUE',
      area: 'production',
      severity: 'critical',
      title: `Ordem atrasada: ${order.code}`,
      detail: `${order.variant.product.name} — prazo ${order.dueDate ? formatDate(order.dueDate.toISOString().slice(0, 10)) : ''}`,
      link: `/producao/ordens/${order.id}`,
    }));
  }
}
