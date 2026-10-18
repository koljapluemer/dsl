import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import type { ProjectIssue, Projects } from '@/api/types';
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

  return (
    <div>
      <button className="btn btn-sm mb-4" onClick={() => add(NEW_PROJECT)}><Plus size={16} />Project</button>
      {data && <Lists projects={data} onOpen={open} onAdd={add} />}
      {editing && <ItemModal key={editing.key} file={editing.file} initial={editing.initial} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Lists({ projects: data, onOpen: open, onAdd: add }: { projects: Projects; onOpen: (file: string) => void; onAdd: (initial: string) => void }) {
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
            </div>
            <IssueList issues={p.issues} onOpen={open} />
          </div>
        </details>
      ))}
      {!!data.orphans.length && (
        <div className="mt-6">
          <h2 className="font-semibold mb-1">Issues without a project</h2>
          <p className="text-sm text-base-content/50 mb-2">An issue needs a relationship <code>-&gt; project @&lt;project&gt;</code> to a project.</p>
          <IssueList issues={data.orphans} onOpen={open} />
        </div>
      )}
    </>
  );
}

function IssueList({ issues, onOpen }: { issues: ProjectIssue[]; onOpen: (file: string) => void }) {
  if (!issues.length) return <p className="text-sm text-base-content/50">No issues.</p>;
  return (
    <ul className="list">
      {issues.map((i) => (
        <li key={i.file} className="list-row py-1 cursor-pointer hover:bg-base-200" onClick={() => onOpen(i.file)}>{i.heading || i.file}</li>
      ))}
    </ul>
  );
}
