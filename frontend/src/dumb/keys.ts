import { useEffect, useRef } from 'react';

/** Ctrl/⌘+Enter: commit what's being edited and close it. */
export const isSubmit = (e: { key: string; ctrlKey: boolean; metaKey: boolean }) => e.key === 'Enter' && (e.ctrlKey || e.metaKey);

/** `e.key` values ('n', 'N', '?', 'ArrowLeft'), or two of them separated by a space for a chord ('g n'). */
export type Bindings = Record<string, () => void>;

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'isComposing' | 'defaultPrevented' | 'target'>;

const TYPING = 'input, textarea, select, [contenteditable], .cm-editor';
const CHORD_MS = 1000;

/** Whether a shortcut may take this key: not while typing, holding a modifier other than Shift, or with a modal open. */
export function shortcutAllowed(e: KeyLike, root: ParentNode = document) {
  if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return false;
  if ((e.target as Element | null)?.closest?.(TYPING)) return false;
  return !root.querySelector('.modal-open');
}

/** What `key` does among `maps`: completes the chord `started` began, runs a binding, starts a chord ('prefix'), or nothing. */
export function resolve(maps: Bindings[], key: string, started: string | null): (() => void) | 'prefix' | null {
  const chord = started && maps.find((m) => m[`${started} ${key}`])?.[`${started} ${key}`];
  if (chord) return chord;
  const plain = maps.find((m) => m[key])?.[key];
  if (plain) return plain;
  return maps.some((m) => Object.keys(m).some((k) => k.startsWith(key + ' '))) ? 'prefix' : null;
}

const registered = new Set<{ current: Bindings }>();
let pending: { key: string; at: number } | null = null;

function onKey(e: KeyboardEvent) {
  if (e.key === 'Shift' || !shortcutAllowed(e)) return;
  const started = pending && e.timeStamp - pending.at < CHORD_MS ? pending.key : null;
  pending = null;
  const hit = resolve([...registered].map((r) => r.current), e.key, started);
  if (hit === 'prefix') pending = { key: e.key, at: e.timeStamp };
  else if (hit) {
    e.preventDefault();
    hit();
  }
}

/** Page-wide single-key shortcuts while mounted (and `enabled`); see `shortcutAllowed` for when they're ignored. */
export function useHotkeys(bindings: Bindings, enabled = true) {
  const current = useRef(bindings);
  useEffect(() => { current.current = bindings; });
  useEffect(() => {
    if (!enabled) return;
    if (!registered.size) document.addEventListener('keydown', onKey);
    registered.add(current);
    return () => {
      registered.delete(current);
      if (!registered.size) document.removeEventListener('keydown', onKey);
    };
  }, [enabled]);
}

/** Escape leaves a filter field, so the page's shortcuts work again. */
export const blurOnEscape = (e: { key: string; currentTarget: HTMLElement }) => { if (e.key === 'Escape') e.currentTarget.blur(); };

/** A ref for the page's filter or search field, which `/` focuses. */
export function useSlashFocus() {
  const input = useRef<HTMLInputElement>(null);
  useHotkeys({ '/': () => input.current?.focus() });
  return input;
}
