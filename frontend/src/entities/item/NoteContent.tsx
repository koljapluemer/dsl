import type { ReactNode } from 'react';
import type { Item } from '@/api/types';
import { Markdown } from '@/dumb/Markdown';
import { analyze } from './dsl/analyze';
import { highlight } from './dsl/highlight';
import { outline } from './dsl/outline';
import { isRelationLine } from './dsl/relation';
import { useSchema } from './schema';
import { useOpenNote } from './useOpenNote';
import './item.css';

/**
 * A note for reading. `full`: body and `extra` as markdown, `data` blocks as
 * highlighted code and the other keyword lines in monospace, highlighted.
 * `simple`: the body only. Never its relationships (the relationships widget
 * shows those) nor its attachment (the note's media slot does).
 * A click on a note link goes to `onRef`, by default the note on its own.
 */
export function NoteContent({ item, variant = 'full', onRef }: { item: Item; variant?: 'full' | 'simple'; onRef?: (file: string) => void }) {
  const schema = useSchema();
  const openNote = useOpenNote();
  const open = onRef ?? openNote;
  const text = item.text.trimEnd();
  const { lines, starts, first, boundary, parts } = outline(schema, text);
  const body = first >= 0 ? lines.slice(first, boundary).join('\n') : '';
  if (variant === 'simple') {
    return <div className="overview select-text">{body.trim() && <Markdown source={body} refs={item.refs} onRef={open} />}</div>;
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
      else blocks.push(<Markdown key={line} className="ov-extra" source={content} refs={item.refs} onRef={open} />);
      continue;
    }
    const trimmed = lines[line].trim();
    if (trimmed && !isRelationLine(trimmed)) section.push(code(line));
  }

  return (
    <div className="overview select-text">
      {body.trim() && <Markdown source={body} refs={item.refs} onRef={open} />}
      {section.length > 0 && <div className="ov-section">{section}</div>}
      {blocks}
    </div>
  );
}
