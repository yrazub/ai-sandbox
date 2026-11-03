import { useQuery } from '@tanstack/react-query';
import { fetchUsage } from '../lib/api-client';
import type { UsageResponse } from '../../shared/contracts';

export const usageQueryKey = ['usage'] as const;

export function useUsage(): { usage: UsageResponse | undefined; failed: boolean } {
  const query = useQuery({ queryKey: usageQueryKey, queryFn: fetchUsage });
  // TanStack clears `error` when a fetch starts with no data, so a retry after a failed
  // first load would flash "loading"; the error count keeps the footer on "unavailable".
  const failed = query.isError || (query.data === undefined && query.errorUpdateCount > 0);
  return { usage: query.data, failed };
}
