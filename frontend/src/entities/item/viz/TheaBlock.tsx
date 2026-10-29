import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, TriangleAlert, WandSparkles } from 'lucide-react';
import { showError } from '@/dumb/notice';
import { theaId, type TheaBlock as Block } from '../dsl/thea';
import { generateViz, theaBuiltQuery, theaMetaQuery, theaStatusQuery, useTheaJobs, setVizVersion, vizThumbUrl, vizViewUrl } from './queries';

type Props = {
  /** the block as parsed from the note's text; undefined when the renderer found a fence the parser doesn't count (in a list, say) */
  block: Block | undefined;
  /** the fence's code, shown when there's no block */
  code: string;
  /** the note; '' for one not written yet */
  file: string;
  /** a thumbnail only: graph nodes, canvas cards, lists */
  compact?: boolean;
  /** the note shown differs from the one written: generating is off until it's saved */
  dirty?: boolean;
};

const DEFAULT_HEIGHT = 160;

/** A ```thea block: its generated viz, live or as its thumbnail, with what generates it (docs/thea.md). */
export function TheaBlock({ block, code, file, compact = false, dirty = false }: Props) {
  const id = block ? theaId(block) : null;
  if (!block) return <pre><code>{code}</code></pre>;
  if (compact) {
    return id
      ? <img className="not-prose my-1 block max-w-full rounded" src={vizThumbUrl(id)} alt={block.spec.split('\n')[0]} loading="lazy" />
      : <pre className="not-prose my-1 text-xs opacity-60"><code>{block.spec}</code></pre>;
  }
  return <LiveBlock block={block} id={id} file={file} dirty={dirty} />;
}

function LiveBlock({ block, id, file, dirty }: { block: Block; id: string | null; file: string; dirty: boolean }) {
  const qc = useQueryClient();
  const status = useQuery(theaStatusQuery).data;
  const meta = useQuery({ ...theaMetaQuery(id ?? ''), enabled: !!id }).data;
  const built = useQuery({ ...theaBuiltQuery(id ?? ''), enabled: !!id }).data;
  const job = useTheaJobs().find((j) => j.name === block.name && j.file === file);
  const busy = job?.state === 'queued' || job?.state === 'running';
  const [errors, setErrors] = useState<string[]>([]);
  const stale = !!meta && meta.spec !== block.spec;
  // the version the last run made isn't the one the note names: a save from before it overwrote the header
  const lost = job?.state === 'done' && job.id && job.id !== id ? job.id : null;

  const why = !file ? 'write the note first'
    : dirty ? 'save the note first'
    : !block.spec ? 'write a spec first'
    : status && !status.available ? `unavailable: ${status.reason}`
    : null;

  async function generate() {
    try {
      await generateViz(qc, file, block.index, errors);
      setErrors([]);
    } catch (e) { showError(e); }
  }

  async function use(made: string) {
    try { await setVizVersion(qc, file, block.index, made); } catch (e) { showError(e); }
  }

  const Icon = id ? RefreshCw : WandSparkles;
  const title = why ?? (busy ? job.step : stale ? 'the spec changed since: regenerate' : id ? 'regenerate' : 'generate');
  return (
    <div className="not-prose my-2">
      <div className="mb-1 flex min-h-6 flex-wrap items-center gap-1 text-xs">
        <button type="button" className={`btn btn-xs btn-square ${stale ? 'btn-warning' : 'btn-ghost'}`} title={title}
                disabled={!!why || busy} onClick={() => void generate()}>
          {busy ? <span className="loading loading-spinner loading-xs" /> : <Icon size={14} />}
        </button>
        {block.name && <span className="font-mono opacity-60">{block.name}{block.version ? `-${block.version}` : ''}</span>}
        {busy && <span className="truncate opacity-70">{job.step}…</span>}
        {stale && !busy && <span className="badge badge-warning badge-xs">spec changed</span>}
        {errors.length > 0 && (
          <span className="flex items-center gap-1 text-error" title={errors.join('\n')}><TriangleAlert size={12} />{errors.length} runtime error{errors.length > 1 ? 's' : ''}</span>
        )}
      </div>
      {job?.state === 'failed' && !busy && (
        <div role="alert" className="alert alert-error alert-soft mb-1 block p-2 text-xs">
          <p className="font-semibold">The last generation failed{job.finished ? ` (${new Date(job.finished * 1000).toLocaleString()})` : ''}</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap">{job.error}</pre>
        </div>
      )}
      {lost && !busy && (
        <div role="alert" className="alert alert-warning alert-soft mb-1 flex flex-wrap p-2 text-xs">
          <span className="flex-1">The last run made <span className="font-mono">{lost}</span>, but a save since set the note back to {id ? <span className="font-mono">{id}</span> : 'no version'}.</span>
          <button type="button" className="btn btn-xs" disabled={!!why} title={why ?? undefined} onClick={() => void use(lost)}>Use {lost}</button>
        </div>
      )}
      {id && built === false && <img className="block max-w-full rounded" src={vizThumbUrl(id)} alt="" />}
      {id && built !== false && <VizFrame id={id} setErrors={setErrors} />}
      {!id && !busy && <p className="text-xs opacity-60">not generated yet</p>}
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer opacity-60">spec</summary>
        <pre className="whitespace-pre-wrap">{block.spec}</pre>
      </details>
    </div>
  );
}

/** The version's built page in a sandboxed iframe (an opaque origin, no network), as high as its content. */
function VizFrame({ id, setErrors }: { id: string; setErrors: Dispatch<SetStateAction<string[]>> }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  useEffect(() => {
    const report = (message: string) => setErrors((es) => (es.length < 10 && !es.includes(message) ? [...es, message] : es));
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.source !== 'thea') return;
      if (event.data.type === 'resize' && typeof event.data.height === 'number') setHeight(Math.max(event.data.height, 40));
      if (event.data.type === 'error') report(String(event.data.message).slice(0, 500));
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [setErrors]);
  return <iframe ref={frame} key={id} src={vizViewUrl(id)} sandbox="allow-scripts" title={id} className="block w-full border-0" style={{ height }} />;
}
