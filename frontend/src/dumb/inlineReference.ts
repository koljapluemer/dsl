import { FENCE } from './fence';
import { mathAt, type MathSpan } from './math';

export type InlineReference = { from: number; to: number; target: string; label: string | null };
/** `![[path]]` or `![[path|alt]]`: an attached file shown in place, never a relationship */
export type InlineEmbed = InlineReference;

const TARGET = /^[^\s|[\]/\\]+$/;
const EMBED_TARGET = /^[^|[\]]+$/;

/** Inline note references outside Markdown code spans, fenced code blocks and math. */
export const inlineReferences = (source: string): InlineReference[] => scanInline(source).refs;

/** Embeds, by the same rules as references. */
export const inlineEmbeds = (source: string): InlineEmbed[] => scanInline(source).embeds;

/** Math outside Markdown code spans and fenced code blocks (references hold none). */
export const mathSpans = (source: string): MathSpan[] => scanInline(source).math;

/**
 * Inline references and math, left to right: whichever opens first holds what
 * follows, so a `[[` in math is TeX and a reference's label is never math.
 * Mirrors dsl_crud/core/inline_refs.py.
 */
function scanInline(source: string) {
  const out: Scan = { refs: [], embeds: [], math: [] };
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
type Scan = { refs: InlineReference[]; embeds: InlineEmbed[]; math: MathSpan[] };

function scanLine(source: string, i: number, end: number, out: Scan) {
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
    const embed = source.startsWith('![[', i);
    if (!ticks && (embed || source.startsWith('[[', i))) {
      const open = i + (embed ? 3 : 2);
      const close = source.indexOf(']]', open);
      if (close >= 0 && close + 2 <= end) {
        const raw = source.slice(open, close);
        const pipe = raw.indexOf('|');
        const target = pipe < 0 ? raw : raw.slice(0, pipe);
        const label = pipe < 0 ? null : raw.slice(pipe + 1);
        if ((embed ? EMBED_TARGET : TARGET).test(target) && (label === null || label.length > 0)) {
          (embed ? out.embeds : out.refs).push({ from: i, to: close + 2, target, label });
          i = close + 2;
          continue;
        }
      }
    }
    i++;
  }
  return i;
}
