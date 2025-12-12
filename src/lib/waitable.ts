type Waitable<T> = {
  emit: (value: T) => void;
  get: () => Promise<T>;
};

type WaitableOptions<T> = {
  shouldAccept?: (next: T, prev?: T) => boolean;
  afterEmit?: (next: T, prev?: T) => void;
};

export function createWaitable<T>(
  options: WaitableOptions<T> = {}
): Waitable<T> {
  let latest: T | undefined;
  let initialized = false;
  let waiting: Array<(value: T) => void> = [];

  async function emit(value: T) {
    const prev = latest;

    if (options.shouldAccept && !options.shouldAccept(value, prev)) {
      return;
    }

    latest = value;
    initialized = true;
    const queued = waiting;
    waiting = [];
    for (const resolve of queued) resolve(value);

    if (options.afterEmit) {
      queueMicrotask(() => options.afterEmit!(value, prev));
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
