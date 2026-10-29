import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Note } from '@/meta/note/Note';
import { dailyDate, dailyQuery } from './daily';

/** how often an open tab checks whether a new day has begun, in ms */
const TICK_MS = 60_000;

/**
 * Today's daily note (`daily <date>`), created when missing, in the editor to
 * begin with and saved as focus leaves it. Left open, it moves on to the next
 * day's note at DAY_STARTS_AT.
 */
export function DailyPage() {
  const [date, setDate] = useState(dailyDate);
  useEffect(() => {
    const timer = setInterval(() => setDate(dailyDate()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const { data, error } = useQuery(dailyQuery(date));
  if (error) return <p className="text-error">{error.message}</p>;
  if (!data) return <span className="loading loading-spinner loading-sm" />;
  return (
    <div className="pb-4">
      <Note key={data.file} file={data.file} item={data} commit="blur" defaultMode="edit" persist="daily" tools={{ delete: false }} />
    </div>
  );
}
