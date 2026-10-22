import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Hammer, Lightbulb, Plus } from 'lucide-react';
import type { Item, Projects } from '@/api/types';
import { Note } from '@/meta/note/Note';
import { NoteModal } from '@/meta/note/NoteModal';
import type { TagToggle } from '@/meta/note/tools';
import { NEW_PROJECT, newIssue, projectsQuery, THINK_TAG } from './projects';

/** A new note's modal, starting as `initial`. */
type Adding = { initial: string; key: number };

const THINK: TagToggle = {
  tag: THINK_TAG, icon: Hammer, activeIcon: Lightbulb, title: 'to build (click: to think about)', activeTitle: 'to think about (click: to build)',
};

/** Projects, each expandable to its issues, and the issues without a project; all inline, edited in a modal; new ones too. */
export function ProjectsPage() {
  const { data } = useQuery(projectsQuery);
  const [adding, setAdding] = useState<Adding | null>(null);
  const add = (initial: string) => setAdding({ initial, key: Date.now() });

  return (
    <div>
      <button className="btn btn-sm mb-4" onClick={() => add(NEW_PROJECT)}><Plus size={16} />Project</button>
      {data && <Lists projects={data} onAdd={add} />}
      {adding && <NoteModal key={adding.key} file={null} initial={adding.initial} onClose={() => setAdding(null)} />}
    </div>
  );
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

function Lists({ projects: data, onAdd }: { projects: Projects; onAdd: (initial: string) => void }) {
  const { openFiles, toggle } = useOpenProjects();
  return (
    <>
      {!data.projects.length && <p className="text-base-content/50">No projects.</p>}
      {data.projects.map((p) => (
        <details key={p.file} className="collapse collapse-arrow border border-base-300 mb-2"
                 open={openFiles.has(p.file)} onToggle={(e) => toggle(p.file, e.currentTarget.open)}>
          <summary className="collapse-title font-semibold">
            <Note file={p.file} item={p} render="inline" extraTools={[
              { key: 'count', node: <span className="badge badge-ghost badge-sm font-normal" title="issues">{p.issues.length}</span> },
              { key: 'issue', title: 'add an issue', icon: <Plus size={14} />, onClick: () => onAdd(newIssue(p.file)) },
            ]} />
          </summary>
          <div className="collapse-content">
            <IssueList issues={p.issues} />
          </div>
        </details>
      ))}
      {!!data.orphans.length && (
        <div className="mt-6">
          <h2 className="font-semibold mb-1">Issues without a project</h2>
          <p className="text-sm text-base-content/50 mb-2">An issue needs a relationship <code>-&gt; project @&lt;project&gt;</code> to a project.</p>
          <IssueList issues={data.orphans} />
        </div>
      )}
    </>
  );
}

/** Issues to think about come first (the backend's order). */
function IssueList({ issues }: { issues: Item[] }) {
  if (!issues.length) return <p className="text-sm text-base-content/50">No issues.</p>;
  return (
    <ul className="space-y-1">
      {issues.map((i) => (
        <li key={i.file}><Note file={i.file} item={i} render="inline" inlineWhole tagToggles={[THINK]} className="px-2 py-1" /></li>
      ))}
    </ul>
  );
}
