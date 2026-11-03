import { focusManager, QueryClient } from '@tanstack/react-query';

// TanStack v5 listens to `visibilitychange` only; returning to the window from another app
// fires `focus` without it, so the usage footer would stay stale.
function listenToWindowFocus(): void {
  focusManager.setEventListener((handleFocus) => {
    if (typeof window === 'undefined') return undefined;
    const listener = () => handleFocus();
    window.addEventListener('visibilitychange', listener);
    window.addEventListener('focus', listener);
    return () => {
      window.removeEventListener('visibilitychange', listener);
      window.removeEventListener('focus', listener);
    };
  });
}

export function createQueryClient(): QueryClient {
  listenToWindowFocus();
  return new QueryClient({
    // The page offers its own Retry button, so a failed load shows at once.
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}
