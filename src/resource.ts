import { stableStringify } from "./lib/stringify";
import { createWaitable, Waitable } from "./lib/waitable";

type ContextArgs<C> = keyof C extends never ? void : C;

type Subscriber<T> = (value: T) => void;

type ResourceConfig<T> = {
  equality?: (a: T, b: T) => boolean;
};

type Instance<T> = {
  refs: Map<symbol, { notify: Subscriber<T> }>;
  running: boolean;
  close: () => void;
  get: () => Promise<T>;
  untilRetain: Promise<void>;
  retain: () => Promise<void>;
};

const emptyInstance: Instance<any> = {
  refs: new Map(),
  running: false,
  close: () => {},
  get: async () => {
    throw new Error("Called get on empty Resource ref");
  },
  untilRetain: Promise.resolve(),
  retain: async () => {},
};

export class Resource<T, C = {}> {
  private instances = new Map<string, Instance<T>>();

  constructor(
    private init: (
      arg: {
        emit: Waitable<T>["emit"];
        retain: Instance<T>["retain"];
      },
      ctx: ContextArgs<C>
    ) => Promise<void> | void,
    private config?: ResourceConfig<T>
  ) {}

  use(ctx: ContextArgs<C>) {
    const key = stableStringify(ctx);
    const instance = this.prepareInstance(key, ctx);
    return this.createRef({ instance });
  }

  empty() {
    return this.createRef({ instance: emptyInstance });
  }

  private prepareInstance(key: string, ctx: ContextArgs<C>): Instance<T> {
    if (this.instances.get(key)) return this.instances.get(key)!;

    let running = true;
    let close!: () => void;
    let until!: () => void;

    const untilRetain = new Promise<void>((resolve) => (until = resolve));
    const retain = () => {
      until();
      return new Promise<void>((resolve) => {
        close = () => {
          this.instances.delete(key);
          if (running) resolve();
          running = false;
        };
      });
    };

    const refs = new Map<symbol, { notify: Subscriber<T> }>();

    const { emit, get } = createWaitable<T>({
      equality: this.config?.equality,
      shouldAccept: () => running,
      afterEmit: (next) => refs.forEach((ref) => ref.notify(next)),
    });

    Promise.resolve(this.init({ emit, retain }, ctx)).then(until);

    const instance: Instance<T> = {
      refs,
      running,
      close,
      get,
      untilRetain,
      retain,
    };

    this.instances.set(key, instance);
    return instance;
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

    const changeInstance = async (ctx: ContextArgs<C>) => {
      const key = stableStringify(ctx);
      const newInstance = this.prepareInstance(key, ctx);
      await newInstance.untilRetain;
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

      reuse(ctx: ContextArgs<C>) {
        changeInstance(ctx);
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
