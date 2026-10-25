import { queryOptions } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Item, Portfolio } from '@/api/types';

/**
 * The note tagged `portfolio` and its template, created by the server when
 * missing (repeating it changes nothing); under `items`, so writes refetch it.
 */
export const portfolioQuery = queryOptions({
  queryKey: ['items', 'portfolio'],
  queryFn: () => api<Portfolio>('POST', '/api/portfolio'),
});

/** Every note tagged `card` (portfolio.CARD_TAG), by heading; under `items`, so writes refetch it. */
export const cardsQuery = queryOptions({
  queryKey: ['items', 'portfolio', 'cards'],
  queryFn: () => api<Item[]>('GET', '/api/portfolio/cards'),
});

export const PREVIEW_URL = '/api/portfolio/preview';

/** A short hash of the card's text, so the browser doesn't keep showing an earlier render. */
function version(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (h * 33) ^ text.charCodeAt(i);
  return (h >>> 0).toString(36);
}

const cardUrl = (item: Item, suffix: string) => `/api/portfolio/cards/${item.file.replace(/\.txt$/, '')}${suffix}?v=${version(item.text)}`;
/** A card's A4 collage, as WebP. */
export const cardImageUrl = (item: Item) => cardUrl(item, '.webp');
export const cardThumbUrl = (item: Item) => cardUrl(item, '-thumb.webp');
