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
  private id = Symbol("session:template");
  constructor(private options: DeferredOptions<T, S, C>) {}

  async entry(ctx: ContextArgs<C>) {
    const { callerId } = asyncStorage.getStore() ?? {};
    const instanceId = Symbol("session:instance");
    const entryId = callerId && Symbol("session:entrypoint");

    const instance = await asyncStorage.run(
      { callerId: instanceId },
      async () =>
        sessionClient.prepareInstance<T, S>(
          [this.id, stableStringify(ctx)],
          async (instance) => {
            if (instance) return instance;
            const options = await resolveDeferred(this.options, ctx);
            return new SessionInstance(instanceId, options, entryId);
          }
        )
    );

    const caller = callerId && sessionClient.instances.get(callerId);
    if (caller) {
      caller.children.add(instanceId);
      instance.parents.add(callerId);
    }

    return new Session(instance);
  }
}

class SessionInstance<T, S> {
  parents = new Set<symbol>();
  children = new Set<symbol>();
  running = true;
  state: S;

  get: () => Promise<T>;

  constructor(
    readonly id: symbol,
    readonly options: Options<T, S>,
    readonly entryId?: symbol
  ) {
    this.state = options.initialState!;

    const { call, get } = promiseStream(this.createGenerator());

    this.get = get;

    entryId && this.parents.add(entryId);
    this.options.scheduler?.(call, () => this.close(entryId));
  }

  async *createGenerator() {
    while (this.running) {
      yield await this.options.onCall(this.state);
    }
  }

  close(source?: symbol) {
    if (this.running) return true;
    source && this.parents.delete(source);
    if (this.parents.size === 0) {
      this.options.onClose?.(this.state);
      this.children.forEach((id) => {
        sessionClient.instances.get(id)?.close(this.id);
      });
      this.running = false;
      sessionClient.instances.delete(this.id);
      sessionClient.mapped.deleteByLeft(this.id);

      return true;
    }
    return false;
  }
}

class Session<T, S, C> {
  constructor(private instance: SessionInstance<T, S>) {}

  async get() {
    return await this.instance.get();
  }
}

//////////////////////////////////
//////////////////////////////////
// examples

const greetingTemplate = new SessionTemplate({
  scheduler: (call) => call(),
  onCall: () => console.log("Hello World!"),
  onClose: () => console.log("Goodbye World!"),
});

const counterTemplate = new SessionTemplate(() => {
  greetingTemplate.entry();
  return {
    initialState: { count: 0 },
    scheduler: (call, close) => {
      const timeout = setInterval(call, 250);
      setTimeout(() => {
        clearInterval(timeout);
        close();
      }, 1000);
    },
    onCall: (state) => console.log(state.count++),
  };
});

counterTemplate.entry();
