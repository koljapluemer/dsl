import { useState } from 'react';
import { Plus } from 'lucide-react';
import { NoteSearch } from '@/entities/item/search/NoteSearch';
import { EMPTY_SEARCH } from '@/entities/item/search/search';
import { useNoteSearch } from '@/entities/item/search/useNoteSearch';

export type Pick = { target: string } | { text: string };

const SUGGESTIONS = 8;

type Props = {
  /** files not to suggest */
  exclude: string[];
  busy: boolean;
  /** resolves once the pick is done; the field is cleared when it succeeds */
  onPick: (how: Pick) => Promise<boolean>;
  inputRef?: React.Ref<HTMLInputElement>;
  /** small controls, for tight spots like table rows */
  compact?: boolean;
};

/** A field whose text either picks an existing note (from search suggestions) or becomes a new one. */
export function NotePicker({ exclude, busy, onPick, inputRef, compact }: Props) {
  const [search, setSearch] = useState(EMPTY_SEARCH);
  const found = useNoteSearch(search, { exclude, regex: false, limit: SUGGESTIONS, browse: false, enabled: !busy });

  async function submit(how: Pick) {
    if (busy) return;
    if (await onPick(how)) setSearch(EMPTY_SEARCH);
  }

  return (
    <NoteSearch state={search} onState={setSearch} found={found} variant="suggest" syntax="words" disabled={busy} inputRef={inputRef} compact={compact}
                placeholder="Search a note to link, or write a new one" onSelect={(target) => void submit({ target })}
                action={{ label: <><Plus size={compact ? 16 : 20} />{!compact && <span className="hidden sm:inline">New note</span>}</>, title: 'create as new note', run: (text) => void submit({ text }) }} />
  );
}
