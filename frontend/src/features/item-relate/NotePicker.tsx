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
};

/**
 * A field whose text either picks an existing note (from search suggestions) or becomes a new one;
 * focused but empty, it suggests the most recently edited notes.
 */
export function NotePicker({ exclude, busy, onPick, inputRef }: Props) {
  const [search, setSearch] = useState(EMPTY_SEARCH);
  const [focused, setFocused] = useState(false);
  const found = useNoteSearch(search, { exclude, regex: false, limit: SUGGESTIONS, browse: focused, enabled: !busy });

  async function submit(how: Pick) {
    if (busy) return;
    if (await onPick(how)) setSearch(EMPTY_SEARCH);
  }

  return (
    <div className="w-full" onFocus={() => setFocused(true)}
         onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <NoteSearch state={search} onState={setSearch} found={found} variant="suggest" syntax="words" disabled={busy} inputRef={inputRef}
                  placeholder="Search a note, or write a new one" onSelect={(target) => void submit({ target })}
                  action={{ label: <Plus size={20} />, title: 'create as new note', run: (text) => void submit({ text }) }} />
    </div>
  );
}
