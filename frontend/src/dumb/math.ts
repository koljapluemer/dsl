/**
 * TeX math in Markdown, as Pandoc's `tex_math_dollars`: `$…$` inline, on one
 * line, its content neither starting nor ending with whitespace and the closing
 * `$` not followed by a digit (so `$20 and $30` stays text); `$$…$$` display,
 * across lines but not across a blank one. A backslash escapes the next
 * character, in math too. Mirrors dsl_crud/core/inline_math.py.
 */
export type MathSpan = { from: number; to: number; tex: string; display: boolean };

const SPACE = /\s/;
const BLANK_LINE = /^\n[ \t]*(\n|$)/;

/** The math opening with the `$` at `i`, or null; whether that `$` is escaped is the caller's business. */
export function mathAt(src: string, i: number): MathSpan | null {
  if (src[i] !== '$') return null;
  if (src[i + 1] === '$') {
    for (let j = i + 2; j < src.length; j++) {
      if (src[j] === '\\') j++;
      else if (src[j] === '\n' && BLANK_LINE.test(src.slice(j))) return null;
      else if (src.startsWith('$$', j)) {
        const tex = src.slice(i + 2, j);
        return tex.trim() ? { from: i, to: j + 2, tex, display: true } : null;
      }
    }
    return null;
  }
  if (i + 1 >= src.length || SPACE.test(src[i + 1])) return null;
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') j++;
    else if (src[j] === '\n') return null;
    else if (src[j] === '$') {
      if (SPACE.test(src[j - 1]) || /\d/.test(src[j + 1] ?? '')) return null;
      return { from: i, to: j + 1, tex: src.slice(i + 1, j), display: false };
    }
  }
  return null;
}
