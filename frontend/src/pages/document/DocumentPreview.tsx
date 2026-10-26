import type { MouseEvent, ReactNode } from 'react';
import type { Item } from '@/api/types';
import { escapeHtml, markdown } from '@/dumb/markdown';
import { analyze } from '@/entities/item/dsl/analyze';
import { highlight } from '@/entities/item/dsl/highlight';
import { outline } from '@/entities/item/dsl/outline';
import { isRelationLine } from '@/entities/item/dsl/relation';
import { useSchema } from '@/entities/item/schema';
import { documentReferences, type DocumentReference } from './documentReferences';

function DocumentMarkdown({ source, start, occurrences, onActivate, className = '' }: {
  source: string;
  start: number;
  occurrences: Map<number, DocumentReference>;
  onActivate: (id: string) => void;
  className?: string;
}) {
  const html = markdown(source, {}, (ref) => {
    const occurrence = occurrences.get(start + ref.from);
    if (!occurrence) return escapeHtml(ref.label ?? ref.target);
    const label = ref.label ? `<span>${escapeHtml(ref.label)}</span>` : '';
    return `<button type="button" class="document-reference-anchor" data-document-reference="${escapeHtml(occurrence.id)}" aria-label="annotation ${occurrence.number}: ${escapeHtml(ref.target)}">${label}<sup>${occurrence.number}</sup></button>`;
  });
  const click = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as Element).closest<HTMLElement>('[data-document-reference]');
    if (!anchor?.dataset.documentReference) return;
    event.preventDefault();
    event.stopPropagation();
    onActivate(anchor.dataset.documentReference);
  };
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} onClick={click} />;
}

/** The normal full note preview, with inline references rendered as numbered annotation anchors. */
export function DocumentPreview({ item, onActivate }: { item: Item; onActivate: (id: string) => void }) {
  const schema = useSchema();
  const text = item.text.trimEnd();
  const { lines, starts, first, boundary, parts } = outline(schema, text);
  const references = documentReferences(schema, text);
  const byStart = new Map(references.map((ref) => [ref.from, ref]));
  const body = first >= 0 ? lines.slice(first, boundary).join('\n') : '';
  const analysis = analyze(schema, text);
  const code = (i: number, end = i + 1) => (
    <div key={i} className="ov-code">
      {highlight(text, analysis, starts[i], starts[end - 1] + lines[end - 1].length).map((part, j) =>
        part.cls ? <span key={j} className={part.cls} title={part.title}>{part.text}</span> : part.text)}
    </div>
  );

  const section: ReactNode[] = [];
  const blocks: ReactNode[] = [];
  for (const { line, end, keyword } of parts) {
    if (keyword) {
      const content = lines.slice(line + 1, end).join('\n');
      if (!content.trim()) blocks.push(code(line));
      else if (schema.keywords[keyword].block === 'yaml') blocks.push(code(line, end));
      else blocks.push(
        <DocumentMarkdown key={line} className="ov-extra" source={content}
                          start={starts[line] + lines[line].length + 1} occurrences={byStart} onActivate={onActivate} />,
      );
      continue;
    }
    const trimmed = lines[line].trim();
    if (trimmed && !isRelationLine(trimmed)) section.push(code(line));
  }

  return (
    <div className="overview select-text document-preview">
      {body.trim() && <DocumentMarkdown source={body} start={starts[first]} occurrences={byStart} onActivate={onActivate} />}
      {section.length > 0 && <div className="ov-section">{section}</div>}
      {blocks}
    </div>
  );
}

