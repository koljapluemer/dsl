import { markdown } from './markdown';

type Props = { source: string; refs?: Record<string, string | null>; onRef?: (file: string) => void; className?: string };

export function Markdown({ source, refs, onRef, className = '' }: Props) {
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: markdown(source, refs) }} onClick={onRef ? (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-note]');
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    onRef(`${link.dataset.note}.txt`);
  } : undefined} />;
}
