import { stableHash } from "./lib/stringify";
import { createWaitable, Waitable } from "./lib/waitable";

export type RefLike<T> = {
  key: string;
  value: Promise<T>;
  subscribe: (fn: Subscriber<T>) => () => boolean;
};

type ContextArgs<C> = keyof C extends never ? void : C;

type Subscriber<T> = (value: T, prev?: T) => void;

type ResourceConfig<T> = {
  name?: string;
  equality?: (a: T, b: T) => boolean;
};

type Instance<T> = {
  key: string;
  refs: Map<symbol, { notify: Subscriber<T> }>;
  running: boolean;
  get: () => Promise<T>;
  close: () => void;
  retain: () => Promise<void>;
  untilClose: Promise<void>;
  untilRetain: Promise<void>;
};

const emptyInstance: Instance<any> = {
  key: "",
  refs: new Map(),
  running: false,
  get: async () => {
    throw new Error("Called get on empty Resource ref");
  },
  close: () => {},
  retain: async () => {},
  untilClose: Promise.resolve(),
  untilRetain: Promise.resolve(),
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

  get name() {
    return this.config?.name;
  }

  use(ctx: ContextArgs<C>) {
    const instance = this.prepareInstance(ctx);
    return this.createRef({ instance });
  }

  empty() {
    return this.createRef({ instance: emptyInstance });
  }

  private prepareInstance(ctx: ContextArgs<C>): Instance<T> {
    const key = stableHash(ctx);
    if (this.instances.get(key)) return this.instances.get(key)!;

    let running = true;

    let resolveClose!: () => void;
    const untilClose = new Promise<void>((r) => (resolveClose = r));
    const close = () => {
      if (!running) return;
      this.instances.delete(key);
      running = false;
      resolveClose();
    };

    let resolveRetain!: () => void;
    const untilRetain = new Promise<void>((r) => (resolveRetain = r));
    const retain = async () => {
      resolveRetain();
      await untilClose;
    };

    const refs = new Map<symbol, { notify: Subscriber<T> }>();

    const { emit, get } = createWaitable<T>({
      equality: this.config?.equality,
      shouldAccept: () => running,
      afterEmit: (next, prev) => {
        refs.forEach((ref) => ref.notify(next, prev));
      },
    });

    Promise.resolve(this.init({ emit, retain }, ctx)).then(resolveRetain);

    const instance: Instance<T> = {
      key,
      refs,
      running,
      get,
      close,
      retain,
      untilClose,
      untilRetain,
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
      const newInstance = this.prepareInstance(ctx);
      if (newInstance === instance) return;
      await newInstance.untilRetain;
      newInstance.refs.set(ref, refEntry);
      instance.refs.delete(ref);
      instance.close();
      instance = newInstance;
    };

    return {
      get key() {
        return instance.key;
      },

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
