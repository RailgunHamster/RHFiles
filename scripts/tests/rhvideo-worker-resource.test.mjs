import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function fixture(fetch) {
  const waiting = new Map(),
    collections = new Map();
  let id = 0;
  const self = {
    postMessage(value) {
      const p = waiting.get(value.id);
      if (!p) return;
      waiting.delete(value.id);
      value.error ? p.reject(Error(value.error)) : p.resolve(value.result);
    },
  };
  const ctx = {
    self,
    importScripts() {},
    RHVideoIndex: {
      Catalog: class {
        set(kind, items) {
          collections.set(kind, items);
          return true;
        }
        query(args) {
          return collections.get(args.kind);
        }
        info() {
          return [...collections.keys()];
        }
      },
    },
    RHTagFilter: {},
    RHSearchCore: {},
    pinyinPro: {},
    AbortController,
    setTimeout,
    clearTimeout,
    fetch,
  };
  vm.runInNewContext(fs.readFileSync("src/js/rhvideo-worker.js", "utf8"), ctx);
  return {
    collections,
    send(action, args = {}) {
      const ticket = ++id;
      const promise = new Promise((resolve, reject) =>
        waiting.set(ticket, { resolve, reject }),
      );
      self.onmessage({ data: { id: ticket, action, args } });
      return promise;
    },
  };
}
const url = "http://127.0.0.1:1234/abc123/1",
  response = (items) => ({ ok: true, json: async () => ({ items }) });
test("a slow resource never blocks another collection or diagnostics", async () => {
  let release;
  const f = fixture(async (value) =>
    value.endsWith("/1")
      ? await new Promise((r) => (release = r))
      : response([{ id: "fast" }]),
  );
  const slow = f.send("resource", { kind: "video", url, revision: 1 });
  await f.send("resource", {
    kind: "picture",
    url: url.replace(/\/1$/, "/2"),
    revision: 1,
  });
  assert.equal(f.collections.get("picture")[0].id, "fast");
  assert.deepEqual(Array.from(await f.send("info")), ["picture"]);
  release(response([{ id: "slow" }]));
  await slow;
  assert.equal(f.collections.get("video")[0].id, "slow");
});
test("invalidation cancels a read; a transport ignoring abort still cannot resurrect it", async () => {
  let release, signal;
  const f = fixture(async (_url, options) => {
    signal = options.signal;
    return await new Promise((r) => (release = r));
  });
  const old = f.send("resource", { kind: "picture", url, revision: 1 });
  const rejected = assert.rejects(old, /更改/);
  await f.send("invalidate", { revision: 2 });
  assert.equal(signal.aborted, true);
  release(response([{ id: "deleted" }]));
  await rejected;
  assert.equal(f.collections.size, 0);
});
test("resources omit browser credentials and reject arbitrary remote hosts before I/O", async () => {
  let count = 0;
  const f = fixture(async (_url, options) => {
    count++;
    assert.equal(options.credentials, "omit");
    return response([]);
  });
  await assert.rejects(
    f.send("resource", {
      kind: "video",
      revision: 1,
      url: "https://evil.invalid/data",
    }),
    /通道无效/,
  );
  assert.equal(count, 0);
  await f.send("resource", { kind: "video", revision: 1, url });
  assert.equal(count, 1);
});
