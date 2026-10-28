import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { ExportKey, LlmInfo, Maintenance, Settings, TheaSettings } from '@/api/types';

export const settingsQuery = queryOptions({ queryKey: ['settings'], queryFn: () => api<Settings>('GET', '/api/settings') });

export const llmQuery = queryOptions({ queryKey: ['llm'], queryFn: () => api<LlmInfo>('GET', '/api/llm') });

export const maintenanceQuery = queryOptions({
  queryKey: ['maintenance'], queryFn: () => api<Maintenance>('GET', '/api/maintenance'),
});

/** Runs a Settings → maintenance cleanup; it deletes items or files, so everything is refetched. */
export async function runMaintenance(qc: QueryClient, action: 'past-appointments' | 'orphaned-files') {
  await api('POST', `/api/maintenance/${action}`);
  await qc.invalidateQueries();
}

/** `path` is the data directory, `llm.url` the Ollama server (empty for the default), `thea` how viz blocks are generated, `exports` an export's target paths. */
export async function saveSettings(qc: QueryClient, body: { path: string } | { llm: { url: string } } | { thea: TheaSettings } | { exports: Partial<Record<ExportKey, string[]>> }) {
  await api('PUT', '/api/settings', body);
  // a new data directory means other items, a new server maybe other models
  await qc.invalidateQueries();
}
