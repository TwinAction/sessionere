export type Waitable<T> = {
  emit: (value: T | Promise<T> | ((prev?: T) => T | Promise<T>)) => void;
  throw: (error: unknown) => void;
  get: () => Promise<T>;
};

type WaitableOptions<T> = {
  shouldAccept?: (next: T, prev?: T) => boolean;
  afterEmit?: (next: T, prev?: T) => void;
  afterThrow?: (error: unknown) => void;
  equality?: (a: T, b: T) => boolean;
};

type State<T> =
  | { status: "pending" }
  | { status: "resolved"; value: T }
  | { status: "rejected"; error: unknown };

export function createWaitable<T>(
  options: WaitableOptions<T> = {}
): Waitable<T> {
  let state: State<T> = { status: "pending" };

  let waiting: Array<{
    resolve: (value: T) => void;
    reject: (err: unknown) => void;
  }> = [];

  function flush() {
    const queued = waiting;
    waiting = [];

    if (state.status === "resolved") {
      for (const { resolve } of queued) resolve(state.value);
    } else if (state.status === "rejected") {
      for (const { reject } of queued) reject(state.error);
    }
  }

  async function emit(input: T | Promise<T> | ((prev?: T) => T | Promise<T>)) {
    const prev = state.status === "resolved" ? state.value : undefined;

    let next: T;
    try {
      if (typeof input === "function") {
        const fn = input as (prev?: T) => T | Promise<T>;
        next = await fn(prev);
      } else {
        next = await input;
      }
    } catch (err) {
      _throw(err);
      return;
    }

    const equals = options.equality ?? (() => false);

    if (state.status === "resolved" && equals(next, state.value)) return;

    if (options.shouldAccept && !options.shouldAccept(next, prev)) {
      return;
    }

    state = { status: "resolved", value: next };

    flush();

    if (options.afterEmit) {
      queueMicrotask(() => options.afterEmit!(next, prev));
    }
  }

  function _throw(error: unknown) {
    state = { status: "rejected", error };

    flush();

    if (options.afterThrow) {
      queueMicrotask(() => options.afterThrow!(error));
    }
  }

  function get(): Promise<T> {
    if (state.status === "resolved") {
      return Promise.resolve(state.value);
    }
    if (state.status === "rejected") {
      return Promise.reject(state.error);
    }
    return new Promise<T>((resolve, reject) => {
      waiting.push({ resolve, reject });
    });
  }

  return { emit, throw: _throw, get };
}
