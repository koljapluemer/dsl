import type { Item } from '@/api/types';

/** Text not (yet) written as a note, shaped like one to render it: a draft, or a note staged to be created. */
export const draftItem = (text: string, base?: Item): Item => ({
  file: base?.file ?? '', text, media: base?.media ?? null, files: base?.files ?? [], errors: [], warnings: [], refs: base?.refs ?? {}, sourceKey: base?.sourceKey ?? null,
});
