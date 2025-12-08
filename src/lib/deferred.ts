export type DeferredValue<T, A extends any[] = []> =
  | ((...args: A) => T | Promise<T>)
  | (T | Promise<T>);

export function resolveDeferred<T, A extends any[] = []>(
  value: DeferredValue<T, A>,
  ...args: A
): Promise<T> {
  return Promise.resolve(
    typeof value === "function"
      ? (value as (...args: A) => T | Promise<T>)(...args)
      : value
  );
}
