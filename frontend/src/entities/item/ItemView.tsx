import type { ItemView as View } from '@/api/types';
import { Markdown } from '@/dumb/Markdown';
import { Media } from '@/dumb/Media';
import { mediaUrl } from './media';
import './item.css';

/**
 * An item's body, its attachment, and its extra content in a box in smaller
 * type; keyword lines and relationships aren't shown. An invalid item shows
 * its raw text, marked invalid.
 */
export function ItemView({ item }: { item: View }) {
  if (item.errors.length) {
    return (
      <div>
        <p className="text-error text-xs mb-1">Invalid: {item.file}</p>
        <p className="whitespace-pre-wrap">{item.text}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Markdown source={item.body} />
      {item.media && <Media src={mediaUrl(item.media)} />}
      {item.extra && <Markdown className="rounded-box bg-base-200 p-3 text-xs" source={item.extra} />}
    </div>
  );
}
