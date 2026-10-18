import type { Schema } from '@/api/types';
import { outline } from './outline';
import { isRelationLine, relation } from './relation';
import { tokenize, type Token } from './tokenize';
import { valueType } from './valueType';

export type Segment = { from: number; to: number; cls: string; title?: string };
export type Problem = { from: number; to: number; severity: 'error' | 'warning'; message: string };
export type Analysis = { segments: Segment[]; problems: Problem[] };

/**
 * One pass's state: `keywords` is every keyword met so far (for duplicates),
 * `clauses` the keywords of clauses that parsed (for excludes, like dsl.check_excludes).
 */
type Pass = Analysis & { schema: Schema; keywords: string[]; clauses: string[] };

/**
 * Highlighting and problems for item text, as absolute offsets; mirrors dsl.parse.
 * Drives the editor's decorations and lint, and the list's keyword lines. YAML
 * validity is only checked by the server.
 */
export function analyze(schema: Schema, text: string): Analysis {
  const { lines, starts, first, parts } = outline(schema, text);
  const pass: Pass = { schema, segments: [], problems: [], keywords: [], clauses: [] };
  const { segments, problems } = pass;
  if (first < 0) return { segments, problems };

  for (const { line, end, keyword } of parts) {
    if (!keyword) {
      sectionLine(pass, lines[line], starts[line]);
      continue;
    }
    const def = schema.keywords[keyword];
    const from = starts[line];
    const to = from + lines[line].trimEnd().length;
    segments.push({ from, to, cls: `tok-${def.role}`, title: def.meaning.trim() });
    if (pass.keywords.includes(keyword)) problems.push({ from, to, severity: 'error', message: `duplicate_keyword: ${keyword}` });
    pass.keywords.push(keyword);
    if (lines.slice(line + 1, end).some((l) => l.trim())) {
      const blockTo = end < lines.length ? starts[end] - 1 : text.length;
      segments.push({ from: to + 1, to: blockTo, cls: 'tok-extra' });
    } else {
      const code = def.block === 'yaml' ? 'empty_data' : 'empty_extra';
      problems.push({ from, to, severity: 'error', message: `${code}: no content after ${keyword}` });
    }
  }
  return { segments, problems };
}

/** One keyword-section line (at offset `at`): a relationship, a state line, or clauses. */
function sectionLine(pass: Pass, line: string, at: number) {
  const { schema, segments, problems } = pass;
  const trimmed = line.trim();
  if (!trimmed) return;
  const from = at + line.indexOf(trimmed[0]);
  const to = from + trimmed.length;
  const fail = (message: string) => { problems.push({ from, to, severity: 'error', message }); };

  if (isRelationLine(trimmed)) {
    const rel = relation(trimmed);
    if (!rel) return fail('invalid_relation: expected -> label @target');
    segments.push({ from, to: from + 2, cls: 'tok-relation' }, { from: to - rel.target.length - 1, to, cls: 'tok-target', title: rel.target + '.txt' });
    return;
  }

  if (trimmed.startsWith('(')) {
    if (!trimmed.endsWith(')')) return fail('invalid_state: a state line ends with )');
    const toks = tokenize(trimmed.slice(1, -1), from + 1);
    const kw = toks[0];
    if (!kw || kw.quoted || !/^[a-z]+$/.test(kw.text)) return fail('invalid_state');
    const def = schema.keywords[kw.text];
    if (!def) {
      segments.push({ from, to, cls: 'tok-unknown' });
      problems.push({ from, to, severity: 'warning', message: `unknown_keyword: ${kw.text} (the line is kept as is)` });
      return;
    }
    if (def.role !== 'state') return fail(`invalid_state: ${kw.text} is not a state keyword`);
    const next = clause(pass, toks, 0, to);
    if (next >= 0 && next < toks.length) problems.push({ from: toks[next].from, to, severity: 'error', message: 'unexpected_token' });
    return;
  }

  const toks = tokenize(line, at);
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    const def = schema.keywords[t.text];
    if (t.quoted || !/^[a-z]+$/.test(t.text) || def?.role === 'state' || def?.block) {
      problems.push({ from: t.from, to, severity: 'error', message: 'unexpected_token' });
      return;
    }
    if (!def) {
      segments.push({ from: t.from, to, cls: 'tok-unknown' });
      problems.push({ from: t.from, to, severity: 'warning', message: `unknown_keyword: ${t.text} (the rest of the line is kept as is)` });
      return;
    }
    if (i > 0 && def.line_start) {
      problems.push({ from: t.from, to, severity: 'error', message: `unexpected_token: ${t.text} must start its line` });
      return;
    }
    i = clause(pass, toks, i, to);
    if (i < 0) return;
  }
}

/**
 * The clause whose keyword is toks[i] (`end` is the offset of the line's end);
 * returns the index after it, or -1 after an error (the parser skips the rest of the line).
 */
function clause(pass: Pass, toks: Token[], i: number, end: number): number {
  const { schema: { keywords: kws }, segments, problems } = pass;
  const isKw = (j: number) => j < toks.length && !toks[j].quoted && kws[toks[j].text] !== undefined;
  const mark = (j: number, cls: string, title?: string) => segments.push({ from: toks[j].from, to: toks[j].to, cls, title });
  /** an error on token j, or from j to the end of the line */
  const fail = (j: number, message: string, toEnd = true) => {
    problems.push({ from: toks[j].from, to: toEnd ? end : toks[j].to, severity: 'error', message });
    return -1;
  };

  const t = toks[i];
  const def = kws[t.text];
  if (pass.keywords.includes(t.text)) return fail(i, `duplicate_keyword: ${t.text}`);
  pass.keywords.push(t.text);
  mark(i, `tok-${def.role}`, def.meaning.trim());
  const kwAt = i++;
  for (const arg of def.args) {
    if (arg.type.length === 1 && arg.type[0] === 'text') {
      if (i >= toks.length) return fail(kwAt, `missing_arg: ${arg.name} (text)`, false);
      segments.push({ from: toks[i].from, to: end, cls: 'tok-text', title: arg.name });
      i = toks.length;
      continue;
    }
    if (arg.type.length === 1 && arg.type[0] === 'tags') {
      if (i >= toks.length) return fail(kwAt, `missing_arg: ${arg.name} (tags)`, false);
      for (; i < toks.length; i++) {
        if (toks[i].quoted || !/^[a-z0-9-]+$/.test(toks[i].text)) return fail(i, `invalid_value: ${arg.name} are a-z, 0-9 and -`, false);
        mark(i, 'tok-tags', arg.name);
      }
      continue;
    }
    if (i >= toks.length || isKw(i)) return fail(kwAt, `missing_arg: ${arg.name} (${arg.type.join(' | ')})`, false);
    const vt = valueType(toks[i].value, arg.type, toks[i].quoted);
    if (!vt) return fail(i, `invalid_value: ${arg.name} expects ${arg.type.join(' | ')}`);
    mark(i++, `tok-${vt}`, arg.name);
  }
  const opts: string[] = [];
  while (i < toks.length && !toks[i].quoted && def.options[toks[i].text]) {
    const name = toks[i].text;
    const opt = def.options[name];
    if (opts.includes(name)) return fail(i, `duplicate_keyword: ${name}`);
    opts.push(name);
    mark(i, 'tok-option', opt.meaning.trim());
    const optAt = i++;
    if (i >= toks.length || isKw(i)) return fail(optAt, `missing_arg: ${name} (${opt.type.join(' | ')})`, false);
    const vt = valueType(toks[i].value, opt.type, toks[i].quoted);
    if (!vt) return fail(i, `invalid_value: ${name} expects ${opt.type.join(' | ')}`);
    mark(i++, `tok-${vt}`, name);
  }
  const conflict = pass.clauses.find((k) => def.excludes.includes(k) || kws[k].excludes.includes(t.text));
  if (conflict) fail(kwAt, `conflicting_keywords: ${conflict}, ${t.text}`, false);
  pass.clauses.push(t.text);
  return i;
}
