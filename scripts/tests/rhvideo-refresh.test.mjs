import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { Loop } = createRequire(import.meta.url)(
  "../../src/js/rhvideo-refresh.js",
);
function fixture(run) {
  let visible = true,
    sequence = 0;
  const jobs = new Map(),
    delays = [];
  const loop = new Loop({
    run,
    visible: () => visible,
    timers: {
      setTimeout(fn, delay) {
        const key = ++sequence;
        jobs.set(key, fn);
        delays.push(delay);
        return key;
      },
      clearTimeout(key) {
        jobs.delete(key);
      },
    },
  });
  return {
    loop,
    jobs,
    delays,
    visibility(value) {
      visible = value;
      loop.configure(loop.enabled);
    },
    async tick() {
      const entry = jobs.entries().next().value;
      assert(entry);
      jobs.delete(entry[0]);
      entry[1]();
      await new Promise((r) => setImmediate(r));
    },
  };
}
test("visible refresh is single-flight and stops when work becomes terminal", async () => {
  let release,
    calls = 0;
  const f = fixture(() => {
    calls++;
    return new Promise((r) => (release = r));
  });
  f.loop.configure(true, true);
  await f.tick();
  assert.equal(calls, 1);
  await f.loop.tick();
  assert.equal(calls, 1);
  assert.equal(f.jobs.size, 0);
  release(false);
  await new Promise((r) => setImmediate(r));
  assert.equal(f.loop.state().enabled, false);
  assert.equal(f.jobs.size, 0);
});
test("hidden/covered/input-focused pages make zero requests and resume on visibility", async () => {
  let calls = 0;
  const f = fixture(async () => {
    calls++;
    return true;
  });
  f.loop.configure(true, true);
  f.visibility(false);
  assert.equal(f.jobs.size, 0);
  await f.loop.tick();
  assert.equal(calls, 0);
  f.visibility(true);
  await f.tick();
  assert.equal(calls, 1);
  f.loop.stop();
  assert.equal(f.jobs.size, 0);
});
test("read failures back off and stop after three, manual refresh resets budget", async () => {
  const f = fixture(async () => {
    throw Error("offline");
  });
  f.loop.configure(true, true);
  await f.tick();
  await f.tick();
  await f.tick();
  assert.equal(f.jobs.size, 0);
  assert.equal(f.loop.state().failures, 3);
  assert.match(f.loop.state().error, /offline/);
  assert.deepEqual(f.delays, [3000, 6000, 12000]);
  f.loop.configure(true, true);
  assert.equal(f.jobs.size, 1);
  assert.equal(f.loop.state().failures, 0);
});
test("late refresh cannot reactivate a closed or newly configured account", async () => {
  let release;
  const f = fixture(() => new Promise((r) => (release = r)));
  f.loop.configure(true, true);
  await f.tick();
  f.loop.stop();
  release(true);
  await new Promise((r) => setImmediate(r));
  assert.equal(f.loop.state().enabled, false);
  assert.equal(f.jobs.size, 0);
});
