import { useRecentNotes } from '../useRecentNotes';
import { NoteListItem } from './NoteListItem';
import { PagedNoteList } from './PagedNoteList';

export interface RecentTabProps {
  page: number;
  onPageChange: (page: number) => void;
  pins: ReadonlyMap<string, number>;
  onSelectNote: (filename: string) => void;
}

export function RecentTab({ page, onPageChange, pins, onSelectNote }: RecentTabProps) {
  const { results, total, loading } = useRecentNotes(page);

  return (
    <>
      <PagedNoteList page={page} total={total} loading={loading} onPageChange={onPageChange} emptyMessage="No recent notes.">
        {results.map((note) => (
          <NoteListItem key={note.filename} preview={note.preview} isPinned={pins.has(note.filename)} onSelect={() => onSelectNote(note.filename)} />
        ))}
      </PagedNoteList>
    </>
  );
}
