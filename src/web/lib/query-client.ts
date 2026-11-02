import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    // The page offers its own Retry button, so a failed load shows at once.
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}
