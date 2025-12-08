export function promiseStream<T>(asyncGenerator: AsyncGenerator<T, any, any>) {
  let resolveInitialValue: ((value: T) => void) | undefined;
  const initialValuePromise: Promise<T> = new Promise((resolve) => {
    resolveInitialValue = resolve;
  });

  let value = initialValuePromise;

  function call() {
    (async () => {
      const result = await asyncGenerator.next();

      if (result.done) return;

      if (resolveInitialValue) {
        resolveInitialValue(result.value);
        resolveInitialValue = undefined;
      } else {
        value = Promise.resolve(result.value);
      }
    })();
  }

  function get() {
    return value;
  }

  return { call, get };
}
