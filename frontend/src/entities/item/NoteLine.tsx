import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { CircleX, TriangleAlert } from 'lucide-react';
import type { Item } from '@/api/types';
import { inlineMarkdown } from '@/dumb/markdown';
import { firstLine } from './dsl/firstLine';
import { NoteMedia } from './Media';
import { NoteContent } from './NoteContent';
import { useSchema } from './schema';
import { useOpenNote } from './sidebar';
import './item.css';

/** How many characters of the first line an inline note shows by default. */
export const INLINE_CHARS = 120;

type Props = {
  item: Item;
  /** how much of the first line's text shows, then `…` */
  chars?: number;
  /** the whole body, uncut, instead of the first line (`chars` and `highlight` then don't apply) */
  whole?: boolean;
  /** text to mark in it (a search's match) */
  highlight?: string | null;
  /** the whole note is clickable (links, buttons and media in it still do their own thing) */
  onClick?: () => void;
  /** a click on a note link in it; by default the note in the sidebar */
  onRef?: (file: string) => void;
  /** controls at its end (the note component's tools) */
  actions?: ReactNode;
  className?: string;
};

/** Whether a click is the note's own: not on something in it acting on its own, nor in a portal outside it. */
const ownClick = (event: MouseEvent<HTMLElement>) => {
  const target = event.target as Element;
  return event.currentTarget.contains(target) && !target.closest('a, button, input, video, img');
};

/**
 * A note in one line: its first line rendered as Markdown, cut after `chars`
 * characters with `…` (also when the body goes on), its attachment as a
 * thumbnail and its problems as an icon. Never its relationships.
 * `whole`: the whole body instead, uncut, as NoteContent's `simple`.
 */
export function NoteLine({ item, chars = INLINE_CHARS, whole = false, highlight, onClick, onRef, actions, className = '' }: Props) {
  const schema = useSchema();
  const openNote = useOpenNote();
  const { line, more } = firstLine(schema, item.text);
  const { html, cut } = inlineMarkdown(line, item.refs, chars, highlight ?? undefined);
  const problem = item.errors.length ? 'error' : item.warnings.length ? 'warning' : null;

  const click = (event: MouseEvent<HTMLElement>) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-note]');
    if (link) {
      event.preventDefault();
      event.stopPropagation();
      (onRef ?? openNote)(`${link.dataset.note}.txt`);
    } else if (onClick && ownClick(event)) {
      onClick();
    }
  };
  const key = onClick ? (event: KeyboardEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onClick(); }
  } : undefined;

  return (
    <div className={`flex min-w-0 ${whole ? 'items-start' : 'items-center'} gap-2 ${onClick ? 'cursor-pointer' : ''} ${className}`}
         role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onClick={click} onKeyDown={key}>
      {problem === 'error' && <CircleX size={14} className="shrink-0 text-error" aria-label="has errors" />}
      {problem === 'warning' && <TriangleAlert size={14} className="shrink-0 text-warning" aria-label="has warnings" />}
      {whole && line
        ? <div className="min-w-0 flex-1"><NoteContent item={item} variant="simple" onRef={onRef ?? openNote} /></div>
        : (
          <span className="md-inline min-w-0 flex-1 break-words">
            {line
              ? <span dangerouslySetInnerHTML={{ __html: html + (cut || more ? '…' : '') }} />
              : <span className="ov-muted">{item.file.replace(/\.txt$/, '')}{more ? '…' : ''}</span>}
          </span>
        )}
      {item.media && <NoteMedia path={item.media} size="thumb" />}
      {actions && <span className="flex shrink-0 items-center gap-0.5">{actions}</span>}
    </div>
  );
}
