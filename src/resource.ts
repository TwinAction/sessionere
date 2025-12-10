import { stableStringify } from "./lib/stringify";
import { promiseStream } from "./lib/stream";
import { PlannerCB } from "./planner";

type ContextArgs<C> = keyof C extends never ? void : C;
type Provider<T> = (args: {
  handler: () => Promise<T> | T;
  planner: PlannerCB;
}) => Promise<void>;

type Subscriber<T> = (value: T) => void;

type Instance<T> = {
  refCount: number;
  running: boolean;
  close: () => void;
  get: () => Promise<T>;
  subscribe: (fn: Subscriber<T>) => () => void;
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

    const subscribers = new Set<Subscriber<T>>();

    const notify = (value: T) => subscribers.forEach((fn) => fn(value));

    const subscribe = (fn: Subscriber<T>) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    };

    const provider: Provider<T> = async ({ handler, planner }) => {
      const { call, getValue } = this.createStream(
        handler,
        notify,
        () => running
      );

      const cleanup: (() => void)[] = [];

      get = getValue;
      planner(call, (fn) => cleanup.push(fn));

      return new Promise<void>((resolve) => {
        close = () => {
          cleanup.forEach((fn) => fn());
          this.instances.delete(key);
          if (running) resolve();
          running = false;
          subscribers.clear();
        };
      });
    };

    this.init(provider, ctx);

    const instance = {
      refCount: 0,
      running,
      close,
      get,
      subscribe,
    };

    this.instances.set(key, instance);
    return instance;
  }

  private createStream(
    handler: () => Promise<T> | T,
    after: (value: T) => void,
    isRunning: () => boolean
  ) {
    return promiseStream(
      (async function* () {
        while (isRunning()) {
          const v = await handler();
          if (!isRunning()) return;
          yield v;
          after(v);
        }
      })()
    );
  }

  private createHandle(instance: Instance<T>) {
    return {
      get value() {
        return instance.get();
      },
      subscribe(fn: Subscriber<T>) {
        return instance.subscribe(fn);
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
