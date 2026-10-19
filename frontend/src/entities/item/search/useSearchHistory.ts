import { useCallback, useEffect, useState } from 'react';

const MAX_ENTRIES = 20;

/** Storage can be unavailable or hold garbage; either way history just starts empty. */
function readHistory(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function writeHistory(key: string, history: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(history));
  } catch {
    // A lost history entry isn't worth surfacing.
  }
}

/** The queries acted on (a result opened), most recent first, no duplicates; kept in local storage under `key`, none without. */
export function useSearchHistory(key: string | undefined) {
  const [history, setHistory] = useState<string[]>(() => (key ? readHistory(key) : []));

  useEffect(() => { if (key) writeHistory(key, history); }, [key, history]);

  const record = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!key || !trimmed) return;
    setHistory((current) => [trimmed, ...current.filter((entry) => entry !== trimmed)].slice(0, MAX_ENTRIES));
  }, [key]);

  return { history, record };
}
