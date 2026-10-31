import { api } from '@/api/client';
import type { LearnCard, LearnNext, Rating } from '@/api/types';

export const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

/** A random due flashcard, else a random new one (see docs/flashcards.md). */
export const nextCard = () => api<LearnNext>('GET', '/api/learn/next');

/** Rates the card; the next one comes back. */
export const review = (card: LearnCard, rating: Rating) =>
  api<LearnNext>('POST', '/api/learn/review', { file: card.file, id: card.id, rating });

/** How long until `iso`, rounded down to its largest unit: `<1m`, `10m`, `3h`, `4d`, `2mo`, `1.5y`. */
export function until(iso: string, now = Date.now()) {
  const minutes = (Date.parse(iso) - now) / 60_000;
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.floor(days)}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 36.5) / 10}y`;
}
