import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SemanticStatus } from '@/api/types';
import { semanticStatusQuery } from '@/entities/ollama/queries';
import { ModelDownload } from '@/features/model-download/ModelDownload';

/**
 * Why semantic search isn't (fully) ranking, following the background
 * embedding; ranks again once it's done, as the ranking covered only what was embedded then.
 */
export function SemanticNote({ status, ranking }: { status: SemanticStatus | null; ranking: boolean }) {
  const qc = useQueryClient();
  const polling = ranking && !!status?.embedding;
  const polled = useQuery({
    ...semanticStatusQuery,
    enabled: polling,
    refetchInterval: (query) => (query.state.data?.embedding ? 2000 : false),
  });
  const current = status && polling && polled.data ? { ...status, ...polled.data } : status;

  const embedding = current?.embedding;
  const wasEmbedding = useRef(false);
  useEffect(() => {
    if (wasEmbedding.current && embedding === false && ranking) void qc.invalidateQueries({ queryKey: ['search'] });
    wasEmbedding.current = !!embedding;
  }, [embedding, ranking, qc]);

  if (!ranking || !current) return null;
  const note = current.missing_model ? `${current.missing_model} isn't installed, searching by text.`
    : current.error ? `Semantic search unavailable, searching by text: ${current.error}`
    : current.indexed < current.total ? `Ranking the ${current.indexed} of ${current.total} notes embedded so far.`
    : '';
  if (!note) return null;
  return (
    <p className="mt-2 text-xs text-base-content/50">{note}
      {current.missing_model && (
        <ModelDownload kind="semantic" model={current.missing_model} onInstalled={() => qc.invalidateQueries({ queryKey: ['search'] })} />
      )}
    </p>
  );
}
