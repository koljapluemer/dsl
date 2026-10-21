import { describe, expect, it } from 'vitest';
import { isMode, resolveMode } from './mode';

describe('resolveMode', () => {
  it('takes the wanted mode when enabled', () => {
    expect(resolveMode(['edit', 'view', 'split'], 'split', 'view')).toBe('split');
  });

  it('falls back when the wanted (e.g. a stored) mode is disabled here', () => {
    expect(resolveMode(['view', 'edit'], 'split', 'view')).toBe('view');
    expect(resolveMode(['edit'], 'view', 'view')).toBe('edit');
    expect(resolveMode(['view', 'edit'], undefined, 'edit')).toBe('edit');
  });

  it('recognises stored values', () => {
    expect([isMode('edit'), isMode('nope'), isMode(null)]).toEqual([true, false, false]);
  });
});
