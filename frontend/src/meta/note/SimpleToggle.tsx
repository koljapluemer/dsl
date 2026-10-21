import { AlignLeft, LayoutList } from 'lucide-react';

/** An icon toggle between notes shown simply (`render="simple"`) and in full. */
export function SimpleToggle({ simple, onChange }: { simple: boolean; onChange: (simple: boolean) => void }) {
  return (
    <button type="button" className="btn btn-square" aria-pressed={simple} title={simple ? 'simple (click: in full)' : 'in full (click: simple)'}
            onClick={() => onChange(!simple)}>
      {simple ? <AlignLeft size={20} /> : <LayoutList size={20} />}
    </button>
  );
}
