//#region src/lib/waitable.d.ts
type Waitable<T> = {
  emit: (value: T | Promise<T> | ((prev?: T) => T | Promise<T>)) => void;
  throw: (error: unknown) => void;
  get: () => Promise<T>;
};
//#endregion
//#region src/resource.d.ts
type RefLike<T> = {
  readonly key: string;
  readonly value: Promise<T>;
  onEmit: (fn: ValueSubscriber<T>) => () => boolean;
  onError: (fn: ErrorSubscriber) => () => boolean;
};
type GlobalValueSubscriber<T, C> = (value: T, prev: T | undefined, ctx: ContextArgs<C>, key: string) => void;
type GlobalErrorSubscriber<C> = (error: unknown, ctx: ContextArgs<C>, key: string) => void;
type ContextArgs<C> = keyof C extends never ? void : C;
type ValueSubscriber<T> = (value: T, prev?: T) => void;
type ErrorSubscriber = (error: unknown) => void;
type ResourceConfig<T> = {
  name?: string;
  equality?: (a: T, b: T) => boolean;
};
type Instance<T> = {
  key: string;
  refs: Map<symbol, {
    notifyEmit: ValueSubscriber<T>;
    notifyError: ErrorSubscriber;
  }>;
  running: boolean;
  get: () => Promise<T>;
  close: () => void;
  retain: () => Promise<void>;
  untilClose: Promise<void>;
  untilRetain: Promise<void>;
  untilFinish: Promise<void>;
};
declare class Resource<T, C = {}> {
  private init;
  private config?;
  private globalEmitSubs;
  private globalErrorSubs;
  private instances;
  constructor(init: (arg: {
    emit: Waitable<T>["emit"];
    retain: Instance<T>["retain"];
    key: string;
  }, ctx: ContextArgs<C>) => Promise<void> | void, config?: ResourceConfig<T> | undefined);
  get name(): string | undefined;
  use(ctx: ContextArgs<C>): {
    readonly key: string;
    readonly value: Promise<T>;
    onEmit(fn: ValueSubscriber<T>): () => boolean;
    onError(fn: ErrorSubscriber): () => boolean;
    reuse(ctx: ContextArgs<C>): void;
    [Symbol.dispose](): void;
  };
  empty(): {
    readonly key: string;
    readonly value: Promise<T>;
    onEmit(fn: ValueSubscriber<T>): () => boolean;
    onError(fn: ErrorSubscriber): () => boolean;
    reuse(ctx: ContextArgs<C>): void;
    [Symbol.dispose](): void;
  };
  onEveryEmit(fn: GlobalValueSubscriber<T, C>): () => void;
  onEveryError(fn: GlobalErrorSubscriber<C>): () => void;
  private prepareInstance;
  private createRef;
}
//#endregion
//#region src/action.d.ts
type Subscriber<T> = (value: T) => void;
declare class Action<T> {
  private refs;
  private value?;
  get latestValue(): T | undefined;
  emit(value: T): void;
  use(): {
    subscribe(fn: Subscriber<T>): void;
    [Symbol.dispose]: () => void;
  };
}
//#endregion
export { Action, type RefLike, Resource };
//# sourceMappingURL=index.d.mts.map