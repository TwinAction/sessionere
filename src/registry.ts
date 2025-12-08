import { stableStringify } from "./lib/stringify";
import { Session } from "./session";
import { ContextArgs } from "./types";

export class SessionRegistry<T, S, C> {
  private sessions = new Map<string, Session<T, S>>();

  get(ctx: ContextArgs<C>): Session<T, S> | undefined {
    return this.sessions.get(stableStringify(ctx));
  }

  getOrSet(ctx: ContextArgs<C>, factory: () => Session<T, S>): Session<T, S> {
    const key = stableStringify(ctx);
    if (!this.sessions.has(key)) this.sessions.set(key, factory());
    return this.sessions.get(key)!;
  }

  getAndSet(
    ctx: ContextArgs<C>,
    factory: (session?: Session<T, S>) => Session<T, S>
  ): Session<T, S> {
    const key = stableStringify(ctx);
    this.sessions.set(key, factory(this.sessions.get(key)));
    return this.sessions.get(key)!;
  }

  delete(ctx: ContextArgs<C>): boolean {
    return this.sessions.delete(stableStringify(ctx));
  }

  has(ctx: ContextArgs<C>): boolean {
    return this.sessions.has(stableStringify(ctx));
  }
}
