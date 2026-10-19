import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ClipboardPaste, CodeXml, Copy, Link as LinkIcon, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Source } from '@/api/types';
import { showError } from '@/dumb/errorBanner';
import { itemsChanged } from '@/entities/item/mutations';
import { itemQuery } from '@/entities/item/queries';
import { useDeleteItem } from '@/features/item-delete/useDeleteItem';
import { authors, importBibtex, matches, sourcesQuery, year } from './sources';

const RECENT_BG = ['bg-yellow-400/50!', 'bg-yellow-400/30!', 'bg-yellow-400/15!'];

const escHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); } catch { showError('Could not copy to clipboard'); }
}

const copyMarkdown = (s: Source) => copy(`[${(s.title || s.key).replace(/[[\]]/g, '\\$&')}](${String(s.url ?? '')})`);
const copyHtml = (s: Source) => copy(`<a href="${escHtml(String(s.url ?? ''))}" target="_blank">${escHtml(s.title || s.key)}</a>`);

/** Every source, filtered by the URL's `q`; the most recently edited highlighted. */
export function SourcesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { q = '' } = useSearch({ from: '/sources' });
  const { data } = useQuery(sourcesQuery);
  const remove = useDeleteItem();
  const edit = (file: string) => navigate({ to: '/sources/edit/$file', params: { file } });

  async function fromClipboard() {
    try {
      const created = await importBibtex(await navigator.clipboard.readText());
      await itemsChanged(qc);
      if (created.length === 1) void edit(created[0].file);
    } catch (e) { showError(e); }
  }

  async function del(s: Source) {
    try {
      await remove(await qc.fetchQuery({ ...itemQuery(s.file), staleTime: 0 }));
    } catch (e) { showError(e); }
  }

  const rows = data?.sources.filter((s) => matches(s, q)) ?? [];
  return (
    <div>
      <div className="flex gap-1 mb-2">
        <Link to="/sources/new" className="btn"><Plus size={20} />New</Link>
        <button className="btn" title="add from BibTeX in the clipboard" onClick={fromClipboard}><ClipboardPaste size={20} />Import BibTeX</button>
      </div>
      <input className="input w-full mb-4" type="search" value={q} placeholder="Filter" autoFocus
             onChange={(e) => navigate({ to: '/sources', search: { q: e.target.value || undefined }, replace: true })} />
      <table className="table table-xs table-zebra">
        <thead><tr><th></th><th>key</th><th>title</th><th>author</th><th>year</th><th>type</th><th></th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.file} className={RECENT_BG[data!.recent.indexOf(s.file)] ?? 'hover:bg-base-200'}>
              <td><button className="btn btn-ghost btn-xs btn-square" title="copy key" onClick={() => copy(s.key)}><Copy size={14} /></button></td>
              <td className="font-mono">{s.key}</td>
              <td>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">{s.title}</span>
                  <span className="flex shrink-0">
                    <button className="btn btn-ghost btn-xs btn-square" title="copy as markdown link" onClick={() => copyMarkdown(s)}><LinkIcon size={14} /></button>
                    <button className="btn btn-ghost btn-xs btn-square" title="copy as html link" onClick={() => copyHtml(s)}><CodeXml size={14} /></button>
                  </span>
                </div>
              </td>
              <td>{authors(s)}</td><td>{year(s)}</td><td>{s.entrytype}</td>
              <td className="whitespace-nowrap text-right">
                <button className="btn btn-ghost btn-xs btn-square" title="edit" onClick={() => edit(s.file)}><Pencil size={14} /></button>
                <button className="btn btn-ghost btn-xs btn-square text-error" title="delete" onClick={() => del(s)}><Trash2 size={14} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
