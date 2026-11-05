import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from './health.api';

export const healthQueryKey = ['system', 'health'] as const;

export function useHealth() {
  return useQuery({
    queryKey: healthQueryKey,
    queryFn: fetchHealth,
    refetchInterval: 15_000,
    retry: false,
  });
}
