import { afterEach, describe, expect, it, vi } from 'vitest';

import { BACKOFF, NetworkError, fetchWithTimeout, resetBackoff } from './net';

vi.mock('expo-network', () => ({}));

/** A fetch that never answers (a dead connection), until aborted. */
const hang = vi.fn(
  (_url: string, init?: RequestInit) =>
    new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
);
const ok = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
const json = (r: Response) => r.json();

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetBackoff();
});

describe('weak-signal backoff', () => {
  it('stops hitting the network after a request gets no answer', async () => {
    vi.stubGlobal('fetch', hang);
    await expect(fetchWithTimeout('https://x/a', {}, 20, json)).rejects.toBeInstanceOf(NetworkError);
    expect(hang).toHaveBeenCalledTimes(1);
    // Straight after, requests fail fast without using the radio.
    await expect(fetchWithTimeout('https://x/b', {}, 20, json)).rejects.toThrow('Waiting for a better signal');
    expect(hang).toHaveBeenCalledTimes(1);
  });

  it('waits longer after each failure, up to the cap', async () => {
    vi.stubGlobal('fetch', hang);
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const waits: number[] = [];
    for (let i = 0; i < 8; i++) {
      await expect(fetchWithTimeout('https://x', {}, 5, json)).rejects.toBeInstanceOf(NetworkError);
      // Find how long until the next real attempt is allowed.
      let wait = 0;
      const before = hang.mock.calls.length;
      while (hang.mock.calls.length === before) {
        wait += 1000;
        now += 1000;
        await fetchWithTimeout('https://x', {}, 5, json).catch(() => undefined);
      }
      waits.push(wait);
    }
    expect(waits[0]).toBe(BACKOFF.startMs);
    expect(waits[1]).toBeGreaterThan(waits[0]);
    expect(Math.max(...waits)).toBeLessThanOrEqual(BACKOFF.maxMs + 1000);
  });

  it('resets as soon as a server answers', async () => {
    vi.stubGlobal('fetch', hang);
    await expect(fetchWithTimeout('https://x', {}, 5, json)).rejects.toBeInstanceOf(NetworkError);
    resetBackoff(); // e.g. signal came back and the next request succeeded
    vi.stubGlobal('fetch', ok);
    await expect(fetchWithTimeout('https://x', {}, 1000, json)).resolves.toEqual({ ok: true });
    await expect(fetchWithTimeout('https://x', {}, 1000, json)).resolves.toEqual({ ok: true });
  });
});
