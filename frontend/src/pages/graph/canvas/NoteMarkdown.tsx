import { markdown } from '@/dumb/markdown';

const PROSE_CLASS = [
  'note-markdown prose prose-sm max-w-none',
  'prose-code:before:content-none prose-code:after:content-none',
  // Blockquotes: keep the accent bar + a subtle fill, drop the plugin's
  // bold + italic styling and the auto-inserted curly quote marks.
  'prose-blockquote:font-normal prose-blockquote:not-italic',
  'prose-blockquote: prose-blockquote:bg-base-200/60 prose-blockquote:py-2 prose-blockquote:pr-4',
  '[&_blockquote_p:first-of-type::before]:content-none',
  '[&_blockquote_p:last-of-type::after]:content-none',
].join(' ');

/** A note's Markdown (body or extra), with links opening in a new tab. `small` sets it a size down. */
export function NoteMarkdown({ markdown: source, small = false }: { markdown: string; small?: boolean }) {
  return <div className={small ? `${PROSE_CLASS} text-xs!` : PROSE_CLASS} dangerouslySetInnerHTML={{ __html: markdown(source) }} />;
}
