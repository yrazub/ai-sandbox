import { describe, expect, it } from 'vitest';
import { createQueryClient } from './query-client';

describe('createQueryClient', () => {
  it('keeps the global defaults: no retry and no focus refetch (R-WEB-20)', () => {
    expect(createQueryClient().getDefaultOptions()).toEqual({
      queries: { retry: false, refetchOnWindowFocus: false },
    });
  });
});
