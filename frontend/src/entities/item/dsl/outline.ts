import type { KeywordDef, Role, Schema } from '@/api/types';

const OPENING_ROLES: Role[] = ['primary', 'property'];
export const ALL_ROLES: Role[] = ['primary', 'property', 'modifier', 'state'];

/** Whether a block keyword's line opens its block: followed by its args, or alone without any; mirrors dsl._opens_block. */
const opensBlock = (def: KeywordDef, line: string, name: string) => def.args.length > 0 || line.trimEnd() === name;

/** The block keyword a line opens a block of, or undefined; mirrors dsl.block_keyword. */
export function blockKeyword(schema: Schema, line: string): string | undefined {
  const kw = /^([a-z]+)(?=\s|$)/.exec(line);
  const def = kw && schema.keywords[kw[1]];
  return def && def.block && opensBlock(def, line, kw[1]) ? kw[1] : undefined;
}

/** Whether a line at column 0 starts a keyword, relationship or state line of one of `roles`; mirrors dsl._starts_line_of. */
export function startsLineOf(schema: Schema, line: string, roles: Role[]): boolean {
  const kws = schema.keywords;
  if (/^->\s/.test(line)) return (line.trim().split(/\s+/).at(-1) as string).startsWith('@');
  const state = /^\(([a-z]+)(?=[\s)]|$)/.exec(line);
  if (state) return kws[state[1]]?.role === 'state' && roles.includes('state');
  const kw = /^([a-z]+)(?=\s|$)/.exec(line);
  const def = kw && kws[kw[1]];
  if (!def || !roles.includes(def.role)) return false;
  return !def.block || opensBlock(def, line, kw[1]);
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
