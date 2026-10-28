import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@/api/client';
import type { TheaJob, TheaMeta, TheaStatus } from '@/api/types';
import { showError } from '@/dumb/notice';
import { fileUrl } from '../files/files';

/** A viz version's folder in the data folder (see docs/thea.md). */
export const vizPath = (id: string, file: string) => `files/thea/${id}/${file}`;
export const vizViewUrl = (id: string) => `/api/thea/${encodeURIComponent(id)}/view`;
export const vizThumbUrl = (id: string) => fileUrl(vizPath(id, 'thumb.webp'));

export const theaStatusQuery = queryOptions({
  queryKey: ['thea', 'status'], queryFn: () => api<TheaStatus>('GET', '/api/thea/status'), staleTime: 60_000,
});

export const theaMetaQuery = (id: string) => queryOptions({
  queryKey: ['thea', 'meta', id],
  queryFn: async () => {
    const res = await fetch(fileUrl(vizPath(id, 'thea.json')));
    return res.ok ? (await res.json() as TheaMeta) : null;
  },
  staleTime: Infinity,
});

/** Whether the version's built page is there (it isn't when only the thumbnail was synced, say). */
export const theaBuiltQuery = (id: string) => queryOptions({
  queryKey: ['thea', 'built', id],
  queryFn: async () => (await fetch(vizViewUrl(id), { method: 'HEAD' })).ok,
  staleTime: Infinity,
});

const theaJobsQuery = queryOptions({ queryKey: ['thea', 'jobs'], queryFn: () => api<TheaJob[]>('GET', '/api/thea/jobs') });

/** The states seen of each job, so a job finishing is acted on once however many blocks watch it. */
const seen = new Map<string, TheaJob['state']>();

/** Everything a finished job may have changed (the note's header, lists' covers), but the viz queries themselves. */
const vizChanged = (qc: QueryClient) => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'thea' });

/** The generation jobs, polled while one is queued or running; a finished one refreshes the notes, a failed one shows its error. */
export function useTheaJobs() {
  const qc = useQueryClient();
  const { data } = useQuery({
    ...theaJobsQuery,
    refetchInterval: (q) => (q.state.data?.some((j) => j.state === 'queued' || j.state === 'running') ? 1000 : false),
  });
  useEffect(() => {
    let finished = false;
    for (const job of data ?? []) {
      const before = seen.get(job.name + job.started);
      seen.set(job.name + job.started, job.state);
      if ((before === 'queued' || before === 'running') && (job.state === 'done' || job.state === 'failed')) {
        finished = true;
        if (job.state === 'failed') showError(`${job.name}: ${job.error?.split('\n')[0] ?? 'failed'}`);
      }
    }
    if (finished) void vizChanged(qc);
  }, [data, qc]);
  return data ?? [];
}

/** Queues generating the note's `index`th viz block, as saved; `errors` are what the live viz reported. */
export async function generateViz(qc: QueryClient, file: string, index: number, errors: string[]) {
  const job = await api<TheaJob>('POST', '/api/thea/generate', { file, index, errors });
  seen.set(job.name + job.started, job.state);
  // the block may have been given its name
  await Promise.all([qc.invalidateQueries({ queryKey: theaJobsQuery.queryKey }), vizChanged(qc)]);
  return job;
}
