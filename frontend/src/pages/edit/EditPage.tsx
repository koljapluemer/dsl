import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { NotePanel } from '@/meta/note-panel/NotePanel';
import { useGoBack } from './useGoBack';

/**
 * /new and /edit/$file: one note with its relationships. A new note moves to
 * its /edit URL once saved, keeping the panel; any other change of URL shows a fresh one.
 */
export function EditPage() {
  const navigate = useNavigate();
  const goBack = useGoBack();
  const { file } = useParams({ strict: false }) as { file?: string };
  const [created, setCreated] = useState<string | null>(null);
  const [shown, setShown] = useState({ file, session: 0 });
  if (file !== shown.file) setShown({ file, session: file && file === created ? shown.session : shown.session + 1 });

  return (
    <div>
      <button className="btn btn-square mb-4" title="back" onClick={goBack}><ArrowLeft size={20} /></button>
      <NotePanel key={shown.session} file={file ?? null} relationships onClose={file ? undefined : goBack} onDeleted={goBack}
                 onSaved={(saved) => {
                   if (file) return;
                   setCreated(saved.file);
                   void navigate({ to: '/edit/$file', params: { file: saved.file }, replace: true });
                 }} />
    </div>
  );
}
