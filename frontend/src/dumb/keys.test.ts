import { describe, expect, it } from 'vitest';
import { resolve, shortcutAllowed, type Bindings } from './keys';

const target = (typing: boolean) => ({ closest: () => (typing ? {} : null) }) as unknown as EventTarget;
const key = (over: object = {}) => ({
  key: 'n', ctrlKey: false, altKey: false, metaKey: false, isComposing: false, defaultPrevented: false, target: target(false), ...over,
});
const root = (modal: boolean) => ({ querySelector: () => (modal ? {} : null) }) as unknown as ParentNode;

describe('shortcutAllowed', () => {
  it('takes a plain key outside fields', () => expect(shortcutAllowed(key(), root(false))).toBe(true));
  it('ignores keys while typing', () => expect(shortcutAllowed(key({ target: target(true) }), root(false))).toBe(false));
  it('ignores Ctrl, Alt and Meta', () => {
    for (const m of ['ctrlKey', 'altKey', 'metaKey']) expect(shortcutAllowed(key({ [m]: true }), root(false))).toBe(false);
  });
  it('ignores keys under a modal', () => expect(shortcutAllowed(key(), root(true))).toBe(false));
  it('ignores handled keys', () => expect(shortcutAllowed(key({ defaultPrevented: true }), root(false))).toBe(false));
});

describe('resolve', () => {
  const next = () => {};
  const notes = () => {};
  const maps: Bindings[] = [{ n: next }, { 'g n': notes }];
  it('runs a plain binding', () => expect(resolve(maps, 'n', null)).toBe(next));
  it('starts a chord', () => expect(resolve(maps, 'g', null)).toBe('prefix'));
  it('completes a chord before a plain binding', () => expect(resolve(maps, 'n', 'g')).toBe(notes));
  it('falls back to the plain binding after an unknown chord', () => expect(resolve([{ n: next }], 'n', 'g')).toBe(next));
  it('ignores unbound keys', () => expect(resolve(maps, 'x', null)).toBe(null));
});
