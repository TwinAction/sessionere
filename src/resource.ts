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
  refs: Map<symbol, { notify: Subscriber<T> }>;
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

    const instance = this.prepareInstance(key, ctx);

    return this.createRef({ instance });
  }

  private prepareInstance(key: string, ctx: ContextArgs<C>): Instance<T> {
    if (this.instances.get(key)) return this.instances.get(key)!;

    let get!: () => Promise<T>;
    let close!: () => void;
    let running = true;

    const refs = new Map<symbol, { notify: Subscriber<T> }>();

    const provider: Provider<T> = async ({ handler, planner }) => {
      const { call, getValue } = this.createStream(
        handler,
        (v) => refs.forEach((ref) => ref.notify(v)),
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
        };
      });
    };

    this.init(provider, ctx);

    const instance: Instance<T> = {
      refs,
      running,
      close,
      get,
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

  private createRef(args: { instance: Instance<T> }) {
    let instance = args.instance;
    const ref = Symbol();

    const subs = new Set<Subscriber<T>>();

    const refEntry = {
      notify: (v: T) => {
        subs.forEach((fn) => fn(v));
      },
    };

    instance.refs.set(ref, refEntry);

    const switchInstance = (ctx: ContextArgs<C>) => {
      const key = stableStringify(ctx);
      const newInstance = this.prepareInstance(key, ctx);
      instance.refs.delete(ref);
      newInstance.refs.set(ref, refEntry);
      instance = newInstance;
    };

    return {
      get value() {
        return instance.get();
      },

      subscribe(fn: Subscriber<T>) {
        subs.add(fn);
        return () => subs.delete(fn);
      },

      switch(ctx: ContextArgs<C>) {
        switchInstance(ctx);
      },

      [Symbol.dispose]() {
        instance.refs.delete(ref);
        if (instance.refs.size === 0) {
          instance.close();
        }
      },
    };
  }
}
