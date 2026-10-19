import { queryOptions } from '@tanstack/react-query';
import { api, enc } from '@/api/client';
import type { Projects } from '@/api/types';

/** Every project with its issues; under `items`, so writes and undo refetch it. */
export const projectsQuery = queryOptions({ queryKey: ['items', 'projects'], queryFn: () => api<Projects>('GET', '/api/projects') });

export const NEW_PROJECT = '\nproject\n';

/** A new issue's text, belonging to the project `file`; its first line is left for the heading. */
export const newIssue = (file: string) => `\nissue\n-> project @${file.replace(/\.txt$/, '')}\n`;

/** Marks the issue `file` as one to think about rather than build, or back. */
export const setThink = (file: string, think: boolean) => api<null>('PUT', `/api/projects/think/${enc(file)}`, { think });
