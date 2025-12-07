import { ContextArgs, DeferredOptions, Options } from "./types";

export function resolveOptions<T, S, Context>(
  input: DeferredOptions<T, S, Context>,
  ctx: ContextArgs<Context>
): Promise<Options<T, S>> {
  return Promise.resolve(typeof input === "function" ? input(ctx) : input);
}

export function promiseStream<T>(asyncGenerator: AsyncGenerator<T, any, any>) {
  let resolveInitialValue: ((value: T) => void) | undefined;
  const initialValuePromise: Promise<T> = new Promise((resolve) => {
    resolveInitialValue = resolve;
  });

  let value = initialValuePromise;

  async function call() {
    const result = await asyncGenerator.next();

    if (result.done) return;

    if (resolveInitialValue) {
      resolveInitialValue(result.value);
      resolveInitialValue = undefined;
    } else {
      value = Promise.resolve(result.value);
    }
  }

  function getValue() {
    return value;
  }

  return { call, getValue };
}
