import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Globe, PanelLeft, TriangleAlert } from 'lucide-react';
import { showError } from '@/dumb/notice';
import { itemsChanged, saveItem } from '@/entities/item/mutations';
import { itemQuery } from '@/entities/item/queries';
import { useSchema } from '@/entities/item/schema';
import { useSidebarAction } from '@/entities/item/sidebar';
import { Note } from '@/meta/note/Note';
import { publishedQuery, routeTree, withPublish, type PublishedSearch, type RouteNode } from './published';

/**
 * The notes with a `publish` route, as a tree of their routes' segments, beside
 * the one open in the standard editor, written as focus leaves it. From the
 * sidebar, any note opens here, or gets a `publish` block first.
 */
export function PublishedPage() {
  const qc = useQueryClient();
  const schema = useSchema();
  const navigate = useNavigate();
  const { open } = useSearch({ strict: false }) as PublishedSearch;
  const { data } = useQuery(publishedQuery);
  /** on a narrow screen the tree takes the place of the editor */
  const [listing, setListing] = useState(!open);

  const show = (file: string | undefined) => {
    setListing(!file);
    void navigate({ to: '.', search: { open: file } });
  };

  /** Adds a `publish` block to the note unless it has one, then opens it. */
  async function publish(file: string) {
    try {
      const item = await qc.fetchQuery({ ...itemQuery(file), staleTime: 0 });
      const text = withPublish(schema, item.text, file);
      if (text !== null) {
        qc.setQueryData(itemQuery(file).queryKey, await saveItem(file, text));
        void itemsChanged(qc);
      }
      show(file);
    } catch (e) { showError(e); }
  }

  useSidebarAction([
    { icon: <Globe size={14} />, title: 'publish here', run: (file) => void publish(file), applies: (r) => !r.route },
    { icon: <PanelLeft size={14} />, title: 'open here', run: show, marked: { has: (file) => file === open } },
  ]);

  const tree = routeTree(data ?? []);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-4 @3xl:grid @3xl:grid-cols-[22rem_minmax(0,1fr)] @3xl:gap-4">
      <button type="button" className="btn btn-sm self-start @3xl:hidden" onClick={() => setListing(!listing)}>
        <PanelLeft size={16} />{listing ? 'Editor' : 'Published'}
      </button>
      <aside className={`flex min-h-0 flex-1 flex-col border border-base-300 p-2 @3xl:flex-none ${listing ? '' : '@max-3xl:hidden'}`}>
        <ul className="menu menu-sm min-h-0 w-full flex-1 flex-nowrap overflow-y-auto font-mono">
          {tree.map((n) => <RouteEntry key={n.route} node={n} open={open} onOpen={show} />)}
          {data && !tree.length && <li className="px-2 font-sans text-base-content/50">Nothing published.</li>}
        </ul>
      </aside>
      <section className={`min-h-0 flex-1 ${listing ? '@max-3xl:hidden' : ''}`}>
        {open ? (
          <Note key={open} file={open} commit="blur" fill className="h-full rounded-box border border-base-300 bg-base-100 p-3"
                onDeleted={() => show(undefined)} />
        ) : <p className="text-sm text-base-content/50">Pick a note.</p>}
      </section>
    </div>
  );
}

/** A route: its notes by the segment's name, then, as a folder, the routes below it. */
function RouteEntry({ node, open, onOpen }: { node: RouteNode; open?: string; onOpen: (file: string) => void }) {
  const clash = node.items.length > 1;
  const notes = node.items.map((item) => (
    <li key={item.file}>
      <button type="button" className={item.file === open ? 'menu-active' : ''} title={`${node.route} (${item.file})`} onClick={() => onOpen(item.file)}>
        <span className="min-w-0 truncate">{node.name}</span>
        {clash && <TriangleAlert size={14} className="shrink-0 text-warning" aria-label={`${node.items.length} notes at ${node.route}`} />}
      </button>
    </li>
  ));
  if (!node.children.length) return <>{notes}</>;
  return (
    <>
      {notes}
      <li>
        <details open>
          <summary>{node.name}/</summary>
          <ul>{node.children.map((c) => <RouteEntry key={c.route} node={c} open={open} onOpen={onOpen} />)}</ul>
        </details>
      </li>
    </>
  );
}
