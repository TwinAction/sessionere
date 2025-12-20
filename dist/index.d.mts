//#region src/lib/waitable.d.ts
type Waitable<T> = {
  emit: (value: T | Promise<T> | ((prev?: T) => T | Promise<T>)) => void;
  get: () => Promise<T>;
};
//#endregion
//#region src/resource.d.ts
type RefLike<T> = {
  readonly key: string;
  readonly value: Promise<T>;
  subscribe: (fn: Subscriber$1<T>) => () => boolean;
};
type ContextArgs<C> = keyof C extends never ? void : C;
type Subscriber$1<T> = (value: T, prev?: T) => void;
type ResourceConfig<T> = {
  name?: string;
  equality?: (a: T, b: T) => boolean;
};
type Instance<T> = {
  key: string;
  refs: Map<symbol, {
    notify: Subscriber$1<T>;
  }>;
  running: boolean;
  get: () => Promise<T>;
  close: () => void;
  retain: () => Promise<void>;
  untilClose: Promise<void>;
  untilRetain: Promise<void>;
};
declare class Resource<T, C = {}> {
  private init;
  private config?;
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
    subscribe(fn: Subscriber$1<T>): () => boolean;
    reuse(ctx: ContextArgs<C>): void;
    [Symbol.dispose](): void;
  };
  empty(): {
    readonly key: string;
    readonly value: Promise<T>;
    subscribe(fn: Subscriber$1<T>): () => boolean;
    reuse(ctx: ContextArgs<C>): void;
    [Symbol.dispose](): void;
  };
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