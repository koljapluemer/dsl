import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SuggestNote } from './SuggestNote';
import { tagsQuery } from './suggest';

const PREFIX = 'suggest-';

/** A dropdown of the `suggest-` tags, a random one selected on load, and a random note carrying it. */
export function SuggestPage() {
  const { data } = useQuery(tagsQuery);
  if (!data) return null;
  if (!data.length) return <p className="text-base-content/50">No {PREFIX} tags found.</p>;
  return <Suggest tags={data} />;
}

function Suggest({ tags }: { tags: string[] }) {
  const [chosen, setChosen] = useState(() => tags[Math.floor(Math.random() * tags.length)]);
  // gone once its last note is deleted
  const tag = tags.includes(chosen) ? chosen : tags[0];
  return (
    <div>
      <select className="select mb-4" value={tag} onChange={(e) => setChosen(e.target.value)}>
        {tags.map((t) => <option key={t} value={t}>{t.slice(PREFIX.length)}</option>)}
      </select>
      <SuggestNote key={tag} tag={tag} />
    </div>
  );
}
