import type { Ref } from 'react';
import { NoteSearch } from '@/entities/item/search/NoteSearch';
import type { SearchState } from '@/entities/item/search/search';
import type { NoteSearch as Found } from '@/entities/item/search/useNoteSearch';
import { SemanticNote } from './SemanticNote';

type Props = {
  state: SearchState;
  onState: (state: SearchState) => void;
  /** what useNoteSearch found for `state` */
  found: Found;
  historyKey: string;
  /** notes to set apart (open, pinned) */
  marked: { has: (file: string) => boolean };
  onSelect: (file: string) => void;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
};

/** A page's paged search with every filter: semantic ranking and orphans. Where it sits is the page's. */
export function NoteSearchSidebar({ state, onState, found, historyKey, marked, onSelect, autoFocus, inputRef }: Props) {
  return (
    <NoteSearch state={state} onState={onState} found={found} semanticToggle orphanFilter historyKey={historyKey} autoFocus={autoFocus}
                inputRef={inputRef} marked={marked} onSelect={onSelect}>
      <SemanticNote status={found.semantic} ranking={state.semantic && !!state.query.trim()} />
    </NoteSearch>
  );
}
