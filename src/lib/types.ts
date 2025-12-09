import { DeferredValue } from "../../src/lib/deferred";

export type ContextArgs<C> = keyof C extends never ? void : C;
export type DeferredOptions<T, S, C> = DeferredValue<
  Options<T, S>,
  [ContextArgs<C>]
>;

export type Options<T, S = undefined> = {
  scheduler: (call: () => void, close: () => void) => void;
  onCall: (args: HandlerArgs<S>) => Promise<T> | T;
  onClose?: (args: HandlerArgs<S>) => void;
} & Initial<S>;

type HandlerArgs<S> = { state: S };
type Initial<S> = S extends undefined
  ? { initialState?: undefined }
  : { initialState: S };
