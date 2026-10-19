import { queryOptions } from '@tanstack/react-query';
import { api, enc } from '@/api/client';
import type { Answered, NextNote, QuestionPick } from '@/api/types';

/** A random loosely-linked note (see questions.py), not one of `exclude`. */
export const nextNote = (exclude: string[]) => api<NextNote>('GET', `/api/questions/next?${new URLSearchParams({ exclude: exclude.join(',') })}`);

/** The questions to ask about the note. */
export const pickQuery = (file: string) => queryOptions({
  queryKey: ['questions', 'pick', file],
  queryFn: () => api<QuestionPick>('GET', `/api/questions/pick/${enc(file)}`),
  staleTime: Infinity,
});

/** Links the note to `target` (a file) or to a new note with `text`, answering question `qid`. */
export const answer = (file: string, qid: string, how: { target: string } | { text: string }) =>
  api<Answered>('POST', `/api/questions/answer/${enc(file)}`, { qid, ...how });

/** Tags the note so it's never asked about again. */
export const disable = (file: string) => api<null>('POST', `/api/questions/disable/${enc(file)}`);
