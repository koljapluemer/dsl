import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Previous/next buttons around "page / pages · total"; hidden for a single page. */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="join mt-4">
      <button className="btn join-item" disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft size={20} /></button>
      <span className="btn join-item pointer-events-none">{page + 1} / {pages} · {total}</span>
      <button className="btn join-item" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={20} /></button>
    </div>
  );
}
