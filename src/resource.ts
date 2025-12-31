import { stableHash } from "./lib/stringify";
import { createWaitable, Waitable } from "./lib/waitable";

export type RefLike<T> = {
  readonly key: string;
  readonly value: Promise<T>;
  onEmit: (fn: ValueSubscriber<T>) => () => boolean;
  onError: (fn: ErrorSubscriber) => () => boolean;
};

type GlobalValueSubscriber<T, C> = (
  value: T,
  prev: T | undefined,
  ctx: ContextArgs<C>,
  key: string
) => void;

type GlobalErrorSubscriber<C> = (
  error: unknown,
  ctx: ContextArgs<C>,
  key: string
) => void;

type ContextArgs<C> = keyof C extends never ? void : C;

type ValueSubscriber<T> = (value: T, prev?: T) => void;
type ErrorSubscriber = (error: unknown) => void;

type ResourceConfig<T> = {
  name?: string;
  equality?: (a: T, b: T) => boolean;
};

type Instance<T> = {
  key: string;
  refs: Map<
    symbol,
    { notifyEmit: ValueSubscriber<T>; notifyError: ErrorSubscriber }
  >;
  running: boolean;
  get: () => Promise<T>;
  close: () => void;
  retain: () => Promise<void>;
  untilClose: Promise<void>;
  untilRetain: Promise<void>;
  untilFinish: Promise<void>;
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
  untilFinish: Promise.resolve(),
};

export class Resource<T, C = {}> {
  private globalEmitSubs = new Set<GlobalValueSubscriber<T, C>>();
  private globalErrorSubs = new Set<GlobalErrorSubscriber<C>>();
  private instances = new Map<string, Instance<T>>();

  constructor(
    private init: (
      arg: {
        emit: Waitable<T>["emit"];
        retain: Instance<T>["retain"];
        key: string;
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

  onEveryEmit(fn: GlobalValueSubscriber<T, C>) {
    this.globalEmitSubs.add(fn);
    return () => {
      this.globalEmitSubs.delete(fn);
    };
  }

  onEveryError(fn: GlobalErrorSubscriber<C>) {
    this.globalErrorSubs.add(fn);
    return () => {
      this.globalErrorSubs.delete(fn);
    };
  }

  private prepareInstance(ctx: ContextArgs<C>): Instance<T> {
    const key = `${this.config?.name ?? "unknown"}:${stableHash(ctx)}`;
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

    let resolveFinish!: () => void;
    const untilFinish = new Promise<void>((r) => (resolveFinish = r));

    const refs = new Map<
      symbol,
      { notifyEmit: ValueSubscriber<T>; notifyError: ErrorSubscriber }
    >();

    const waitable = createWaitable<T>({
      equality: this.config?.equality,
      shouldAccept: () => running,
      afterEmit: (next, prev) => {
        refs.forEach((ref) => ref.notifyEmit(next, prev));
        this.globalEmitSubs.forEach((fn) => fn(next, prev, ctx, key));
      },
      afterThrow: (err) => {
        refs.forEach((ref) => ref.notifyError(err));
        this.globalErrorSubs.forEach((fn) => fn(err, ctx, key));
      },
    });

    const { emit, get } = waitable;

    Promise.resolve()
      .then(() => this.init({ emit, retain, key }, ctx))
      .catch((err) => {
        waitable.throw(err);
      })
      .then(() => {
        resolveRetain();
        resolveFinish();
      });

    const instance: Instance<T> = {
      key,
      refs,
      running,
      get,
      close,
      retain,
      untilClose,
      untilRetain,
      untilFinish,
    };

    this.instances.set(key, instance);
    return instance;
  }

  private createRef(args: { instance: Instance<T> }) {
    let instance = args.instance;
    const ref = Symbol();

    const emitSubs = new Set<ValueSubscriber<T>>();
    const errorSubs = new Set<ErrorSubscriber>();

    const refEntry = {
      notifyEmit: (v: T, prev?: T) => {
        emitSubs.forEach((fn) => fn(v, prev));
      },
      notifyError: (err: unknown) => {
        errorSubs.forEach((fn) => fn(err));
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

      onEmit(fn: ValueSubscriber<T>) {
        emitSubs.add(fn);
        return () => emitSubs.delete(fn);
      },

      onError(fn: ErrorSubscriber) {
        errorSubs.add(fn);
        return () => errorSubs.delete(fn);
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
