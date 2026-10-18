import type { Role, Schema } from '@/api/types';

const OPENING_ROLES: Role[] = ['primary', 'property'];
export const ALL_ROLES: Role[] = ['primary', 'property', 'modifier', 'state'];

/** The block keyword a line consists of, or undefined; mirrors dsl._block_keyword. */
export const blockKeyword = (schema: Schema, line: string) => (schema.keywords[line.trimEnd()]?.block ? line.trimEnd() : undefined);

/** Whether a line at column 0 starts a keyword, relationship or state line of one of `roles`; mirrors dsl._starts_line_of. */
export function startsLineOf(schema: Schema, line: string, roles: Role[]): boolean {
  const kws = schema.keywords;
  if (/^->\s/.test(line)) return (line.trim().split(/\s+/).at(-1) as string).startsWith('@');
  const state = /^\(([a-z]+)(?=[\s)]|$)/.exec(line);
  if (state) return kws[state[1]]?.role === 'state' && roles.includes('state');
  const kw = /^([a-z]+)(?=\s|$)/.exec(line);
  const def = kw && kws[kw[1]];
  if (!def || !roles.includes(def.role)) return false;
  return !def.block || line.trimEnd() === kw[1];
}

/** Whether a body line (after the first) starts the keyword section; mirrors dsl.is_section_opener. */
const isSectionOpener = (schema: Schema, line: string) => startsLineOf(schema, line, OPENING_ROLES);

/** A plain line or a block of the keyword section: `line` is its keyword's line, `end` the line after its content. */
export type Part = { line: number; end: number; keyword?: string };

/**
 * The parts of item text, as line indices: the body runs from `first` (-1 for an
 * empty text) to `boundary`; from there `parts` lists the keyword section in
 * order. Mirrors the start of dsl.parse.
 */
export function outline(schema: Schema, text: string) {
  const lines = text.split('\n');
  const starts: number[] = [];
  lines.reduce((at, l) => { starts.push(at); return at + l.length + 1; }, 0);
  const first = lines.findIndex((l) => l.trim());
  let boundary = first < 0 ? lines.length : first + 1;
  while (boundary < lines.length && !isSectionOpener(schema, lines[boundary])) boundary++;
  const parts: Part[] = [];
  for (let i = boundary; i < lines.length;) {
    const keyword = blockKeyword(schema, lines[i]);
    let end = i + 1;
    if (keyword) while (end < lines.length && !startsLineOf(schema, lines[end], ALL_ROLES)) end++;
    parts.push({ line: i, end, keyword });
    i = end;
  }
  return { lines, starts, first, boundary, parts };
}
