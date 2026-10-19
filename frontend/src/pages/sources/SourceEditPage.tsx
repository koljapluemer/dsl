import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useRouter } from '@tanstack/react-router';
import { ArrowLeft, Trash2 } from 'lucide-react';
import type { Source, SourceSchema } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { itemsChanged } from '@/entities/item/mutations';
import { itemQuery } from '@/entities/item/queries';
import { useDeleteItem } from '@/features/item-delete/useDeleteItem';
import { Backlinks } from '@/features/item-relate/Backlinks';
import { EMPTY_FORM, blankValue, hasValue, isList, saveSource, sourceSchemaQuery, sourcesQuery, toForm, type SourceForm } from './sources';

const DATE_PATTERN = String.raw`-?\d{4}(-\d{2}(-\d{2})?)?(/(-?\d{4}(-\d{2}(-\d{2})?)?)?)?`;

/**
 * /sources/new and /sources/edit/$file. A new source moves to its /edit URL
 * once saved, keeping the form; any other change of URL starts a fresh one.
 */
export function SourceEditPage() {
  const { file } = useParams({ strict: false }) as { file?: string };
  const [created, setCreated] = useState<string | null>(null);
  const [shown, setShown] = useState({ file, session: 0 });
  if (file !== shown.file) setShown({ file, session: file && file === created ? shown.session : shown.session + 1 });

  return <Loader key={shown.session} file={file ?? null} onCreated={setCreated} />;
}

function Loader({ file, onCreated }: { file: string | null; onCreated: (file: string) => void }) {
  const [initialFile] = useState(file);
  const { data: schema } = useQuery(sourceSchemaQuery);
  // the sources as they are now, not as cached: the form keeps what it starts with
  const { data, isFetchedAfterMount } = useQuery(sourcesQuery);
  if (!schema || (initialFile && !(data && isFetchedAfterMount))) return null;
  const source = initialFile ? data!.sources.find((s) => s.file === initialFile) : null;
  if (initialFile && !source) return <p className="text-base-content/50">No source in {initialFile}.</p>;
  return <Editor schema={schema} source={source ?? null} onCreated={onCreated} />;
}

/** Saved when a field loses focus. */
function Editor({ schema, source, onCreated }: { schema: SourceSchema; source: Source | null; onCreated: (file: string) => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const remove = useDeleteItem();
  const [form, setForm] = useState(() => (source ? toForm(source, schema) : EMPTY_FORM));
  const [added, setAdded] = useState<string[]>([]);
  const [savedFile, setSavedFile] = useState(source?.file ?? null);
  const current = useRef(form);
  const file = useRef(source?.file ?? null);
  const saved = useRef(JSON.stringify(form));
  const pending = useRef(Promise.resolve());

  const update = (f: SourceForm) => { current.current = f; setForm(f); };
  const set = (field: string, value: string | string[]) => update({ ...current.current, [field]: value });

  const save = () => (pending.current = pending.current.then(async () => {
    const f = current.current;
    if (JSON.stringify(f) === saved.current || (!file.current && !f.key.trim() && !f.title.trim())) return;
    try {
      const s = await saveSource(file.current, f);
      // a blank key is the title's slug
      const now = f.key.trim() ? f : { ...f, key: s.key };
      if (now !== f && current.current === f) update(now);
      saved.current = JSON.stringify(now);
      if (!file.current) {
        file.current = s.file;
        setSavedFile(s.file);
        onCreated(s.file);
        void navigate({ to: '/sources/edit/$file', params: { file: s.file }, replace: true });
      }
      await itemsChanged(qc, false);
    } catch (e) { showError(e); }
  }));

  const back = () => (router.history.canGoBack() ? router.history.back() : navigate({ to: '/sources' }));

  async function del() {
    await save();
    if (!file.current) return;
    try {
      if (await remove(await qc.fetchQuery({ ...itemQuery(file.current), staleTime: 0 }))) void back();
    } catch (e) { showError(e); }
  }

  const defaults = schema.entryTypes[form.entrytype] ?? [];
  const visible = Object.keys(schema.fields).filter((f) => defaults.includes(f) || added.includes(f) || hasValue(form[f]));
  const hidden = Object.keys(schema.fields).filter((f) => !visible.includes(f));

  return (
    <div onBlur={() => void save()}>
      <div className="flex items-center gap-1 mb-4">
        <button className="btn btn-square" title="back" onClick={back}><ArrowLeft size={20} /></button>
        {savedFile && <button className="btn btn-square btn-error btn-outline" title="delete" onClick={del}><Trash2 size={20} /></button>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
        <Field label="key">
          <input className="input w-full" value={form.key} placeholder="from the title" onChange={(e) => set('key', e.target.value)} />
        </Field>
        <Field label="entrytype">
          <select className="select w-full" value={form.entrytype} onChange={(e) => set('entrytype', e.target.value)}>
            {Object.keys(schema.entryTypes).map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="title" wide>
          <input className="input w-full" value={form.title} onChange={(e) => set('title', e.target.value)} autoFocus={!source} />
        </Field>
        {visible.map((f) => (
          <Field key={f} label={f} wide={isList(schema, f)}>
            <Value type={schema.fields[f].type} value={form[f] ?? blankValue(schema, f)} onChange={(v) => set(f, v)} />
          </Field>
        ))}
        <Field label="extra" wide>
          <textarea className="textarea w-full" value={form.extra} onChange={(e) => set('extra', e.target.value)} />
        </Field>
      </div>
      <select className="select select-sm mt-4" value="" onChange={(e) => e.target.value && setAdded([...added, e.target.value])}>
        <option value="">+ field</option>
        {hidden.map((f) => <option key={f}>{f}</option>)}
      </select>
      {savedFile && <div className="mt-6"><Backlinks file={savedFile} deleteItem={remove} /></div>}
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <fieldset className={`fieldset ${wide ? 'md:col-span-2' : ''}`}><legend className="fieldset-legend">{label}</legend>{children}</fieldset>;
}

function Value({ type, value, onChange }: { type: string; value: string | string[]; onChange: (v: string | string[]) => void }) {
  if (Array.isArray(value)) return <Rows rows={value} placeholder={type === 'name' ? 'family, given' : undefined} onChange={onChange} />;
  const attrs = { className: 'input w-full', value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) };
  if (type === 'integer') return <input {...attrs} type="number" />;
  if (type === 'date') return <input {...attrs} placeholder="YYYY-MM-DD" pattern={DATE_PATTERN} />;
  return <input {...attrs} type={type === 'uri' ? 'url' : 'text'} />;
}

/** One input per row, keeping one trailing blank row to add to. */
function Rows({ rows, placeholder, onChange }: { rows: string[]; placeholder?: string; onChange: (rows: string[]) => void }) {
  function setRow(i: number, v: string) {
    const next = rows.map((r, j) => (j === i ? v : r));
    onChange(next[next.length - 1] === '' ? next : [...next, '']);
  }
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r, i) => <input key={i} className="input input-sm w-full" value={r} placeholder={placeholder} onChange={(e) => setRow(i, e.target.value)} />)}
    </div>
  );
}
