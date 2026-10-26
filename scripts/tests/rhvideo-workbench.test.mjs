import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
const require = createRequire(import.meta.url),
  I = require("../../src/js/rhvideo-index.js"),
  tags = require("../../src/js/rhvideo-tags.js"),
  search = require("../../src/js/rhvideo-search.js"),
  dictionary = require("../../src/vendor/pinyin-pro/pinyin-pro.js");
const create = () => new I.Catalog({ tags, search, dictionary });
test("export limit counts UTF-8 bytes, rejects before native dialogs, and preserves JSON", () => {
  const rows = [{ title: "中文😀", id: "a" }],
    text = I.exportText(rows);
  assert.deepEqual(JSON.parse(text), rows);
  const bytes = new TextEncoder().encode(text).byteLength;
  assert(bytes > text.length);
  assert.equal(I.exportText(rows, bytes), text);
  assert.throws(() => I.exportText(rows, bytes - 1), /32 MiB/);
  assert.throws(
    () => I.exportText([{ title: "中".repeat(12 * 1024 * 1024) }]),
    /32 MiB/,
  );
});
const videos = [
  {
    id: "a",
    original_filename: "重庆森林2",
    folder_label: "电影, 剧情",
    created_at: "2026-01-01",
    original_filesize: 20,
    duration_seconds: 30,
    original_resolution: "1080x1920",
  },
  {
    id: "b",
    original_filename: "夏日10",
    folder_label: "电影, 旅行",
    created_at: "2026-03-01",
    original_filesize: 10,
    duration_seconds: 60,
  },
  {
    id: "c",
    original_filename: "夏日2",
    folder_label: "旅行",
    created_at: "2026-02-01",
    original_filesize: 30,
    duration_seconds: 10,
  },
];
for (const [sort, expected] of [
  ["nameAsc", ["a", "c", "b"]],
  ["nameDesc", ["b", "c", "a"]],
  ["dateAsc", ["a", "c", "b"]],
  ["dateDesc", ["b", "c", "a"]],
  ["sizeAsc", ["b", "a", "c"]],
  ["sizeDesc", ["c", "a", "b"]],
  ["durationAsc", ["c", "a", "b"]],
  ["durationDesc", ["b", "a", "c"]],
])
  test("catalog sort " + sort, async () => {
    const c = create();
    c.set("video", videos);
    assert.deepEqual(
      (await c.query({ kind: "video", sort })).items.map((v) => v.id),
      expected,
    );
  });
test("nested rules, exact labels and exclusions have RHVideo semantics", async () => {
  const c = create();
  c.set("video", videos);
  assert.equal((await c.query({ kind: "video", folder: "电" })).total, 0);
  const result = await c.query({
    kind: "video",
    rule: {
      mode: "and",
      include: ["电影"],
      groups: [{ mode: "or", include: ["剧情", "旅行"], exclude: ["剧情"] }],
    },
  });
  assert.deepEqual(
    result.items.map((v) => v.id),
    ["b"],
  );
  for (const rule of [
    { include: ["a,b"] },
    { mode: "invalid" },
    {
      include: Array(65)
        .fill(0)
        .map((_, i) => String(i)),
    },
  ])
    await assert.rejects(c.query({ kind: "video", rule }));
});
test("mixed Chinese, polyphonic pinyin and initials match the original dictionary", async () => {
  const c = create();
  c.set("video", videos);
  for (const q of [
    "重庆",
    "chongqing",
    "cqsl",
    "重qing森",
    "qing sen",
    "zhongq",
  ])
    assert.deepEqual(
      (await c.query({ kind: "video", search: q })).items.map((v) => v.id),
      ["a"],
      q,
    );
  assert.equal((await c.query({ kind: "video", search: "旅行" })).total, 2);
});
test("all-page queue, selection, portrait and favorite type separation", async () => {
  const c = create();
  c.set("video", videos);
  const q = await c.query({ kind: "video", limit: 1, allKeys: true });
  assert.equal(q.items.length, 1);
  assert.equal(q.queue.length, 3);
  assert.deepEqual(
    (await c.query({ kind: "video", portraitOnly: true })).items.map(
      (v) => v.id,
    ),
    ["a"],
  );
  c.set("favorite", [
    { ...videos[0], type: "video" },
    { ...videos[0], type: "picture" },
  ]);
  assert.equal(
    (await c.query({ kind: "favorite", selected: ["picture:a"] })).items[0]
      .kind,
    "picture",
  );
});
test("shuffle is stable, saved seed restores order, and updates invalidate caches", async () => {
  const c = create();
  c.set("video", videos);
  const a = await c.query({ kind: "video", seed: 123 });
  assert.deepEqual(a, await c.query({ kind: "video", seed: 123 }));
  c.set("video", videos.slice(0, 1));
  assert.equal((await c.query({ kind: "video", seed: 123 })).total, 1);
  assert.deepEqual(c.info().indexed, []);
});
test("virtual strip handles long images, two lanes and bounded viewport tiles", () => {
  const items = Array.from({ length: 50000 }, (_, i) => ({
    id: "p" + i,
    kind: "picture",
    resolution: i % 50 ? "1920x1080" : "100x10000",
  }));
  for (const vertical of [false, true]) {
    const layout = I.stripLayout(items, { vertical, lanes: 2, extent: 800 });
    assert(layout.items.length > 50000);
    const visible = I.visible(layout, 15000, 800);
    assert(visible.length < 100);
    assert(
      visible.every((v) => v.length > 0 && v.cross > 0 && v.part < v.cuts),
    );
  }
  assert.throws(() => I.stripLayout(items, { lanes: 0 }));
});
test("slideshow overlap never exceeds a short stay", () => {
  assert.equal(
    I.transition({ stay: 0.1, min: 1, max: 2.5, ratio: 0.3 }).fade,
    0.1,
  );
  assert.equal(I.transition({ stay: 5, overlap: false }).fade, 0);
  assert.equal(
    I.transition({ stay: 30, min: 1, max: 2.5, ratio: 0.3 }).fade,
    2.5,
  );
});
test("invalid media IDs and excessive paging cannot reach media resolution", async () => {
  const c = create();
  for (const id of ["../secret", "a?password=leak", "https://example"])
    assert.throws(() => c.set("video", [{ id }]));
  c.set("video", videos);
  for (const p of [{ limit: 101 }, { offset: -1 }, { sort: "invalid" }])
    await assert.rejects(c.query({ kind: "video", ...p }));
});
test("both clients package every worker dependency and the same operation manifest", () => {
  const sync = fs.readFileSync("scripts/android-sync.ps1", "utf8"),
    activity = fs.readFileSync(
      "android/gradle/app/src/main/java/com/railgunhamster/rhfiles/RhVideoActivity.kt",
      "utf8",
    );
  for (const file of [
    "rhvideo-operations.json",
    "js/rhvideo-worker.js",
    "js/rhvideo-search.js",
    "js/rhvideo-tags.js",
    "js/rhvideo-index.js",
    "vendor/pinyin-pro/pinyin-pro.js",
    "js/rhvideo-workbench.js",
    "css/rhvideo-workbench.css",
  ]) {
    assert(fs.existsSync("src/" + file), file);
    assert(sync.includes(file), file);
    assert(activity.includes("/rhvideo/" + file), file);
  }
  assert(
    fs
      .readFileSync("src-tauri/src/rhvideo_contract.rs", "utf8")
      .includes('include_str!("../../src/rhvideo-operations.json")'),
  );
});
test("contract routes correspond to the live sibling RHVideo operation inventory", () => {
  const source = path.resolve("../RHVideo/static/operation-contract.json");
  if (!fs.existsSync(source)) return;
  const inventory = new Set(
      JSON.parse(fs.readFileSync(source)).business_operations.map((v) =>
        v.id.replaceAll(/\{[^}]+\}/g, "{}"),
      ),
    ),
    spec = JSON.parse(fs.readFileSync("src/rhvideo-operations.json"));
  for (const [name, s] of Object.entries(spec.operations)) {
    const paths = s.path.includes("/{kind}/")
      ? s.params.kind.split("|").map((kind) => s.path.replace("{kind}", kind))
      : [s.path];
    for (const p of paths) {
      const route = s.method + " /api/v1/" + p.replaceAll(/\{[^}]+\}/g, "{}");
      assert(inventory.has(route), name + " " + route);
    }
  }
  assert(
    !Object.keys(spec.operations).some((n) => n.includes("retry")),
    "failed file requests must not acquire a replay button",
  );
});
test("fifty-thousand metadata sorting/paging is cached, bounded and repeatable", async () => {
  const c = create(),
    rows = Array.from({ length: 50000 }, (_, i) => ({
      id: "v" + i,
      original_filename: "夏日旅行 " + i,
      folder_label: i % 2 ? "旅行" : "电影",
      created_at: new Date(2026, 0, 1 + (i % 100)).toISOString(),
    }));
  const start = performance.now();
  c.set("video", rows);
  const cold = await c.query({ kind: "video", sort: "nameAsc", limit: 36 });
  const coldMs = performance.now() - start;
  assert.equal(cold.total, 50000);
  const phoneticStart = performance.now();
  const phonetic = await c.query({
    kind: "video",
    search: "xiari lvxing",
    limit: 36,
  });
  const phoneticMs = performance.now() - phoneticStart;
  assert.equal(phonetic.total, 50000);
  const samples = [];
  for (let i = 0; i < 30; i++) {
    const before = performance.now();
    const page = await c.query({
      kind: "video",
      sort: "nameAsc",
      limit: 36,
      offset: i * 36,
    });
    samples.push(performance.now() - before);
    assert.equal(page.items.length, 36);
  }
  samples.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      rhvideoMetadataBenchmark: {
        count: rows.length,
        coldMs,
        phoneticMs,
        p50: samples[15],
        p95: samples[28],
        heapMB: Math.round(process.memoryUsage().heapUsed / 1048576),
        note: "Node metadata only, not a playback/real-phone performance comparison",
      },
    }),
  );
  assert(c.info().orders <= 8);
});

test("Android native grid actions reach both the UI-thread gate and native dispatcher", () => {
  const source = fs.readFileSync(
      "android/gradle/app/src/main/java/com/railgunhamster/rhfiles/MainActivity.kt",
      "utf8",
    ),
    native = fs.readFileSync(
      "android/gradle/app/src/main/java/com/railgunhamster/rhfiles/NativeAutomation.kt",
      "utf8",
    ),
    actions = fs.readFileSync("android/web/js/automation-android.js", "utf8");
  for (const command of ["state", "control"]) {
    const name = "automation.grid." + command;
    assert.equal(
      source.split('"' + name + '"').length - 1,
      2,
      "gate + dispatch: " + name,
    );
    assert(native.includes('"' + name + '"'));
    assert(actions.includes("'native.grid." + command + "'"));
  }
});
test("Android build sync cannot silently discard case-only source fixes", () => {
  assert(
    fs
      .readFileSync("scripts/android-sync.ps1", "utf8")
      .includes("(Get-Content $Target -Raw) -ceq $desired"),
  );
});
test("resolution separators and preference key ordering cannot break orientation or restored positions", () => {
  assert.equal(I.portrait({ resolution: "1080×1920" }), true);
  assert.equal(
    I.portrait(I.normalize({ original_resolution: "1080 X 1920" }, "video")),
    true,
  );
  assert.equal(
    I.canonical({ sort: "nameAsc", rule: { exclude: [], mode: "and" } }),
    I.canonical({ rule: { mode: "and", exclude: [] }, sort: "nameAsc" }),
  );
});
test("large image strips do not exceed browser scroll geometry limits", () => {
  const metrics = I.scrollMetrics(50000000, 1200);
  assert.equal(metrics.physicalMax, 8000000);
  assert(metrics.scale > 1);
  for (const ratio of [0, 0.25, 0.5, 0.99, 1])
    assert(
      Math.abs(
        ratio * metrics.physicalMax * metrics.scale -
          ratio * metrics.logicalMax,
      ) < 0.00001,
    );
  assert.equal(I.scrollMetrics(800, 1200).physicalMax, 0);
  assert.equal(I.scrollMetrics(800, 1200).scale, 1);
});
