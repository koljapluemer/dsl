import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { inlineReferences } from './inlineReference';
import './markdown.css';

// External links open in a new tab; note links are handled inside the app.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    if (node.hasAttribute('data-note')) {
      node.removeAttribute('target');
      node.removeAttribute('rel');
    } else {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener');
    }
  }
});

/** Markdown as sanitized HTML; single newlines break lines. */
export const markdown = (s: string, refs: Record<string, string | null> = {}) => {
  let expanded = s;
  for (const ref of inlineReferences(s).reverse()) {
    const heading = refs[ref.target];
    const label = escapeHtml(ref.label ?? heading ?? ref.target);
    const replacement = heading === null
      ? `<span class="ov-missing" title="no such note">${label}</span>`
      : `<a class="link link-hover" data-note="${escapeHtml(ref.target)}" href="/edit/${encodeURIComponent(`${ref.target}.txt`)}">${label}</a>`;
    expanded = expanded.slice(0, ref.from) + replacement + expanded.slice(ref.to);
  }
  return DOMPurify.sanitize(marked.parse(expanded, { breaks: true, async: false }));
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
