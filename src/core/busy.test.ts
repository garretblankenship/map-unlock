import { describe, expect, it } from 'vitest';

import { BusyTracker, SLOW_AFTER_MS } from './busy';

/** A scheduler whose clock the test moves by hand. */
function fakeScheduler() {
  let now = 0;
  const timers: { at: number; fn: () => void; done: boolean }[] = [];
  return {
    advance(ms: number) {
      now += ms;
      for (const t of timers) {
        if (t.done || t.at > now) continue;
        t.done = true;
        t.fn();
      }
    },
    scheduler: {
      setTimeout: (fn: () => void, ms: number) => {
        const t = { at: now + ms, fn, done: false };
        timers.push(t);
        return t;
      },
      clearTimeout: (t: unknown) => void ((t as { done: boolean }).done = true),
      nextFrame: async () => undefined,
    },
  };
}

describe('busy indicator', () => {
  it('stays hidden for quick waits', async () => {
    const clock = fakeScheduler();
    let changes = 0;
    const busy = new BusyTracker(() => changes++, clock.scheduler);
    await busy.run('Saving…', async () => clock.advance(100));
    expect(changes).toBe(0);
    expect(busy.label).toBeNull();
  });

  it('appears once a wait passes half a second, and goes away after', async () => {
    const clock = fakeScheduler();
    const busy = new BusyTracker(() => undefined, clock.scheduler);
    let seen: string | null = null;
    await busy.run('Saving area…', async () => {
      clock.advance(SLOW_AFTER_MS + 1);
      seen = busy.label;
    });
    expect(seen).toBe('Saving area…');
    expect(busy.label).toBeNull();
  });

  it('shows before heavy work starts', async () => {
    const busy = new BusyTracker(() => undefined, fakeScheduler().scheduler);
    let seen: string | null = null;
    await busy.run('Preparing United States…', () => (seen = busy.label), { showFirst: true });
    expect(seen).toBe('Preparing United States…');
    expect(busy.label).toBeNull();
  });

  it('clears even when the work fails, and shows the newest of several', async () => {
    const busy = new BusyTracker(() => undefined, fakeScheduler().scheduler);
    let inner: string | null = null;
    await expect(
      busy.run(
        'Outer',
        () =>
          busy.run(
            'Inner',
            () => {
              inner = busy.label;
              throw new Error('boom');
            },
            { showFirst: true },
          ),
        { showFirst: true },
      ),
    ).rejects.toThrow('boom');
    expect(inner).toBe('Inner');
    expect(busy.label).toBeNull();
  });
});
