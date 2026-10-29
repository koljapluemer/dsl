import { Lexer, Marked, marked, Parser, type MarkedExtension, type Token, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
import temml from 'temml';
import 'temml/dist/Temml-Local.css';
import { inlineReferences, type InlineReference } from './inlineReference';
import { mathAt } from './math';
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

/** A new tab's address for a note: this page (the start page outside a browser) with it open in the sidebar. */
export const noteHref = (file: string) =>
  `${typeof location === 'undefined' ? '/' : location.pathname}?sopen=${encodeURIComponent(JSON.stringify([file]))}`;

type MathToken = Tokens.Generic & { tex: string; display: boolean };

/** `$…$` and `$$…$$` as MathML (see math.ts); bad TeX shows as Temml's error. */
const math: MarkedExtension = {
  extensions: [{
    name: 'math',
    level: 'inline',
    start: (src) => {
      for (let i = src.indexOf('$'); i >= 0; i = src.indexOf('$', i + 1)) if (!escaped(src, i)) return i;
      return undefined;
    },
    tokenizer(src) {
      const span = mathAt(src, 0);
      return span ? { type: 'math', raw: src.slice(0, span.to), tex: span.tex, display: span.display } : undefined;
    },
    renderer: (token) => temml.renderToString((token as MathToken).tex, { displayMode: (token as MathToken).display, throwOnError: false }),
  }],
};
marked.use(math);

function escaped(text: string, at: number) {
  let slashes = 0;
  while (at > 0 && text[--at] === '\\') slashes++;
  return slashes % 2 === 1;
}

// MathML's `form` (prefix/postfix fences), which DOMPurify doesn't know
const SANITIZE = { ADD_ATTR: ['form'] };

export type ReferenceHtml = (ref: InlineReference, heading: string | null | undefined) => string;

/** `s` with its inline note references as links (or as a caller's sanitized HTML). */
function expandReferences(s: string, refs: Record<string, string | null>, referenceHtml?: ReferenceHtml) {
  let expanded = s;
  for (const ref of inlineReferences(s).reverse()) {
    const heading = refs[ref.target];
    // `$` as an entity: a label is never math
    const label = escapeHtml(ref.label ?? heading ?? ref.target).replaceAll('$', '&#36;');
    const replacement = referenceHtml?.(ref, heading) ?? (heading === null
      ? `<span class="ov-missing" title="no such note">${label}</span>`
      : `<a class="link link-hover" data-note="${escapeHtml(ref.target)}" href="${noteHref(`${ref.target}.txt`)}">${label}</a>`);
    expanded = expanded.slice(0, ref.from) + replacement + expanded.slice(ref.to);
  }
  return expanded;
}

/** Markdown as sanitized HTML; single newlines break lines. */
export const markdown = (s: string, refs: Record<string, string | null> = {}, referenceHtml?: ReferenceHtml) =>
  DOMPurify.sanitize(marked.parse(expandReferences(s, refs, referenceHtml), { breaks: true, async: false }), SANITIZE);

// the fence kinds the current `slotted` call leaves slots for
let slotKinds: readonly string[] = [];
const slotting = new Marked(math, {
  renderer: {
    code({ text, lang }) {
      const info = (lang ?? '').trim();
      const kind = info.split(/\s+/)[0];
      if (!slotKinds.includes(kind)) return false;
      return `<div data-fence="${escapeHtml(kind)}" data-info="${escapeHtml(info)}" data-code="${escapeHtml(text)}"></div>\n`;
    },
  },
});

/**
 * As `markdown`, but a fenced code block whose info string starts with one of
 * `kinds` becomes an empty slot, `<div data-fence data-info data-code>`, for
 * the caller to fill (see Markdown's `fences`).
 */
export function slotted(s: string, refs: Record<string, string | null>, kinds: readonly string[]) {
  slotKinds = kinds;
  try {
    return DOMPurify.sanitize(slotting.parse(expandReferences(s, refs), { breaks: true, async: false }), SANITIZE);
  } finally {
    slotKinds = [];
  }
}

/**
 * One line of Markdown as sanitized inline HTML, cut after `chars` characters of
 * its text (not of its Markdown, so no syntax is cut in half); `cut` says whether
 * it was. The first occurrence of `highlight` in its text is marked.
 */
export function inlineMarkdown(line: string, refs: Record<string, string | null>, chars: number, highlight?: string) {
  const tokens = Lexer.lexInline(expandReferences(line, refs));
  const state = { left: chars, cut: false, needle: highlight?.toLowerCase() || null };
  const html = Parser.parseInline(shorten(tokens, state));
  return { html: DOMPurify.sanitize(html, SANITIZE), cut: state.cut };
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
    } else if (token.type === 'math') {
      // whole or not at all, counted by its TeX
      state.left -= (token as MathToken).tex.length;
      out.push(token);
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
