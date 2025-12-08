import { SessionManager } from "./session";

const helloManager = new SessionManager({
  scheduler: (call) => call(),
  onCall: () => console.log("hello world!"),
});

await helloManager.entrypoint();

const ctxManager = new SessionManager((initial: number) => ({
  scheduler: (call) => setInterval(call, 500),
  initialState: { count: initial },
  onCall: ({ state }) => console.log(state.count++),
}));

ctxManager.entrypoint(21);
ctxManager.entrypoint(21);
ctxManager.entrypoint(500);
