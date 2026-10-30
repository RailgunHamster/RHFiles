import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import vm from "node:vm";
const require = createRequire(import.meta.url),
  I = require("../../src/js/rhvideo-index.js"),
  tags = require("../../src/js/rhvideo-tags.js"),
  search = require("../../src/js/rhvideo-search.js"),
  dictionary = require("../../src/vendor/pinyin-pro/pinyin-pro.js");
const create = () => new I.Catalog({ tags, search, dictionary });

test("favorite dates mean the time favorited, not the source media creation date",async()=>{
  const catalog=create();catalog.set("favorite",[{id:"new-favorite",type:"video",created_at:"2020-01-01T00:00:00Z",favorited_at:"2026-10-29T00:00:00Z"},{id:"old-favorite",type:"video",created_at:"2026-10-29T00:00:00Z",favorited_at:"2020-01-01T00:00:00Z"}]);
  assert.deepEqual((await catalog.query({kind:"favorite",sort:"dateDesc"})).items.map(row=>row.id),["new-favorite","old-favorite"]);assert.deepEqual((await catalog.query({kind:"favorite",sort:"dateAsc"})).items.map(row=>row.id),["old-favorite","new-favorite"]);
});
test("favorite date ties keep the backend's stable order rather than reorder by media IDs",async()=>{
  const catalog=create();catalog.set("favorite",[{id:"z",type:"picture",favorited_at:"2026-10-29T00:00:00.123002Z"},{id:"a",type:"picture",favorited_at:"2026-10-29T00:00:00.123001Z"}]);
  assert.deepEqual((await catalog.query({kind:"favorite",sort:"dateDesc"})).items.map(row=>row.id),["z","a"]);assert.deepEqual((await catalog.query({kind:"favorite",sort:"dateAsc"})).items.map(row=>row.id),["a","z"]);
});

test("cached filtered ordering skips repeated full-index searches and invalidates on catalog writes", async () => {
  const catalog = create();
  catalog.set("video", [{ id: "one", original_filename: "山野.mp4" }]);
  let reads = 0;
  const original = catalog.search.bind(catalog);
  catalog.search = (...args) => { reads++; return original(...args); };
  const criteria = { kind: "video", search: "shanye" };
  assert.equal((await catalog.query(criteria)).total, 1);
  await catalog.query({ ...criteria, offset: 1 });
  assert.equal(reads, 1, "Paging/revisiting a cached filter must not scan the whole search index again");
  catalog.set("video", []);
  assert.equal((await catalog.query(criteria)).total, 0);
  assert.equal(reads, 2, "A changed catalog cannot reuse old matches");
});

test("queued events from a terminated account worker cannot reject or resolve the replacement worker", () => {
  const source = fs.readFileSync(new URL("../../src/js/rhvideo-workbench.js", import.meta.url), "utf8");
  const start = source.slice(source.indexOf("function startWorker()"), source.indexOf("function send(action"));
  const context = vm.createContext({ Worker: class { terminate() {} }, clearTimeout, Error });
  vm.runInContext(`let worker; const requests=new Map(); ${start}
    startWorker(); const oldError=worker.onerror, oldMessage=worker.onmessage; startWorker();
    let resolved=0,rejected=0; requests.set(7,{timer:0,resolve:()=>resolved++,reject:()=>rejected++});
    oldError();oldMessage({data:{id:7,result:'stale'}});
    if(rejected||resolved||requests.size!==1)throw Error('Old worker touched new requests');
    worker.onmessage({data:{id:7,result:'current'}});
    if(resolved!==1||rejected||requests.size)throw Error('Current worker failed');`, context);
});
test("resolved metadata memo is signature-checked, byte/entry bounded and clearable", () => {
  const cache = new I.ResolveCache(2, 1024);
  cache.put("a", "one", { id: "a" });
  cache.put("b", "two", { id: "b" });
  assert.equal(cache.get("a", "outdated"), undefined);
  assert.equal(cache.get("a", "one").id, "a");
  cache.put("c", "three", { id: "c" });
  assert.equal(cache.get("b", "two"), undefined);
  cache.put("huge", "x".repeat(2000), { id: "large" });
  assert(cache.info().estimatedBytes <= 1024);
  assert(cache.info().items <= 2);
  cache.clear();
  assert.equal(cache.info().items, 0);
  assert.equal(cache.info().estimatedBytes, 0);
});
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
  ["nameAsc", ["a", "b", "c"]],
  ["nameDesc", ["c", "b", "a"]],
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
    assert.equal(layout.items.length,vertical?50000:124000,"Vertical pictures remain whole; horizontal 100:1 pictures keep all 75 reference crops");
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

test("Android native events are allowlisted, unsubscribable, and cannot complete a request",async()=>{
  const source=fs.readFileSync(new URL("../../android/web/js/rhvideo-mobile.js",import.meta.url),"utf8"),sent=[];
  const context=vm.createContext({window:{RHVideoBridge:{postMessage:value=>sent.push(JSON.parse(value))}},Map,Set,Promise,Error,JSON,setTimeout,clearTimeout});
  vm.runInContext(source,context);const native=context.window.RHVideoNative,received=[];
  const unlisten=await native.listen("rhvideo-parent-preview",event=>received.push(event.payload));
  native.dispatch("arbitrary-event",{generation:1});assert.equal(received.length,0);
  native.dispatch("rhvideo-parent-preview",{generation:2,parentPreview:"new"});assert.equal(received.length,1);unlisten();native.dispatch("rhvideo-parent-preview",{generation:3});assert.equal(received.length,1);
  const request=native.request("state",{});native.dispatch("rhvideo-parent-preview",{id:sent[0].id,result:"not a response"});context.window.RHVideoBridge.onmessage({data:JSON.stringify({id:sent[0].id,result:{connected:true}})});assert.equal((await request).connected,true);
  await assert.rejects(native.listen("arbitrary-event",()=>{}),/未知/);
});

test("parent-video returns require the exact account, source and preview nonce, including unopened parents",async()=>{
  const source=fs.readFileSync(new URL("../../src/js/rhvideo-workbench.js",import.meta.url),"utf8"),start=source.indexOf('action("image.returnFromVideo"'),end=source.indexOf('action("image.reveal"',start),calls=[];
  let handler;const context=vm.createContext({action:(name,schema,callback)=>{handler=callback;},object:v=>v,string:{type:"string"},state:{generation:7},imageSession:{previewId:"new",playbackId:"child-new",current:{key:"frame:one:2"}},I:{key:item=>item.key},invoke:async name=>{calls.push(name);return {closed:true};},stepImage:async direction=>({direction}),ctx:{openDialog:id=>calls.push(id)}});
  vm.runInContext(source.slice(start,end),context);
  const event={generation:7,parentPreview:"new",parentKey:"frame:one:2",parentPlayback:"child-new"};
  for(const override of [{generation:6},{parentPreview:"old"},{parentKey:"frame:one:0"},{parentPlayback:"child-old"},{parentPlayback:undefined}])assert.equal((await handler({...event,close:true,...override})).stale,true);
  assert.equal(calls.length,0);
  await handler({...event,close:true});assert.deepEqual(calls,["image.close"],"Even a parent prepared by an ordinary video card must be cleared on whole close");calls.length=0;
  assert.equal((await handler({...event,direction:1})).stale,true,'an already-consumed return cannot navigate twice');context.imageSession.playbackId='child-new';
  assert.equal((await handler({...event,direction:-1})).direction,-1);assert.deepEqual(calls,["image-dialog"]);
});

test("image navigation commits the displayed target atomically and accumulates fast next actions",async()=>{
  const source=fs.readFileSync(new URL("../../src/js/rhvideo-workbench.js",import.meta.url),"utf8"),start=source.indexOf("async function stepImage("),end=source.indexOf("function refreshImage()",start),pending=[];
  const session={args:{kind:"gallery"},index:0,total:4,current:{id:"frame-0",kind:"frame",path:"/storage/0.webp"}};
  const context=vm.createContext({imageSession:session,imageToken:0,gallery:{limit:36},RHVideoModel:{playback:{step:(at,direction,total)=>(at+direction+total)%total}},send:(_name,args)=>new Promise((resolve,reject)=>pending.push({args,resolve,reject})),native:async(_name,args)=>args.paths.map(path=>"resolved:"+path),refreshImage(){},ctx:{resetImageZoom(){}},prefs:{},I,save(){},Error});
  vm.runInContext(source.slice(start,end),context);
  const first=context.stepImage(1);assert.equal(session.loading,true);assert.equal(session.index,0);assert.equal(session.current.id,"frame-0");assert.equal(session.pendingIndex,1);
  const second=context.stepImage(1);assert.equal(session.pendingIndex,2);assert.equal(pending[1].args.offset,2);
  pending[1].resolve({items:[{id:"frame-2",kind:"frame",path:"/storage/2.webp"}]});assert.equal((await second).index,2);assert.equal(session.current.id,"frame-2");assert.equal(session.index,2);assert.equal(session.loading,false);assert.equal(session.pendingIndex,undefined);
  pending[0].resolve({items:[{id:"frame-1",kind:"frame",path:"/storage/1.webp"}]});assert.equal((await first).stale,true);assert.equal(session.current.id,"frame-2");assert.equal(session.index,2);
  const failed=context.stepImage(1);pending[2].reject(Error("offline"));await assert.rejects(failed,/offline/);assert.equal(session.loading,false);assert.equal(session.current.id,"frame-2");assert.equal(session.index,2);
  const closed=context.stepImage(1);context.imageSession=null;context.imageToken++;pending[3].resolve({items:[{id:"frame-3"}]});assert.equal((await closed).stale,true);assert.equal(context.imageSession,null);
});

test("a screenshot cannot start its old video while switching, closing or changing account",async()=>{
  const source=fs.readFileSync(new URL("../../src/js/rhvideo-workbench.js",import.meta.url),"utf8"),start=source.indexOf("async function playImageVideo("),end=source.indexOf('action("image.playFrame"',start);
  for(const invalidate of [context=>{context.imageSession.loading=true;},context=>{context.imageSession=null;},context=>{context.epoch++;},context=>{context.imageSession.current={kind:"frame",videoId:"new"};}]){
    let ready;const calls=[],session={previewId:"preview",total:8,current:{id:"frame",kind:"frame",videoId:"old",seconds:10}};
    const context=vm.createContext({imageSession:session,epoch:1,singlePlayIntent:0,discardPrepared:async()=>{},crypto:{randomUUID:()=>"child-new"},$:()=>({open:true}),I:{key:item=>item.id},prepareQueue:()=>new Promise(resolve=>{ready=resolve;}),native:async(...args)=>calls.push(args),Error});vm.runInContext(source.slice(start,end),context);
    const playing=context.playImageVideo(false,true);invalidate(context);ready("ticket");await assert.rejects(playing,/预览目标已改变/);assert.equal(calls.length,0);
  }
  let prepared=0;const context=vm.createContext({imageSession:{loading:true},epoch:1,prepareQueue:()=>{prepared++;},Error});vm.runInContext(source.slice(start,end),context);await assert.rejects(context.playImageVideo(false,false),/正在切换/);assert.equal(prepared,0);
});

test("overlapping plays from the same screenshot cannot revive an older child or consume a newer return",async()=>{
  const source=fs.readFileSync(new URL("../../src/js/rhvideo-workbench.js",import.meta.url),"utf8"),start=source.indexOf("async function playImageVideo("),end=source.indexOf('action("image.playFrame"',start),pending=[],calls=[],session={previewId:"preview",playbackId:"previous",total:1,current:{id:"frame",kind:"frame",videoId:"one",seconds:10}};let sequence=0;
  const context=vm.createContext({imageSession:session,epoch:1,singlePlayIntent:0,discardPrepared:async()=>{},crypto:{randomUUID:()=>"child-"+(++sequence)},$:()=>({open:true}),I:{key:item=>item.id},prepareQueue:(_items,options)=>new Promise((resolve,reject)=>pending.push({resolve,reject,options})),native:async(...args)=>{calls.push(args);return {opened:true};},Error});vm.runInContext(source.slice(start,end),context);
  const older=context.playImageVideo(false,false),newer=context.playImageVideo(false,true);assert.equal(session.playbackId,'previous');assert.equal(session.playAttempt,'child-2');assert.equal(pending[0].options.parentPlayback,'child-1');assert.equal(pending[1].options.parentPlayback,'child-2');pending[0].resolve('older');await assert.rejects(older,/预览目标已改变/);assert.equal(session.playbackId,'previous');pending[1].resolve('newer');assert.equal((await newer).opened,true);assert.equal(session.playbackId,'child-2');assert.equal(session.playAttempt,undefined);assert.equal(calls.length,1);assert.equal(calls[0][1].playlist,'newer');
  const failed=context.playImageVideo(false,false);pending[2].reject(Error('prepare failed'));await assert.rejects(failed,/prepare failed/);assert.equal(session.playbackId,'child-2','a rejected new preparation preserves the still-current child return');
});

test("two failed screenshot preparations leave the current child's return intact",async()=>{
  const source=fs.readFileSync(new URL("../../src/js/rhvideo-workbench.js",import.meta.url),"utf8"),start=source.indexOf("async function playImageVideo("),end=source.indexOf('action("image.playFrame"',start),pending=[],session={previewId:"preview",playbackId:"live-child",total:1,current:{id:"frame",kind:"frame",videoId:"one",seconds:10}};let sequence=0;
  const context=vm.createContext({imageSession:session,epoch:1,singlePlayIntent:0,discardPrepared:async()=>{},crypto:{randomUUID:()=>"attempt-"+(++sequence)},$:()=>({open:true}),I:{key:item=>item.id},prepareQueue:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),native:async()=>{throw Error("Must not play an unprepared source");},Error});vm.runInContext(source.slice(start,end),context);
  const first=context.playImageVideo(false,false),second=context.playImageVideo(false,true),firstRejected=assert.rejects(first,/prepare failed/),secondRejected=assert.rejects(second,/prepare failed/);
  pending[0].reject(Error("prepare failed"));await firstRejected;pending[1].reject(Error("prepare failed"));await secondRejected;
  assert.equal(session.playbackId,"live-child","Failed preparations must not replace the already-playing child's return capability");
});

test("the mobile native player's visible menu has a public, input-guarded operation",async()=>{
  const original=fs.readFileSync(new URL("../../src/js/rhvideo-workbench.js",import.meta.url),"utf8");
  // Windows Git checkouts can use CRLF. The executable contract is identical;
  // normalize before finding a multiline boundary, and exercise both forms.
  for(const checkout of [original.replace(/\r?\n/g,"\n"),original.replace(/\r?\n/g,"\r\n")]){
    const source=checkout.replace(/\r\n/g,"\n"),start=source.indexOf('if (ctx.mobile) {\n        action(\n          "grid.target"'),end=source.indexOf("async function image(media)",start),actions=new Map(),calls=[];
    assert(start>=0&&end>start);
    const context=vm.createContext({ctx:{mobile:true},action:(name,schema,handler)=>actions.set(name,{schema,handler}),object:(properties={},required=[])=>({properties,required}),native:async(...args)=>calls.push(args)});vm.runInContext(source.slice(start,end),context);
    const control=actions.get("player.control");assert(control.schema.properties.command.enum.includes("options"));assert.equal(control.schema.properties.expectedInputId.type,"integer");
    await control.handler({command:"options",expectedInputId:17});assert.deepEqual(calls,[["player.control",{command:"options",expectedInputId:17}]]);
  }
});
