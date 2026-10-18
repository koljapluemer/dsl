export type Token = { text: string; value: string; from: number; to: number; quoted: boolean };

/** Whitespace-separated tokens of `line`, with absolute offsets (`at` is the line's offset in the text); `value` is a quoted token's content. */
export function tokenize(line: string, at: number): Token[] {
  return [...line.matchAll(/"(?:\\"|[^"])*"?|[^\s"]\S*/g)].map((m) => {
    const quoted = m[0][0] === '"';
    const value = quoted ? m[0].slice(1).replace(/"$/, '').replace(/\\"/g, '"') : m[0];
    return { text: m[0], value, from: at + (m.index ?? 0), to: at + (m.index ?? 0) + m[0].length, quoted };
  });
}
