import { marked } from 'marked';
import DOMPurify from 'dompurify';
import './markdown.css';

// links in rendered markdown open in a new tab
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener');
  }
});

/** Markdown as sanitized HTML; single newlines break lines. */
export const markdown = (s: string) => DOMPurify.sanitize(marked.parse(s, { breaks: true, async: false }));
