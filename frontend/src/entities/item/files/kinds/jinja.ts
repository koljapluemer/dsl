import { jinja } from '@codemirror/lang-jinja';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

/** Jinja templates, as file_kinds.JINJA: edited as text, highlighted as Jinja in HTML. */
export const JINJA_EXTENSIONS = ['j2', 'jinja', 'jinja2'];

export const jinjaEditor = (): Extension[] => [jinja(), syntaxHighlighting(defaultHighlightStyle, { fallback: true })];
