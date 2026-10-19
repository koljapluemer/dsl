import { useState } from 'react';
import type { Answered, Question, Suggestion } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { NotePicker, type Pick } from './NotePicker';
import { answer } from './questions';

type Props = {
  file: string;
  question: Question;
  /** resolves once pending edits of the note are saved */
  flush: () => Promise<void>;
  onAnswered: (note: Answered) => void;
};

/** One question about a note, answered by linking an existing note or a new one. */
export function QuestionAnswer({ file, question, flush, onAnswered }: Props) {
  const [busy, setBusy] = useState(false);
  /** the notes linked so far */
  const [linked, setLinked] = useState<Suggestion[]>([]);

  async function submit(how: Pick) {
    setBusy(true);
    try {
      await flush();
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
        <div key={l.file} className="text-sm"><span className="ov-muted">{question.label} →</span> {l.heading || l.file}</div>
      ))}
      <div className="mt-1">
        <NotePicker exclude={[file, ...linked.map((l) => l.file)]} busy={busy} onPick={submit} />
      </div>
    </div>
  );
}
