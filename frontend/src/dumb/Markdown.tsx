import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { markdown, slotted, type EmbedHtml } from './markdown';

/** What a fence kind renders as, given its info string, its code and its place among that kind's fences here. */
export type FenceRenderer = (info: string, code: string, index: number) => ReactNode;

type Props = {
  source: string; refs?: Record<string, string | null>; onRef?: (file: string) => void; className?: string;
  /** fenced code blocks rendered by the caller instead, by the first word of their info string */
  fences?: Record<string, FenceRenderer>;
  /** how `![[…]]` embeds render; without it they stay as written */
  embedHtml?: EmbedHtml;
};

export function Markdown({ source, refs, onRef, className = '', fences, embedHtml }: Props) {
  const kinds = useMemo(() => Object.keys(fences ?? {}), [fences]);
  const html = useMemo(
    () => kinds.length ? slotted(source, refs ?? {}, kinds, embedHtml) : markdown(source, refs, undefined, embedHtml),
    [source, refs, kinds, embedHtml],
  );
  const box = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<HTMLElement[]>([]);
  // the slots of this html: new elements whenever it changes
  useLayoutEffect(() => {
    setSlots(kinds.length && box.current ? [...box.current.querySelectorAll<HTMLElement>('[data-fence]')] : []);
  }, [html, kinds]);

  const counts: Record<string, number> = {};
  return (
    <>
      <div ref={box} className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} onClick={onRef ? (event) => {
        const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-note]');
        if (!link) return;
        event.preventDefault();
        event.stopPropagation();
        onRef(`${link.dataset.note}.txt`);
      } : undefined} />
      {slots.map((el, i) => {
        const kind = el.dataset.fence ?? '';
        const render = fences?.[kind];
        const index = counts[kind] = (counts[kind] ?? -1) + 1;
        return render && el.isConnected ? createPortal(render(el.dataset.info ?? '', el.dataset.code ?? '', index), el, `${kind}-${i}`) : null;
      })}
    </>
  );
}
