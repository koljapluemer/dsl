import { useNavigate } from '@tanstack/react-router';
import { CircleX, Trash2, TriangleAlert } from 'lucide-react';
import type { Item } from '@/api/types';
import { describeProblems } from '@/entities/item/describe';
import { ItemOverview } from '@/entities/item/ItemOverview';
import { useDeleteItem } from '@/features/item-delete/useDeleteItem';

/** A reference jumps to its item, other links open in a new tab, the rest of the row opens the editor. */
export function ItemRow({ item, focused, onRef }: { item: Item; focused: boolean; onRef: (file: string) => void }) {
  const navigate = useNavigate();
  const remove = useDeleteItem();
  return (
    <tr id={'item:' + item.file} className={`cursor-pointer hover:bg-base-200 ${focused ? 'outline-2 -outline-offset-2 outline-primary' : ''}`}
        onClick={(e) => { if (!(e.target as Element).closest('a')) navigate({ to: '/edit/$file', params: { file: item.file } }); }}>
      <td className="w-4 align-top" title={describeProblems(item)}>
        {item.errors.length > 0 ? <CircleX size={14} className="text-error" />
          : item.warnings.length > 0 && <TriangleAlert size={14} className="text-warning" />}
      </td>
      <td className="overview"><ItemOverview item={item} onRef={onRef} /></td>
      <td className="w-4 align-top text-right">
        <button className="btn btn-ghost btn-xs btn-square text-error" title="delete" onClick={(e) => { e.stopPropagation(); remove(item); }}>
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}
