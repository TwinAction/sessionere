import { DeferredValue } from "./lib/deferred";
import { Session } from "./session";

export type ContextArgs<Context> = keyof Context extends never ? void : Context;
export type DeferredOptions<T, S, Context> = DeferredValue<
  Options<T, S>,
  [ContextArgs<Context>]
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
