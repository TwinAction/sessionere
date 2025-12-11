//#region src/planner.d.ts
type PlannerCB = (call: () => void, cleanup: (fn: () => void) => void) => void;
declare class Planner {
  private readonly options?;
  private calls;
  private cleanups;
  constructor(options?: {
    timeout?: number;
    interval?: number;
  } | undefined);
  get into(): PlannerCB;
  private start;
  private cleanup;
  call(): void;
}
//#endregion
//#region src/resource.d.ts
type ContextArgs<C> = keyof C extends never ? void : C;
type Provider<T> = (args: {
  handler: () => Promise<T> | T;
  planner: PlannerCB;
}) => Promise<void>;
type Subscriber<T> = (value: T) => void;
declare class Resource<T, C = {}> {
  private init;
  private instances;
  constructor(init: (provider: Provider<T>, args: ContextArgs<C>) => Promise<void> | void);
  use(ctx: ContextArgs<C>): Promise<{
    readonly value: Promise<T>;
    subscribe(fn: Subscriber<T>): () => boolean;
    reuse(ctx: ContextArgs<C>): Promise<void>;
    [Symbol.dispose](): void;
  }>;
  private prepareInstance;
  private createStream;
  private createRef;
}
//#endregion
export { Planner, Resource };
//# sourceMappingURL=index.d.ts.map