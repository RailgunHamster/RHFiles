/* Bounded derived catalog, shared by the worker and business tests. */
(function (root, factory) {
  const value = factory();
  if (typeof module === "object" && module.exports) module.exports = value;
  else root.RHVideoIndex = value;
})(globalThis, () => {
  "use strict";
  const sorts = [
    "nameAsc",
    "nameDesc",
    "dateDesc",
    "dateAsc",
    "sizeDesc",
    "sizeAsc",
    "durationDesc",
    "durationAsc",
  ];
  const collator = new Intl.Collator("zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
  const hash = (text, seed = 1) => {
    let value = seed | 0;
    for (const c of text) value = Math.imul(value ^ c.codePointAt(0), 16777619);
    return value >>> 0;
  };
  function key(v) {
    return (v.kind || v.type || "video") + ":" + v.id;
  }
  function canonical(value) {
    return JSON.stringify(value, (_key, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((key) => [key, v[key]]),
          )
        : v,
    );
  }
  function normalize(v, kind) {
    const type = v.type || v.kind || kind;
    return {
      ...v,
      kind: type,
      title: String(v.title || v.original_filename || v.filename || v.id || ""),
      folder: String(v.folder_label || v.folder || ""),
      size: Number(v.original_filesize || v.source_size || v.filesize || 0),
      date: Date.parse(v.created_at) || 0,
      duration: Number(
        v.duration_seconds || v.original_duration || v.duration || 0,
      ),
      resolution: String(v.original_resolution || v.resolution || "")
        .replace(/[×X]/g, "x")
        .replace(/\s/g, ""),
      wordCount: Number(v.word_count || 0),
    };
  }
  function portrait(v) {
    const [w, h] = String(v.resolution || v.original_resolution || "")
      .split(/[x×X]/)
      .map(Number);
    return w > 0 && h > w;
  }
  class Catalog {
    constructor({ tags, search, dictionary } = {}) {
      this.tags = tags;
      this.searchCore = search;
      this.dictionary = dictionary;
      this.collections = new Map();
      this.indexes = new Map();
      this.orderCache = new Map();
    }
    set(kind, raw) {
      if (!Array.isArray(raw) || raw.length > 1000000)
        throw Error("媒体清单无效或超出上限");
      const rows = raw.map((v) => normalize(v, kind));
      for (const v of rows)
        if (
          !/^[A-Za-z0-9_-]{1,128}$/.test(v.id) ||
          !["video", "picture", "novel", "frame"].includes(v.kind)
        )
          throw Error("媒体编号或类型无效");
      this.collections.set(kind, rows);
      this.indexes.delete(kind);
      this.orderCache.clear();
      return { count: rows.length };
    }
    async search(kind, text) {
      if (!text) return null;
      if (!this.searchCore || !this.dictionary)
        throw Error("拼音搜索词典未加载");
      let index = this.indexes.get(kind);
      if (!index) {
        index = new this.searchCore.Index(this.dictionary);
        const rows = this.collections.get(kind) || [];
        for (let offset = 0; offset < rows.length; offset += 256) {
          for (const row of rows.slice(offset, offset + 256))
            index.upsert({
              key: key(row),
              fields: [row.title, row.folder],
              literal: [row.resolution, row.codec || ""],
            });
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        this.indexes.set(kind, index);
      }
      return new Set(index.search(text));
    }
    async query({
      kind,
      search = "",
      rule = {},
      folder = "",
      sort = "dateDesc",
      offset = 0,
      limit = 36,
      seed = 0,
      mediaType = "",
      portraitOnly = false,
      selected = [],
      allKeys = false,
    }) {
      if (
        !sorts.includes(sort) ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100
      )
        throw Error("分页或排序参数无效");
      const rows = this.collections.get(kind) || [];
      const cacheKey = JSON.stringify([
        kind,
        search,
        rule,
        folder,
        sort,
        seed,
        mediaType,
        portraitOnly,
        selected,
      ]);
      let order = this.orderCache.get(cacheKey);
      if (!order) {
        const matches = await this.search(kind, search),
          tags = this.tags?.compile(rule) || (() => true),
          selectedSet = new Set(selected);
        order = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (
            (matches && !matches.has(key(row))) ||
            (folder &&
              !row.folder
                .split(",")
                .map((v) => v.trim())
                .includes(folder)) ||
            !tags(row.folder) ||
            (mediaType && row.kind !== mediaType) ||
            (portraitOnly && !portrait(row)) ||
            (selectedSet.size && !selectedSet.has(key(row)))
          )
            continue;
          order.push(i);
        }
        const field = sort.startsWith("name")
            ? "title"
            : sort.startsWith("date")
              ? "date"
              : sort.startsWith("size")
                ? "size"
                : "duration",
          direction = sort.endsWith("Desc") ? -1 : 1;
        order.sort((ai, bi) => {
          const a = rows[ai],
            b = rows[bi];
          return (
            (seed
              ? hash(key(a), seed) - hash(key(b), seed)
              : direction *
                (field === "title"
                  ? collator.compare(a.title, b.title)
                  : a[field] - b[field])) || collator.compare(key(a), key(b))
          );
        });
        if (this.orderCache.size >= 8)
          this.orderCache.delete(this.orderCache.keys().next().value);
        this.orderCache.set(cacheKey, order);
      }
      return {
        items: order.slice(offset, offset + limit).map((i) => rows[i]),
        total: order.length,
        ...(allKeys
          ? {
              queue: order.map((i) => {
                const v = rows[i];
                return {
                  id: v.id,
                  kind: v.kind,
                  title: v.title,
                  duration: v.duration,
                  resolution: v.resolution,
                  ...(v.kind === "picture" || v.kind === "frame"
                    ? { path: v.path || "/storage/" + v.webp_path }
                    : {}),
                  ...(v.kind === "frame"
                    ? { videoId: v.videoId, seconds: v.seconds }
                    : {}),
                  key: key(v),
                };
              }),
            }
          : {}),
      };
    }
    info() {
      return {
        collections: Object.fromEntries(
          [...this.collections].map(([k, v]) => [k, v.length]),
        ),
        indexed: [...this.indexes.keys()],
        orders: this.orderCache.size,
      };
    }
  }
  function stripLayout(
    items,
    { vertical = false, lanes = 1, extent = 600, gap = 8, longRatio = 5 } = {},
  ) {
    if (![1, 2].includes(lanes) || !Number.isFinite(extent) || extent < 1)
      throw Error("布局参数无效");
    const cross = (extent - gap * (lanes - 1)) / lanes,
      positions = Array(lanes).fill(0),
      out = [];
    for (const item of items) {
      const [w, h] = String(
          item.resolution || item.original_resolution || "1x1",
        )
          .split(/[x×X]/)
          .map(Number),
        ratio =
          Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
            ? Math.max(0.00001, Math.min(100000, w / h))
            : 1;
      const cuts =
        ratio < 1 / longRatio
          ? Math.min(100, Math.ceil(1 / ratio / longRatio))
          : 1;
      for (let part = 0; part < cuts; part++) {
        const lane = positions.indexOf(Math.min(...positions)),
          length = Math.max(
            32,
            vertical ? cross / ratio / cuts : cross * ratio * cuts,
          );
        out.push({
          key: key(item) + ":" + part,
          item,
          lane,
          start: positions[lane],
          length,
          cross,
          part,
          cuts,
          vertical,
        });
        positions[lane] += length + gap;
      }
    }
    const laneItems = Array.from({ length: lanes }, () => []);
    for (const item of out) laneItems[item.lane].push(item);
    return {
      items: out,
      lanes: laneItems,
      length: Math.max(0, ...positions) - gap,
      cross,
    };
  }
  function visible(layout, start, length, overscan = 800) {
    const found = [];
    for (const lane of layout.lanes || [layout.items]) {
      let lo = 0,
        hi = lane.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (lane[mid].start + lane[mid].length < start - overscan) lo = mid + 1;
        else hi = mid;
      }
      for (
        let i = lo;
        i < lane.length && lane[i].start <= start + length + overscan;
        i++
      )
        found.push(lane[i]);
    }
    return found;
  }
  function transition(settings = {}) {
    const stay = Math.max(0.1, Math.min(30, Number(settings.stay) || 5));
    return {
      stay,
      fade:
        settings.overlap === false
          ? 0
          : Math.min(
              stay,
              Math.max(
                Number(settings.min) || 1,
                Math.min(
                  Number(settings.max) || 2.5,
                  stay * (Number(settings.ratio) || 0.3),
                ),
              ),
            ),
    };
  }
  function scrollMetrics(length, extent) {
    const logicalMax = Math.max(0, length - extent),
      physicalMax = Math.min(8000000, logicalMax);
    return {
      logicalMax,
      physicalMax,
      scale: physicalMax > 0 ? logicalMax / physicalMax : 1,
      spacer: physicalMax + extent,
    };
  }
  function exportText(items, maximumBytes = 32 * 1024 * 1024) {
    const text = JSON.stringify(items, null, 2);
    if (new TextEncoder().encode(text).byteLength > maximumBytes)
      throw Error("导出超过 32 MiB，请减少所选项目后再导出");
    return text;
  }
  class ResolveCache {
    constructor(maximum = 512, budget = 2 * 1024 * 1024) {
      this.maximum = maximum;
      this.budget = budget;
      this.entries = new Map();
      this.bytes = 0;
    }
    clear() {
      this.entries.clear();
      this.bytes = 0;
    }
    get(key, signature) {
      const e = this.entries.get(key);
      if (!e || e.signature !== signature) return;
      this.entries.delete(key);
      this.entries.set(key, e);
      return e.value;
    }
    put(key, signature, value) {
      const old = this.entries.get(key);
      if (old) {
        this.bytes -= old.bytes;
        this.entries.delete(key);
      }
      const bytes = 256 + 2 * (signature.length + JSON.stringify(value).length);
      if (bytes > this.budget) return;
      this.entries.set(key, { signature, value, bytes });
      this.bytes += bytes;
      for (const [id, e] of this.entries) {
        if (this.entries.size <= this.maximum && this.bytes <= this.budget)
          break;
        this.entries.delete(id);
        this.bytes -= e.bytes;
      }
    }
    info() {
      return { items: this.entries.size, estimatedBytes: this.bytes };
    }
  }
  return {
    Catalog,
    sorts,
    hash,
    key,
    canonical,
    normalize,
    portrait,
    stripLayout,
    visible,
    transition,
    scrollMetrics,
    exportText,
    ResolveCache,
  };
});
