export type InlineReference = { from: number; to: number; target: string; label: string | null };

const TARGET = /^[^\s|[\]/\\]+$/;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;

/** Inline note references outside Markdown code spans and fenced code blocks. */
export function inlineReferences(source: string): InlineReference[] {
  const out: InlineReference[] = [];
  let offset = 0;
  let fence: { char: string; length: number } | null = null;
  for (const line of source.split('\n')) {
    const marker = FENCE.exec(line)?.[1];
    if (fence) {
      if (marker?.[0] === fence.char && marker.length >= fence.length) fence = null;
    } else if (marker) {
      fence = { char: marker[0], length: marker.length };
    } else {
      scanLine(line, offset, out);
    }
    offset += line.length + 1;
  }
  return out;
}

function scanLine(line: string, offset: number, out: InlineReference[]) {
  let ticks = 0;
  for (let i = 0; i < line.length;) {
    if (line[i] === '`') {
      let end = i;
      while (line[end] === '`') end++;
      const run = end - i;
      if (!ticks) ticks = run;
      else if (run === ticks) ticks = 0;
      i = end;
      continue;
    }
    if (!ticks && line.startsWith('[[', i) && !escaped(line, i)) {
      const end = line.indexOf(']]', i + 2);
      if (end >= 0) {
        const raw = line.slice(i + 2, end);
        const pipe = raw.indexOf('|');
        const target = pipe < 0 ? raw : raw.slice(0, pipe);
        const label = pipe < 0 ? null : raw.slice(pipe + 1);
        if (TARGET.test(target) && (label === null || label.length > 0)) {
          out.push({ from: offset + i, to: offset + end + 2, target, label });
          i = end + 2;
          continue;
        }
      }
    }
    i++;
  }
}

function escaped(text: string, at: number) {
  let slashes = 0;
  while (at > 0 && text[--at] === '\\') slashes++;
  return slashes % 2 === 1;
}
