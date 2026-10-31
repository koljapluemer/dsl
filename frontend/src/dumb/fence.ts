/** A Markdown fence's opening line: at most three spaces, then three or more ` or ~. */
export const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;

/** The index of the line closing the fence lines[i] opens, or -1 when it opens none or isn't closed; mirrors dsl.fence_end. */
export function fenceEnd(lines: string[], i: number): number {
  const marker = FENCE.exec(lines[i])?.[1];
  if (!marker) return -1;
  const char = marker[0] === '`' ? '`' : '~';
  const closing = new RegExp(`^[ \\t]{0,3}${char}{${marker.length},}[ \\t]*$`);
  for (let j = i + 1; j < lines.length; j++) if (closing.test(lines[j])) return j;
  return -1;
}
