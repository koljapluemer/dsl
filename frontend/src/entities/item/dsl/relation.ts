import type { Schema } from '@/api/types';
import { outline } from './outline';

/** Whether a trimmed section line is a relationship line. */
export const isRelationLine = (trimmed: string) => trimmed === '->' || /^->\s/.test(trimmed);

/** A relationship line's label and target name (without `@`), or null when it's malformed; mirrors dsl's _relation. */
export function relation(trimmed: string): { label: string; target: string } | null {
  const target = trimmed.slice(2).trim().split(/\s+/).at(-1) || '';
  if (target.length < 2 || !target.startsWith('@') || /[/\\]/.test(target)) return null;
  return { label: trimmed.slice(2, -target.length).trim(), target: target.slice(1) };
}

/** The text's relationship lines, in order: their index in `text.split('\n')`, label and target. */
export function relations(schema: Schema, text: string): { line: number; label: string; target: string }[] {
  const { lines, parts } = outline(schema, text);
  return parts.flatMap(({ line, keyword }) => {
    const trimmed = lines[line].trim();
    const rel = !keyword && isRelationLine(trimmed) && relation(trimmed);
    return rel ? [{ line, ...rel }] : [];
  });
}

const line = (label: string, target: string) => (label ? `-> ${label} @${target}` : `-> @${target}`);

/** `text` with a relationship `label` ('' for none) to `target` (a name without .txt) appended; mirrors questions.add_relation. */
export const addRelation = (text: string, label: string, target: string) => `${text.replace(/\n+$/, '')}\n${line(label.trim(), target)}\n`;

/** `text` with its first relationship `label` to `target` changed by `edit` (null drops the line); unchanged when there's none. */
function withRelation(schema: Schema, text: string, label: string, target: string, edit: (target: string) => string | null) {
  const found = relations(schema, text).find((r) => r.label === label && r.target === target);
  if (!found) return text;
  const lines = text.split('\n');
  const next = edit(target);
  if (next === null) lines.splice(found.line, 1);
  else lines[found.line] = next;
  return lines.join('\n');
}

/** `text` without its first relationship `label` to `target`; mirrors store.detach. */
export const removeRelation = (schema: Schema, text: string, label: string, target: string) =>
  withRelation(schema, text, label, target, () => null);

/** `text` with its first relationship `label` to `target` labeled `next` instead; mirrors store.relabel. */
export const relabelRelation = (schema: Schema, text: string, label: string, target: string, next: string) =>
  withRelation(schema, text, label, target, (t) => line(next.trim(), t));
