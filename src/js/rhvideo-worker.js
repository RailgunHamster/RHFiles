/* Search/sort/layout work never runs on the UI thread. No credentials or I/O. */
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
const latest = new Map();
self.onmessage = (event) => {
  const { id, action, args } = event.data;
  const collection = args.kind || "";
  if (action === "query") latest.set(collection, id);
  work = work.then(async () => {
    try {
      if (action === "query" && latest.get(collection) !== id) {
        self.postMessage({ id, result: { items: [], total: 0, stale: true } });
        return;
      }
      const result =
        action === "set"
          ? catalog.set(args.kind, args.items)
          : action === "query"
            ? await catalog.query(args)
            : catalog.info();
      self.postMessage({ id, result });
    } catch (error) {
      self.postMessage({ id, error: String(error.message || error) });
    }
  });
};
