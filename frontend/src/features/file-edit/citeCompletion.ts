import { autocompletion, type CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import type { QueryClient } from '@tanstack/react-query';
import { citeTransaction, rankSources } from '@/entities/source/cite';
import { authors, year } from '@/entities/source/format';
import { citeSourcesQuery, matches, sourcesQuery } from '@/entities/source/queries';

const LIMIT = 20;

/**
 * Autocompletes sources after `@` (not after a word character, so not in an
 * email address): by key, title, date or name, those of `note` (related, on its
 * canvas) first. Choosing one cites it (see citeTransaction).
 */
export const citeCompletion = (qc: QueryClient, note: string) => autocompletion({
  override: [async (context): Promise<CompletionResult | null> => {
    const before = context.matchBefore(/(?<![\w@])@[\p{L}\p{N}_\-.:]*/u);
    if (!before) return null;
    // cached between keystrokes, refreshed in the background once stale
    const [sources, preferred] = await Promise.all([
      qc.ensureQueryData({ ...sourcesQuery, revalidateIfStale: true }),
      qc.ensureQueryData({ ...citeSourcesQuery(note), revalidateIfStale: true }),
    ]);
    const query = before.text.slice(1);
    const found = rankSources(sources.filter((s) => matches(s.fields, query)), preferred).slice(0, LIMIT);
    if (!found.length) return null;
    return {
      from: before.from,
      filter: false,
      options: found.map(({ fields }) => ({
        label: `@${fields.key}`,
        detail: `${authors(fields)} ${year(fields)}`.trim(),
        info: fields.title,
        apply: (view: EditorView, _completion: unknown, from: number, to: number) => view.dispatch(citeTransaction(view.state, [fields.key], from, to)),
      })),
    };
  }],
});
