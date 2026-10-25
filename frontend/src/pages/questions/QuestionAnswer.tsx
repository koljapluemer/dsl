import { useState } from 'react';
import type { Answered, Question } from '@/api/types';
import { showError } from '@/dumb/notice';
import { NotePicker, type Pick } from '@/features/item-relate/NotePicker';
import { answer } from './questions';

type Props = {
  file: string;
  question: Question;
  /** the note, now related to the answer (the note's relationships show it) */
  onAnswered: (note: Answered) => void;
};

/** One question about a note, answered by linking an existing note or a new one. */
export function QuestionAnswer({ file, question, onAnswered }: Props) {
  const [busy, setBusy] = useState(false);

  async function submit(how: Pick) {
    setBusy(true);
    try {
      onAnswered(await answer(file, question.id, how));
      return true;
    } catch (e) {
      showError(e);
      return false;
    } finally { setBusy(false); }
  }

  return (
    <div>
      <p className="font-medium mb-1">{question.question}</p>
      <NotePicker exclude={[file]} busy={busy} onPick={submit} />
    </div>
  );
}
