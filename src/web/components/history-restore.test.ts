import { describe, expect, it } from 'vitest';
import type { ModelInfo } from '../../shared/contracts';
import { restoreSelection } from './history-restore';

const live = (...ids: string[]): ModelInfo[] =>
  ids.map((id) => ({ id, label: id, inputUsdPerMTok: 1, outputUsdPerMTok: 1 }));
const stored = [
  { id: 'b', label: 'B label' },
  { id: 'a', label: 'A label' },
  { id: 'c', label: 'C label' },
];

describe('restoreSelection', () => {
  it('selects every stored model in stored order when all are present', () => {
    expect(restoreSelection(stored, live('a', 'b', 'c'))).toEqual({
      selectedIds: ['b', 'a', 'c'],
      leftOut: [],
    });
  });
  it('leaves out a missing model and reports its stored label', () => {
    expect(restoreSelection(stored, live('a', 'c'))).toEqual({
      selectedIds: ['a', 'c'],
      leftOut: [{ id: 'b', label: 'B label' }],
    });
  });
  it('keeps every stored id when the list is not loaded', () => {
    expect(restoreSelection(stored, undefined)).toEqual({ selectedIds: ['b', 'a', 'c'], leftOut: [] });
  });
});
