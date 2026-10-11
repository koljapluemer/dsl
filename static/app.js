// @ts-check
/**
 * @typedef {'date'|'month'|'weekday'} ValueType
 * @typedef {{name: string, type: ValueType[]}} ArgDef
 * @typedef {{role: 'primary'|'modifier', args: ArgDef[], options: Record<string, {type: ValueType[], meaning: string}>, excludes: string[], meaning: string}} KeywordDef
 * @typedef {{version: number, keywords: Record<string, KeywordDef>}} Schema
 * @typedef {{code: string, line: number | null, detail: string | null}} Diagnostic
 * @typedef {{file: string, text: string, errors: Diagnostic[], warnings: Diagnostic[]}} Item
 */

import { EditorState } from '@codemirror/state';
import { EditorView, ViewPlugin, Decoration, keymap, drawSelection } from '@codemirror/view';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { linter } from '@codemirror/lint';

// @ts-ignore globals from CDN
const { createApp, ref, computed, onMounted, onBeforeUnmount, watch, h } = Vue;
// @ts-ignore
const lucide_ = lucide;

/**
 * @param {string} method
 * @param {string} url
 * @param {any} [body]
 */
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

const go = (/** @type {string} */ hash) => { location.hash = hash; };

/** list route including the current filter, e.g. '#/?q=foo' */
const listHash = ref('#/');
const hashQuery = () => (location.hash.startsWith('#/?') ? new URLSearchParams(location.hash.slice(3)).get('q') || '' : '');

/** @type {Schema} */
let schema = { version: 0, keywords: {} };

const WEEKDAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];

/**
 * Which of `types` the token is; mirrors dsl.value_type.
 * @param {string} v
 * @param {ValueType[]} types
 * @returns {ValueType | undefined}
 */
function valueType(v, types) {
  return types.find((t) => {
    if (t === 'weekday') return WEEKDAYS.includes(v);
    const m = t === 'month' ? /^(\d{2})-(\d{2})$/.exec(v) : /^(\d{2})-(\d{2})-(\d{2})$/.exec(v);
    if (!m || +m[2] < 1 || +m[2] > 12) return false;
    if (t === 'month') return true;
    return +m[3] >= 1 && +m[3] <= new Date(2000 + +m[1], +m[2], 0).getDate();
  });
}

/**
 * @typedef {{from: number, to: number, cls: string, title?: string}} Segment
 * @typedef {{from: number, to: number, severity: 'error'|'warning', message: string}} Problem
 */

/**
 * Highlighting and problems for item text, as absolute offsets; mirrors dsl.parse.
 * Drives the editor's decorations and lint, and the list's rendering.
 * @param {string} text
 * @returns {{segments: Segment[], problems: Problem[]}}
 */
function analyze(text) {
  const kws = schema.keywords;
  const lines = text.split('\n');
  /** @type {number[]} */
  const starts = [];
  lines.reduce((at, l) => { starts.push(at); return at + l.length + 1; }, 0);
  /** @type {Segment[]} */
  const segments = [];
  /** @type {Problem[]} */
  const problems = [];

  const titleAt = lines.findIndex((l) => l.trim());
  if (titleAt < 0) return { segments, problems };
  const boundary = lines.findIndex((l, i) => {
    const m = /^([a-z]+)(?=\s|$)/.exec(l);
    return i > titleAt && !!m && kws[m[1]]?.role === 'primary';
  });
  if (boundary < 0) {
    const primaries = Object.keys(kws).filter((k) => kws[k].role === 'primary');
    problems.push({ from: starts[titleAt], to: starts[titleAt] + lines[titleAt].length, severity: 'error',
      message: `no_primary: no line starts with ${primaries.join(' / ')}` });
    return { segments, problems };
  }
  /** @type {string[]} */
  const seen = [];
  for (let i = boundary; i < lines.length; i++) keywordLine(lines[i], starts[i], kws, seen, segments, problems);
  return { segments, problems };
}

/**
 * @param {string} line
 * @param {number} at offset of the line in the text
 * @param {Record<string, KeywordDef>} kws
 * @param {string[]} seen keywords of earlier lines, appended to
 * @param {Segment[]} segments appended to
 * @param {Problem[]} problems appended to
 */
function keywordLine(line, at, kws, seen, segments, problems) {
  const end = at + line.trimEnd().length;
  const trimmed = line.trim();
  if (!trimmed) return;
  const lineFrom = at + line.indexOf(trimmed[0]);
  if (trimmed.startsWith('(')) {
    segments.push({ from: lineFrom, to: end, cls: 'tok-unknown' });
    problems.push({ from: lineFrom, to: end, severity: 'warning', message: 'unknown_keyword: state lines are reserved' });
    return;
  }
  const toks = [...line.matchAll(/"(?:\\"|[^"])*"?|[^\s"]\S*/g)].map((m) =>
    ({ text: m[0], from: at + m.index, to: at + m.index + m[0].length, quoted: m[0][0] === '"' }));
  const isKw = (/** @type {number} */ j) => j < toks.length && !toks[j].quoted && kws[toks[j].text] !== undefined;
  /** @param {number} j @param {ValueType[]} types */
  const value = (j, types) => (toks[j].quoted ? undefined : valueType(toks[j].text, types));
  /** @param {number} j @param {string} cls @param {string} [title] */
  const mark = (j, cls, title) => segments.push({ from: toks[j].from, to: toks[j].to, cls, title });
  /** an error on token j, or from j to the end of the line; the parser skips the rest of the line */
  const fail = (/** @type {number} */ j, /** @type {string} */ message, toEnd = true) => {
    problems.push({ from: toks[j].from, to: toEnd ? end : toks[j].to, severity: 'error', message });
  };

  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    const def = kws[t.text];
    if (t.quoted || !/^[a-z]+$/.test(t.text)) return fail(i, 'unexpected_token');
    if (!def) {
      segments.push({ from: t.from, to: end, cls: 'tok-unknown' });
      problems.push({ from: t.from, to: end, severity: 'warning', message: `unknown_keyword: ${t.text} (the rest of the line is kept as is)` });
      return;
    }
    if (seen.includes(t.text)) return fail(i, `duplicate_keyword: ${t.text}`);
    const conflict = seen.find((k) => def.excludes.includes(k) || kws[k].excludes.includes(t.text));
    seen.push(t.text);
    mark(i, `tok-${def.role}`, def.meaning.trim());
    if (conflict) fail(i, `conflicting_keywords: ${conflict}, ${t.text}`, false);
    const kwAt = i++;
    for (const arg of def.args) {
      if (i >= toks.length || isKw(i)) return fail(kwAt, `missing_arg: ${arg.name} (${arg.type.join(' | ')})`, false);
      const vt = value(i, arg.type);
      if (!vt) return fail(i, `invalid_value: ${arg.name} expects ${arg.type.join(' | ')}`);
      mark(i++, `tok-${vt}`, arg.name);
    }
    /** @type {string[]} */
    const opts = [];
    while (i < toks.length && !toks[i].quoted && def.options[toks[i].text]) {
      const name = toks[i].text;
      const opt = def.options[name];
      if (opts.includes(name)) return fail(i, `duplicate_keyword: ${name}`);
      opts.push(name);
      mark(i, 'tok-option', opt.meaning.trim());
      const optAt = i++;
      if (i >= toks.length || isKw(i)) return fail(optAt, `missing_arg: ${name} (${opt.type.join(' | ')})`, false);
      const vt = value(i, opt.type);
      if (!vt) return fail(i, `invalid_value: ${name} expects ${opt.type.join(' | ')}`);
      mark(i++, `tok-${vt}`, name);
    }
  }
}

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Item text as highlighted HTML, for read-only display.
 * @param {string} text
 */
function highlightHtml(text) {
  const { segments, problems } = analyze(text);
  const errors = problems.filter((p) => p.severity === 'error');
  /** @type {Segment[]} */
  const marks = [...segments];
  for (const e of errors) {
    const seg = marks.find((m) => m.from === e.from && m.to === e.to);
    if (seg) Object.assign(seg, { cls: `${seg.cls} tok-error`, title: e.message });
    else marks.push({ from: e.from, to: e.to, cls: 'tok-error', title: e.message });
  }
  marks.sort((x, y) => x.from - y.from);
  let out = '';
  let pos = 0;
  for (const m of marks) {
    if (m.from < pos) continue;
    out += esc(text.slice(pos, m.from)) + `<span class="${m.cls}"${m.title ? ` title="${esc(m.title)}"` : ''}>${esc(text.slice(m.from, m.to))}</span>`;
    pos = m.to;
  }
  return out + esc(text.slice(pos));
}

/** Decorations from `analyze`, recomputed per change (items are a few lines). */
const dslHighlight = ViewPlugin.fromClass(class {
  /** @param {EditorView} view */
  constructor(view) { this.decorations = this.build(view); }
  /** @param {import('@codemirror/view').ViewUpdate} u */
  update(u) { if (u.docChanged) this.decorations = this.build(u.view); }
  /** @param {EditorView} view */
  build(view) {
    return Decoration.set(analyze(view.state.doc.toString()).segments.map((s) =>
      Decoration.mark({ class: s.cls, attributes: s.title ? { title: s.title } : {} }).range(s.from, s.to)), true);
  }
}, { decorations: (v) => v.decorations });

const dslLint = linter((view) => analyze(view.state.doc.toString()).problems, { delay: 150 });

const editorTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', fontSize: '0.9rem' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', padding: '0.75rem 0', minHeight: '12rem', caretColor: 'var(--color-base-content)' },
  '.cm-line': { padding: '0 1rem' },
  '.cm-cursor': { borderLeftColor: 'var(--color-base-content)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'color-mix(in oklab, var(--color-primary) 25%, transparent) !important' },
  '.cm-tooltip': { backgroundColor: 'var(--color-base-100)', color: 'var(--color-base-content)', border: '1px solid var(--color-base-300)' },
});

const Icon = {
  props: { name: { type: String, required: true }, size: { type: Number, default: 20 } },
  setup(/** @type {{name: string, size: number}} */ props) {
    return () => {
      const pascal = props.name.replace(/(^|-)(\w)/g, (_m, _s, c) => c.toUpperCase());
      /** @type {[string, Record<string, string>][]} */
      const nodes = lucide_.icons[pascal] || [];
      return h('svg', {
        xmlns: 'http://www.w3.org/2000/svg', width: props.size, height: props.size, viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      }, nodes.map(([tag, attrs]) => h(tag, attrs)));
    };
  },
};

/** @param {Diagnostic} d */
const describe = (d) => [d.code, d.line != null && `line ${d.line}`, d.detail && `"${d.detail}"`].filter(Boolean).join(' · ');

/** CodeMirror editor for item text. */
const Editor = {
  props: { modelValue: { type: String, required: true } },
  emits: ['update:modelValue', 'save'],
  setup(/** @type {{modelValue: string}} */ props, /** @type {any} */ { emit }) {
    const host = ref(/** @type {HTMLElement | null} */ (null));
    /** @type {EditorView | null} kept out of Vue's reactivity */
    let view = null;
    onMounted(() => {
      view = new EditorView({
        parent: /** @type {HTMLElement} */ (host.value),
        state: EditorState.create({
          doc: props.modelValue,
          extensions: [
            history(),
            drawSelection(),
            EditorView.lineWrapping,
            keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => { emit('save'); return true; } }, ...defaultKeymap, ...historyKeymap]),
            dslHighlight,
            dslLint,
            editorTheme,
            EditorView.updateListener.of((u) => { if (u.docChanged) emit('update:modelValue', u.state.doc.toString()); }),
          ],
        }),
      });
      view.focus();
    });
    onBeforeUnmount(() => view?.destroy());
    return { host };
  },
  template: `<div ref="host" class="rounded-box border border-base-300 focus-within:border-base-content/40"></div>`,
};

const ItemEditor = {
  components: { Icon, Editor },
  props: {
    /** existing file name, or null when new */
    editFile: { type: String, default: null },
    items: { type: Array, required: true },
  },
  emits: ['error', 'saved', 'deleted'],
  setup(/** @type {any} */ props, /** @type {any} */ { emit }) {
    const existing = /** @type {Item | undefined} */ (props.editFile && props.items.find((/** @type {Item} */ i) => i.file === props.editFile));
    const item = ref(/** @type {Item | null} */ (existing || null));
    const text = ref(existing ? existing.text : '');
    let currentFile = props.editFile;
    let lastSaved = text.value;
    let pendingSave = Promise.resolve();

    async function save() {
      const sent = text.value;
      if (!sent.trim() || sent === lastSaved) return;
      try {
        const body = { text: sent };
        const saved = /** @type {Item} */ (currentFile
          ? await api('PUT', `/api/items/${encodeURIComponent(currentFile)}`, body)
          : await api('POST', '/api/items', body));
        currentFile = saved.file;
        lastSaved = sent;
        item.value = saved;
        emit('saved', saved.file);
      } catch (e) { emit('error', e); }
    }

    function autosave() {
      pendingSave = pendingSave.then(save);
    }

    async function remove() {
      await pendingSave;
      if (!currentFile || !item.value) return;
      try {
        const deleted = item.value;
        await api('DELETE', `/api/items/${encodeURIComponent(currentFile)}`);
        emit('deleted', deleted);
      } catch (e) { emit('error', e); }
    }

    return { text, autosave, remove, listHash };
  },
  template: `
    <div @focusout="autosave">
      <div class="flex items-center gap-1 mb-4">
        <a :href="listHash" class="btn btn-square" title="back"><icon name="arrow-left"></icon></a>
        <button v-if="editFile" class="btn btn-square btn-error btn-outline" title="delete" @click="remove"><icon name="trash-2"></icon></button>
        <span v-if="editFile" class="ml-auto font-mono text-xs text-base-content/50">{{ editFile }}</span>
      </div>
      <editor v-model="text" @save="autosave"></editor>
    </div>`,
};

const ItemList = {
  components: { Icon },
  props: { items: { type: Array, required: true }, recent: { type: Array, required: true } },
  emits: ['error', 'deleted'],
  setup(/** @type {any} */ props, /** @type {any} */ { emit }) {
    const query = ref(hashQuery());
    const attention = ref(false);
    watch(query, (q) => {
      listHash.value = q ? '#/?' + new URLSearchParams({ q }) : '#/';
      history.replaceState(null, '', listHash.value);
    }, { immediate: true });

    const flagged = computed(() => props.items.filter((/** @type {Item} */ i) => i.errors.length || i.warnings.length));
    const rows = computed(() => {
      const q = query.value.trim().toLowerCase();
      return (attention.value ? flagged.value : props.items).filter((/** @type {Item} */ i) => !q || i.text.toLowerCase().includes(q));
    });

    /** @param {Item} i */
    async function remove(i) {
      try {
        await api('DELETE', `/api/items/${encodeURIComponent(i.file)}`);
        emit('deleted', i);
      } catch (e) { emit('error', e); }
    }

    const recentBg = ['bg-yellow-400/50!', 'bg-yellow-400/30!', 'bg-yellow-400/15!'];
    /** @param {Item} i */
    const rowClass = (i) => recentBg[props.recent.indexOf(i.file)] || 'hover:bg-base-200';
    /** @param {Item} i */
    const problems = (i) => [...i.errors, ...i.warnings].map(describe).join('\n');

    return { query, attention, flagged, rows, rowClass, problems, remove, highlight: (/** @type {string} */ t) => highlightHtml(t.trimEnd()), edit: (/** @type {string} */ f) => go('#/edit/' + encodeURIComponent(f)) };
  },
  template: `
    <div>
      <div class="flex gap-1 mb-2">
        <a href="#/new" class="btn" title="new item"><icon name="plus"></icon>New</a>
        <button class="btn" :class="{'btn-active': attention}" title="needs attention" @click="attention = !attention">
          <icon name="triangle-alert"></icon>{{ flagged.length }}</button>
        <a href="#/settings" class="btn" title="settings"><icon name="settings"></icon>Settings</a>
      </div>
      <div class="mb-4">
        <input class="input w-full" type="search" v-model="query" placeholder="Filter" autofocus>
      </div>
      <table class="table table-xs table-zebra">
        <tbody>
          <tr v-for="i in rows" :key="i.file" :class="rowClass(i)" class="cursor-pointer" @click="edit(i.file)">
            <td class="w-4 align-top" :title="problems(i)">
              <icon v-if="i.errors.length" name="circle-x" :size="14" class="text-error"></icon>
              <icon v-else-if="i.warnings.length" name="triangle-alert" :size="14" class="text-warning"></icon>
            </td>
            <td><pre class="font-mono whitespace-pre-wrap break-words" v-html="highlight(i.text)"></pre></td>
            <td class="w-4 align-top text-right">
              <button class="btn btn-ghost btn-xs btn-square text-error" title="delete" @click.stop="remove(i)"><icon name="trash-2" :size="14"></icon></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>`,
};

const Settings = {
  components: { Icon },
  props: { path: { type: String, default: '' }, suggested: { type: String, default: '' } },
  emits: ['error', 'saved'],
  setup(/** @type {any} */ props, /** @type {any} */ { emit }) {
    const value = ref(props.path || props.suggested || '');

    async function save() {
      if (!value.value.trim() || value.value === props.path) return;
      try {
        await api('PUT', '/api/settings', { path: value.value });
        emit('saved');
      } catch (e) { emit('error', e); }
    }

    return { value, save, listHash };
  },
  template: `
    <div>
      <div class="flex gap-1 mb-4">
        <a v-if="path" :href="listHash" class="btn btn-square" title="back"><icon name="arrow-left"></icon></a>
      </div>
      <fieldset class="fieldset"><legend class="fieldset-legend">data directory</legend>
        <div class="join w-full">
          <input class="input join-item w-full" v-model="value" @keydown.enter="save" autofocus>
          <button class="btn join-item" @click="save">Save</button>
        </div>
        <p v-if="suggested && suggested !== value" class="label">calendar: <a class="link font-mono" @click="value = suggested">{{ suggested }}</a></p>
      </fieldset>
    </div>`,
};

createApp({
  components: { ItemEditor, ItemList, Settings },
  setup() {
    const route = ref(location.hash || '#/');
    const error = ref('');
    const path = ref(/** @type {string | null} */ (null));
    const suggested = ref('');
    const items = ref(/** @type {Item[]} */ ([]));
    const recent = ref(/** @type {string[]} */ ([]));
    const ready = ref(false);
    const deleted = ref(/** @type {Item | null} */ (null));
    let undoTimer = 0;

    /** @param {any} e */
    const fail = (e) => { error.value = e.message || String(e); };

    async function loadItems() {
      try {
        ({ items: items.value, recent: recent.value } = await api('GET', '/api/items'));
      } catch (e) { fail(e); }
    }

    async function loadSettings() {
      const s = await api('GET', '/api/settings');
      path.value = s.path;
      suggested.value = s.suggested || '';
    }

    async function init() {
      schema = await api('GET', '/api/schema');
      await loadSettings();
      if (!path.value) go('#/settings'); else await loadItems();
      ready.value = true;
    }

    addEventListener('hashchange', () => {
      route.value = location.hash || '#/';
      error.value = '';
      if (page.value === 'list' && path.value) loadItems();
    });

    const page = computed(() => {
      const r = route.value;
      if (r.startsWith('#/settings')) return 'settings';
      if (r === '#/new') return 'new';
      if (r.startsWith('#/edit/')) return 'edit';
      return 'list';
    });
    const editFile = computed(() => decodeURIComponent(route.value.slice('#/edit/'.length)));

    async function settingsSaved() {
      await loadSettings();
      await loadItems();
      go(listHash.value);
    }

    /** @param {string} file */
    async function itemSaved(file) {
      error.value = '';
      await loadItems();
      if (page.value === 'new') {
        history.replaceState(null, '', `#/edit/${encodeURIComponent(file)}`);
        route.value = location.hash;
      }
    }

    /** @param {Item} item */
    async function itemDeleted(item) {
      await loadItems();
      go(listHash.value);
      deleted.value = item;
      clearTimeout(undoTimer);
      undoTimer = setTimeout(() => { deleted.value = null; }, 20000);
    }

    async function undoDelete() {
      if (!deleted.value) return;
      const { file, text } = deleted.value;
      try {
        await api('POST', '/api/items', { file, text });
        deleted.value = null;
        clearTimeout(undoTimer);
        await loadItems();
      } catch (e) { fail(e); }
    }

    onMounted(() => init().catch(fail));

    return { ready, error, path, suggested, items, recent, page, editFile, deleted, fail, settingsSaved, itemSaved, itemDeleted, undoDelete };
  },
  template: `
    <div v-if="deleted" class="toast toast-top toast-end z-50">
      <div class="alert shadow-lg">
        <span>{{ deleted.file }} deleted</span>
        <button class="btn btn-sm" @click="undoDelete">Undo</button>
      </div>
    </div>
    <div v-if="error" role="alert" class="alert alert-error mb-4"><span>{{ error }}</span></div>
    <template v-if="ready">
      <settings v-if="page === 'settings'" :path="path || ''" :suggested="suggested" @saved="settingsSaved" @error="fail"></settings>
      <item-editor v-else-if="page === 'new' || page === 'edit'" key="editor" :items="items"
                   :edit-file="page === 'edit' ? editFile : null" @saved="itemSaved" @deleted="itemDeleted" @error="fail"></item-editor>
      <item-list v-else :items="items" :recent="recent" @deleted="itemDeleted" @error="fail"></item-list>
    </template>`,
}).mount('#app');
