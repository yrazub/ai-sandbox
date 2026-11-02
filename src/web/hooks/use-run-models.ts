import { useMutation } from '@tanstack/react-query';
import { postRun } from '../lib/api-client';

export function useRunModels() {
  return useMutation({ mutationFn: postRun });
}
