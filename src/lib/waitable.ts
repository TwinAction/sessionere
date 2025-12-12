export type Waitable<T> = {
  emit: (value: T | Promise<T> | ((prev?: T) => T | Promise<T>)) => void;
  get: () => Promise<T>;
};

type WaitableOptions<T> = {
  shouldAccept?: (next: T, prev?: T) => boolean;
  afterEmit?: (next: T, prev?: T) => void;
  equality?: (a: T, b: T) => boolean;
};

export function createWaitable<T>(
  options: WaitableOptions<T> = {}
): Waitable<T> {
  let latest: T | undefined;
  let initialized = false;
  let waiting: Array<(value: T) => void> = [];

  async function emit(input: T | Promise<T> | ((prev?: T) => T | Promise<T>)) {
    const prev = latest;

    let next: T;
    try {
      if (typeof input === "function") {
        const fn = input as (prev?: T) => T | Promise<T>;
        next = await fn(prev);
      } else {
        next = await input;
      }
    } catch {
      return;
    }

    const equals = options.equality ?? (() => false);

    if (initialized && equals(next, prev!)) return;

    if (options.shouldAccept && !options.shouldAccept(next, prev)) {
      return;
    }

    latest = next;
    initialized = true;

    const queued = waiting;
    waiting = [];
    for (const resolve of queued) resolve(next);

    if (options.afterEmit) {
      queueMicrotask(() => options.afterEmit!(next, prev));
    }
  }

  function get(): Promise<T> {
    if (initialized) {
      return Promise.resolve(latest as T);
    }
    return new Promise<T>((resolve) => {
      waiting.push(resolve);
    });
  }

  return { emit, get };
}
