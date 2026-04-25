type AsyncTask = () => Promise<void>;

export class MailCacheRefreshQueue {
  private readonly pending = new Map<string, Promise<void>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly delayMs: number = 120) {}

  schedule(key: string, task: AsyncTask): Promise<void> {
    const existing = this.pending.get(key);
    if (existing) return existing;

    let resolvePromise!: () => void;
    let rejectPromise!: (error: unknown) => void;

    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    this.pending.set(key, promise);

    const timer = setTimeout(async () => {
      this.timers.delete(key);
      try {
        await task();
        resolvePromise();
      } catch (error) {
        rejectPromise(error);
      } finally {
        this.pending.delete(key);
      }
    }, this.delayMs);

    this.timers.set(key, timer);
    return promise;
  }

  dispose() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.pending.clear();
  }
}
