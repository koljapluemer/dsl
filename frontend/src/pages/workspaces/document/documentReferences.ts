import type { Schema } from '@/api/types';
import { itemInlineReferences } from '@/entities/item/dsl/inlineRefs';

export type DocumentReference = ReturnType<typeof itemInlineReferences>[number] & {
  /** Stable while references to this target are not inserted before it. */
  id: string;
  /** One-based position among every inline reference in the document. */
  number: number;
};

/** Inline references in document order, with occurrence identities for anchors and cards. */
export function documentReferences(schema: Schema, text: string): DocumentReference[] {
  const seen = new Map<string, number>();
  return itemInlineReferences(schema, text).map((ref, index) => {
    const occurrence = (seen.get(ref.target) ?? 0) + 1;
    seen.set(ref.target, occurrence);
    return { ...ref, id: `${ref.target}:${occurrence}`, number: index + 1 };
  });
}

