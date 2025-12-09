import { AsyncLocalStorage } from "node:async_hooks";

import { BiMap } from "./lib/BiMap";
import { resolveDeferred } from "./lib/deferred";
import { stableStringify } from "./lib/stringify";
import { ContextArgs, DeferredOptions, Options } from "./lib/types";
import { promiseStream } from "./lib/stream";

class SessionClient {
  mapped = new BiMap<symbol, readonly [symbol, string]>();
  instances = new Map<symbol, SessionInstance<any, any>>();

  async prepareInstance<T, S = undefined>(
    key: [symbol, string],
    fn: (instance?: SessionInstance<T, S>) => Promise<SessionInstance<T, S>>
  ) {
    const id = this.mapped.getLeft(key);
    const instance = await fn(id && this.instances.get(id));
    this.mapped.set(instance.id, key);
    this.instances.set(instance.id, instance);
    return instance;
  }
}

const asyncStorage = new AsyncLocalStorage<{ callerId: symbol }>();
const sessionClient = new SessionClient();

export class SessionTemplate<T, S = undefined, C = {}> {
  readonly id = Symbol("session:template");
  constructor(private options: DeferredOptions<T, S, C>) {}

  async entry(ctx: ContextArgs<C>) {
    const instanceId = Symbol("session:instance");
    const { callerId } = asyncStorage.getStore() ?? {
      callerId: Symbol("session:entrypoint"),
    };

    const instance = await asyncStorage.run({ callerId: instanceId }, () =>
      sessionClient.prepareInstance<T, S>(
        [this.id, stableStringify(ctx)],
        async (instance) => {
          if (instance) return instance;
          const options = await resolveDeferred(this.options, ctx);
          return new SessionInstance(instanceId, options);
        }
      )
    );

    const caller = sessionClient.instances.get(callerId);
    if (caller) caller.children.add(instanceId);
    instance.parents.add(callerId);

    return new Session(instance);
  }
}

class SessionInstance<T, S> {
  parents = new Set<symbol>();
  children = new Set<symbol>();
  running = true;
  state: S;

  get: () => Promise<T>;

  constructor(readonly id: symbol, readonly options: Options<T, S>) {
    this.state = options.initialState!;

    const { call, get } = promiseStream(this.createGenerator());

    this.get = get;

    const schedulerId = Symbol("session:scheduler");

    this.parents.add(schedulerId);
    this.options.scheduler(call, () => this.close(schedulerId));
  }

  async *createGenerator() {
    while (this.running) {
      yield await this.options.onCall({ state: this.state });
    }
  }

  close(source: symbol) {
    this.parents.delete(source);
    if (this.parents.size === 0) {
      this.options.onClose?.({ state: this.state });
      this.running = false;
      sessionClient.instances.delete(this.id);
      sessionClient.mapped.deleteByLeft(this.id);
      this.children.forEach((id) => {
        sessionClient.instances.get(id)?.close(this.id);
      });
      return true;
    }
    return false;
  }
}

class Session<T, S, C> {
  constructor(private instance: SessionInstance<T, S>) {}

  get get() {
    return this.instance.get();
  }
}
