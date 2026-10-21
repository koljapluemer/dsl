/** How a note is shown: its editor, rendered, or both side by side. */
export type NoteMode = 'edit' | 'view' | 'split';

export const ALL_MODES: readonly NoteMode[] = ['edit', 'view', 'split'];

export const isMode = (value: unknown): value is NoteMode => ALL_MODES.includes(value as NoteMode);

/** The mode to show: `wanted` when it's enabled, else `fallback` when it is, else the first enabled one. */
export function resolveMode(enabled: readonly NoteMode[], wanted: NoteMode | undefined, fallback: NoteMode): NoteMode {
  if (wanted && enabled.includes(wanted)) return wanted;
  return enabled.includes(fallback) ? fallback : enabled[0];
}
