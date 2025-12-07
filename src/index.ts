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
      const entrypointId = Symbol(`entrypoint:${options.name ?? "unknown"}`);
      const instanceId = Symbol(`instance:${options.name ?? "unknown"}}`);

      const instance = registry.getOrSet(ctx, () => {
        let state = structuredClone(options.initialState as S);
        let running = true;

        function close() {
          options.onClose?.({ state });
          running = false;
          instance.parents.delete(entrypointId);
          if (instance.parents.size === 0) {
            return registry.delete(ctx);
          }
          return false;
        }

        const { getValue, call } = promiseStream(
          (async function* () {
            while (running) yield options.onCall({ state });
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

      instance.parents.add(entrypointId);

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

const testSession = session(async () => {
  const funny = await funnySession.entrypoint();
  return {
    scheduler: (call) => setInterval(call, 500),
    onCall: async () => console.log(await funny.getValue()),
  };
});

testSession.entrypoint().then((s) =>
  setTimeout(() => {
    s.close();
    testSession.entrypoint();
  }, 1200)
);
