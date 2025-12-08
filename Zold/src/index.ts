import { instanceRegistry } from "./registry";
import { ContextArgs, DeferredOptions, Session } from "./types";
import { promiseStream, resolveOptions } from "./utils";

export function session<T, S = undefined, Context = {}>(
  opt: DeferredOptions<T, S, Context>
) {
  const registry = instanceRegistry<T, S, Context>();
  return {
    async entrypoint(ctx: ContextArgs<Context>, parent?: symbol) {
      const parentId = parent ?? Symbol(`id:entrypoint`);
      const instanceId = Symbol(`id:instance`);

      const closeAll = new Set<(closerId?: symbol) => void>();

      async function use<T2, S2, Context2>(
        session: Session<T2, S2, Context2>,
        ...restCtx: ContextArgs<Context2> extends void ? [] : [Context2]
      ) {
        const instance = await session.entrypoint(
          restCtx[0] as ContextArgs<Context2>,
          instanceId
        );
        closeAll.add(instance.close);
        return instance.getValue;
      }

      const options = await resolveOptions(opt, ctx, use);

      const instance = registry.getOrSet(ctx, () => {
        let state = options.initialState as S;
        let running = true;

        function close(closerId?: symbol) {
          instance.parents.delete(closerId ?? parentId);
          if (instance.parents.size === 0) {
            try {
              if (options.onClose) options.onClose({ state });
            } catch {}
            running = false;
            closeAll.forEach((c) => c(instanceId));
            registry.delete(ctx);
            return true;
          }
          return false;
        }

        const { getValue, call } = promiseStream(
          (async function* () {
            try {
              while (running) yield await options.onCall({ state });
            } catch {
              try {
                if (options.onError) yield await options.onError({ state });
              } catch {}
            }
          })()
        );

        options.scheduler(call, close);

        return {
          id: instanceId,
          options,
          parents: new Set(),
          getValue,
          close,
        };
      });

      instance.parents.add(parentId);

      return {
        id: instance.id,
        close: instance.close,
        getValue: instance.getValue,
      };
    },
  };
}
