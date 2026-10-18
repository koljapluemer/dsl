import type { ReactNode } from 'react';
import type { Item } from '@/api/types';
import { Markdown } from '@/dumb/Markdown';
import { analyze } from './dsl/analyze';
import { highlight } from './dsl/highlight';
import { outline } from './dsl/outline';
import { isRelationLine, relation } from './dsl/relation';
import { useSchema } from './schema';
import './item.css';

/**
 * An item for reading: body and extra as markdown, relationships as links to
 * their targets (shown by heading, from `refs`), and only keyword lines in
 * monospace, highlighted.
 */
export function ItemOverview({ item, onRef }: { item: Item; onRef: (file: string) => void }) {
  const schema = useSchema();
  const text = item.text.trimEnd();
  const { lines, starts, first, boundary, parts } = outline(schema, text);
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
      else blocks.push(<Markdown key={line} className="ov-extra" source={content} />);
      continue;
    }
    const trimmed = lines[line].trim();
    const rel = isRelationLine(trimmed) && relation(trimmed);
    if (rel) section.push(<Ref key={line} {...rel} heading={item.refs?.[rel.target]} onRef={onRef} />);
    else if (trimmed) section.push(code(line));
  }

  return (
    <>
      {first >= 0 && <Markdown source={lines.slice(first, boundary).join('\n')} />}
      {section.length > 0 && <div className="ov-section">{section}</div>}
      {blocks}
    </>
  );
}

/** A relationship; `heading` is the target's, null when there's no such item. */
function Ref({ label, target, heading, onRef }: { label: string; target: string; heading: string | null | undefined; onRef: (file: string) => void }) {
  const file = target + '.txt';
  return (
    <div>
      <span className="ov-muted">{label ? label + ' ' : ''}→</span>{' '}
      {heading === null
        ? <span className="ov-missing" title={`no item ${file}`}>{target}</span>
        : <a className="link link-hover" title={file} onClick={(e) => { e.stopPropagation(); onRef(file); }}>{heading || target}</a>}
    </div>
  );
}
