import { useNavigate } from '@tanstack/react-router';

/** Opens a note where notes are read on their own: the Notes tab, with it open. */
export function useOpenNote() {
  const navigate = useNavigate();
  return (file: string) => void navigate({ to: '/', search: { open: [file] } });
}
