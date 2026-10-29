import { ApiError } from '@/api/client';
import type { WireNode } from './canvas-model';

/**
 * `saved`: nothing to write; `pending`: changes wait to be written; `saving`: a
 * write is under way (newer changes wait for it); `error`: the last write
 * failed, its changes are kept and go with the next one; `conflict`: the
 * stored canvas changed elsewhere, nothing more is written.
 */
export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';
export type SaveState = { status: SaveStatus; error: string | null };

type Put = (nodes: WireNode[], rev: string) => Promise<{ rev: string }>;

/** the savers with a write under way, so a reload of their canvas waits for it */
const writing = new Set<CanvasSaver>();

/** Resolves once no write of `file`'s canvas is under way. */
export const whenSaved = (file: string) => Promise.all([...writing].filter((saver) => saver.file === file).map((saver) => saver.settled()));

/**
 * Writes one canvas, a whole snapshot at a time. Changes are written after
 * `delay` without more, at most one write is under way, and the changes made
 * meanwhile go together in the next one, which carries the revision the
 * previous one returned. So writes land in order and each one checks it's
 * writing over what this page last wrote (docs/canvas.md).
 */
export class CanvasSaver {
  private unsaved: WireNode[] | null = null;
  private inFlight: Promise<void> | null = null;
  private held = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private state: SaveState = { status: 'saved', error: null };
  private readonly listeners = new Set<() => void>();

  constructor(readonly file: string, private rev: string, private readonly put: Put, private readonly delay = 400) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getState = () => this.state;

  /** The canvas as it now is, to write. */
  change(nodes: WireNode[]) {
    if (this.state.status === 'conflict') return;
    this.unsaved = nodes;
    if (this.state.status !== 'saving') this.set('pending');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delay);
  }

  /** While held (a drag), nothing is written; letting go writes at once. */
  hold(on: boolean) {
    this.held = on;
    if (!on) this.flush();
  }

  /** Writes what's unsaved now, unless held (or `force`d), or a write is under way (it follows that one). */
  flush = (force = false) => {
    clearTimeout(this.timer);
    if ((this.held && !force) || this.inFlight || !this.unsaved || this.state.status === 'conflict') return;
    const nodes = this.unsaved;
    this.unsaved = null;
    this.set('saving');
    writing.add(this);
    this.inFlight = this.put(nodes, this.rev).then(
      ({ rev }) => {
        this.rev = rev;
        this.inFlight = null;
        if (this.unsaved) {
          this.set('pending');
          this.flush(force);
        } else this.set('saved');
      },
      (error: unknown) => {
        this.inFlight = null;
        if (error instanceof ApiError && error.status === 409) {
          this.set('conflict', error.message);
          return;
        }
        // newer changes include these; else keep these for the next write
        this.unsaved ??= nodes;
        this.set('error', error instanceof Error ? error.message : String(error));
      },
    ).finally(() => {
      if (!this.inFlight) writing.delete(this);
    });
  };

  /** Resolves once no write is under way. */
  async settled() {
    while (this.inFlight) await this.inFlight;
  }

  private set(status: SaveStatus, error: string | null = null) {
    if (this.state.status === status && this.state.error === error) return;
    this.state = { status, error };
    this.listeners.forEach((listener) => listener());
  }
}
