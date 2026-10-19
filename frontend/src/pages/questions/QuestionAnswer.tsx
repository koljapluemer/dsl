import { useState } from 'react';
import type { Answered, Question, Suggestion } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { NotePicker, type Pick } from '@/features/item-relate/NotePicker';
import { answer } from './questions';

type Props = {
  file: string;
  question: Question;
  onAnswered: (note: Answered) => void;
};

/** One question about a note, answered by linking an existing note or a new one. */
export function QuestionAnswer({ file, question, onAnswered }: Props) {
  const [busy, setBusy] = useState(false);
  /** the notes linked so far */
  const [linked, setLinked] = useState<Suggestion[]>([]);

  async function submit(how: Pick) {
    setBusy(true);
    try {
      const res = await answer(file, question.id, how);
      setLinked((l) => [...l, res.target]);
      onAnswered(res);
      return true;
    } catch (e) {
      showError(e);
      return false;
    } finally { setBusy(false); }
  }

  return (
    <div>
      <p className="font-medium mb-1">{question.question}</p>
      {linked.map((l) => (
        <div key={l.file} className="text-sm"><span className="ov-muted">{question.label} →</span> {l.heading || 'untitled'}</div>
      ))}
      <div className="mt-1">
        <NotePicker exclude={[file, ...linked.map((l) => l.file)]} busy={busy} onPick={submit} />
      </div>
    </div>
  );
}
