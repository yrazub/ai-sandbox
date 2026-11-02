import { useMutation } from '@tanstack/react-query';
import type { RunRequest, RunResult } from '../../shared/contracts';
import { postRun } from '../lib/api-client';

interface Options {
  /** Called once per successful run, with the results and the request that produced them. */
  onSuccess?: (results: RunResult[], request: RunRequest) => void;
}

export function useRunModels({ onSuccess }: Options = {}) {
  return useMutation({
    mutationFn: postRun,
    onSuccess: (results, request) => onSuccess?.(results, request),
  });
}
