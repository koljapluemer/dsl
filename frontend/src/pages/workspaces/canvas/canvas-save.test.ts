import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import type { WireNode } from './canvas-model';
import { CanvasSaver, whenSaved } from './canvas-save';

const nodes = (text: string): WireNode[] => [{ id: 'a', x: 0, y: 0, text }];

/** A put whose calls resolve or reject when the test says. */
function fakePut() {
  const calls: { nodes: WireNode[]; rev: string; resolve: (rev: string) => void; reject: (error: unknown) => void }[] = [];
  const put = vi.fn((sent: WireNode[], rev: string) => new Promise<{ rev: string }>((resolve, reject) => {
    calls.push({ nodes: sent, rev, resolve: (next) => resolve({ rev: next }), reject });
  }));
  return { put, calls };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('CanvasSaver', () => {
  it('writes the last of quick changes once, after the delay', async () => {
    const { put, calls } = fakePut();
    const saver = new CanvasSaver('h.txt', 'r0', put, 400);
    saver.change(nodes('1'));
    saver.change(nodes('2'));
    expect(saver.getState().status).toBe('pending');
    await vi.advanceTimersByTimeAsync(399);
    expect(put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(calls.map((c) => [c.nodes, c.rev])).toEqual([[nodes('2'), 'r0']]);
    expect(saver.getState().status).toBe('saving');
    calls[0].resolve('r1');
    await vi.runAllTimersAsync();
    expect(saver.getState().status).toBe('saved');
  });

  it('keeps one write under way; changes meanwhile follow with its revision', async () => {
    const { put, calls } = fakePut();
    const saver = new CanvasSaver('h.txt', 'r0', put, 10);
    saver.change(nodes('1'));
    await vi.advanceTimersByTimeAsync(10);
    saver.change(nodes('2'));
    saver.change(nodes('3'));
    await vi.advanceTimersByTimeAsync(100);
    expect(put).toHaveBeenCalledTimes(1);
    calls[0].resolve('r1');
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.map((c) => [c.nodes, c.rev])).toEqual([[nodes('1'), 'r0'], [nodes('3'), 'r1']]);
    calls[1].resolve('r2');
    await vi.advanceTimersByTimeAsync(0);
    expect(saver.getState().status).toBe('saved');
  });

  it('holds while dragging and writes on letting go', async () => {
    const { put } = fakePut();
    const saver = new CanvasSaver('h.txt', 'r0', put, 10);
    saver.hold(true);
    saver.change(nodes('1'));
    await vi.advanceTimersByTimeAsync(100);
    expect(put).not.toHaveBeenCalled();
    saver.hold(false);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('keeps failed changes for the next write', async () => {
    const { put, calls } = fakePut();
    const saver = new CanvasSaver('h.txt', 'r0', put, 10);
    saver.change(nodes('1'));
    await vi.advanceTimersByTimeAsync(10);
    calls[0].reject(new Error('offline'));
    await vi.advanceTimersByTimeAsync(0);
    expect(saver.getState()).toEqual({ status: 'error', error: 'offline' });
    saver.flush();
    expect(calls[1].nodes).toEqual(nodes('1'));
    expect(calls[1].rev).toBe('r0');
  });

  it('stops writing on a conflict', async () => {
    const { put, calls } = fakePut();
    const saver = new CanvasSaver('h.txt', 'r0', put, 10);
    saver.change(nodes('1'));
    await vi.advanceTimersByTimeAsync(10);
    calls[0].reject(new ApiError('changed elsewhere', 409));
    await vi.advanceTimersByTimeAsync(0);
    expect(saver.getState().status).toBe('conflict');
    saver.change(nodes('2'));
    saver.flush(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('lets a reload wait for the write under way', async () => {
    const { put, calls } = fakePut();
    const saver = new CanvasSaver('reload.txt', 'r0', put, 10);
    saver.change(nodes('1'));
    saver.flush(true);
    let done = false;
    const waiting = whenSaved('reload.txt').then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    calls[0].resolve('r1');
    await waiting;
    expect(saver.getState().status).toBe('saved');
  });
});
