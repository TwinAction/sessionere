type HandlerArgs<S> = { state: S };
type Initial<S> = S extends undefined
  ? { initialState?: undefined }
  : { initialState: S };

export type Options<T, S = undefined> = {
  name?: string;
  scheduler: (call: () => void, close: () => void) => void;
  onCall: (args: HandlerArgs<S>) => Promise<T> | T;
  onError?: (args: HandlerArgs<S>) => Promise<T> | T;
  onClose?: (args: HandlerArgs<S>) => void;
} & Initial<S>;

type OptionsFunction<T, S, Context> = (
  ctx: ContextArgs<Context>
) => Promise<Options<T, S>> | Options<T, S>;

export type DeferredOptions<T, S, Context> =
  | OptionsFunction<T, S, Context>
  | Promise<Options<T, S>>
  | Options<T, S>;

export type ContextArgs<Context> = keyof Context extends never ? void : Context;
export type SessionInstance<T, S> = {
  id: symbol;
  options: Options<T, S>;
  parents: Set<symbol>;
  children: Set<symbol>;
  getValue: () => Promise<T>;
  close: () => void;
};
