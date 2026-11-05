import { healthStatusSchema, type ApiSuccess, type HealthStatus } from '@alipe3d/shared';
import { api, toApiRequestError } from '@/services/api';

export async function fetchHealth(): Promise<HealthStatus> {
  try {
    // validateStatus aceita 503: o corpo ainda traz o diagnóstico de cada serviço
    const response = await api.get<ApiSuccess<HealthStatus>>('/health', {
      validateStatus: (status) => status === 200 || status === 503,
    });
    return healthStatusSchema.parse(response.data.data);
  } catch (error) {
    throw toApiRequestError(error);
  }
}
