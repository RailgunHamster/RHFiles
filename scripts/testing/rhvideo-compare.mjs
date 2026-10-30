// Same generated 50k metadata, same local HTTP fixture and WebView2 engine.
// Executes the reference project's real packaged UI, never its production DB.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { launchApp, until } from "./app-session.mjs";
import { cdpSession } from "../rhfiles-api.mjs";
import { rhvideoFixture } from "./rhvideo-fixture.mjs";
function verifyComparisonWorkload(reports) {
  assert.equal(reports.length,2);assert.equal(reports[0].client,'RHVideo');assert.equal(reports[1].client,'RHFiles');
  for (const row of reports) {
    assert.equal(row.count,50000);
    assert.equal(row.rendered.width,1280);assert.equal(row.rendered.height,800);
    assert.equal(row.rendered.visible,'visible');
    assert(Number.isSafeInteger(row.rendered.decodedImages)&&row.rendered.decodedImages>0, row.client+' must render actual authenticated covers; a blank/error workload is not comparable');
  }
  assert.deepEqual(reports[0].counts,reports[1].counts,'both clients must match identical search semantics');
}
const comparisonDirectory=fs.mkdtempSync(path.resolve('test-artifacts/rhvideo-reference-comparison-'));
const profileSearch=process.env.RHFILES_QA_SEARCH_PROFILE==='1';
assert([undefined,'0','1'].includes(process.env.RHFILES_QA_SEARCH_PROFILE),'Search profiling is explicit and diagnostic-only');
const reference = process.env.RHVIDEO_SOURCE || path.resolve("../RHVideo");
assert(fs.existsSync(path.join(reference, "static/index.html")));
const fixture = await rhvideoFixture({
  videoCount: 50000,
  referenceStatic: path.join(reference, "static"),
});
const reports = [];
const percentile = (samples, n) =>
  [...samples].sort((a, b) => a - b)[
    Math.min(samples.length - 1, Math.floor(samples.length * n))
  ];
try {
  for (const client of ["RHVideo", "RHFiles"]) {
    const app = await launchApp({ emulateFocus: true });
    let page;
    try {
      if (client === "RHVideo") {
        // The real page's <img> cannot attach fetch headers. Authorize only the
        // generated local fixture transport, as in the reference video probe;
        // do not alter the reference's render/search functions or source URLs.
        await app.send('Network.enable');
        await app.send('Network.setExtraHTTPHeaders',{headers:{Authorization:'Bearer fixture-bearer-do-not-persist'}});
        await app.send("Page.navigate", { url: fixture.url });
        await until(
          () =>
            app.evaluate(
              "typeof loadVideos==='function'&&typeof RHSearch!=='undefined'",
            ),
          "reference UI ready",
        );
        page = app;
      } else {
        await app.evaluate("RHFilesAPI.invoke('rhvideo.open')");
        const t = await until(async () => {
          const all = await (
            await fetch("http://127.0.0.1:" + app.port + "/json/list")
          ).json();
          return all.find((t) =>
            new URL(t.url).pathname.endsWith("/rhvideo.html"),
          );
        }, "RHFiles media view");
        page = await cdpSession(t, 120000);
        await until(
          () =>
            page.evaluate(
              "!!globalThis.RHFilesAPI?.list().some(a=>a.id==='rhvideo.state')",
            ),
          "RHFiles API ready",
        );
        for (const file of [
          "rhvideo-workbench.js",
          "rhvideo-client.js",
          "rhvideo-worker.js",
        ]) {
          const actual = await page.evaluate(
              "fetch(" + JSON.stringify("js/" + file) + ").then(r=>r.text())",
            ),
            expected = fs.readFileSync("src/js/" + file, "utf8");
          assert.equal(
            createHash("sha256").update(actual).digest("hex"),
            createHash("sha256").update(expected).digest("hex"),
            "benchmark must use the current " + file,
          );
        }
      }
      await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      await page.send("Emulation.setDeviceMetricsOverride", {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      });
      // The reference runs in the already focus-emulated main WebView; RHFiles
      // runs in its own library window. Apply the SAME focus condition to both,
      // otherwise secondary-window timer throttling skews only RHFiles samples.
      await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      await page.send("Page.bringToFront");
      await page.evaluate(
        "window.__bench={maxGap:0,last:0,frames:0};window.__benchFrame=t=>{const b=window.__bench;if(b.last)b.maxGap=Math.max(b.maxGap,t-b.last);b.last=t;b.frames++;window.__benchRAF=requestAnimationFrame(window.__benchFrame)};requestAnimationFrame(window.__benchFrame);true",
      );
      const before = Date.now();
      if (client === "RHVideo") {
        await page.evaluate(
          "(async()=>{const v=await(await fetch('/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'preview',password:'fixture-only'})})).json();token=v.access_token;document.getElementById('app').classList.remove('hidden');document.getElementById('login-section').classList.add('hidden');pageSize=36;switchTab('list');await loadVideos();await filterVideos();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()",
        );
        assert.equal(await page.evaluate("filteredVideos.length"), 50000);
        assert.equal(
          await page.evaluate(
            "document.getElementById('videos-grid').getBoundingClientRect().height>0",
          ),
          true,
          "reference list must be visible, not a hidden background tab",
        );
      } else {
        await page.evaluate('RHFilesAPI.invoke("rhvideo.category",{kind:"video"})');
        const result = await page.evaluate(
          'RHFilesAPI.invoke("rhvideo.connection.connect",' +
            JSON.stringify({
              server: fixture.url,
              username: "preview",
              password: "fixture-only",
            }) +
            ")",
        );
        assert.equal(result.total, 50000);
      }
      await until(()=>page.evaluate("[...document.images].some(node=>node.complete&&node.naturalWidth>0)"),client+' authenticated cover actually decoded');
      const coldMs = Date.now() - before,
        samples = [],
        apiSamples = [],
        counts = [];
      if(profileSearch){
        await page.send('Profiler.enable');
        await page.send('Profiler.setSamplingInterval',{interval:1000});
        await page.send('Profiler.start');
      }
      for (const query of [
        "shan ye",
        ...Array.from({ length: 20 }, (_, i) => (i % 2 ? "海边" : "qing chen")),
      ]) {
        await page.send("Page.bringToFront");
        const result =
          await page.evaluate(`(async()=>{const start=performance.now();${
            client === "RHVideo"
              ? `document.getElementById('search-input').value=${JSON.stringify(query)};await filterVideos();const total=filteredVideos.length;`
              : `const value=await RHFilesAPI.invoke('rhvideo.search',{query:${JSON.stringify(query)}});const total=value.total;`
          }
        const apiMs=performance.now()-start;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {ms:performance.now()-start,apiMs,total};})()`);
        samples.push(result.ms);
        apiSamples.push(result.apiMs);
        counts.push(result.total);
      }
      if(profileSearch){
        const {profile}=await page.send('Profiler.stop');
        fs.writeFileSync(path.join(comparisonDirectory,client+'-search.cpuprofile'),JSON.stringify(profile));
        await page.send('Profiler.disable');
      }
      const frame = await page.evaluate("({...window.__bench})");
      const rendered = await page.evaluate(
        "({width:innerWidth,height:innerHeight,visible:document.visibilityState,decodedImages:[...document.images].filter(n=>n.naturalWidth>0).length})",
      );
      reports.push({
        client,
        count: 50000,
        coldMs,
        coldPinyinMs: samples[0],
        hotSearchP50: percentile(samples.slice(1), 0.5),
        hotSearchP95: percentile(samples.slice(1), 0.95),
        hotApiP50: percentile(apiSamples.slice(1), 0.5),
        hotApiP95: percentile(apiSamples.slice(1), 0.95),
        maxFrameGapMs: frame.maxGap,
        rendered,
        artifact:app.artifactDir,
        counts,
      });
    } finally {
      if (page && page !== app) page.close();
      app.close();
    }
  }
} finally {
  await fixture.close();
}
let admissionError;
try{verifyComparisonWorkload(reports);}catch(error){admissionError=error;}
const output = {
  at: new Date().toISOString(),
  executable:
    process.env.RHFILES_TEST_EXECUTABLE ||
    "target/debug/rhfiles.exe (unoptimized development build)",
  referenceSource: reference,
  referenceSHA256: createHash("sha256")
    .update(fs.readFileSync(path.join(reference, "static/index.html")))
    .digest("hex"),
  fixture: "generated metadata, no production data",
  scope:
    "Windows WebView2 metadata/search UI with real authenticated covers. Not mobile, playback, network or memory acceptance.",
  comparable:!admissionError,
  diagnosticSampling:profileSearch,
  ...(admissionError?{admissionError:String(admissionError)}:{}),
  artifact:comparisonDirectory,
  reports,
};
fs.writeFileSync(
  path.join(comparisonDirectory,"comparison.json"),
  JSON.stringify(output, null, 2),
);
console.log(JSON.stringify(output, null, 2));
if(admissionError)throw admissionError;
