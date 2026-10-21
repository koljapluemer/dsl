import type { ReactNode } from 'react';
import { Columns2, Eye, Pencil, type LucideIcon } from 'lucide-react';
import type { NoteMode } from './mode';

/** The note's own tools, each shown where it applies (see Note's `tools`). */
export type ToolId = 'media' | 'reference' | 'bibtex' | 'copyKey' | 'edit' | 'delete';

/** A tag the note toggles: `icon` while it's off, `activeIcon` (else `icon`, highlighted) while on. */
export type TagToggle = { tag: string; icon: LucideIcon; activeIcon?: LucideIcon; title: string; activeTitle?: string };

/** A page's own tool in the note's tool row: a button like the others, or any control (`node`). */
export type ExtraTool =
  | { key: string; title: string; icon: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }
  | { key: string; node: ReactNode };

/** Every tool's look: icon only, small, ghost. */
export const TOOL = 'btn btn-ghost btn-xs btn-square';

export function ToolButton({ title, onClick, disabled, active, danger, children }: {
  title: string; onClick: () => void; disabled?: boolean; active?: boolean; danger?: boolean; children: ReactNode;
}) {
  return (
    // the mouse doesn't take the focus (from the editor); the click isn't a row's, nor (in a <summary>) its details' toggle
    <button type="button" className={`${TOOL} ${active ? 'btn-active text-primary' : ''} ${danger ? 'hover:text-error' : ''}`} title={title}
            disabled={disabled} onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClick(); }}>
      {children}
    </button>
  );
}

const MODE_ICONS: Record<NoteMode, { icon: LucideIcon; title: string }> = {
  edit: { icon: Pencil, title: 'edit' },
  view: { icon: Eye, title: 'view' },
  split: { icon: Columns2, title: 'edit and view side by side' },
};

/** The modes to switch between, of those enabled. */
export function ModeToggle({ modes, mode, onMode }: { modes: readonly NoteMode[]; mode: NoteMode; onMode: (mode: NoteMode) => void }) {
  return (
    <div className="join">
      {modes.map((m) => {
        const { icon: Icon, title } = MODE_ICONS[m];
        return (
          <button key={m} type="button" className={`btn join-item btn-xs btn-square ${m === mode ? 'btn-active' : 'btn-ghost'}`} title={title}
                  aria-pressed={m === mode} onClick={() => onMode(m)}>
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}

export function Extra({ tool }: { tool: ExtraTool }) {
  if ('node' in tool) return <>{tool.node}</>;
  return <ToolButton title={tool.title} onClick={tool.onClick} disabled={tool.disabled} danger={tool.danger}>{tool.icon}</ToolButton>;
}
