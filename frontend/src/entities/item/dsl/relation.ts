/** Whether a trimmed section line is a relationship line. */
export const isRelationLine = (trimmed: string) => trimmed === '->' || /^->\s/.test(trimmed);

/** A relationship line's label and target name (without `@`), or null when it's malformed; mirrors dsl's _relation. */
export function relation(trimmed: string): { label: string; target: string } | null {
  const target = trimmed.slice(2).trim().split(/\s+/).at(-1) || '';
  if (target.length < 2 || !target.startsWith('@') || /[/\\]/.test(target)) return null;
  return { label: trimmed.slice(2, -target.length).trim(), target: target.slice(1) };
}
