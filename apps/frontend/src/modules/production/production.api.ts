import type {
  ApiSuccess,
  AppAlert,
  CancelProductionOrderInput,
  FinishPrintJobInput,
  InspectionInput,
  ListPrintJobsQuery,
  ListProductionOrdersQuery,
  PrintJobEntry,
  ProductionOrderDetail,
  ProductionOrderInput,
  FinishPrintJobResult,
  ProductionOrderSummary,
  StartPrintJobInput,
  UserOption,
} from '@alipe3d/shared';
import { useQueryClient } from '@tanstack/react-query';
import { api, request, requestPage } from '@/services/api';
import { cleanParams } from '@/utils/params';

export const productionApi = {
  listOrders: (query: ListProductionOrdersQuery) =>
    requestPage(
      api.get<ApiSuccess<ProductionOrderSummary[]>>('/production/orders', {
        params: cleanParams(query),
      }),
    ),
  getOrder: (id: string) =>
    request(api.get<ApiSuccess<ProductionOrderDetail>>(`/production/orders/${id}`)),
  createOrder: (input: ProductionOrderInput) =>
    request(api.post<ApiSuccess<ProductionOrderDetail>>('/production/orders', input)),
  updateOrder: (id: string, input: ProductionOrderInput) =>
    request(api.put<ApiSuccess<ProductionOrderDetail>>(`/production/orders/${id}`, input)),
  cancelOrder: (id: string, input: CancelProductionOrderInput) =>
    request(api.post<ApiSuccess<ProductionOrderDetail>>(`/production/orders/${id}/cancel`, input)),
  closeOrder: (id: string, input: CancelProductionOrderInput) =>
    request(api.post<ApiSuccess<ProductionOrderDetail>>(`/production/orders/${id}/close`, input)),
  startInspection: (id: string) =>
    request(
      api.post<ApiSuccess<ProductionOrderDetail>>(`/production/orders/${id}/start-inspection`),
    ),
  inspect: (id: string, input: InspectionInput) =>
    request(
      api.post<ApiSuccess<ProductionOrderDetail>>(`/production/orders/${id}/inspections`, input),
    ),
  responsibles: () => request(api.get<ApiSuccess<UserOption[]>>('/production/responsibles')),

  startJob: (orderId: string, input: StartPrintJobInput) =>
    request(api.post<ApiSuccess<{ id: string }>>(`/production/orders/${orderId}/jobs`, input)),
  listJobs: (query: ListPrintJobsQuery) =>
    requestPage(
      api.get<ApiSuccess<PrintJobEntry[]>>('/production/jobs', { params: cleanParams(query) }),
    ),
  pauseJob: (id: string) =>
    request(api.post<ApiSuccess<{ id: string }>>(`/production/jobs/${id}/pause`)),
  resumeJob: (id: string) =>
    request(api.post<ApiSuccess<{ id: string }>>(`/production/jobs/${id}/resume`)),
  finishJob: (id: string, input: FinishPrintJobInput) =>
    request(api.post<ApiSuccess<FinishPrintJobResult>>(`/production/jobs/${id}/finish`, input)),
};

export const alertsApi = {
  list: () => request(api.get<ApiSuccess<AppAlert[]>>('/alerts')),
};

export const productionKeys = {
  all: ['production'] as const,
  orders: (query?: ListProductionOrdersQuery) => ['production', 'orders', query] as const,
  order: (id: string) => ['production', 'order', id] as const,
  jobs: (query?: ListPrintJobsQuery) => ['production', 'jobs', query] as const,
  responsibles: ['production', 'responsibles'] as const,
  alerts: ['alerts'] as const,
};

/**
 * Depois de qualquer operação de produção, recarrega o que depende dela:
 * ordens, impressoras (situação e horas), estoque (rolos e produtos acabados) e alertas.
 */
export function useInvalidateProduction() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all(
      ['production', 'printers', 'inventory', 'alerts', 'products', 'product'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
  };
}
