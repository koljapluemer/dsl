/** Typst documents, as file_kinds.TYPST: edited as text, compiled to the PDF beside them when written. */
export const TYPST_EXTENSIONS = ['typ'];

/** The PDF a Typst file is compiled to (as file_kinds.pdf_of). */
export const pdfOf = (path: string) => path.replace(/\.[^./]*$/, '') + '.pdf';
