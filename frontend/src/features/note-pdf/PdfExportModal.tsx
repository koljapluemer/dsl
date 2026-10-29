import { useState } from 'react';
import { FileDown, X } from 'lucide-react';
import type { Item } from '@/api/types';
import { Modal } from '@/dumb/Modal';
import { showError } from '@/dumb/notice';
import { outline } from '@/entities/item/dsl/outline';
import { kindOf } from '@/entities/item/files/files';
import { useSchema } from '@/entities/item/schema';
import { downloadPdf, type PdfContent, type PdfPaper } from './pdf';

const CONTENTS: { value: PdfContent; label: string }[] = [
  { value: 'both', label: 'Main and extra' }, { value: 'body', label: 'Main' }, { value: 'extra', label: 'Extra' },
];

/** What of the saved note goes into its PDF (body, `extra` or both, its images, the paper), then the download. */
export function PdfExportModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const schema = useSchema();
  const { lines, parts } = outline(schema, item.text);
  const hasExtra = parts.some((p) => p.keyword === 'extra' && lines.slice(p.line + 1, p.end).join('\n').trim());
  const hasImages = item.files.some((f) => kindOf(f).name === 'image');
  const [content, setContent] = useState<PdfContent>(hasExtra ? 'both' : 'body');
  const [images, setImages] = useState(true);
  const [paper, setPaper] = useState<PdfPaper>('A4');
  const [busy, setBusy] = useState(false);

  async function exportPdf() {
    setBusy(true);
    try {
      await downloadPdf(item.file, { content, images: hasImages && images, paper });
      onClose();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="mb-2 flex items-center">
        <h3 className="flex-1 font-semibold">Export as PDF</h3>
        <button type="button" className="btn btn-ghost btn-xs btn-square" title="close" onClick={onClose}><X size={14} /></button>
      </div>
      <fieldset className="fieldset">
        <legend className="fieldset-legend">Content</legend>
        {CONTENTS.map((c) => {
          const disabled = !hasExtra && c.value !== 'body';
          return (
            <label key={c.value} className={`label gap-2 ${disabled ? 'opacity-50' : ''}`}>
              <input type="radio" name="pdf-content" className="radio radio-sm" checked={content === c.value} disabled={disabled}
                     onChange={() => setContent(c.value)} />
              {c.label}
            </label>
          );
        })}
      </fieldset>
      {hasImages && (
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Images</legend>
          <label className="label gap-2">
            <input type="checkbox" className="checkbox checkbox-sm" checked={images} onChange={(e) => setImages(e.target.checked)} />
            Include the note's images
          </label>
        </fieldset>
      )}
      <fieldset className="fieldset">
        <legend className="fieldset-legend">Paper</legend>
        <select className="select w-full" value={paper} onChange={(e) => setPaper(e.target.value as PdfPaper)}>
          <option value="A4">A4</option>
          <option value="Letter">Letter</option>
        </select>
      </fieldset>
      <div className="modal-action">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void exportPdf()}>
          {busy ? <span className="loading loading-spinner loading-sm" /> : <FileDown size={16} />} Export
        </button>
      </div>
    </Modal>
  );
}
