import type { Diagnostic, Item } from '@/api/types';

const describe = (d: Diagnostic) => [d.code, d.line != null && `line ${d.line}`, d.detail && `"${d.detail}"`].filter(Boolean).join(' · ');

/** An item's errors and warnings, one per line. */
export const describeProblems = (i: Item) => [...i.errors, ...i.warnings].map(describe).join('\n');
