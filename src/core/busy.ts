/**
 * Tracks slow operations so the app can show a loading indicator for them.
 *
 * Two kinds of work:
 *  - Heavy work on the JavaScript thread (preparing a huge region, drawing
 *    the fog for a long history). While it runs nothing can be drawn, so the
 *    indicator must be on screen *before* it starts: `showFirst` shows it and
 *    waits for a frame. (The spinner itself is native and keeps turning.)
 *  - Waiting (storage, downloads): the indicator only appears if the wait
 *    passes `SLOW_AFTER_MS`, so quick operations don't flash it.
 */
export const SLOW_AFTER_MS = 500;

export type BusyOptions = {
  /** Show straight away and let it render before starting (for heavy synchronous work). */
  showFirst?: boolean;
};

type Scheduler = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  /** Resolves once the indicator has had a chance to be drawn. */
  nextFrame: () => Promise<void>;
};

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  nextFrame: () =>
    new Promise((resolve) => {
      const after = () => setTimeout(resolve, 0);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(after);
      else after();
    }),
};

export class BusyTracker {
  private tasks = new Map<number, string>();
  private seq = 0;

  constructor(
    private onChange: () => void,
    private scheduler: Scheduler = defaultScheduler,
  ) {}

  /** The message to show, or null when nothing slow is running. */
  get label(): string | null {
    let last: string | null = null;
    for (const label of this.tasks.values()) last = label;
    return last;
  }

  async run<T>(label: string, work: () => T | Promise<T>, options: BusyOptions = {}): Promise<T> {
    const id = ++this.seq;
    let shown = false;
    const show = () => {
      shown = true;
      this.tasks.set(id, label);
      this.onChange();
    };
    let timer: unknown = null;
    if (options.showFirst) {
      show();
      await this.scheduler.nextFrame();
    } else {
      timer = this.scheduler.setTimeout(show, SLOW_AFTER_MS);
    }
    try {
      return await work();
    } finally {
      if (timer !== null) this.scheduler.clearTimeout(timer);
      if (shown) {
        this.tasks.delete(id);
        this.onChange();
      }
    }
  }
}
