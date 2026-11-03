import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RunRequest, RunResult } from '../../shared/contracts';
import { postRun } from '../lib/api-client';
import { usageQueryKey } from './use-usage';

interface Options {
  /** Called once per successful run, with the results and the request that produced them. */
  onSuccess?: (results: RunResult[], request: RunRequest) => void;
}

export function useRunModels({ onSuccess }: Options = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postRun,
    onSuccess: (results, request) => onSuccess?.(results, request),
    // Not returned: the run must not stay pending until the usage refetch ends.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: usageQueryKey });
    },
  });
}
