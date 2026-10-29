import type { Schema } from '@/api/types';
import { inlineReferences, mathSpans, type InlineReference } from '@/dumb/inlineReference';
import type { MathSpan } from '@/dumb/math';
import { outline } from './outline';

/** What `find` finds in each part of the item's Markdown text: the body and `text` blocks; offsets into `text`. */
function inMarkdown<T extends { from: number; to: number }>(schema: Schema, text: string, find: (source: string) => T[]): T[] {
  const { lines, starts, first, boundary, parts } = outline(schema, text);
  const out: T[] = [];
  const scan = (from: number, to: number) => {
    if (from >= to) return;
    const at = starts[from];
    for (const found of find(lines.slice(from, to).join('\n'))) out.push({ ...found, from: found.from + at, to: found.to + at });
  };
  if (first >= 0) scan(first, boundary);
  for (const { line, end, keyword } of parts) if (keyword && schema.keywords[keyword].block === 'text') scan(line + 1, end);
  return out;
}

/** Inline references in the body and `text` blocks (`extra`, `publish`), the only places they count; offsets into `text`. */
export const itemInlineReferences = (schema: Schema, text: string): InlineReference[] => inMarkdown(schema, text, inlineReferences);

/** Math in the body and `text` blocks; offsets into `text`. */
export const itemMathSpans = (schema: Schema, text: string): MathSpan[] => inMarkdown(schema, text, mathSpans);
