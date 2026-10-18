import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { LlmInfo, Settings } from '@/api/types';

export const settingsQuery = queryOptions({ queryKey: ['settings'], queryFn: () => api<Settings>('GET', '/api/settings') });

export const llmQuery = queryOptions({ queryKey: ['llm'], queryFn: () => api<LlmInfo>('GET', '/api/llm') });

/** `path` is the data directory, `llm.url` the Ollama server (empty for the default), `bibtex` the .bib export paths. */
export async function saveSettings(qc: QueryClient, body: { path: string } | { llm: { url: string } } | { bibtex: string[] }) {
  await api('PUT', '/api/settings', body);
  // a new data directory means other items, a new server maybe other models
  await qc.invalidateQueries();
}
