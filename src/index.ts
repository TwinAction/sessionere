import { stableStringify } from "./lib/stringify";
import { promiseStream } from "./lib/stream";

type ContextArgs<C> = keyof C extends never ? void : C;
type Provider<T> = (args: {
  handler: () => Promise<T> | T;
  planner: (call: () => void) => void;
}) => Promise<void>;

type Instance<T> = {
  refCount: number;
  running: boolean;
  close: () => void;
  get: () => Promise<T>;
};

export class Session<T, C = {}> {
  private instances = new Map<string, Instance<T>>();

  constructor(
    private init: (
      provider: Provider<T>,
      args: ContextArgs<C>
    ) => Promise<void> | void
  ) {}

  use(ctx: ContextArgs<C>) {
    const key = stableStringify(ctx);
    const instance =
      this.instances.get(key) ??
      ((() => {
        let get: any;
        let close: any;
        let running = true;
        this.init((provider) => {
          const { call, getValue } = promiseStream(
            (async function* () {
              while (running) {
                const t = await provider.handler();
                if (!running) return;
                yield t;
              }
            })()
          );
          get = getValue;
          provider.planner(call);
          return new Promise(
            (r) =>
              (close = () => {
                this.instances.delete(key);
                running = false;
                r();
              })
          );
        }, ctx);
        return { refCount: 0, running, close, get };
      })() as any as Instance<T>);
    instance.refCount++;
    this.instances.set(key, instance);
    return {
      get value() {
        return instance.get();
      },
      async [Symbol.asyncDispose]() {
        instance.refCount--;
        if (instance.refCount === 0) instance.close();
      },
    };
  }
}
