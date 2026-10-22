import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Note } from '@/meta/note/Note';
import { done, markDone, ordered } from './session';
import { taggedQuery, tagsQuery } from './tags';

const DEFAULT_TAG = 'zero';
const NONE_DONE: ReadonlySet<string> = new Set();

/** A dropdown of every tag, `zero` selected on load, and the items carrying the selected one. */
export function TagsPage() {
  const { data } = useQuery(tagsQuery);
  if (!data) return null;
  if (!data.length) return <p className="text-base-content/50">No tags found.</p>;
  return <Tags tags={data} />;
}

function Tags({ tags }: { tags: string[] }) {
  const [chosen, setChosen] = useState(DEFAULT_TAG);
  // missing, or gone once its last item is untagged
  const tag = tags.includes(chosen) ? chosen : tags[0];
  return (
    <div>
      <select className="select mb-4" value={tag} onChange={(e) => setChosen(e.target.value)}>
        {tags.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <Tagged key={tag} tag={tag} />
    </div>
  );
}

/** Each item tagged `tag`, inline, in a random order per page load; clicking one greys it out and moves it last. */
function Tagged({ tag }: { tag: string }) {
  const { data } = useQuery(taggedQuery(tag));
  const isDone = done.use().get(tag) ?? NONE_DONE;
  if (!data) return null;
  if (!data.length) return <p className="text-base-content/50">No items found.</p>;
  return (
    <div className="space-y-2">
      {ordered(data, isDone).map((i) => (
        <Note key={i.file} file={i.file} item={i} render="inline" onClick={() => markDone(tag, i.file)}
              className={`rounded-box border border-base-300 p-2 ${isDone.has(i.file) ? 'opacity-40' : ''}`} />
      ))}
    </div>
  );
}
