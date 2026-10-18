/** 32-bit FNV-1a over UTF-8; stable across runs, so a note keeps its color (as the zero app's). */
function fnv1a(input: string, offsetBasis = 0x811c9dc5): number {
  let hash = offsetBasis;
  for (const byte of new TextEncoder().encode(input)) hash = Math.imul((hash ^ byte) >>> 0, 0x01000193) >>> 0;
  return hash;
}

/** Hue in degrees [0, 360) derived from the file name. */
export const hueFor = (file: string) => fnv1a(file, 0x9747b28c) % 360;

/** A light card color for the file: HSV(hue, 0.3, 0.95). */
export function cardColorFor(file: string): string {
  const h = hueFor(file) / 60, s = 0.3, v = 0.95;
  const c = v * s, x = c * (1 - Math.abs((h % 2) - 1)), m = v - c;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return `rgb(${[r, g, b].map((k) => Math.round((k + m) * 255)).join(', ')})`;
}
