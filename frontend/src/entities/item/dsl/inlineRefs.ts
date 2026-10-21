import type { Schema } from '@/api/types';
import { inlineReferences, type InlineReference } from '@/dumb/inlineReference';
import { outline } from './outline';

/** Inline references in the body and `extra`, the only places they count; offsets into `text`. */
export function itemInlineReferences(schema: Schema, text: string): InlineReference[] {
  const { lines, starts, first, boundary, parts } = outline(schema, text);
  const out: InlineReference[] = [];
  const scan = (from: number, to: number) => {
    if (from >= to) return;
    const at = starts[from];
    for (const ref of inlineReferences(lines.slice(from, to).join('\n'))) out.push({ ...ref, from: ref.from + at, to: ref.to + at });
  };
  if (first >= 0) scan(first, boundary);
  for (const { line, end, keyword } of parts) if (keyword === 'extra') scan(line + 1, end);
  return out;
}
