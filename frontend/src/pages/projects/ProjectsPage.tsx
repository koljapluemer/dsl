import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { ProjectIssue, Projects } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { itemQuery } from '@/entities/item/queries';
import { useDeleteItem } from '@/features/item-delete/useDeleteItem';
import { ItemModal } from './ItemModal';
import { NEW_PROJECT, newIssue, projectsQuery } from './projects';

/** The modal: an item to edit, or a new one starting as `initial`. */
type Editing = { file: string | null; initial: string; key: number };

/** Projects, each collapsible with its issues, and the issues without a project; items open in a modal to edit, add or delete. */
export function ProjectsPage() {
  const { data } = useQuery(projectsQuery);
  const [editing, setEditing] = useState<Editing | null>(null);
  const open = (file: string) => setEditing({ file, initial: '', key: Date.now() });
  const add = (initial: string) => setEditing({ file: null, initial, key: Date.now() });
  const del = useDelete();

  return (
    <div>
      <button className="btn btn-sm mb-4" onClick={() => add(NEW_PROJECT)}><Plus size={16} />Project</button>
      {data && <Lists projects={data} onOpen={open} onAdd={add} onDelete={del} />}
      {editing && <ItemModal key={editing.key} file={editing.file} initial={editing.initial} onClose={() => setEditing(null)} />}
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

type Handlers = { onOpen: (file: string) => void; onAdd: (initial: string) => void; onDelete: (file: string) => void };

function Lists({ projects: data, onOpen: open, onAdd: add, onDelete: del }: { projects: Projects } & Handlers) {
  return (
    <>
      {!data.projects.length && <p className="text-base-content/50">No projects.</p>}
      {data.projects.map((p) => (
        <details key={p.file} className="collapse collapse-arrow border border-base-300 mb-2">
          <summary className="collapse-title font-semibold">
            {p.heading || p.file} <span className="text-base-content/50 font-normal">({p.issues.length})</span>
          </summary>
          <div className="collapse-content">
            <div className="flex gap-1 mb-2">
              <button className="btn btn-xs" onClick={() => open(p.file)}><Pencil size={14} />Edit project</button>
              <button className="btn btn-xs" onClick={() => add(newIssue(p.file))}><Plus size={14} />Issue</button>
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

function IssueList({ issues, onOpen, onDelete }: { issues: ProjectIssue[] } & Omit<Handlers, 'onAdd'>) {
  if (!issues.length) return <p className="text-sm text-base-content/50">No issues.</p>;
  return (
    <ul className="list">
      {issues.map((i) => (
        <li key={i.file} className="list-row py-1 items-center cursor-pointer hover:bg-base-200" onClick={() => onOpen(i.file)}>
          <span className="list-col-grow">{i.heading || i.file}</span>
          <button className="btn btn-ghost btn-xs btn-square text-error" title="delete"
                  onClick={(e) => { e.stopPropagation(); onDelete(i.file); }}><Trash2 size={14} /></button>
        </li>
      ))}
    </ul>
  );
}
