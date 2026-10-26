import { Lexer, marked, Parser, type Token, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
import { inlineReferences, type InlineReference } from './inlineReference';
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

/** Where a note opens as a page of its own: the start page with it open in the sidebar (a new tab's address). */
export const noteHref = (file: string) => `/?sopen=${encodeURIComponent(JSON.stringify([file]))}`;

export type ReferenceHtml = (ref: InlineReference, heading: string | null | undefined) => string;

/** `s` with its inline note references as links (or as a caller's sanitized HTML). */
function expandReferences(s: string, refs: Record<string, string | null>, referenceHtml?: ReferenceHtml) {
  let expanded = s;
  for (const ref of inlineReferences(s).reverse()) {
    const heading = refs[ref.target];
    const label = escapeHtml(ref.label ?? heading ?? ref.target);
    const replacement = referenceHtml?.(ref, heading) ?? (heading === null
      ? `<span class="ov-missing" title="no such note">${label}</span>`
      : `<a class="link link-hover" data-note="${escapeHtml(ref.target)}" href="${noteHref(`${ref.target}.txt`)}">${label}</a>`);
    expanded = expanded.slice(0, ref.from) + replacement + expanded.slice(ref.to);
  }
  return expanded;
}

/** Markdown as sanitized HTML; single newlines break lines. */
export const markdown = (s: string, refs: Record<string, string | null> = {}, referenceHtml?: ReferenceHtml) =>
  DOMPurify.sanitize(marked.parse(expandReferences(s, refs, referenceHtml), { breaks: true, async: false }));

/**
 * One line of Markdown as sanitized inline HTML, cut after `chars` characters of
 * its text (not of its Markdown, so no syntax is cut in half); `cut` says whether
 * it was. The first occurrence of `highlight` in its text is marked.
 */
export function inlineMarkdown(line: string, refs: Record<string, string | null>, chars: number, highlight?: string) {
  const tokens = Lexer.lexInline(expandReferences(line, refs));
  const state = { left: chars, cut: false, needle: highlight?.toLowerCase() || null };
  const html = Parser.parseInline(shorten(tokens, state));
  return { html: DOMPurify.sanitize(html), cut: state.cut };
}

type Budget = { left: number; cut: boolean; needle: string | null };

const text = (s: string): Tokens.Text => ({ type: 'text', raw: s, text: s, escaped: false });
const html = (s: string): Tokens.HTML => ({ type: 'html', raw: s, text: s, block: false, pre: false });

/** The tokens up to the budget's end, the highlight marked in the first text holding it. */
function shorten(tokens: Token[], state: Budget): Token[] {
  const out: Token[] = [];
  for (const token of tokens) {
    if (state.left <= 0) {
      // closing tags still close what was opened; markup is left out silently
      if (token.type === 'html' && token.text.startsWith('</')) out.push(token);
      else if (token.type !== 'html' && token.raw.trim()) state.cut = true;
      continue;
    }
    if ('tokens' in token && token.tokens && token.type !== 'text') {
      out.push({ ...token, tokens: shorten(token.tokens, state) } as Token);
    } else if (token.type === 'text' || token.type === 'escape') {
      out.push(...leaf(token.text, state));
    } else if (token.type === 'codespan') {
      const kept = token.text.slice(0, state.left);
      if (kept.length < token.text.length) state.cut = true;
      state.left -= kept.length;
      out.push({ ...token, text: kept });
    } else {
      out.push(token);
    }
  }
  return out;
}

function leaf(value: string, state: Budget): Token[] {
  const kept = value.slice(0, state.left);
  if (kept.length < value.length) state.cut = true;
  state.left -= kept.length;
  const at = state.needle ? kept.toLowerCase().indexOf(state.needle) : -1;
  if (at < 0) return [text(kept)];
  const end = at + state.needle!.length;
  state.needle = null;
  return [text(kept.slice(0, at)), html('<mark>'), text(kept.slice(at, end)), html('</mark>'), text(kept.slice(end))];
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
