import { stableStringify } from "./lib/stringify";
import { promiseStream } from "./lib/stream";

type ContextArgs<C> = keyof C extends never ? void : C;
type Provider<T> = (args: {
  handler: () => Promise<T> | T;
  planner: (call: () => void, cleanup: (fn: () => void) => void) => void;
}) => Promise<void>;

type Instance<T> = {
  refCount: number;
  running: boolean;
  close: () => void;
  get: () => Promise<T>;
};

export class Resource<T, C = {}> {
  private instances = new Map<string, Instance<T>>();

  constructor(
    private init: (
      provider: Provider<T>,
      args: ContextArgs<C>
    ) => Promise<void> | void
  ) {}

  use(ctx: ContextArgs<C>) {
    const key = stableStringify(ctx);
    const instance = this.instances.get(key) ?? this.createInstance(key, ctx);

    instance.refCount++;

    return this.createHandle(instance);
  }

  private createInstance(key: string, ctx: ContextArgs<C>): Instance<T> {
    let get!: () => Promise<T>;
    let close!: () => void;
    let running = true;

    const provider: Provider<T> = ({ handler, planner }) => {
      const { call, getValue } = this.createStream(handler, () => running);

      const cleanup: (() => void)[] = [];

      get = getValue;
      planner(call, (fn) => cleanup.push(fn));

      return new Promise<void>((resolve) => {
        close = () => {
          cleanup.forEach((fn) => fn());
          this.instances.delete(key);
          if (running) resolve();
          running = false;
        };
      });
    };

    this.init(provider, ctx);

    const instance = {
      refCount: 0,
      running,
      close,
      get,
    };

    this.instances.set(key, instance);
    return instance;
  }

  private createStream(
    handler: () => Promise<T> | T,
    isRunning: () => boolean
  ) {
    return promiseStream(
      (async function* () {
        while (isRunning()) {
          const t = await handler();
          if (!isRunning()) return;
          yield t;
        }
      })()
    );
  }

  private createHandle(instance: Instance<T>) {
    return {
      get value() {
        return instance.get();
      },
      async [Symbol.asyncDispose]() {
        instance.refCount--;
        if (instance.refCount === 0) {
          instance.close();
        }
      },
    };
  }
}
