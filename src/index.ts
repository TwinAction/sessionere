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
      const id = Symbol(`session-entrypoint:${options.name ?? "unknown"}`);

      //////////////

      const instance = registry.getOrSet(ctx, () => {
        let running = true;

        function close() {
          running = false;
          instance.refs.delete(id);
          if (instance.refs.size === 0) {
            return registry.delete(ctx);
          }
          return false;
        }

        let state = structuredClone(options.initialState as S);
        const { getValue, call } = promiseStream(
          (async function* (): AsyncGenerator<T, void, void> {
            while (running) yield options.handler({ state });
          })()
        );

        options.scheduler(call, close);

        return {
          options,
          refs: new Set(),
          id: Symbol(`session-instance:${options.name ?? "unknown"}}`),
          getValue,
          close,
        };
      });

      instance.refs.add(id);

      //////////////

      return {
        close: instance.close,
        value: instance.getValue,
      };
    },
  };
}

////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////

const mySession = session((ctx: number) => ({
  name: "coolshih",
  initialState: "",
  scheduler: (call) => setInterval(call, 500),
  handler: async () => ctx,
}));

const session2 = session({
  scheduler: (call) => setInterval(call, 1750),
  handler: () => {},
});

const instance1 = await mySession.entrypoint(123);
const instance2 = await session2.entrypoint();
