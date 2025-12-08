import { stableStringify } from "./lib/stringify";
import { Session } from "./session";
import { ContextArgs } from "./types";

type AnyRegistry = SessionRegistry<any, any, any>;

export class SessionRegistry<T, S, Context> {
  private static registries = new Map<symbol, AnyRegistry>();
  private sessions = new Map<string, Session<T, S>>();

  constructor(id: symbol) {
    SessionRegistry.registries.set(id, this);
  }

  static access<T2, S2, Context2>(
    id: symbol
  ): SessionRegistry<T2, S2, Context2> | undefined {
    return SessionRegistry.registries.get(id);
  }

  get(ctx: ContextArgs<Context>): Session<T, S> | undefined {
    return this.sessions.get(stableStringify(ctx));
  }

  getOrSet(
    ctx: ContextArgs<Context>,
    factory: () => Session<T, S>
  ): Session<T, S> {
    const key = stableStringify(ctx);
    if (!this.sessions.has(key)) this.sessions.set(key, factory());
    return this.sessions.get(key)!;
  }

  getAndSet(
    ctx: ContextArgs<Context>,
    factory: (session?: Session<T, S>) => Session<T, S>
  ): Session<T, S> {
    const key = stableStringify(ctx);
    this.sessions.set(key, factory(this.sessions.get(key)));
    return this.sessions.get(key)!;
  }

  delete(ctx: ContextArgs<Context>): boolean {
    return this.sessions.delete(stableStringify(ctx));
  }

  has(ctx: ContextArgs<Context>): boolean {
    return this.sessions.has(stableStringify(ctx));
  }
}
