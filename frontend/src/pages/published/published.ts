import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Item, Schema } from '@/api/types';
import { outline } from '@/entities/item/dsl/outline';

/** Every note with a `publish` route, by route; under `items`, so writes refetch it. */
export const publishedQuery = queryOptions({ queryKey: ['items', 'published'], queryFn: () => api<Item[]>('GET', '/api/published') });

/** The published page's URL search: the note open. */
export type PublishedSearch = { open?: string };

export const validatePublishedSearch = (s: Record<string, unknown>): PublishedSearch => ({
  open: typeof s.open === 'string' && s.open ? s.open : undefined,
});

/** keep in line with views.PUBLISH_KEYWORD */
export const PUBLISH_KEYWORD = 'publish';

/** A route for a note not yet published: its file name without the random suffix (see items._new_name). */
export const defaultRoute = (file: string) =>
  file.replace(/\.txt$/, '').replace(/-[0-9a-f]{6}$/, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';

/** The note's text with a `publish` block at its end, at `defaultRoute`; null when it has one already. */
export function withPublish(schema: Schema, text: string, file: string): string | null {
  if (outline(schema, text).parts.some((p) => p.keyword === PUBLISH_KEYWORD)) return null;
  return `${text.trimEnd()}\n${PUBLISH_KEYWORD} ${defaultRoute(file)}\n`;
}

/**
 * A route segment: `items` are the notes published at `route` itself (more than
 * one is a clash), `children` the routes below it. A route can be both, e.g.
 * `essays` and `essays/x`.
 */
export type RouteNode = { name: string; route: string; items: Item[]; children: RouteNode[] };

/** The notes' routes as a tree of their segments, each level by name. */
export function routeTree(items: Item[]): RouteNode[] {
  const root: RouteNode = { name: '', route: '', items: [], children: [] };
  for (const item of items) {
    if (!item.route) continue;
    let node = root;
    for (const name of item.route.split('/')) {
      let child = node.children.find((c) => c.name === name);
      if (!child) {
        child = { name, route: node.route ? `${node.route}/${name}` : name, items: [], children: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.items.push(item);
  }
  const sort = (n: RouteNode) => { n.children.sort((a, b) => a.name.localeCompare(b.name)); n.children.forEach(sort); };
  sort(root);
  return root.children;
}
