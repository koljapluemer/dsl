// Bundles src/ into one self-contained, offline dist/index.html: body.html, the
// CSS and the JS inlined, plus the bridge the app talks to. Don't edit the bridge.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const MAX_BYTES = 5 * 1024 * 1024;

const BRIDGE = `(() => {
  const post = (m) => { if (parent !== window) parent.postMessage({ source: 'thea', ...m }, '*'); };
  const apply = (mode) => { document.documentElement.dataset.theme = mode; document.documentElement.style.colorScheme = mode; };
  apply(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  addEventListener('message', (e) => { if (e.source === parent && e.data && e.data.type === 'theme') apply(e.data.mode === 'dark' ? 'dark' : 'light'); });
  addEventListener('error', (e) => post({ type: 'error', message: String(e.message || e.error) }));
  addEventListener('unhandledrejection', (e) => post({ type: 'error', message: String((e.reason && e.reason.message) || e.reason) }));
  const size = () => post({ type: 'resize', height: Math.ceil(document.documentElement.getBoundingClientRect().height) });
  addEventListener('DOMContentLoaded', () => { new ResizeObserver(size).observe(document.documentElement); size(); });
})();`;

// the theme every viz starts from; style.css builds on these variables
const BASE = `html, body { margin: 0; }
:root { --viz-bg: transparent; --viz-surface: #f4f4f5; --viz-fg: #18181b; --viz-muted: #71717a; --viz-border: #e4e4e7;
  --viz-accent: #2563eb; --viz-series: #2563eb, #ea580c, #16a34a, #9333ea, #db2777, #0891b2;
  --viz-font: system-ui, "Noto Sans", "DejaVu Sans", sans-serif; --viz-mono: ui-monospace, "DejaVu Sans Mono", monospace;
  color: var(--viz-fg); background: var(--viz-bg); font: 15px/1.5 var(--viz-font); }
:root[data-theme="dark"] { --viz-surface: #27272a; --viz-fg: #f4f4f5; --viz-muted: #a1a1aa; --viz-border: #3f3f46;
  --viz-accent: #60a5fa; --viz-series: #60a5fa, #fb923c, #4ade80, #c084fc, #f472b6, #22d3ee; }`;

const inline = (code, tag) => code.replaceAll(`</${tag}`, `<\\/${tag}`);

const result = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  write: false,
  outdir: 'dist',
  format: 'iife',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.csv': 'text', '.txt': 'text' },
});
const out = (ext) => result.outputFiles.filter((f) => f.path.endsWith(ext)).map((f) => f.text).join('\n');
const body = await readFile('src/body.html', 'utf-8');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script data-thea-bridge>${BRIDGE}</script>
<style>${BASE}</style>
<style>${inline(out('.css'), 'style')}</style>
</head>
<body>
${body}
<script>${inline(out('.js'), 'script')}</script>
</body>
</html>
`;
if (Buffer.byteLength(html) > MAX_BYTES) throw new Error(`dist/index.html is ${Buffer.byteLength(html)} bytes, more than ${MAX_BYTES}`);
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
