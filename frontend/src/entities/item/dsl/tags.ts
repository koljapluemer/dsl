import type { Schema } from '@/api/types';
import { outline } from './outline';

/** The note's tags: the words of its `tags` line in the keyword section. */
export function tags(schema: Schema, text: string): string[] {
  const { lines, parts } = outline(schema, text);
  const tagLine = parts.map(({ line }) => lines[line].trim()).find((l) => /^tags(\s|$)/.test(l));
  return tagLine ? tagLine.split(/\s+/).slice(1) : [];
}

export const hasTag = (schema: Schema, text: string, tag: string) => tags(schema, text).includes(tag);
