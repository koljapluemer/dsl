import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Hammer, Lightbulb, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ProjectIssue, Projects } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { itemsChanged } from '@/entities/item/mutations';
import { itemQuery } from '@/entities/item/queries';
import { useDeleteItem } from '@/features/item-delete/useDeleteItem';
import { Modal } from '@/dumb/Modal';
import { NotePanel } from '@/meta/note-panel/NotePanel';
import { NEW_PROJECT, newIssue, projectsQuery, setThink } from './projects';

/** The modal: an item, or a new one starting as `initial`, closing once written if `closeOnCreate`. */
type Editing = { file: string | null; initial: string; key: number; closeOnCreate?: boolean };

/** Projects, each collapsible with its issues, and the issues without a project; items open in a modal to read, edit or delete; new ones too. */
export function ProjectsPage() {
  const { data } = useQuery(projectsQuery);
  const [editing, setEditing] = useState<Editing | null>(null);
  const open = (file: string) => setEditing({ file, initial: '', key: Date.now() });
  const add = (initial: string, closeOnCreate = false) => setEditing({ file: null, initial, key: Date.now(), closeOnCreate });
  const del = useDelete();

  return (
    <div>
      <button className="btn btn-sm mb-4" onClick={() => add(NEW_PROJECT)}><Plus size={16} />Project</button>
      {data && <Lists projects={data} onOpen={open} onAdd={add} onDelete={del} />}
      {editing && (
        <Modal wide onClose={() => setEditing(null)}>
          <NotePanel key={editing.key} file={editing.file} initial={editing.initial} onClose={() => setEditing(null)} onDeleted={() => setEditing(null)}
                     onCreated={editing.closeOnCreate ? () => setEditing(null) : undefined} />
        </Modal>
      )}
    </div>
  );
}

/** Deletes the item `file`, offering to undo it. */
function useDelete() {
  const qc = useQueryClient();
  const remove = useDeleteItem();
  return async (file: string) => {
    try {
      await remove(await qc.fetchQuery({ ...itemQuery(file), staleTime: 0 }));
    } catch (e) { showError(e); }
  };
}

const OPEN_KEY = 'projects-open';

/** Files of the expanded projects; storage can be unavailable or hold garbage, then all start collapsed. */
function readOpen(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((f) => typeof f === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Remembers which projects are expanded across reloads. */
function useOpenProjects() {
  const [openFiles, setOpenFiles] = useState(readOpen);
  const toggle = (file: string, isOpen: boolean) => {
    if (openFiles.has(file) === isOpen) return;
    const next = new Set(openFiles);
    if (isOpen) next.add(file); else next.delete(file);
    setOpenFiles(next);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify([...next])); } catch { /* not worth surfacing */ }
  };
  return { openFiles, toggle };
}

type Handlers = { onOpen: (file: string) => void; onAdd: (initial: string, closeOnCreate?: boolean) => void; onDelete: (file: string) => void };

function Lists({ projects: data, onOpen: open, onAdd: add, onDelete: del }: { projects: Projects } & Handlers) {
  const { openFiles, toggle } = useOpenProjects();
  return (
    <>
      {!data.projects.length && <p className="text-base-content/50">No projects.</p>}
      {data.projects.map((p) => (
        <details key={p.file} className="collapse collapse-arrow border border-base-300 mb-2"
                 open={openFiles.has(p.file)} onToggle={(e) => toggle(p.file, e.currentTarget.open)}>
          <summary className="collapse-title font-semibold">
            {p.heading || 'untitled'} <span className="text-base-content/50 font-normal">({p.issues.length})</span>
          </summary>
          <div className="collapse-content">
            <div className="flex gap-1 mb-2">
              <button className="btn btn-xs" onClick={() => open(p.file)}><Pencil size={14} />Edit project</button>
              <button className="btn btn-xs" onClick={() => add(newIssue(p.file), true)}><Plus size={14} />Issue</button>
              <button className="btn btn-xs btn-ghost text-error ml-auto" onClick={() => del(p.file)}><Trash2 size={14} />Delete project</button>
            </div>
            <IssueList issues={p.issues} onOpen={open} onDelete={del} />
          </div>
        </details>
      ))}
      {!!data.orphans.length && (
        <div className="mt-6">
          <h2 className="font-semibold mb-1">Issues without a project</h2>
          <p className="text-sm text-base-content/50 mb-2">An issue needs a relationship <code>-&gt; project @&lt;project&gt;</code> to a project.</p>
          <IssueList issues={data.orphans} onOpen={open} onDelete={del} />
        </div>
      )}
    </>
  );
}

/** Issues to think about come first (the backend's order), tinted; the bulb/hammer flips an issue between think and build. */
function IssueList({ issues, onOpen, onDelete }: { issues: ProjectIssue[] } & Omit<Handlers, 'onAdd'>) {
  const qc = useQueryClient();
  const flip = async (i: ProjectIssue) => {
    try {
      await setThink(i.file, !i.think);
      await itemsChanged(qc);
    } catch (e) { showError(e); }
  };
  if (!issues.length) return <p className="text-sm text-base-content/50">No issues.</p>;
  return (
    <ul className="list">
      {issues.map((i) => (
        <li key={i.file} className={`list-row py-1 items-center cursor-pointer hover:bg-base-200 ${i.think ? 'bg-info/10' : ''}`} onClick={() => onOpen(i.file)}>
          <span className="list-col-grow">{i.heading || 'untitled'}</span>
          <button className={`btn btn-ghost btn-xs btn-square ${i.think ? 'text-info' : 'text-base-content/40'}`}
                  title={i.think ? 'think about this' : 'build this'}
                  onClick={(e) => { e.stopPropagation(); void flip(i); }}>{i.think ? <Lightbulb size={14} /> : <Hammer size={14} />}</button>
          <button className="btn btn-ghost btn-xs btn-square text-error" title="delete"
                  onClick={(e) => { e.stopPropagation(); onDelete(i.file); }}><Trash2 size={14} /></button>
        </li>
      ))}
    </ul>
  );
}
