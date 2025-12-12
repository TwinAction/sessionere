//#region src/lib/waitable.d.ts
type Waitable<T> = {
  emit: (value: T | Promise<T> | ((prev?: T) => T | Promise<T>)) => void;
  get: () => Promise<T>;
};
//#endregion
//#region src/resource.d.ts
type ContextArgs<C> = keyof C extends never ? void : C;
type Subscriber<T> = (value: T) => void;
type ResourceConfig<T> = {
  equality?: (a: T, b: T) => boolean;
};
type Instance<T> = {
  refs: Map<symbol, {
    notify: Subscriber<T>;
  }>;
  running: boolean;
  close: () => void;
  get: () => Promise<T>;
  untilRetain: Promise<void>;
  retain: () => Promise<void>;
};
declare class Resource<T, C = {}> {
  private init;
  private config?;
  private instances;
  constructor(init: (arg: {
    emit: Waitable<T>["emit"];
    retain: Instance<T>["retain"];
  }, ctx: ContextArgs<C>) => Promise<void> | void, config?: ResourceConfig<T> | undefined);
  use(ctx: ContextArgs<C>): {
    readonly value: Promise<T>;
    subscribe(fn: Subscriber<T>): () => boolean;
    reuse(ctx: ContextArgs<C>): void;
    [Symbol.dispose](): void;
  };
  empty(): {
    readonly value: Promise<T>;
    subscribe(fn: Subscriber<T>): () => boolean;
    reuse(ctx: ContextArgs<C>): void;
    [Symbol.dispose](): void;
  };
  private prepareInstance;
  private createRef;
}
//#endregion
export { Resource };
//# sourceMappingURL=index.d.ts.map