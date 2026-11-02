import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('boots with no key and the default port', () => {
    expect(loadConfig({})).toEqual({ port: 4000, openRouterApiKey: undefined });
  });

  it('treats an empty key as missing', () => {
    expect(loadConfig({ OPENROUTER_API_KEY: '  ' }).openRouterApiKey).toBeUndefined();
  });

  it('reads the key and the port', () => {
    expect(loadConfig({ OPENROUTER_API_KEY: 'k', PORT: '4100' })).toEqual({
      port: 4100,
      openRouterApiKey: 'k',
    });
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow();
  });
});
