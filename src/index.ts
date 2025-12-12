import { Resource } from "./resource";

export { Resource } from "./resource";

const testRes = new Resource<void, number>(async ({ retain }, num) => {
  console.log("H " + num);
  await retain();
  console.log("B " + num);
});

const test = testRes.use(-1);

let num = 0;

setInterval(() => test.reuse(num++), 2000);
