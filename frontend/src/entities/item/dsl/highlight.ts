import type { Analysis, Segment } from './analyze';

/** A run of text, marked when it has a class. */
export type Piece = { text: string; cls?: string; title?: string };

/** The text from `from` to `to` as highlighted pieces for read-only display; errors are marked too. */
export function highlight(text: string, { segments, problems }: Analysis, from: number, to: number): Piece[] {
  const marks: Segment[] = segments.map((m) => ({ ...m }));
  for (const e of problems.filter((p) => p.severity === 'error')) {
    const seg = marks.find((m) => m.from === e.from && m.to === e.to);
    if (seg) Object.assign(seg, { cls: `${seg.cls} tok-error`, title: e.message });
    else marks.push({ from: e.from, to: e.to, cls: 'tok-error', title: e.message });
  }
  marks.sort((x, y) => x.from - y.from);
  const out: Piece[] = [];
  let pos = from;
  for (const m of marks) {
    if (m.from < pos || m.to > to) continue;
    if (m.from > pos) out.push({ text: text.slice(pos, m.from) });
    out.push({ text: text.slice(m.from, m.to), cls: m.cls, title: m.title });
    pos = m.to;
  }
  if (pos < to) out.push({ text: text.slice(pos, to) });
  return out;
}
