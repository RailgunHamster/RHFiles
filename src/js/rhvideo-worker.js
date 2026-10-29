/* Search/sort/layout never runs on the UI thread. Native, session-revoked
 * read-only capabilities provide catalog data; no server credentials here. */
importScripts(
  "../vendor/pinyin-pro/pinyin-pro.js",
  "rhvideo-search.js",
  "rhvideo-tags.js",
  "rhvideo-index.js",
);
const catalog = new RHVideoIndex.Catalog({
  tags: RHTagFilter,
  search: RHSearchCore,
  dictionary: pinyinPro,
});
let work = Promise.resolve();
let revision = 0;
const resourceReads = new Map();
async function readResource(id, args) {
  if (
    !/^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+\/\d+$/.test(args.url) &&
    !/^https:\/\/appassets\.androidplatform\.net\/rhvideo-catalog\/[a-f0-9-]{36}$/.test(
      args.url,
    )
  )
    throw Error("清单通道无效");
  if (args.revision !== revision) throw Error("媒体清单已更改");
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 35000);
  resourceReads.set(id, { controller, revision: args.revision });
  try {
    const response = await fetch(args.url, {
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw Error(data.error || "清单读取失败（HTTP " + response.status + "）");
    return data;
  } finally {
    clearTimeout(timer);
    resourceReads.delete(id);
  }
}
const latest = new Map();
self.onmessage = (event) => {
  const { id, action, args } = event.data;
  if (["invalidate", "resource"].includes(action))
    revision = Math.max(revision, args.revision);
  if (action === "invalidate")
    for (const read of resourceReads.values())
      if (read.revision < revision) read.controller.abort();
  const collection = action==='tags'?'@tags':args.kind || "";
  // Only obsolete paints may coalesce. Playback/export/order snapshots and exact
  // lookups must not be silently cancelled by an unrelated page render.
  const cancellable = ["query","tags"].includes(action) && args.latest === true && !args.locate;
  if (cancellable) latest.set(collection, id);
  const enqueue = (resource) => {
    work = work.then(async () => {
      try {
        if (cancellable && latest.get(collection) !== id) {
          self.postMessage({
            id,
            result: { items: [], total: 0, stale: true },
          });
          return;
        }
        let result;
        if (action === "resource") {
          if (args.revision !== revision)
            throw Error("媒体清单已更改，已丢弃旧读取");
          result = catalog.set(
            args.kind,
            Array.isArray(resource) ? resource : resource.items,
          );
        } else
          result =
            action === "invalidate"
              ? { revision }
              : action === "set"
                ? catalog.set(args.kind, args.items)
                : action === "gallery"
                  ? catalog.setGallery(args.videos, args.pictures)
                : action === "tags"
                  ? await catalog.tagQuery(args,()=>cancellable&&latest.get(collection)!==id)
                : action === "query"
                  ? await catalog.query(args)
                  : catalog.info();
        self.postMessage({ id, result });
      } catch (error) {
        self.postMessage({ id, error: String(error.message || error) });
      }
    });
  };
  // Network waits must not occupy the serialized indexing queue. A slow video
  // catalog must not block opening pictures/novels or a newer revision.
  if (action === "resource")
    void readResource(id, args).then(enqueue, (error) =>
      self.postMessage({ id, error: String(error.message || error) }),
    );
  else enqueue();
};
