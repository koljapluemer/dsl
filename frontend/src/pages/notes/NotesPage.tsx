import { Pager } from '@/dumb/Pager';
import { ItemRow } from './ItemRow';
import { SearchBar } from './SearchBar';
import { useItemList } from './useItemList';

/** All items, or with `attention` the ones with problems. */
export function NotesPage({ attention = false }: { attention?: boolean }) {
  const { q, semantic, focused, status, list, setQuery, toggleSemantic, setPage, jump, reload } = useItemList(attention);
  return (
    <div>
      <SearchBar q={q} semantic={semantic} status={status} onQuery={setQuery} onToggleSemantic={toggleSemantic} onModelInstalled={reload} />
      <table className="table table-zebra">
        <tbody>
          {list?.items.map((i) => <ItemRow key={i.file} item={i} focused={i.file === focused} onRef={jump} />)}
        </tbody>
      </table>
      {list && <Pager page={list.page} pageSize={list.page_size} total={list.total} onPage={setPage} />}
    </div>
  );
}
