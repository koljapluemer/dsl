import { useState } from 'react';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/**
 * State kept for the browser tab's session under `key` (across reloads and
 * remounts), or plain state without a key. Storage can be unavailable or hold
 * garbage; `valid` rejects what isn't usable, then it's `initial`.
 */
export function useSessionState<T>(key: string | undefined, initial: T, valid: (value: unknown) => boolean = () => true) {
  const [value, setValue] = useState<T>(() => {
    if (!key) return initial;
    const stored = read<unknown>(key, initial);
    return valid(stored) ? (stored as T) : initial;
  });
  const set = (next: T) => {
    setValue(next);
    if (key) try { sessionStorage.setItem(key, JSON.stringify(next)); } catch { /* not worth surfacing */ }
  };
  return [value, set] as const;
}
