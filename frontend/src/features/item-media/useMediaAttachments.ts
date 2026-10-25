import { useCallback, useEffect, useRef, useState } from 'react';
import type { Item } from '@/api/types';
import { compressImage } from '@/entities/item/files/kinds/image';
import { MAX_VIDEO_ATTACHMENT_BYTES } from '@/entities/item/files/kinds/video';
import { attachMedia, removeMedia } from '@/entities/item/mutations';

/**
 * One of a note's staged images and videos: `existing` names a file already on
 * disk (unchanged); `new` carries freshly picked or pasted bytes not yet written
 * (compressed, for an image; verbatim, for a video) and an object URL previewing them.
 */
export type MediaEntry =
  | { status: 'existing'; path: string }
  | { status: 'new'; kind: 'image' | 'video'; blob: Blob; url: string };

/** The staged media against the note's as written: `removed` are written ones no longer staged. */
export type MediaDraft = { entries: MediaEntry[]; removed: string[] };

export function mediaDraft(base: string[], entries: MediaEntry[]): MediaDraft {
  const kept = new Set(entries.flatMap((e) => (e.status === 'existing' ? [e.path] : [])));
  return { entries, removed: base.filter((path) => !kept.has(path)) };
}

export const mediaChanged = ({ entries, removed }: MediaDraft) => removed.length > 0 || entries.some((e) => e.status === 'new');

/** Writes the draft to the note `file`: removals, then uploads in order (each after the note's others). Resolves to the note as last written, null when nothing was. */
export async function persistMedia(file: string, { entries, removed }: MediaDraft): Promise<Item | null> {
  let saved: Item | null = null;
  for (const path of removed) saved = await removeMedia(file, path);
  for (const entry of entries) if (entry.status === 'new') saved = await attachMedia(file, entry.blob);
  return saved;
}

async function prepare(file: File): Promise<MediaEntry> {
  if (file.type.startsWith('video/')) {
    if (file.size > MAX_VIDEO_ATTACHMENT_BYTES) {
      throw new Error(`Video is too large; keep clips under ${Math.round(MAX_VIDEO_ATTACHMENT_BYTES / (1024 * 1024))}MB.`);
    }
    return { status: 'new', kind: 'video', blob: file, url: URL.createObjectURL(file) };
  }
  const blob = await compressImage(file);
  return { status: 'new', kind: 'image', blob, url: URL.createObjectURL(blob) };
}

/** Stages a note's images and videos (persisting them is the save handler's job) and owns the lifetime of their local preview URLs. */
export function useMediaAttachments(initial: string[]) {
  const [entries, setEntries] = useState<MediaEntry[]>(() => initial.map((path) => ({ status: 'existing', path })));
  const [error, setError] = useState<string | null>(null);

  // object URLs made here, revoked once their entry is gone
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const live = new Set(entries.flatMap((e) => (e.status === 'new' ? [e.url] : [])));
    for (const url of urls.current) if (!live.has(url)) { URL.revokeObjectURL(url); urls.current.delete(url); }
  }, [entries]);

  /** Appends the images and videos among `files`, in order; one that can't be staged is skipped, its error shown. */
  const attachFiles = async (files: File[]) => {
    setError(null);
    const added: MediaEntry[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
      try {
        const entry = await prepare(file);
        if (entry.status === 'new') urls.current.add(entry.url);
        added.push(entry);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }
    if (added.length) setEntries((current) => [...current, ...added]);
  };

  const remove = (entry: MediaEntry) => setEntries((current) => current.filter((e) => e !== entry));

  const reset = useCallback((paths: string[]) => {
    setEntries(paths.map((path) => ({ status: 'existing', path })));
    setError(null);
  }, []);

  return { entries, attachFiles, remove, reset, error };
}
