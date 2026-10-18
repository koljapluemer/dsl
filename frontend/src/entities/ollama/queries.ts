import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Pull, QuestionModel, SemanticStatus } from '@/api/types';

/** The Ollama models the app uses: one for semantic search, one for picking questions. */
export type ModelKind = 'semantic' | 'questions';

/** Background embedding progress and this session's download of its model. */
export const semanticStatusQuery = queryOptions({
  queryKey: ['ollama', 'semantic'],
  queryFn: () => api<SemanticStatus>('GET', '/api/semantic'),
});

/** Whether the questions' model is installed, and this session's download of it. */
export const questionModelQuery = queryOptions({
  queryKey: ['ollama', 'questions'],
  queryFn: () => api<QuestionModel>('GET', '/api/questions/model'),
});

/** Either model's status (the query above for it), as far as its download goes. */
export const modelQuery = (kind: ModelKind) => queryOptions({
  queryKey: ['ollama', kind],
  queryFn: () => api<{ pull: Pull | null }>('GET', kind === 'semantic' ? '/api/semantic' : '/api/questions/model'),
});

/** Starts downloading the model; returns the same status as its query. */
export const pullModel = (kind: ModelKind) =>
  api<{ pull: Pull | null }>('POST', kind === 'semantic' ? '/api/semantic/model/pull' : '/api/questions/model/pull');

export const pullRunning = (p: Pull | null | undefined) => !!p && !p.error && p.status !== 'success';
