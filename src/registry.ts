import { ContextArgs, SessionInstance } from "./types";
import { stableStringify } from "./stringify";

export function instanceRegistry<T, S, Context>() {
  const instances = new Map<string, SessionInstance<T, S>>();

  return {
    get(ctx: ContextArgs<Context>): SessionInstance<T, S> | undefined {
      const key = stableStringify(ctx);
      return instances.get(key);
    },

    getOrSet(
      ctx: ContextArgs<Context>,
      setter: () => SessionInstance<T, S>
    ): SessionInstance<T, S> {
      const key = stableStringify(ctx);
      let instance = instances.get(key);
      if (!instance) {
        instance = setter();
        instances.set(key, instance);
      }
      return instance;
    },

    delete(ctx: ContextArgs<Context>): boolean {
      const key = stableStringify(ctx);
      return instances.delete(key);
    },

    has(ctx: ContextArgs<Context>): boolean {
      const key = stableStringify(ctx);
      return instances.has(key);
    },
  };
}
