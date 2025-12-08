import { resolveDeferred } from "./lib/deferred";
import { promiseStream } from "./lib/stream";
import { SessionRegistry } from "./registry";
import { ContextArgs, DeferredOptions, Options } from "./types";

export class SessionManager<T, S = undefined, C = {}> {
  private registry = new SessionRegistry<T, S, C>();

  constructor(private options: DeferredOptions<T, S, C>) {}

  async entrypoint(ctx: ContextArgs<C>): Promise<Session<T, S>> {
    const entrypointId = Symbol("session:entrypoint");

    const options = await resolveDeferred(this.options, ctx);
    const session = this.registry.getAndSet(ctx, (session) => {
      return Session.entry(options, entrypointId, session);
    });
    return session;
  }
}

export class Session<T, S> {
  private parents = new Set<symbol>();
  private running = true;
  private state: S;

  get: () => Promise<T>;

  private constructor(private options: Options<T, S>, parent: symbol) {
    this.parents.add(parent);

    this.state = options.initialState as S;

    const { call, get } = promiseStream(this.createGenerator());

    this.get = get;

    this.options.scheduler(call, () => this.close(parent));
  }

  static entry<T, S>(
    options: Options<T, S>,
    parent: symbol,
    modify?: Session<T, S>
  ) {
    if (modify) {
      modify.parents.add(parent);
      return modify;
    }
    return new Session(options, parent);
  }

  private async *createGenerator() {
    while (this.running) {
      yield await this.options.onCall({ state: this.state });
    }
  }

  private close(id: symbol) {
    this.parents.delete(id);

    if (this.parents.size === 0) {
      this.running = false;
      try {
        this.options.onClose?.({ state: this.state });
      } catch {}
      return true;
    }
    return false;
  }
}
