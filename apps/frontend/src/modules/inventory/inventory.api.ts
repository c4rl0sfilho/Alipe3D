import type {
  ApiSuccess,
  CreateRollInput,
  ListMovementsQuery,
  ListRollsQuery,
  ListStockItemsQuery,
  MaterialInput,
  MaterialSummary,
  MovementEntry,
  RegisterMovementInput,
  RollSummary,
  StockAlert,
  StockItemSummary,
  SupplierInput,
  SupplierSummary,
  SupplyInput,
  UpdateRollInput,
  WeighRollInput,
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

export const suppliersApi = {
  list: () => request(api.get<ApiSuccess<SupplierSummary[]>>('/suppliers')),
  create: (input: SupplierInput) =>
    request(api.post<ApiSuccess<SupplierSummary>>('/suppliers', input)),
  update: (id: string, input: SupplierInput) =>
    request(api.put<ApiSuccess<SupplierSummary>>(`/suppliers/${id}`, input)),
  remove: (id: string) => noContent(api.delete(`/suppliers/${id}`)),
};

export const materialsApi = {
  list: () => request(api.get<ApiSuccess<MaterialSummary[]>>('/materials')),
  create: (input: MaterialInput) =>
    request(api.post<ApiSuccess<{ id: string }>>('/materials', input)),
  update: (id: string, input: MaterialInput) =>
    request(api.put<ApiSuccess<{ id: string }>>(`/materials/${id}`, input)),
  remove: (id: string) => noContent(api.delete(`/materials/${id}`)),

  listRolls: (query: ListRollsQuery) =>
    requestPage(
      api.get<ApiSuccess<RollSummary[]>>('/materials/rolls', { params: cleanParams(query) }),
    ),
  createRolls: (input: CreateRollInput) =>
    request(api.post<ApiSuccess<RollSummary[]>>('/materials/rolls', input)),
  updateRoll: (id: string, input: UpdateRollInput) =>
    request(api.put<ApiSuccess<RollSummary>>(`/materials/rolls/${id}`, input)),
  weighRoll: (id: string, input: WeighRollInput) =>
    request(
      api.post<ApiSuccess<{ changed: boolean; difference: string; remainingWeightGrams: string }>>(
        `/materials/rolls/${id}/weigh`,
        input,
      ),
    ),
};

export const stockApi = {
  alerts: () => request(api.get<ApiSuccess<StockAlert[]>>('/inventory/alerts')),
  listItems: (query: ListStockItemsQuery) =>
    requestPage(
      api.get<ApiSuccess<StockItemSummary[]>>('/inventory/items', { params: cleanParams(query) }),
    ),
  createSupply: (input: SupplyInput) =>
    request(api.post<ApiSuccess<StockItemSummary>>('/inventory/supplies', input)),
  updateSupply: (id: string, input: SupplyInput) =>
    request(api.put<ApiSuccess<StockItemSummary>>(`/inventory/supplies/${id}`, input)),
  removeSupply: (id: string) => noContent(api.delete(`/inventory/supplies/${id}`)),

  listMovements: (query: ListMovementsQuery) =>
    requestPage(
      api.get<ApiSuccess<MovementEntry[]>>('/inventory/movements', {
        params: cleanParams(query),
      }),
    ),
  registerMovement: (input: RegisterMovementInput) =>
    request(
      api.post<ApiSuccess<{ id: string; balanceAfter: string }>>('/inventory/movements', input),
    ),
};

export const inventoryKeys = {
  all: ['inventory'] as const,
  alerts: ['inventory', 'alerts'] as const,
  suppliers: ['inventory', 'suppliers'] as const,
  materials: ['inventory', 'materials'] as const,
  rolls: (query?: ListRollsQuery) => ['inventory', 'rolls', query] as const,
  items: (query?: ListStockItemsQuery) => ['inventory', 'items', query] as const,
  movements: (query?: ListMovementsQuery) => ['inventory', 'movements', query] as const,
};
