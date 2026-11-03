import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

// AC-11: tests never reach the network. A test that needs fetch must stub it.
// History lives in localStorage, so each test starts with it empty (node tests have none).
beforeEach(() => {
  globalThis.fetch = () => Promise.reject(new Error('Network access is blocked in tests'));
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
