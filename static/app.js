// @ts-check
/**
 * @typedef {'date'|'month'|'weekday'|'path'|'text'|'tags'} ValueType
 * @typedef {{name: string, type: ValueType[]}} ArgDef
 * @typedef {{role: 'primary'|'property'|'modifier'|'state', args: ArgDef[], line_start: boolean, options: Record<string, {type: ValueType[], meaning: string}>, excludes: string[], meaning: string}} KeywordDef
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
const hashQuery = () => {
  const queryAt = location.hash.indexOf('?');
  return queryAt < 0 ? '' : new URLSearchParams(location.hash.slice(queryAt + 1)).get('q') || '';
};

/** @type {Schema} */
let schema = { version: 0, keywords: {} };

const WEEKDAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
const OPENING_ROLES = ['primary', 'property'];
const ALL_ROLES = ['primary', 'property', 'modifier', 'state'];

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

/**
 * The block keyword a line consists of, or undefined; mirrors dsl._block_keyword.
 * @param {string} line
 */
const blockKeyword = (line) => (schema.keywords[line.trimEnd()]?.block ? line.trimEnd() : undefined);

/**
 * Whether a line at column 0 starts a keyword, relationship or state line of one of
 * `roles`; mirrors dsl._starts_line_of.
 * @param {string} line
 * @param {string[]} roles
 */
function startsLineOf(line, roles) {
  const kws = schema.keywords;
  if (/^->\s/.test(line)) return /** @type {string} */ (line.trim().split(/\s+/).at(-1)).startsWith('@');
  const state = /^\(([a-z]+)(?=[\s)]|$)/.exec(line);
  if (state) return kws[state[1]]?.role === 'state' && roles.includes('state');
  const kw = /^([a-z]+)(?=\s|$)/.exec(line);
  const def = kw && kws[kw[1]];
  if (!def || !roles.includes(def.role)) return false;
  return !def.block || line.trimEnd() === kw[1];
}

/**
 * Whether a body line (after the first) starts the keyword section; mirrors dsl.is_section_opener.
 * @param {string} line
 */
const isSectionOpener = (line) => startsLineOf(line, OPENING_ROLES);

/**
 * @typedef {{from: number, to: number, cls: string, title?: string}} Segment
 * @typedef {{from: number, to: number, severity: 'error'|'warning', message: string}} Problem
 * @typedef {{text: string, value: string, from: number, to: number, quoted: boolean}} Token
 * @typedef {{keywords: string[], clauses: string[]}} Seen every keyword met so far (for duplicates), and the
 *   keywords of clauses that parsed (for excludes, like dsl.check_excludes)
 */

/**
 * The parts of item text, as line indices: the body runs from `first` (-1 for an
 * empty text) to `boundary`; from there `parts` lists the keyword section in
 * order, each a plain line or a block (`line` is its keyword's line, `end` the
 * line after its content). Mirrors the start of dsl.parse.
 * @typedef {{line: number, end: number, keyword?: string}} Part
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
  /** @type {Part[]} */
  const parts = [];
  for (let i = boundary; i < lines.length;) {
    const keyword = blockKeyword(lines[i]);
    let end = i + 1;
    if (keyword) while (end < lines.length && !startsLineOf(lines[end], ALL_ROLES)) end++;
    parts.push({ line: i, end, keyword });
    i = end;
  }
  return { lines, starts, first, boundary, parts };
}

/**
 * Highlighting and problems for item text, as absolute offsets; mirrors dsl.parse.
 * Drives the editor's decorations and lint, and the list's keyword lines. YAML
 * validity is only checked by the server.
 * @param {string} text
 * @returns {{segments: Segment[], problems: Problem[]}}
 */
function analyze(text) {
  const { lines, starts, first, parts } = outline(text);
  /** @type {Segment[]} */
  const segments = [];
  /** @type {Problem[]} */
  const problems = [];
  if (first < 0) return { segments, problems };

  /** @type {Seen} */
  const seen = { keywords: [], clauses: [] };
  for (const { line, end, keyword } of parts) {
    if (!keyword) {
      sectionLine(lines[line], starts[line], seen, segments, problems);
      continue;
    }
    const def = schema.keywords[keyword];
    const from = starts[line];
    const to = from + lines[line].trimEnd().length;
    segments.push({ from, to, cls: `tok-${def.role}`, title: def.meaning.trim() });
    if (seen.keywords.includes(keyword)) problems.push({ from, to, severity: 'error', message: `duplicate_keyword: ${keyword}` });
    seen.keywords.push(keyword);
    if (lines.slice(line + 1, end).some((l) => l.trim())) {
      const blockTo = end < lines.length ? starts[end] - 1 : text.length;
      segments.push({ from: to + 1, to: blockTo, cls: 'tok-extra' });
    } else {
      const code = def.block === 'yaml' ? 'empty_data' : 'empty_extra';
      problems.push({ from, to, severity: 'error', message: `${code}: no content after ${keyword}` });
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
    if (t.quoted || !/^[a-z]+$/.test(t.text) || def?.role === 'state' || def?.block) {
      return problems.push({ from: t.from, to, severity: 'error', message: 'unexpected_token' });
    }
    if (!def) {
      segments.push({ from: t.from, to, cls: 'tok-unknown' });
      problems.push({ from: t.from, to, severity: 'warning', message: `unknown_keyword: ${t.text} (the rest of the line is kept as is)` });
      return;
    }
    if (i > 0 && def.line_start) {
      return problems.push({ from: t.from, to, severity: 'error', message: `unexpected_token: ${t.text} must start its line` });
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
    if (arg.type.length === 1 && arg.type[0] === 'tags') {
      if (i >= toks.length) return fail(kwAt, `missing_arg: ${arg.name} (tags)`, false);
      for (; i < toks.length; i++) {
        if (toks[i].quoted || !/^[a-z0-9-]+$/.test(toks[i].text)) return fail(i, `invalid_value: ${arg.name} are a-z, 0-9 and -`, false);
        mark(i, 'tok-tags', arg.name);
      }
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
  const { lines, starts, first, boundary, parts } = outline(text);
  const analysis = analyze(text);
  const code = (/** @type {number} */ i, /** @type {number} */ end = i + 1) =>
    `<div class="ov-code">${highlightHtml(text, analysis, starts[i], starts[end - 1] + lines[end - 1].length)}</div>`;
  let section = '';
  let blocks = '';
  for (const { line, end, keyword } of parts) {
    if (keyword) {
      const content = lines.slice(line + 1, end).join('\n');
      const def = schema.keywords[keyword];
      if (!content.trim()) blocks += code(line);
      else if (def.block === 'yaml') blocks += code(line, end);
      else blocks += `<div class="ov-extra md">${markdown(content)}</div>`;
      continue;
    }
    const trimmed = lines[line].trim();
    const rel = isRelationLine(trimmed) && relation(trimmed);
    if (rel) section += refHtml(rel, item.refs);
    else if (trimmed) section += code(line);
  }
  return (first < 0 ? '' : `<div class="md">${markdown(lines.slice(first, boundary).join('\n'))}</div>`)
    + (section && `<div class="ov-section">${section}</div>`)
    + blocks;
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
  props: {
    attention: { type: Boolean, default: false },
    route: { type: String, default: '#/' },
  },
  emits: ['error', 'deleted'],
  setup(/** @type {any} */ props, /** @type {any} */ { emit }) {
    const query = ref(hashQuery());
    const page = ref(0);
    const rows = ref(/** @type {Item[]} */ ([]));
    const total = ref(0);
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
        ...(props.attention ? { attention: '1' } : {}), ...(focus ? { focus } : {}),
      });
      try {
        const res = await api('GET', `/api/items?${params}`);
        if (n !== loads) return;
        if (focus && !res.focused) {
          if (!query.value) throw new Error(`'${focus}' not found`);
          query.value = '';
          syncHash();
          return load(focus);
        }
        rows.value = res.items;
        total.value = res.total;
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
      listHash.value = props.route + (query.value ? '?' + new URLSearchParams({ q: query.value }) : '');
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

    /** @param {number} p */
    function goPage(p) {
      page.value = p;
      load();
    }

    onMounted(() => {
      listHash.value = props.route + (query.value ? '?' + new URLSearchParams({ q: query.value }) : '');
      load();
    });

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

    return { query, page, pages, total, rows, focused, problems, remove, setQuery, goPage, rowClick, overview: overviewHtml };
  },
  template: `
    <div>
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

/**
 * @typedef {{id: string, question: string, label: string}} Question
 * @typedef {{file: string, heading: string}} Suggestion
 */

/** One question about a note: a field whose text either links an existing note (picked from search suggestions) or becomes a new one. */
const QuestionAnswer = {
  components: { Icon },
  props: {
    file: { type: String, required: true },
    question: { type: Object, required: true },
    /** resolves once pending edits of the note are saved */
    flush: { type: Function, required: true },
  },
  emits: ['answered', 'error'],
  setup(/** @type {any} */ props, /** @type {any} */ { emit }) {
    const text = ref('');
    const suggestions = ref(/** @type {Suggestion[]} */ ([]));
    const active = ref(-1);
    const busy = ref(false);
    /** the notes linked so far */
    const linked = ref(/** @type {Suggestion[]} */ ([]));
    let timer = 0;
    let searches = 0;

    async function search() {
      const n = ++searches;
      const q = text.value.trim();
      if (q.length < 2) {
        suggestions.value = [];
        return;
      }
      const exclude = [props.file, ...linked.value.map((l) => l.file)].join(',');
      try {
        const res = await api('GET', `/api/search?${new URLSearchParams({ q, exclude })}`);
        if (n !== searches) return;
        suggestions.value = res;
        active.value = -1;
      } catch (e) { emit('error', e); }
    }

    function input() {
      clearTimeout(timer);
      timer = setTimeout(search, 120);
    }

    /** @param {{target?: string, text?: string}} how */
    async function submit(how) {
      if (busy.value) return;
      busy.value = true;
      try {
        await props.flush();
        const res = await api('POST', `/api/questions/answer/${encodeURIComponent(props.file)}`, { qid: props.question.id, ...how });
        linked.value.push(res.target);
        text.value = '';
        suggestions.value = [];
        searches++;
        emit('answered', res);
      } catch (e) { emit('error', e); } finally { busy.value = false; }
    }

    /** @param {Suggestion} s */
    const link = (s) => submit({ target: s.file });

    function createNew() {
      if (text.value.trim()) submit({ text: text.value.trim() });
    }

    /** @param {KeyboardEvent} e */
    function keydown(e) {
      const n = suggestions.value.length;
      if (e.key === 'ArrowDown' && n) {
        e.preventDefault();
        active.value = (active.value + 1) % n;
      } else if (e.key === 'ArrowUp' && n) {
        e.preventDefault();
        active.value = active.value <= 0 ? n - 1 : active.value - 1;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (active.value >= 0) link(suggestions.value[active.value]);
        else createNew();
      } else if (e.key === 'Escape') {
        suggestions.value = [];
        active.value = -1;
      }
    }

    return { text, suggestions, active, busy, linked, input, keydown, link, createNew };
  },
  template: `
    <div>
      <p class="font-medium mb-1">{{ question.question }}</p>
      <div v-for="l in linked" :key="l.file" class="text-sm"><span class="ov-muted">{{ question.label }} →</span> {{ l.heading || l.file }}</div>
      <div class="join w-full mt-1">
        <input class="input join-item w-full" v-model="text" @input="input" @keydown="keydown" :disabled="busy"
               placeholder="Search a note to link, or write a new one">
        <button class="btn join-item" :disabled="busy || !text.trim()" title="create as new note" @click="createNew">
          <icon name="plus"></icon>New note</button>
      </div>
      <ul v-if="suggestions.length" class="menu menu-sm bg-base-200 rounded-box w-full mt-1">
        <li v-for="(s, i) in suggestions" :key="s.file">
          <a :class="{'menu-active': i === active}" @mousedown.prevent="link(s)">
            <span class="truncate">{{ s.heading || s.file }}</span>
            <span class="ml-auto font-mono text-xs text-base-content/50">{{ s.file }}</span>
          </a>
        </li>
      </ul>
    </div>`,
};

/** A random loosely-linked note (see questions.py) and the questions picked for it. */
const QuestionView = {
  components: { Icon, Editor, QuestionAnswer },
  emits: ['error'],
  setup(/** @type {any} */ _props, /** @type {any} */ { emit }) {
    const item = ref(/** @type {Item | null} */ (null));
    const total = ref(0);
    const loaded = ref(false);
    const editing = ref(false);
    const text = ref('');
    /** bumped to remount the editor when the note changed underneath it */
    const editorKey = ref(0);
    const questions = ref(/** @type {Question[]} */ ([]));
    const picking = ref(false);
    const pickNote = ref('');
    /** the LLM's model when it isn't installed, and its download's progress */
    const missingModel = ref('');
    const pull = ref(/** @type {{status: string, completed: number, total: number, error: string | null} | null} */ (null));
    let pollTimer = 0;
    /** skipped this session, so Skip doesn't bring them right back */
    const skipped = /** @type {string[]} */ ([]);
    let lastSaved = '';
    /** @type {Promise<void>} */
    let pendingSave = Promise.resolve();

    /** @param {Item | null} i */
    function show(i) {
      item.value = i;
      text.value = lastSaved = i?.text ?? '';
      editorKey.value++;
    }

    async function next() {
      editing.value = false;
      try {
        const exclude = [...skipped, ...(item.value ? [item.value.file] : [])].join(',');
        const res = await api('GET', `/api/questions/next?${new URLSearchParams({ exclude })}`);
        show(res.item);
        total.value = res.total;
        loaded.value = true;
        if (res.item) pick(res.item.file);
        else questions.value = [];
      } catch (e) { emit('error', e); }
    }

    /** @param {string} file */
    async function pick(file) {
      questions.value = [];
      pickNote.value = '';
      missingModel.value = '';
      picking.value = true;
      try {
        const res = await api('GET', `/api/questions/pick/${encodeURIComponent(file)}`);
        if (item.value?.file !== file) return;
        questions.value = res.questions;
        missingModel.value = res.missing_model || '';
        if (res.missing_model) pickNote.value = `${res.missing_model} isn't installed, asking the first ones.`;
        else if (res.reason) pickNote.value = `LLM unavailable, asking the first ones: ${res.reason}`;
        else if (!res.questions.length) pickNote.value = 'No question fits this note.';
      } catch (e) { emit('error', e); } finally {
        if (item.value?.file === file) picking.value = false;
      }
    }

    async function download() {
      try {
        const res = await api('POST', '/api/questions/model/pull');
        pull.value = res.pull;
        poll();
      } catch (e) { emit('error', e); }
    }

    async function poll() {
      clearTimeout(pollTimer);
      try {
        const res = await api('GET', '/api/questions/model');
        pull.value = res.pull;
        if (res.installed) {
          pull.value = null;
          if (item.value) pick(item.value.file);
        } else if (!res.pull?.error) {
          pollTimer = setTimeout(poll, 1000);
        }
      } catch (e) { emit('error', e); }
    }

    const pullText = computed(() => {
      const p = pull.value;
      if (!p) return '';
      if (p.error) return `download failed: ${p.error}`;
      return p.total ? `${p.status} · ${Math.floor((100 * p.completed) / p.total)}%` : p.status;
    });

    onBeforeUnmount(() => clearTimeout(pollTimer));

    function skip() {
      if (item.value) skipped.push(item.value.file);
      next();
    }

    async function disable() {
      if (!item.value) return;
      try {
        await pendingSave;
        await api('POST', `/api/questions/disable/${encodeURIComponent(item.value.file)}`);
        next();
      } catch (e) { emit('error', e); }
    }

    async function save() {
      const sent = text.value;
      if (!item.value || !sent.trim() || sent === lastSaved) return;
      const file = item.value.file;
      try {
        await api('PUT', `/api/items/${encodeURIComponent(file)}`, { text: sent });
        lastSaved = sent;
        const fresh = await api('GET', `/api/questions/note/${encodeURIComponent(file)}`);
        if (item.value?.file === file) item.value = fresh;
      } catch (e) { emit('error', e); }
    }

    function autosave() {
      pendingSave = pendingSave.then(save);
      return pendingSave;
    }

    function toggleEdit() {
      if (editing.value) autosave();
      editing.value = !editing.value;
    }

    /** @param {Item} res the note after the answer was linked */
    function answered(res) {
      show(res);
    }

    /** relationship links open the target in the editor */
    function previewClick(/** @type {MouseEvent} */ e) {
      const a = /** @type {HTMLAnchorElement | null} */ ((/** @type {Element} */ (e.target)).closest('a'));
      if (a?.dataset.ref) go('#/edit/' + encodeURIComponent(a.dataset.ref));
      else if (a?.href) {
        e.preventDefault();
        window.open(a.href, '_blank', 'noopener');
      }
    }

    onMounted(next);

    return {
      item, total, loaded, editing, text, editorKey, questions, picking, pickNote, missingModel, pull, pullText, download,
      skip, disable, toggleEdit, autosave, answered, previewClick, fail: (/** @type {any} */ e) => emit('error', e),
      overview: overviewHtml,
    };
  },
  template: `
    <div>
      <p v-if="loaded && !item" class="text-base-content/50">No notes to ask about.</p>
      <template v-if="item">
        <div class="flex items-center gap-1 mb-4">
          <button class="btn" title="next note" @click="skip"><icon name="skip-forward"></icon>Skip</button>
          <button class="btn" title="never ask about this note (tag no-questions)" @click="disable"><icon name="ban"></icon>Disable</button>
          <button class="btn btn-square" :class="{'btn-active': editing}" title="edit" @click="toggleEdit"><icon name="pencil"></icon></button>
          <span class="ml-auto font-mono text-xs text-base-content/50">{{ item.file }} · {{ total }}</span>
        </div>
        <div v-if="editing" @focusout="autosave">
          <editor :key="editorKey" v-model="text" @save="autosave"></editor>
        </div>
        <div v-else class="overview rounded-box border border-base-300 p-4" v-html="overview(item)" @click="previewClick"></div>
        <div class="mt-6 space-y-6">
          <span v-if="picking" class="loading loading-dots loading-sm"></span>
          <p v-if="pickNote" class="text-sm text-base-content/50">{{ pickNote }}
            <button v-if="missingModel && (!pull || pull.error)" class="btn btn-xs ml-1" @click="download">
              <icon name="download" :size="14"></icon>Download {{ missingModel }}</button>
            <span v-if="pullText" class="ml-1">{{ pullText }}</span>
          </p>
          <question-answer v-for="q in questions" :key="item.file + ':' + q.id" :file="item.file" :question="q"
                           :flush="autosave" @answered="answered" @error="fail"></question-answer>
        </div>
      </template>
    </div>`,
};

const LlmSettings = {
  emits: ['error'],
  setup(/** @type {any} */ _props, /** @type {any} */ { emit }) {
    const info = ref(/** @type {{available: boolean, reason: string | null, url: string, default_url: string} | null} */ (null));
    const url = ref('');

    async function load() {
      try {
        const res = await api('GET', '/api/llm');
        info.value = res;
        url.value = res.url === res.default_url ? '' : res.url;
      } catch (e) { emit('error', e); }
    }

    async function save() {
      try {
        await api('PUT', '/api/settings', { llm: { url: url.value } });
        await load();
      } catch (e) { emit('error', e); }
    }

    onMounted(load);
    return { info, url, save };
  },
  template: `
    <fieldset v-if="info" class="fieldset"><legend class="fieldset-legend">Ollama server</legend>
      <div class="join w-full">
        <input class="input join-item w-full" v-model="url" :placeholder="info.default_url" @keydown.enter="save">
        <button class="btn join-item" @click="save">Save</button>
      </div>
      <p class="label">{{ info.available ? 'reachable at ' + info.url : 'unavailable: ' + info.reason }}</p>
    </fieldset>`,
};

const Settings = {
  components: { LlmSettings },
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

    return { value, save, fail: (/** @type {any} */ e) => emit('error', e) };
  },
  template: `
    <div>
      <fieldset class="fieldset"><legend class="fieldset-legend">data directory</legend>
        <div class="join w-full">
          <input class="input join-item w-full" v-model="value" @keydown.enter="save" autofocus>
          <button class="btn join-item" @click="save">Save</button>
        </div>
        <p v-if="suggested && suggested !== value" class="label">calendar: <a class="link font-mono" @click="value = suggested">{{ suggested }}</a></p>
      </fieldset>
      <llm-settings @error="fail"></llm-settings>
    </div>`,
};

createApp({
  components: { ItemEditor, ItemList, TaskList, QuestionView, Settings },
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
      if (r.startsWith('#/broken')) return 'broken';
      if (r === '#/tasks') return 'tasks';
      if (r === '#/questions') return 'questions';
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

    const notesTab = computed(() => page.value === 'list' || page.value === 'edit');

    return { ready, error, path, suggested, listKey, page, notesTab, editFile, deleted, fail, settingsSaved, itemSaved, itemDeleted, undoDelete };
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
      <div role="tablist" class="tabs tabs-border mb-4">
        <a role="tab" class="tab" :class="{'tab-active': notesTab}" href="#/">Notes</a>
        <a role="tab" class="tab" :class="{'tab-active': page === 'new'}" href="#/new">New</a>
        <a role="tab" class="tab" :class="{'tab-active': page === 'broken'}" href="#/broken">Broken</a>
        <a role="tab" class="tab" :class="{'tab-active': page === 'tasks'}" href="#/tasks">Tasks</a>
        <a role="tab" class="tab" :class="{'tab-active': page === 'questions'}" href="#/questions">Questions</a>
        <a role="tab" class="tab" :class="{'tab-active': page === 'settings'}" href="#/settings">Settings</a>
      </div>
      <settings v-if="page === 'settings'" :path="path || ''" :suggested="suggested" @saved="settingsSaved" @error="fail"></settings>
      <item-editor v-else-if="page === 'new' || page === 'edit'" key="editor"
                   :edit-file="page === 'edit' ? editFile : null" @saved="itemSaved" @deleted="itemDeleted" @error="fail"></item-editor>
      <task-list v-else-if="page === 'tasks'" key="tasks" @error="fail"></task-list>
      <question-view v-else-if="page === 'questions'" key="questions" @error="fail"></question-view>
      <item-list v-else-if="page === 'broken'" key="broken" attention route="#/broken" @deleted="itemDeleted" @error="fail"></item-list>
      <item-list v-else :key="listKey" @deleted="itemDeleted" @error="fail"></item-list>
    </template>`,
}).mount('#app');
