import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Projects } from '@/api/types';

/** Every project with its issues; under `items`, so writes and undo refetch it. */
export const projectsQuery = queryOptions({ queryKey: ['items', 'projects'], queryFn: () => api<Projects>('GET', '/api/projects') });

export const NEW_PROJECT = '\nproject\n';

/** A new issue's text, belonging to the project `file`; its first line is left for the heading. */
export const newIssue = (file: string) => `\nissue\n-> project @${file.replace(/\.txt$/, '')}\n`;

/** An issue to think about (and sketch) rather than build; keep in line with views.THINK_TAG. */
export const THINK_TAG = 'suggest-think-and-sketch';
