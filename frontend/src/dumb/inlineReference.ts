import { mathAt, type MathSpan } from './math';

export type InlineReference = { from: number; to: number; target: string; label: string | null };

const TARGET = /^[^\s|[\]/\\]+$/;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;

/** Inline note references outside Markdown code spans, fenced code blocks and math. */
export const inlineReferences = (source: string): InlineReference[] => scanInline(source).refs;

/** Math outside Markdown code spans and fenced code blocks (references hold none). */
export const mathSpans = (source: string): MathSpan[] => scanInline(source).math;

/**
 * Inline references and math, left to right: whichever opens first holds what
 * follows, so a `[[` in math is TeX and a reference's label is never math.
 * Mirrors dsl_crud/core/inline_refs.py.
 */
function scanInline(source: string) {
  const out = { refs: [] as InlineReference[], math: [] as MathSpan[] };
  let offset = 0;
  // where display math that ran past its line ends
  let resume = 0;
  let fence: { char: string; length: number } | null = null;
  for (const line of source.split('\n')) {
    const end = offset + line.length;
    const marker = FENCE.exec(line)?.[1];
    if (resume > offset) {
      if (resume <= end) resume = scanLine(source, resume, end, out);
    } else if (fence) {
      if (marker?.[0] === fence.char && marker.length >= fence.length) fence = null;
    } else if (marker) {
      fence = { char: marker[0], length: marker.length };
    } else {
      resume = scanLine(source, offset, end, out);
    }
    offset = end + 1;
  }
  return out;
}

/** Scans `source` from `i` to the line's `end`; where it stopped, past `end` when math runs on. */
function scanLine(source: string, i: number, end: number, out: { refs: InlineReference[]; math: MathSpan[] }) {
  let ticks = 0;
  while (i < end) {
    if (source[i] === '`') {
      let stop = i;
      while (source[stop] === '`') stop++;
      const run = stop - i;
      if (!ticks) ticks = run;
      else if (run === ticks) ticks = 0;
      i = stop;
      continue;
    }
    if (!ticks && source[i] === '\\') {
      i += 2;
      continue;
    }
    if (!ticks && source[i] === '$') {
      const math = mathAt(source, i);
      if (math) {
        out.math.push(math);
        i = math.to;
        continue;
      }
    }
    if (!ticks && source.startsWith('[[', i)) {
      const close = source.indexOf(']]', i + 2);
      if (close >= 0 && close + 2 <= end) {
        const raw = source.slice(i + 2, close);
        const pipe = raw.indexOf('|');
        const target = pipe < 0 ? raw : raw.slice(0, pipe);
        const label = pipe < 0 ? null : raw.slice(pipe + 1);
        if (TARGET.test(target) && (label === null || label.length > 0)) {
          out.refs.push({ from: i, to: close + 2, target, label });
          i = close + 2;
          continue;
        }
      }
    }
    i++;
  }
  return i;
}
