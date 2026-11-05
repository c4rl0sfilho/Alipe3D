import type {
  ApiSuccess,
  ListMaintenanceQuery,
  MaintenanceEntry,
  MaintenanceInput,
  PrinterInput,
  PrinterStatusInput,
  PrinterSummary,
} from '@alipe3d/shared';
import { api, request, requestPage, toApiRequestError } from '@/services/api';
import { cleanParams } from '@/utils/params';

async function noContent(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    throw toApiRequestError(error);
  }
}

export const printersApi = {
  list: () => request(api.get<ApiSuccess<PrinterSummary[]>>('/printers')),
  get: (id: string) => request(api.get<ApiSuccess<PrinterSummary>>(`/printers/${id}`)),
  create: (input: PrinterInput) =>
    request(api.post<ApiSuccess<PrinterSummary>>('/printers', input)),
  update: (id: string, input: PrinterInput) =>
    request(api.put<ApiSuccess<PrinterSummary>>(`/printers/${id}`, input)),
  setStatus: (id: string, input: PrinterStatusInput) =>
    request(api.patch<ApiSuccess<PrinterSummary>>(`/printers/${id}/status`, input)),
  remove: (id: string) => noContent(api.delete(`/printers/${id}`)),
};

export const maintenanceApi = {
  list: (query: ListMaintenanceQuery) =>
    requestPage(
      api.get<ApiSuccess<MaintenanceEntry[]>>('/maintenance', { params: cleanParams(query) }),
    ),
  create: (input: MaintenanceInput) =>
    request(api.post<ApiSuccess<MaintenanceEntry>>('/maintenance', input)),
  update: (id: string, input: MaintenanceInput) =>
    request(api.put<ApiSuccess<MaintenanceEntry>>(`/maintenance/${id}`, input)),
  remove: (id: string) => noContent(api.delete(`/maintenance/${id}`)),
};

export const printerKeys = {
  all: ['printers'] as const,
  list: ['printers', 'list'] as const,
  detail: (id: string) => ['printers', 'detail', id] as const,
  maintenance: (query: ListMaintenanceQuery) => ['printers', 'maintenance', query] as const,
};
