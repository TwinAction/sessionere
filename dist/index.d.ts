//#region src/resource.d.ts
type ContextArgs<C> = keyof C extends never ? void : C;
type Subscriber<T> = (value: T) => void;
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
  private instances;
  constructor(init: (arg: {
    emit: (value: T) => void;
    retain: Instance<T>["retain"];
  }, ctx: ContextArgs<C>) => Promise<void> | void);
  use(ctx: ContextArgs<C>): {
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