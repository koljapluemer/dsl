// @ts-check
/**
 * @typedef {'date'|'month'|'weekday'|'path'|'text'} ValueType
 * @typedef {{name: string, type: ValueType[]}} ArgDef
 * @typedef {{role: 'primary'|'property'|'modifier'|'state', args: ArgDef[], options: Record<string, {type: ValueType[], meaning: string}>, excludes: string[], meaning: string}} KeywordDef
 * @typedef {{version: number, keywords: Record<string, KeywordDef>}} Schema
 * @typedef {{code: string, line: number | null, detail: string | null}} Diagnostic
 * @typedef {{file: string, text: string, errors: Diagnostic[], warnings: Diagnostic[], refs?: Record<string, string | null>}} Item
 */

import { EditorState } from '@codemirror/state';
import { EditorView, ViewPlugin, Decoration, keymap, drawSelection } from '@codemirror/view';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { linter } from '@codemirror/lint';

// @ts-ignore globals from CDN
const { createApp, ref, computed, onMounted, onBeforeUnmount, nextTick, h } = Vue;
// @ts-ignore
const lucide_ = lucide;
// @ts-ignore
const marked_ = marked;
// @ts-ignore
const purify = DOMPurify;

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
const EXTRA_MARKER = 'extra';
const OPENING_ROLES = ['primary', 'property'];

/**
 * Which of `types` the token is; mirrors dsl.value_type. Only a `path` may be quoted.
 * @param {string} v
 * @param {ValueType[]} types
 * @param {boolean} quoted
 * @returns {ValueType | undefined}
 */
function valueType(v, types, quoted) {
  return types.find((t) => {
    if (t === 'path') return !!v && !v.startsWith('/') && !v.includes('\\') && !v.split('/').includes('..');
    if (quoted) return false;
    if (t === 'weekday') return WEEKDAYS.includes(v);
    const m = t === 'month' ? /^(\d{2})-(\d{2})$/.exec(v) : /^(\d{2})-(\d{2})-(\d{2})$/.exec(v);
    if (!m || +m[2] < 1 || +m[2] > 12) return false;
    if (t === 'month') return true;
    return +m[3] >= 1 && +m[3] <= new Date(2000 + +m[1], +m[2], 0).getDate();
  });
}

/** @param {string} line */
const isExtraMarker = (line) => line.trimEnd() === EXTRA_MARKER;

/**
 * Whether a body line (after the first) starts the keyword section; mirrors dsl.is_section_opener.
 * @param {string} line
 */
function isSectionOpener(line) {
  const kws = schema.keywords;
  if (isExtraMarker(line)) return true;
  if (/^->\s/.test(line)) return /** @type {string} */ (line.trim().split(/\s+/).at(-1)).startsWith('@');
  const state = /^\(([a-z]+)(?=[\s)]|$)/.exec(line);
  if (state) return kws[state[1]]?.role === 'state';
  const kw = /^([a-z]+)(?=\s|$)/.exec(line);
  return !!kw && OPENING_ROLES.includes(kws[kw[1]]?.role);
}

/**
 * @typedef {{from: number, to: number, cls: string, title?: string}} Segment
 * @typedef {{from: number, to: number, severity: 'error'|'warning', message: string}} Problem
 * @typedef {{text: string, value: string, from: number, to: number, quoted: boolean}} Token
 * @typedef {{keywords: string[], clauses: string[]}} Seen every keyword met so far (for duplicates), and the
 *   keywords of clauses that parsed (for excludes, like dsl.check_excludes)
 */

/**
 * The parts of item text, as line indices: the body runs from `first` (-1 for an
 * empty text) to `boundary`, the keyword section from there to `marker`, which
 * is `lines.length` when there's no extra block. Mirrors the start of dsl.parse.
 * @param {string} text
 */
function outline(text) {
  const lines = text.split('\n');
  /** @type {number[]} */
  const starts = [];
  lines.reduce((at, l) => { starts.push(at); return at + l.length + 1; }, 0);
  const first = lines.findIndex((l) => l.trim());
  let boundary = first < 0 ? lines.length : first + 1;
  while (boundary < lines.length && !isSectionOpener(lines[boundary])) boundary++;
  let marker = boundary;
  while (marker < lines.length && !isExtraMarker(lines[marker])) marker++;
  return { lines, starts, first, boundary, marker };
}

/**
 * Highlighting and problems for item text, as absolute offsets; mirrors dsl.parse.
 * Drives the editor's decorations and lint, and the list's keyword lines.
 * @param {string} text
 * @returns {{segments: Segment[], problems: Problem[]}}
 */
function analyze(text) {
  const { lines, starts, first, boundary, marker } = outline(text);
  /** @type {Segment[]} */
  const segments = [];
  /** @type {Problem[]} */
  const problems = [];
  if (first < 0) return { segments, problems };

  /** @type {Seen} */
  const seen = { keywords: [], clauses: [] };
  for (let i = boundary; i < marker; i++) sectionLine(lines[i], starts[i], seen, segments, problems);

  if (marker < lines.length) {
    const markerTo = starts[marker] + lines[marker].trimEnd().length;
    segments.push({ from: starts[marker], to: markerTo, cls: 'tok-property', title: 'extra content follows, up to the end of the file' });
    if (lines.slice(marker + 1).some((l) => l.trim())) {
      segments.push({ from: starts[marker] + lines[marker].length + 1, to: text.length, cls: 'tok-extra' });
    } else {
      problems.push({ from: starts[marker], to: markerTo, severity: 'error', message: 'empty_extra: no content after extra' });
    }
  }
  return { segments, problems };
}

/**
 * One keyword-section line: a relationship, a state line, or clauses.
 * @param {string} line
 * @param {number} at offset of the line in the text
 * @param {Seen} seen appended to
 * @param {Segment[]} segments appended to
 * @param {Problem[]} problems appended to
 */
function sectionLine(line, at, seen, segments, problems) {
  const trimmed = line.trim();
  if (!trimmed) return;
  const from = at + line.indexOf(trimmed[0]);
  const to = from + trimmed.length;
  const fail = (/** @type {string} */ message) => problems.push({ from, to, severity: 'error', message });

  if (isRelationLine(trimmed)) {
    const rel = relation(trimmed);
    if (!rel) return fail('invalid_relation: expected -> label @target');
    segments.push({ from, to: from + 2, cls: 'tok-relation' }, { from: to - rel.target.length - 1, to, cls: 'tok-target', title: rel.target + '.txt' });
    return;
  }

  if (trimmed.startsWith('(')) {
    if (!trimmed.endsWith(')')) return fail('invalid_state: a state line ends with )');
    const toks = tokenize(trimmed.slice(1, -1), from + 1);
    const kw = toks[0];
    if (!kw || kw.quoted || !/^[a-z]+$/.test(kw.text)) return fail('invalid_state');
    const def = schema.keywords[kw.text];
    if (!def) {
      segments.push({ from, to, cls: 'tok-unknown' });
      problems.push({ from, to, severity: 'warning', message: `unknown_keyword: ${kw.text} (the line is kept as is)` });
      return;
    }
    if (def.role !== 'state') return fail(`invalid_state: ${kw.text} is not a state keyword`);
    const next = clause(toks, 0, to, seen, segments, problems);
    if (next >= 0 && next < toks.length) problems.push({ from: toks[next].from, to, severity: 'error', message: 'unexpected_token' });
    return;
  }

  const toks = tokenize(line, at);
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    const def = schema.keywords[t.text];
    if (t.quoted || !/^[a-z]+$/.test(t.text) || def?.role === 'state') {
      return problems.push({ from: t.from, to, severity: 'error', message: 'unexpected_token' });
    }
    if (!def) {
      segments.push({ from: t.from, to, cls: 'tok-unknown' });
      problems.push({ from: t.from, to, severity: 'warning', message: `unknown_keyword: ${t.text} (the rest of the line is kept as is)` });
      return;
    }
    i = clause(toks, i, to, seen, segments, problems);
    if (i < 0) return;
  }
}

/** @param {string} trimmed a trimmed section line */
const isRelationLine = (trimmed) => trimmed === '->' || /^->\s/.test(trimmed);

/**
 * A relationship line's label and target name (without `@`), or null when it's
 * malformed; mirrors dsl's _relation.
 * @param {string} trimmed
 */
function relation(trimmed) {
  const target = trimmed.slice(2).trim().split(/\s+/).at(-1) || '';
  if (target.length < 2 || !target.startsWith('@') || /[/\\]/.test(target)) return null;
  return { label: trimmed.slice(2, -target.length).trim(), target: target.slice(1) };
}

/**
 * Whitespace-separated tokens of `line`, with absolute offsets; `value` is a quoted token's content.
 * @param {string} line
 * @param {number} at offset of `line` in the text
 * @returns {Token[]}
 */
function tokenize(line, at) {
  return [...line.matchAll(/"(?:\\"|[^"])*"?|[^\s"]\S*/g)].map((m) => {
    const quoted = m[0][0] === '"';
    const value = quoted ? m[0].slice(1).replace(/"$/, '').replace(/\\"/g, '"') : m[0];
    return { text: m[0], value, from: at + (m.index ?? 0), to: at + (m.index ?? 0) + m[0].length, quoted };
  });
}

/**
 * The clause whose keyword is toks[i]; returns the index after it, or -1 after an error
 * (the parser skips the rest of the line).
 * @param {Token[]} toks
 * @param {number} i
 * @param {number} end offset of the line's end
 * @param {Seen} seen
 * @param {Segment[]} segments
 * @param {Problem[]} problems
 */
function clause(toks, i, end, seen, segments, problems) {
  const kws = schema.keywords;
  const isKw = (/** @type {number} */ j) => j < toks.length && !toks[j].quoted && kws[toks[j].text] !== undefined;
  /** @param {number} j @param {string} cls @param {string} [title] */
  const mark = (j, cls, title) => segments.push({ from: toks[j].from, to: toks[j].to, cls, title });
  /** an error on token j, or from j to the end of the line */
  const fail = (/** @type {number} */ j, /** @type {string} */ message, toEnd = true) => {
    problems.push({ from: toks[j].from, to: toEnd ? end : toks[j].to, severity: 'error', message });
    return -1;
  };

  const t = toks[i];
  const def = kws[t.text];
  if (seen.keywords.includes(t.text)) return fail(i, `duplicate_keyword: ${t.text}`);
  seen.keywords.push(t.text);
  mark(i, `tok-${def.role}`, def.meaning.trim());
  const kwAt = i++;
  for (const arg of def.args) {
    if (arg.type.length === 1 && arg.type[0] === 'text') {
      if (i >= toks.length) return fail(kwAt, `missing_arg: ${arg.name} (text)`, false);
      segments.push({ from: toks[i].from, to: end, cls: 'tok-text', title: arg.name });
      i = toks.length;
      continue;
    }
    if (i >= toks.length || isKw(i)) return fail(kwAt, `missing_arg: ${arg.name} (${arg.type.join(' | ')})`, false);
    const vt = valueType(toks[i].value, arg.type, toks[i].quoted);
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
    const vt = valueType(toks[i].value, opt.type, toks[i].quoted);
    if (!vt) return fail(i, `invalid_value: ${name} expects ${opt.type.join(' | ')}`);
    mark(i++, `tok-${vt}`, name);
  }
  const conflict = seen.clauses.find((k) => def.excludes.includes(k) || kws[k].excludes.includes(t.text));
  if (conflict) fail(kwAt, `conflicting_keywords: ${conflict}, ${t.text}`, false);
  seen.clauses.push(t.text);
  return i;
}

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The text from `from` to `to` as highlighted HTML, for read-only display.
 * @param {string} text
 * @param {{segments: Segment[], problems: Problem[]}} analysis of `text`
 * @param {number} from
 * @param {number} to
 */
function highlightHtml(text, { segments, problems }, from, to) {
  /** @type {Segment[]} */
  const marks = segments.map((m) => ({ ...m }));
  for (const e of problems.filter((p) => p.severity === 'error')) {
    const seg = marks.find((m) => m.from === e.from && m.to === e.to);
    if (seg) Object.assign(seg, { cls: `${seg.cls} tok-error`, title: e.message });
    else marks.push({ from: e.from, to: e.to, cls: 'tok-error', title: e.message });
  }
  marks.sort((x, y) => x.from - y.from);
  let out = '';
  let pos = from;
  for (const m of marks) {
    if (m.from < pos || m.to > to) continue;
    out += esc(text.slice(pos, m.from)) + `<span class="${m.cls}"${m.title ? ` title="${esc(m.title)}"` : ''}>${esc(text.slice(m.from, m.to))}</span>`;
    pos = m.to;
  }
  return out + esc(text.slice(pos, to));
}

/** @param {string} s */
const markdown = (s) => purify.sanitize(marked_.parse(s, { breaks: true, async: false }));

/**
 * An item for the list: body and extra as markdown, relationships as links to
 * their targets (shown by heading, from `refs`; `data-ref` holds the file
 * name), and only keyword lines in monospace, highlighted.
 * @param {Item} item
 */
function overviewHtml(item) {
  const text = item.text.trimEnd();
  const { lines, starts, first, boundary, marker } = outline(text);
  const analysis = analyze(text);
  const code = (/** @type {number} */ i) =>
    `<div class="ov-code">${highlightHtml(text, analysis, starts[i], starts[i] + lines[i].length)}</div>`;
  let section = '';
  for (let i = boundary; i < marker; i++) {
    const trimmed = lines[i].trim();
    const rel = isRelationLine(trimmed) && relation(trimmed);
    if (rel) section += refHtml(rel, item.refs);
    else if (trimmed) section += code(i);
  }
  let extra = '';
  if (marker < lines.length) {
    const content = lines.slice(marker + 1).join('\n');
    extra = content.trim() ? `<div class="ov-extra md">${markdown(content)}</div>` : code(marker);
  }
  return (first < 0 ? '' : `<div class="md">${markdown(lines.slice(first, boundary).join('\n'))}</div>`)
    + (section && `<div class="ov-section">${section}</div>`)
    + extra;
}

/**
 * @param {{label: string, target: string}} rel
 * @param {Record<string, string | null>} [refs] target headings; null for a missing target
 */
function refHtml({ label, target }, refs) {
  const file = esc(target + '.txt');
  const heading = refs?.[target];
  const link = heading === null
    ? `<span class="ov-missing" title="no item ${file}">${esc(target)}</span>`
    : `<a class="link link-hover" data-ref="${file}" title="${file}">${esc(heading || target)}</a>`;
  return `<div><span class="ov-muted">${label ? esc(label) + ' ' : ''}→</span> ${link}</div>`;
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
  props: { modelValue: { type: String, required: true }, autofocus: { type: Boolean, default: true } },
  emits: ['update:modelValue', 'save'],
  setup(/** @type {{modelValue: string, autofocus: boolean}} */ props, /** @type {any} */ { emit }) {
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
      if (props.autofocus) view.focus();
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
  },
  emits: ['error', 'saved', 'deleted'],
  setup(/** @type {any} */ props, /** @type {any} */ { emit }) {
    const item = ref(/** @type {Item | null} */ (null));
    const text = ref('');
    const loaded = ref(!props.editFile);
    let currentFile = props.editFile;
    let lastSaved = '';
    /** @type {Promise<void>} */
    let pendingSave = Promise.resolve();

    if (props.editFile) {
      api('GET', `/api/items/${encodeURIComponent(props.editFile)}`).then((/** @type {Item} */ existing) => {
        item.value = existing;
        text.value = lastSaved = existing.text;
        loaded.value = true;
      }, (e) => emit('error', e));
    }

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

    return { text, loaded, autosave, remove, listHash };
  },
  template: `
    <div @focusout="autosave">
      <div class="flex items-center gap-1 mb-4">
        <a :href="listHash" class="btn btn-square" title="back"><icon name="arrow-left"></icon></a>
        <button v-if="editFile" class="btn btn-square btn-error btn-outline" title="delete" @click="remove"><icon name="trash-2"></icon></button>
        <span v-if="editFile" class="ml-auto font-mono text-xs text-base-content/50">{{ editFile }}</span>
      </div>
      <editor v-if="loaded" v-model="text" @save="autosave"></editor>
    </div>`,
};

/** Shuffles the list's order; kept until the page reloads, so the order stays put while working. */
const SEED = Math.floor(Math.random() * 2 ** 32);

const ItemList = {
  components: { Icon },
  emits: ['error', 'deleted'],
  setup(/** @type {any} */ _props, /** @type {any} */ { emit }) {
    const query = ref(hashQuery());
    const attention = ref(false);
    const page = ref(0);
    const rows = ref(/** @type {Item[]} */ ([]));
    const total = ref(0);
    const flagged = ref(0);
    const pageSize = ref(1);
    /** the item last jumped to via a reference */
    const focused = ref(/** @type {string | null} */ (null));
    let loadTimer = 0;
    let loads = 0;

    /**
     * The current page, or with `focus` the page holding that item, scrolled to
     * it; clears the filters when they hide it.
     * @param {string | null} [focus]
     */
    async function load(focus = null) {
      const n = ++loads;
      const params = new URLSearchParams({
        q: query.value, page: String(page.value), seed: String(SEED),
        ...(attention.value ? { attention: '1' } : {}), ...(focus ? { focus } : {}),
      });
      try {
        const res = await api('GET', `/api/items?${params}`);
        if (n !== loads) return;
        if (focus && !res.focused) {
          if (!query.value && !attention.value) throw new Error(`'${focus}' not found`);
          query.value = '';
          attention.value = false;
          syncHash();
          return load(focus);
        }
        rows.value = res.items;
        total.value = res.total;
        flagged.value = res.flagged;
        pageSize.value = res.page_size;
        page.value = res.page;
        focused.value = focus;
        if (focus) {
          await nextTick();
          document.getElementById('item:' + focus)?.scrollIntoView({ block: 'center' });
        }
      } catch (e) { emit('error', e); }
    }

    function syncHash() {
      listHash.value = query.value ? '#/?' + new URLSearchParams({ q: query.value }) : '#/';
      window.history.replaceState(null, '', listHash.value);
    }

    /** @param {string} q */
    function setQuery(q) {
      query.value = q;
      syncHash();
      page.value = 0;
      clearTimeout(loadTimer);
      loadTimer = setTimeout(load, 200);
    }

    function toggleAttention() {
      attention.value = !attention.value;
      page.value = 0;
      load();
    }

    /** @param {number} p */
    function goPage(p) {
      page.value = p;
      load();
    }

    onMounted(load);

    const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

    /** @param {Item} i */
    async function remove(i) {
      try {
        await api('DELETE', `/api/items/${encodeURIComponent(i.file)}`);
        emit('deleted', i);
        await load();
      } catch (e) { emit('error', e); }
    }

    /** A reference jumps to its item, other links open in a new tab, the rest of the row opens the editor. */
    function rowClick(/** @type {MouseEvent} */ e, /** @type {Item} */ i) {
      const a = /** @type {HTMLAnchorElement | null} */ ((/** @type {Element} */ (e.target)).closest('a'));
      if (a?.dataset.ref) {
        clearTimeout(loadTimer);
        load(a.dataset.ref);
      } else if (a?.href) {
        e.preventDefault();
        window.open(a.href, '_blank', 'noopener');
      } else {
        go('#/edit/' + encodeURIComponent(i.file));
      }
    }

    /** @param {Item} i */
    const problems = (i) => [...i.errors, ...i.warnings].map(describe).join('\n');

    return { query, attention, page, pages, total, flagged, rows, focused, problems, remove, setQuery, toggleAttention, goPage, rowClick, overview: overviewHtml };
  },
  template: `
    <div>
      <div class="flex gap-1 mb-2">
        <a href="#/new" class="btn" title="new item"><icon name="plus"></icon>New</a>
        <button class="btn" :class="{'btn-active': attention}" title="needs attention" @click="toggleAttention">
          <icon name="triangle-alert"></icon>{{ flagged }}</button>
        <a href="#/settings" class="btn" title="settings"><icon name="settings"></icon>Settings</a>
      </div>
      <div class="mb-4">
        <input class="input w-full" type="search" :value="query" @input="setQuery($event.target.value)" placeholder="Filter" autofocus>
      </div>
      <table class="table table-zebra">
        <tbody>
          <tr v-for="i in rows" :key="i.file" :id="'item:' + i.file" class="cursor-pointer hover:bg-base-200"
              :class="{'outline-2 -outline-offset-2 outline-primary': i.file === focused}" @click="rowClick($event, i)">
            <td class="w-4 align-top" :title="problems(i)">
              <icon v-if="i.errors.length" name="circle-x" :size="14" class="text-error"></icon>
              <icon v-else-if="i.warnings.length" name="triangle-alert" :size="14" class="text-warning"></icon>
            </td>
            <td class="overview" v-html="overview(i)"></td>
            <td class="w-4 align-top text-right">
              <button class="btn btn-ghost btn-xs btn-square text-error" title="delete" @click.stop="remove(i)"><icon name="trash-2" :size="14"></icon></button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="pages > 1" class="join mt-4">
        <button class="btn join-item" :disabled="page === 0" @click="goPage(page - 1)"><icon name="chevron-left"></icon></button>
        <span class="btn join-item pointer-events-none">{{ page + 1 }} / {{ pages }} · {{ total }}</span>
        <button class="btn join-item" :disabled="page + 1 >= pages" @click="goPage(page + 1)"><icon name="chevron-right"></icon></button>
      </div>
    </div>`,
};

const TaskList = {
  components: { Icon, Editor },
  emits: ['error'],
  setup(/** @type {any} */ _props, /** @type {any} */ { emit }) {
    /** `text` is the textarea's content, `saved` what the file holds; `problem` the last save error */
    const rows = ref(/** @type {{file: string, text: string, saved: string, problem: string}[]} */ ([]));
    const page = ref(0);
    const total = ref(0);
    const pageSize = ref(1);

    async function load() {
      try {
        const params = new URLSearchParams({ tasks: '1', page: String(page.value), seed: String(SEED) });
        const res = await api('GET', `/api/items?${params}`);
        rows.value = res.items.map((/** @type {Item} */ i) => ({ file: i.file, text: i.text, saved: i.text, problem: '' }));
        total.value = res.total;
        pageSize.value = res.page_size;
        page.value = res.page;
      } catch (e) { emit('error', e); }
    }

    /** @param {{file: string, text: string, saved: string, problem: string}} r */
    async function save(r) {
      if (!r.text.trim() || r.text === r.saved) return;
      const sent = r.text;
      try {
        await api('PUT', `/api/items/${encodeURIComponent(r.file)}`, { text: sent });
        r.saved = sent;
        r.problem = '';
      } catch (e) { r.problem = /** @type {Error} */ (e).message; }
    }

    /** @param {number} p */
    function goPage(p) {
      page.value = p;
      load();
    }

    onMounted(load);
    const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

    return { rows, page, pages, total, save, goPage };
  },
  template: `
    <div>
      <p v-if="!rows.length" class="text-base-content/50">No tasks.</p>
      <div v-for="r in rows" :key="r.file" class="mb-4" @focusout="save(r)">
        <editor v-model="r.text" :autofocus="false" @save="save(r)"></editor>
        <p v-if="r.problem" class="text-error text-sm mt-1">{{ r.problem }}</p>
      </div>
      <div v-if="pages > 1" class="join mt-4">
        <button class="btn join-item" :disabled="page === 0" @click="goPage(page - 1)"><icon name="chevron-left"></icon></button>
        <span class="btn join-item pointer-events-none">{{ page + 1 }} / {{ pages }} · {{ total }}</span>
        <button class="btn join-item" :disabled="page + 1 >= pages" @click="goPage(page + 1)"><icon name="chevron-right"></icon></button>
      </div>
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
  components: { ItemEditor, ItemList, TaskList, Settings },
  setup() {
    const route = ref(location.hash || '#/');
    const error = ref('');
    const path = ref(/** @type {string | null} */ (null));
    const suggested = ref('');
    /** bumped to remount the list, e.g. after an undo */
    const listKey = ref(0);
    const ready = ref(false);
    const deleted = ref(/** @type {Item | null} */ (null));
    let undoTimer = 0;

    /** @param {any} e */
    const fail = (e) => { error.value = e.message || String(e); };

    async function loadSettings() {
      const s = await api('GET', '/api/settings');
      path.value = s.path;
      suggested.value = s.suggested || '';
    }

    async function init() {
      schema = await api('GET', '/api/schema');
      await loadSettings();
      if (!path.value) go('#/settings');
      ready.value = true;
    }

    addEventListener('hashchange', () => {
      route.value = location.hash || '#/';
      error.value = '';
    });

    const page = computed(() => {
      const r = route.value;
      if (r.startsWith('#/settings')) return 'settings';
      if (r === '#/new') return 'new';
      if (r === '#/tasks') return 'tasks';
      if (r.startsWith('#/edit/')) return 'edit';
      return 'list';
    });
    const editFile = computed(() => decodeURIComponent(route.value.slice('#/edit/'.length)));

    async function settingsSaved() {
      await loadSettings();
      go(listHash.value);
    }

    /** @param {string} file */
    async function itemSaved(file) {
      error.value = '';
      if (page.value === 'new') {
        window.history.replaceState(null, '', `#/edit/${encodeURIComponent(file)}`);
        route.value = location.hash;
      }
    }

    /** @param {Item} item */
    async function itemDeleted(item) {
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
        listKey.value++;
      } catch (e) { fail(e); }
    }

    onMounted(() => init().catch(fail));

    return { ready, error, path, suggested, listKey, page, editFile, deleted, fail, settingsSaved, itemSaved, itemDeleted, undoDelete };
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
      <item-editor v-else-if="page === 'new' || page === 'edit'" key="editor"
                   :edit-file="page === 'edit' ? editFile : null" @saved="itemSaved" @deleted="itemDeleted" @error="fail"></item-editor>
      <template v-else>
        <div role="tablist" class="tabs tabs-border mb-4">
          <a role="tab" class="tab" :class="{'tab-active': page === 'list'}" href="#/">Notes</a>
          <a role="tab" class="tab" :class="{'tab-active': page === 'tasks'}" href="#/tasks">Tasks</a>
        </div>
        <task-list v-if="page === 'tasks'" key="tasks" @error="fail"></task-list>
        <item-list v-else :key="listKey" @deleted="itemDeleted" @error="fail"></item-list>
      </template>
    </template>`,
}).mount('#app');
