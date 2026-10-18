import { markdown } from './markdown';

export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: markdown(source) }} />;
}
