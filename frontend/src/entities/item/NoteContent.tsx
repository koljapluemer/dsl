import { useMemo, type ReactNode } from 'react';
import type { Item } from '@/api/types';
import { Markdown, type FenceRenderer } from '@/dumb/Markdown';
import { analyze } from './dsl/analyze';
import { highlight } from './dsl/highlight';
import { outline } from './dsl/outline';
import { isRelationLine } from './dsl/relation';
import { theaBlocks } from './dsl/thea';
import { useSchema } from './schema';
import { useOpenNote } from './sidebar';
import { TheaBlock } from './viz/TheaBlock';
import './item.css';

type Props = {
  item: Item;
  variant?: 'full' | 'simple';
  onRef?: (file: string) => void;
  /** viz blocks as their thumbnails (graph nodes, canvas cards); always so in `simple` */
  compactViz?: boolean;
  /** the note's text as written, when `item` is a draft of it: its viz blocks can't be generated while they differ */
  savedText?: string;
};

/**
 * A note for reading. `full`: body and `extra` as markdown, `data` blocks as
 * highlighted code and the other keyword lines in monospace, highlighted.
 * `simple`: the body only. Never its relationships (the relationships widget
 * shows those) nor its attachment (the note's media slot does).
 * A click on a note link goes to `onRef`, by default the note in the sidebar.
 */
export function NoteContent({ item, variant = 'full', onRef, compactViz = false, savedText }: Props) {
  const schema = useSchema();
  const openNote = useOpenNote();
  const open = onRef ?? openNote;
  const text = item.text.trimEnd();
  const { lines, starts, first, boundary, parts } = outline(schema, text);
  const body = first >= 0 ? lines.slice(first, boundary).join('\n') : '';
  const fences = useVizFences(item, variant === 'simple' || compactViz, savedText);
  if (variant === 'simple') {
    return <div className="overview select-text">{body.trim() && <Markdown source={body} refs={item.refs} onRef={open} fences={fences.body} />}</div>;
  }

  const analysis = analyze(schema, text);
  const code = (i: number, end = i + 1) => (
    <div key={i} className="ov-code">
      {highlight(text, analysis, starts[i], starts[end - 1] + lines[end - 1].length).map((p, j) =>
        p.cls ? <span key={j} className={p.cls} title={p.title}>{p.text}</span> : p.text)}
    </div>
  );

  const section: ReactNode[] = [];
  const blocks: ReactNode[] = [];
  for (const { line, end, keyword } of parts) {
    if (keyword) {
      const content = lines.slice(line + 1, end).join('\n');
      if (!content.trim()) blocks.push(code(line));
      else if (schema.keywords[keyword].block === 'yaml') blocks.push(code(line, end));
      else blocks.push(<Markdown key={line} className="ov-extra" source={content} refs={item.refs} onRef={open} fences={fences[keyword]} />);
      continue;
    }
    const trimmed = lines[line].trim();
    if (trimmed && !isRelationLine(trimmed)) section.push(code(line));
  }

  return (
    <div className="overview select-text">
      {body.trim() && <Markdown source={body} refs={item.refs} onRef={open} fences={fences.body} />}
      {section.length > 0 && <div className="ov-section">{section}</div>}
      {blocks}
    </div>
  );
}

/**
 * Per Markdown part ('body' or a text block's keyword), the renderer of its
 * ```thea fences: the k-th one there is that part's k-th viz block.
 */
function useVizFences(item: Item, compact: boolean, savedText: string | undefined) {
  const schema = useSchema();
  const text = item.text.trimEnd();
  const dirty = savedText !== undefined && savedText.trimEnd() !== text;
  return useMemo(() => {
    const blocks = theaBlocks(schema, text);
    const out: Record<string, Record<string, FenceRenderer>> = {};
    for (const section of new Set(['body', ...blocks.map((b) => b.section)])) {
      const mine = blocks.filter((b) => b.section === section);
      out[section] = {
        thea: (_info, code, k) => {
          const block = mine[k]?.spec === code.trim() ? mine[k] : mine.find((b) => b.spec === code.trim());
          return <TheaBlock block={block} code={code} file={item.file} compact={compact} dirty={dirty} />;
        },
      };
    }
    return out;
  }, [schema, text, item.file, compact, dirty]);
}
