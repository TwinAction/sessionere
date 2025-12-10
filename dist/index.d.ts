//#region src/planner.d.ts
type PlannerCB = (call: () => void, cleanup: (fn: () => void) => void) => void;
declare class Planner {
  private readonly options;
  private calls;
  private cleanups;
  constructor(options: {
    timeout?: number;
    interval?: number;
  });
  get into(): PlannerCB;
  private start;
  private call;
  private cleanup;
}
//#endregion
//#region src/resource.d.ts
type ContextArgs<C> = keyof C extends never ? void : C;
type Provider<T> = (args: {
  handler: () => Promise<T> | T;
  planner: PlannerCB;
}) => Promise<void>;
declare class Resource<T, C = {}> {
  private init;
  private instances;
  constructor(init: (provider: Provider<T>, args: ContextArgs<C>) => Promise<void> | void);
  use(ctx: ContextArgs<C>): Promise<{
    readonly value: Promise<T>;
    [Symbol.asyncDispose](): Promise<void>;
  }>;
  private createInstance;
  private createStream;
  private createHandle;
}
//#endregion
export { Planner, Resource };
//# sourceMappingURL=index.d.ts.map