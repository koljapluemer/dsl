import { useHotkeys } from '@/dumb/keys';
import { Pager } from '@/dumb/Pager';
import { ItemRow } from './ItemRow';
import { SearchBar } from './SearchBar';
import { useItemList } from './useItemList';

/** All items. */
export function NotesPage() {
  const { q, semantic, focused, status, list, setQuery, toggleSemantic, setPage, jump, reload } = useItemList();
  const pages = list ? Math.ceil(list.total / list.page_size) : 0;
  useHotkeys({
    ArrowLeft: () => { if (list && list.page > 0) setPage(list.page - 1); },
    ArrowRight: () => { if (list && list.page + 1 < pages) setPage(list.page + 1); },
  });
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
