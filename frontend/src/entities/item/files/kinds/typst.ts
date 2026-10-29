import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { typst_lezer } from 'codemirror-lang-typst/lezer';

/** Typst documents, as file_kinds.TYPST: edited as text, highlighted as Typst, compiled to the PDF beside them when written. */
export const TYPST_EXTENSIONS = ['typ'];

export const typstEditor = (): Extension[] => [typst_lezer(), syntaxHighlighting(defaultHighlightStyle, { fallback: true })];

/** The PDF a Typst file is compiled to (as file_kinds.pdf_of). */
export const pdfOf = (path: string) => path.replace(/\.[^./]*$/, '') + '.pdf';
