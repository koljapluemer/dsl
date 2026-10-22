import { Link } from '@tanstack/react-router';

/** A view to go to: its route, name and `g <key>`. */
export type View = { to: string; label: string; key: string };

/** The start page: the other views, each a link. */
export function HomePage({ views }: { views: readonly View[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @3xl:grid-cols-4">
      {views.filter((v) => v.to !== '/').map((v) => (
        <Link key={v.to} to={v.to} className="btn h-auto justify-between py-4">
          {v.label}<kbd className="kbd kbd-sm">g {v.key}</kbd>
        </Link>
      ))}
    </div>
  );
}
