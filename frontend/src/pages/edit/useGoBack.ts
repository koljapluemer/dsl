import { useNavigate, useRouter } from '@tanstack/react-router';

/** Back to where the editor was opened from (the list with its filter), or to the list. */
export function useGoBack() {
  const router = useRouter();
  const navigate = useNavigate();
  return () => (router.history.canGoBack() ? router.history.back() : navigate({ to: '/' }));
}
