import { EditorView } from '@codemirror/view';
import { tex2typst } from 'tex2typst';
import { mathSpans } from '@/dumb/inlineReference';

// what only TeX writes: a command, or a braced sub- or superscript; `$x^2$` reads the same in both
const TEX = /\\[a-zA-Z]|[_^]\{/;

/**
 * `text` with its TeX math (Markdown's `$…$`, `$$…$$`) as Typst math: inline
 * as `$…$`, display as `$ … $`. Math that might already be Typst, or that
 * doesn't convert, is left as it is.
 */
export function texMathToTypst(text: string): string {
  let out = text;
  for (const span of mathSpans(text).reverse()) {
    if (!TEX.test(span.tex)) continue;
    let typst: string;
    try {
      typst = tex2typst(span.tex.trim());
    } catch {
      continue;
    }
    out = out.slice(0, span.from) + (span.display ? `$ ${typst} $` : `$${typst}$`) + out.slice(span.to);
  }
  return out;
}

/** Pasted text with TeX math gets it as Typst math (the note editor's math; see texMathToTypst). */
export const typstMathPaste = EditorView.domEventHandlers({
  paste(event, view) {
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return false;
    const converted = texMathToTypst(text);
    if (converted === text) return false;
    event.preventDefault();
    view.dispatch(view.state.replaceSelection(converted), { userEvent: 'input.paste', scrollIntoView: true });
    return true;
  },
});
