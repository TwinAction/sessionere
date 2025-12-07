import { instanceRegistry } from "./registry";
import { ContextArgs, DeferredOptions } from "./types";
import { promiseStream, resolveOptions } from "./utils";

function session<T, S = undefined, Context = {}>(
  opt: DeferredOptions<T, S, Context>
) {
  const registry = instanceRegistry<T, S, Context>();
  return {
    async entrypoint(ctx: ContextArgs<Context>) {
      const options = await resolveOptions(opt, ctx);
      const parentId = Symbol(`entrypoint:${options.name ?? "unknown"}`);
      const instanceId = Symbol(`instance:${options.name ?? "unknown"}`);

      const instance = registry.getOrSet(ctx, () => {
        let state = structuredClone(options.initialState as S);
        let running = true;

        function close() {
          try {
            if (options.onClose) options.onClose({ state });
          } catch {}
          running = false;
          instance.parents.delete(parentId);
          if (instance.parents.size === 0) {
            return registry.delete(ctx);
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
          children: new Set(),
          getValue,
          close,
        };
      });

      instance.parents.add(parentId);

      return { close: instance.close, getValue: instance.getValue };
    },
  };
}

////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////

const funnySession = session({
  scheduler: (call) => call(),
  onCall: Date.now,
});

const testSession = session(async (ctx: number) => {
  const funny = await funnySession.entrypoint();
  return {
    scheduler: (call) => setInterval(call, ctx),
    onCall: async () => console.log(await funny.getValue()),
    onError: () => {},
    onClose: funny.close,
  };
});

testSession.entrypoint(500).then((s) =>
  setTimeout(() => {
    s.close();
    testSession.entrypoint(500);
  }, 1200)
);
