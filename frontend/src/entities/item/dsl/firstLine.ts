import type { Schema } from '@/api/types';
import { outline } from './outline';

/**
 * The body's first line, trimmed (what a list shows for a note, as dsl's
 * `Document.heading`), and whether the body goes on after it.
 */
export function firstLine(schema: Schema, text: string): { line: string; more: boolean } {
  const { lines, first, boundary } = outline(schema, text.trimEnd());
  if (first < 0) return { line: '', more: false };
  return { line: lines[first].trim(), more: lines.slice(first + 1, boundary).some((l) => l.trim()) };
}
