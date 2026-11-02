import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// AC-11: tests never reach the network. A test that needs fetch must stub it.
beforeEach(() => {
  globalThis.fetch = () => Promise.reject(new Error('Network access is blocked in tests'));
});
