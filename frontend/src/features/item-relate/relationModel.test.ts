import { describe, expect, inject, it } from 'vitest';
import type { Backlink } from '@/api/types';
import { rowsOf, type PendingOp } from './relationModel';

const schema = inject('schema');

const back = (file: string, label: string, inline = false): Backlink => ({ file, label, heading: file, inline });
const brief = (rows: ReturnType<typeof rowsOf>) => rows.map((r) => `${r.direction === 'out' ? '→' : '←'}${r.inline ? 'i' : ''} ${r.label} ${r.file ?? r.text}`);

describe('rowsOf', () => {
  it('lists outgoing then incoming, inline ones last', () => {
    const text = 'A [[c]] and [[c]]\n-> knows @b\n-> @d\n';
    const rows = rowsOf(schema, text, { b: 'B', c: 'C', d: null }, [back('x.txt', 'cites'), back('y.txt', '', true)], []);
    expect(brief(rows)).toEqual(['→ knows b.txt', '→  d.txt', '→i  c.txt', '← cites x.txt', '←i  y.txt']);
    expect(rows.map((r) => r.heading)).toEqual(['B', null, 'C', 'x.txt', 'y.txt']);
  });

  it('applies the staged ops', () => {
    const pending: PendingOp[] = [
      { kind: 'relate-new', label: 'has', text: 'New one' },
      { kind: 'backlink', label: 'for', source: 'z.txt' },
      { kind: 'detach-in', source: 'x.txt', label: 'cites' },
      { kind: 'relabel-in', source: 'x.txt', label: 'uses', next: 'needs' },
      { kind: 'backlink-new', label: '', text: 'Other new' },
      { kind: 'delete', file: 'b.txt' },
    ];
    const rows = rowsOf(schema, 'A\n-> knows @b\n', {}, [back('x.txt', 'cites'), back('x.txt', 'uses'), back('x.txt', 'cites')], pending);
    expect(brief(rows)).toEqual(['→ has New one', '← needs x.txt', '← cites x.txt', '← for z.txt', '←  Other new']);
    expect(rows.filter((r) => r.pending !== undefined).map((r) => r.pending)).toEqual([0, 1, 4]);
  });
});
