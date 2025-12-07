type HandlerArgs<S> = { state: S };
type Initial<S> = S extends undefined
  ? { initialState?: undefined }
  : { initialState: S };

export type Options<T, S = undefined> = {
  name?: string;
  scheduler: (call: () => void, close: () => void) => void;
  handler: (args: HandlerArgs<S>) => Promise<T> | T;
} & Initial<S>;

export type DeferredOptions<T, S, Context> =
  | ((ctx: ContextArgs<Context>) => Promise<Options<T, S>> | Options<T, S>)
  | Promise<Options<T, S>>
  | Options<T, S>;

export type ContextArgs<Context> = keyof Context extends never ? void : Context;
export type SessionInstance<T, S> = {
  options: Options<T, S>;
  refs: Set<symbol>;
  id: symbol;
  getValue: () => Promise<T>;
  close: () => void;
};
