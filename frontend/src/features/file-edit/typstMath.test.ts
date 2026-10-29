import { describe, expect, it } from 'vitest';
import { texMathToTypst } from './typstMath';

describe('texMathToTypst', () => {
  it('converts inline and display TeX math', () => {
    expect(texMathToTypst('so $\\frac{a}{b}$ and\n$$\n\\alpha_{1}\n$$')).toBe('so $a/b$ and\n$ alpha_1 $');
  });

  it('leaves math that may be Typst already, and text', () => {
    const text = 'cost $5 and $x^2$, `$\\a$`';
    expect(texMathToTypst(text)).toBe(text);
  });

  it('leaves math that does not convert', () => {
    expect(texMathToTypst('$\\frac{a$ and $\\beta$')).toBe('$\\frac{a$ and $beta$');
  });
});
