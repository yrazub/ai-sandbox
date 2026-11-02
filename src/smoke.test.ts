import { expect, it } from 'vitest';

it('runs on Node 26', () => {
  expect(process.versions.node.split('.')[0]).toBe('26');
});
