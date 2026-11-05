import type {
  ApiSuccess,
  AuditLogEntry,
  CreateUserInput,
  ListAuditLogsQuery,
  ListUsersQuery,
  PasswordResetLink,
  RoleInput,
  RoleSummary,
  UpdateUserInput,
  UserSummary,
} from '@alipe3d/shared';
import { api, request, requestPage, toApiRequestError } from '@/services/api';
import { cleanParams } from '@/utils/params';

export const usersApi = {
  list: (query: ListUsersQuery) =>
    requestPage(api.get<ApiSuccess<UserSummary[]>>('/users', { params: cleanParams(query) })),
  create: (input: CreateUserInput) => request(api.post<ApiSuccess<UserSummary>>('/users', input)),
  update: (id: string, input: UpdateUserInput) =>
    request(api.put<ApiSuccess<UserSummary>>(`/users/${id}`, input)),
  setStatus: (id: string, isActive: boolean) =>
    request(api.patch<ApiSuccess<UserSummary>>(`/users/${id}/status`, { isActive })),
  resetLink: (id: string) =>
    request(api.post<ApiSuccess<PasswordResetLink>>(`/users/${id}/reset-link`)),
};

export const rolesApi = {
  list: () => request(api.get<ApiSuccess<RoleSummary[]>>('/roles')),
  create: (input: RoleInput) => request(api.post<ApiSuccess<RoleSummary>>('/roles', input)),
  update: (id: string, input: RoleInput) =>
    request(api.put<ApiSuccess<RoleSummary>>(`/roles/${id}`, input)),
  remove: async (id: string): Promise<void> => {
    try {
      await api.delete(`/roles/${id}`);
    } catch (error) {
      throw toApiRequestError(error);
    }
  },
};

export const auditApi = {
  list: (query: ListAuditLogsQuery) =>
    requestPage(
      api.get<ApiSuccess<AuditLogEntry[]>>('/audit-logs', { params: cleanParams(query) }),
    ),
};

export const queryKeys = {
  users: (query?: ListUsersQuery) => ['users', query] as const,
  roles: ['roles'] as const,
  audit: (query?: ListAuditLogsQuery) => ['audit', query] as const,
};
