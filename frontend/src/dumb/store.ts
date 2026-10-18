import { useSyncExternalStore } from 'react';

/** A value outside React that components can subscribe to. */
export function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((l) => l());
    },
    use: () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => value),
  };
}
