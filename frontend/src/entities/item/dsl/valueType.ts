import type { ValueType } from '@/api/types';

const WEEKDAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];

/** Which of `types` the token is; mirrors dsl.value_type. Only a `path` may be quoted. */
export function valueType(v: string, types: ValueType[], quoted: boolean): ValueType | undefined {
  return types.find((t) => {
    if (t === 'path') return !!v && !v.startsWith('/') && !v.includes('\\') && !v.split('/').includes('..');
    if (quoted) return false;
    if (t === 'weekday') return WEEKDAYS.includes(v);
    const m = t === 'month' ? /^(\d{2})-(\d{2})$/.exec(v) : /^(\d{2})-(\d{2})-(\d{2})$/.exec(v);
    if (!m || +m[2] < 1 || +m[2] > 12) return false;
    if (t === 'month') return true;
    return +m[3] >= 1 && +m[3] <= new Date(2000 + +m[1], +m[2], 0).getDate();
  });
}
