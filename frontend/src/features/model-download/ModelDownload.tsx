import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { showError } from '@/dumb/errorBanner';
import { pullProgress } from '@/dumb/pullProgress';
import { modelQuery, pullModel, pullRunning, type ModelKind } from '@/entities/ollama/queries';

/** A button to download a missing model, then its progress; `onInstalled` once the download is done. */
export function ModelDownload({ kind, model, onInstalled }: { kind: ModelKind; model: string; onInstalled: () => void }) {
  const qc = useQueryClient();
  const query = modelQuery(kind);
  const { data } = useQuery({ ...query, refetchInterval: (q) => (pullRunning(q.state.data?.pull) ? 1000 : false) });
  const pull = data?.pull;

  // shown while the model is missing, so a finished download means it's installed now
  const fired = useRef(false);
  const installed = useRef(onInstalled);
  useEffect(() => { installed.current = onInstalled; });
  useEffect(() => {
    if (pull?.status !== 'success' || pull.error || fired.current) return;
    fired.current = true;
    installed.current();
  }, [pull]);

  async function download() {
    try {
      qc.setQueryData(query.queryKey, await pullModel(kind));
    } catch (e) { showError(e); }
  }

  const progress = pullProgress(pull);
  return (
    <>
      {(!pull || pull.error) && (
        <button className="btn btn-xs ml-1" onClick={download}><Download size={14} />Download {model}</button>
      )}
      {progress && <span className="ml-1">{progress}</span>}
    </>
  );
}
