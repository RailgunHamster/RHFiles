/* RHFiles media workbench. Packaged UI, native HTTP/media, semantic public API. */
(() => {
  "use strict";
  window.RHVideoWorkbench = {
    install(ctx) {
      const {
        api,
        native,
        action,
        invoke,
        object,
        string,
        state,
        reader,
        $,
        notice,
        load,
        showImage,
        openMedia,
        icon,
      } = ctx;
      const I = RHVideoIndex,
        listen = (node, type, fn, site) =>
          RHFilesUI.listen(
            node,
            type,
            fn,
            undefined,
            "rhvideo.workbench." + site,
          );
      const resolutions = new I.ResolveCache();
      let resolutionRevision = "",
        accountGeneration = null,
        resolutionGeneration = 0;
      let sessionSnapshot = null,
        sessionCheckedAt = 0;
      let worker,
        sequence = 0,
        epoch = 0,
        catalogRevision = 0,
        account = "",
        prefs = {},
        saveTimer = 0,
        saveChain = Promise.resolve(),
        selected = new Set(),
        raw = new Map(),
        imageSession = null,
        imageToken = 0,
        thumbnailTicket = 0,
        detailJob = null,
        liveRefresh = null;
      let mutations = {
        depth: 0,
        catalog: false,
        server: false,
        refreshError: "",
      };
      const requests = new Map(),
        manifest = fetch("rhvideo-operations.json").then((r) => {
          if (!r.ok) throw Error("无法读取媒体操作契约");
          return r.json();
        });
      const defaults = {
        sort: "dateDesc",
        rule: { mode: "and", include: [], exclude: [] },
        mediaType: "",
        seed: 0,
        stay: 5,
        videoStay: 15,
        overlap: true,
        ratio: 0.3,
        min: 1,
        max: 2.5,
        kenBurns: true,
        lanes: 1,
        vertical: false,
        scrollSpeed: 60,
        perVideo: 8,
        mixPictures: false,
        readerTheme: "day",
        readerLine: 2.05,
        readerFont: 20,
        segment: 3,
        fullLength: false,
        portraitOnly: false,
        loop: false,
        super: false,
        rotation: 0,
        gridCount: 0,
        volume: 20,
        resume: false,
      };
      const config = () => ({ ...defaults, ...prefs });
      function el(tag, text, cls) {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (cls) node.className = cls;
        return node;
      }
      function button(text, name, args = {}, cls = "button secondary") {
        const b = el("button", text, cls);
        b.type = "button";
        b.dataset.apiAction = "rhvideo." + name;
        listen(
          b,
          "click",
          () =>
            invoke(name, typeof args === "function" ? args() : args).catch(
              notice,
            ),
          name,
        );
        return b;
      }
      function select(options, name, args, value) {
        const node = el("select");
        node.dataset.apiAction = "rhvideo." + name;
        for (const [key, label] of options) node.append(new Option(label, key));
        node.value = String(value ?? "");
        listen(
          node,
          "change",
          () => invoke(name, args(node.value)).catch(notice),
          name,
        );
        return node;
      }
      function field(label, input) {
        const root = el("label", undefined, "wb-field");
        root.append(el("span", label), input);
        return root;
      }
      function input(type, value, id) {
        const node = el("input");
        node.dataset.apiAction = "ui.set";
        node.type = type;
        node.value = String(value ?? "");
        if (id) node.id = id;
        return node;
      }
      function dialog(id, title) {
        if (id === "wb-info") detailJob = null;
        if (id !== "wb-viewer" && viewer?.videoActive) {
          void native("presentation.control", { command: "pause" }).catch(
            notice,
          );
          void syncPresentation(0, false).catch(notice);
        }
        let node = $(id);
        if (!node) {
          node = el("dialog", undefined, "wb-dialog");
          node.id = id;
          const header = el("header", undefined, "wb-dialog-head");
          header.append(el("h2", title), button("关闭", "panel.close", { id }));
          node.append(header, el("section", undefined, "wb-content"));
          document.body.append(node);
          listen(
            node,
            "cancel",
            (event) => {
              event.preventDefault();
              invoke("panel.close", { id }).catch(notice);
            },
            id + ".cancel",
          );
        }
        if (!node.open) {
          ctx.openDialog(id);
        }
        liveRefresh?.configure(liveRefresh.enabled);
        node.querySelector(".wb-dialog-head h2").textContent = title;
        if(id==="wb-info")delete node.querySelector(".wb-content").dataset.batchTicket;
        return node.querySelector(".wb-content");
      }
      function startWorker() {
        if (worker) {
          worker.onmessage = null;
          worker.onerror = null;
          worker.terminate();
        }
        for (const p of requests.values()) {
          clearTimeout(p.timer);
          p.reject(Error("媒体账户或清单已更改"));
        }
        requests.clear();
        const activeWorker = new Worker("js/rhvideo-worker.js");
        worker = activeWorker;
        activeWorker.onmessage = (e) => {
          if (worker !== activeWorker) return;
          const p = requests.get(e.data.id);
          if (!p) return;
          requests.delete(e.data.id);
          clearTimeout(p.timer);
          e.data.error
            ? p.reject(Error(e.data.error))
            : p.resolve(e.data.result);
        };
        activeWorker.onerror = (event) => {
          if (worker !== activeWorker) return;
          for (const p of requests.values()) {
            clearTimeout(p.timer);
            const reason = typeof event?.message === "string" ? event.message.slice(0, 300) : "";
            p.reject(Error("媒体搜索索引失败，请刷新媒体库" + (reason ? "：" + reason : "")));
          }
          requests.clear();
        };
      }
      function send(action, args = {}) {
        if (!worker) startWorker();
        return new Promise((resolve, reject) => {
          const id = ++sequence,
            timer = setTimeout(() => {
              requests.delete(id);
              reject(Error("媒体索引处理超时"));
            }, 120000);
          requests.set(id, { resolve, reject, timer });
          worker.postMessage({ id, action, args });
        });
      }
      async function reset(authenticated) {
        ctx.invalidateReads();
        epoch++;
        resolutions.clear();
        sessionSnapshot = null;
        sessionCheckedAt = 0;
        resolutionRevision = "";
        accountGeneration = null;
        liveRefresh?.stop();
        detailJob = null;
        mutations = {
          depth: 0,
          catalog: false,
          server: false,
          refreshError: "",
        };
        account = "";
        invalidateCatalog();
        selected.clear();
        lastBatch = null;
        imageSession = null;
        imageToken++;
        stopViewer();
        pendingConfirmation = null;
        server.load++;
        Object.assign(server, {
          page: "watch",
          queue: "default",
          view: "running",
          pageNumber: 1,
          q: "",
          days: 7,
          status: "all",
        });
        preview.load++;
        thumbnailTicket++;
        preview.items = [];
        gallery.load++;
        gallery.loaded = false;
        gallery.items = [];
        gallery.offset = 0;
        gallery.total = 0;
        gallery.seed = 0;
        state.search = "";
        state.folder = "";
        state.offset = 0;
        $("search").value = "";
        $("folder").replaceChildren(new Option("所有文件夹", ""));
        for (const node of document.querySelectorAll(".wb-dialog")) {
          node.close();
          node.querySelector(".wb-content")?.replaceChildren();
        }
        startWorker();
        prefs = {};
        clearTimeout(saveTimer);
        if (authenticated) {
          const s = await native("state");
          ctx.updateConnection(s);
          sessionSnapshot = s;
          sessionCheckedAt = performance.now();
          account = s.server + "\n" + s.username;
          accountGeneration = s.generation ?? null;
          resolutionRevision =
            String(s.generation) + ":" + String(s.assetRevision);
          prefs = await native("preferences");
          applyPreferences();
        }
        return { reset: true };
      }
      async function ensure(force = false) {
        if (!state.connected) throw Error("请先连接并登录 RHVideo");
        const readEpoch = epoch;
        const cached =
          !force &&
          sessionSnapshot &&
          performance.now() - sessionCheckedAt < 5000;
        const s = cached ? sessionSnapshot : await native("state");
        if (readEpoch !== epoch) throw Error("媒体账户已更改，已丢弃旧读取");
        if (!cached) {
          sessionSnapshot = s;
          sessionCheckedAt = performance.now();
        }
        if (!s.connected) {
          if (state.connected) {
            ctx.updateConnection(s);
            await reset(false);
            state.total = 0;
            state.error = "RHVideo 登录已失效，请重新连接";
            await load();
            notice(state.error);
            throw Error(state.error);
          }
          throw Error("请先连接并登录 RHVideo");
        }
        const key = s.server + "\n" + s.username;
        if (
          account !== key ||
          (accountGeneration !== null && s.generation !== accountGeneration)
        ) {
          ctx.updateConnection(s);
          await reset(true);
        }
        const active = sessionSnapshot || s;
        const revision =
          String(active.generation) + ":" + String(active.assetRevision);
        if (resolutionRevision !== revision) {
          resolutions.clear();
          resolutionRevision = revision;
        }
        resolutionGeneration = active.generation ?? state.generation;
        await ready;
        return epoch;
      }
      let volumeChain=Promise.resolve(),volumeKey="";
      function syncVolume(){
        const value=config().volume,key=state.generation+":"+value;
        if($("wb-page-volume"))$("wb-page-volume").value=String(value);
        if(!state.connected)return Promise.resolve({volume:value});
        if(volumeKey===key)return volumeChain;
        volumeKey=key;const generation=state.generation;
        volumeChain=volumeChain.catch(()=>{}).then(()=>{if(!state.connected||generation!==state.generation)return {stale:true};return native("page.volume",{value});});
        return volumeChain;
      }
      function applyPreferences() {
        const c = config();
        $("wb-sort").value = c.sort;
        document.documentElement.style.setProperty(
          "--reader-size",
          c.readerFont + "px",
        );
        document.documentElement.style.setProperty(
          "--reader-line",
          c.readerLine,
        );
        $("reader-dialog").dataset.theme = c.readerTheme;
        if (
          ![...$("reader-font").options].some(
            (option) => option.value === String(c.readerFont),
          )
        )
          $("reader-font").append(
            new Option(String(c.readerFont), String(c.readerFont)),
          );
        $("reader-font").value = String(c.readerFont);
        void syncVolume().catch(error=>{volumeKey="";notice(error);});
      }
      function save() {
        clearTimeout(saveTimer);
        const session = epoch;
        saveTimer = setTimeout(() => {
          const value = structuredClone(prefs);
          saveChain = saveChain
            .catch(() => {})
            .then(() => {
              if (session === epoch && state.connected)
                return native("preferences", { value });
            })
            .catch(notice);
        }, 150);
      }
      function invalidateCatalog(kind) {
        catalogRevision++;
        if (kind !== "favorite") resolutions.clear();
        if (worker)
          void send("invalidate", { revision: catalogRevision }).catch(
            () => {},
          );
        if (kind) raw.delete(kind);
        else raw.clear();
      }
      async function rawCatalog(kind, refresh = false) {
        if (refresh) invalidateCatalog(kind);
        const version = epoch,
          revision = catalogRevision;
        if (!raw.has(kind)) {
          const pending = (async () => {
            let rows;
            if (kind === "favorite") {
              rows = [];
              const seen = new Set();
              for (let skip = 0; skip < 100000; skip += 200) {
                const data = await remote("index.favorite", {
                  query: { skip, limit: 200, media_type: "all" },
                });
                if (version !== epoch || revision !== catalogRevision)
                  throw Error("媒体账户或清单已更改，已丢弃旧读取");
                if (!Array.isArray(data.items)) throw Error("收藏清单格式无效");
                if (
                  data.items.some((v) =>
                    seen.has((v.type || v.kind) + ":" + v.id),
                  )
                )
                  throw Error("服务器重复返回同一页收藏，已停止继续请求");
                data.items.forEach((v) =>
                  seen.add((v.type || v.kind) + ":" + v.id),
                );
                rows.push(...data.items);
                if (!data.items.length || rows.length >= data.total) break;
                if (skip >= 99800)
                  throw Error("收藏清单超过 10 万项，请先在服务器缩小范围");
              }
            } else {
              const resource = await invoke("catalog.resource", {
                kind,
                refresh,
              });
              if (version !== epoch || revision !== catalogRevision)
                throw Error("媒体账户或清单已更改，已丢弃旧读取");
              await send("resource", { kind, url: resource.url, revision });
              if (version !== epoch || revision !== catalogRevision)
                throw Error("媒体账户或清单已更改，已丢弃旧读取");
              return true;
            }
            if (version !== epoch || revision !== catalogRevision)
              throw Error("媒体账户或清单已更改，已丢弃旧读取");
            await send("set", { kind, items: rows });
            return true;
          })().catch((error) => {
            if (raw.get(kind) === pending) raw.delete(kind);
            throw error;
          });
          raw.set(kind, pending);
        }
        return raw.get(kind);
      }
      function criteria(extra = {}) {
        const c = config();
        return {
          kind: state.kind,
          search: state.search,
          folder: state.folder,
          rule: c.rule,
          sort: c.sort,
          seed: c.seed,
          mediaType: state.kind === "favorite" ? c.mediaType : "",
          offset: state.offset,
          limit: state.limit,
          ...extra,
        };
      }
      async function query(extra = {}, verifiedToken) {
        const token = verifiedToken ?? (await ensure()),
          args = criteria(extra),
          revision = catalogRevision;
        await rawCatalog(args.kind);
        const result = await send("query", args);
        if (token !== epoch || revision !== catalogRevision)
          throw Error("媒体账户或清单已更改，已丢弃旧读取");
        return result;
      }
      async function catalog(refresh) {
        const token = await ensure(refresh);
        await rawCatalog(state.kind, refresh);
        const version = epoch,
          revision = catalogRevision;
        const result = await query({}, token);
        const cached = result.items.map((item) =>
          resolutions.get(I.key(item), JSON.stringify(item)),
        );
        const missing = result.items.filter((_, index) => !cached[index]);
        let resolved = { items: [], generation: resolutionGeneration };
        if (missing.length) {
          resolved = await native("resolve", { items: missing });
          if (version !== epoch || revision !== catalogRevision)
            throw Error("媒体账户或清单已更改，已丢弃旧读取");
          if (
            !Array.isArray(resolved.items) ||
            resolved.items.length !== missing.length
          )
            throw Error("媒体解析结果无效");
          for (let i = 0; i < missing.length; i++)
            resolutions.put(
              I.key(missing[i]),
              JSON.stringify(missing[i]),
              resolved.items[i],
            );
        }
        let index = 0;
        resolved.items = cached.map((item) => item || resolved.items[index++]);
        if (version !== epoch || revision !== catalogRevision)
          throw Error("媒体账户或清单已更改，已丢弃旧读取");
        return { ...resolved, total: result.total };
      }
      async function remote(name, args = {}) {
        args = { expectedGeneration: state.generation, ...args };
        await ready;
        return api.invoke("rhvideo.remote." + name, args);
      }
      async function flushWrites(scope) {
        if (scope !== mutations || scope.depth) return;
        const catalog = scope.catalog,
          serverDirty = scope.server;
        scope.catalog = false;
        scope.server = false;
        scope.refreshError = "";
        if (catalog) {
          try {
            await load();
            if (scope === mutations && state.error)
              scope.refreshError = state.error;
          } catch (error) {
            scope.refreshError = String(error.message || error);
          }
        }
        if (serverDirty && scope === mutations && $("wb-server")?.open)
          try {
            await renderServer();
            if (scope === mutations) liveRefresh.configure(server.live, true);
          } catch (error) {
            scope.refreshError = String(error.message || error);
          }
        if (scope === mutations && scope.refreshError)
          notice("服务器操作已完成，但刷新失败：" + scope.refreshError);
      }
      async function batchWrites(run) {
        const scope = mutations;
        scope.depth++;
        try {
          return await run();
        } finally {
          scope.depth--;
          if (scope === mutations) await flushWrites(scope);
        }
      }
      const simpleSchema = (rule) =>
        rule === "bool"
          ? { type: "boolean" }
          : rule.startsWith("int:")
            ? {
                type: "integer",
                minimum: Number(rule.split(":")[1]),
                maximum: Number(rule.split(":")[2]),
              }
            : rule.startsWith("ids:")
              ? {
                  type: "array",
                  items: { type: "string", minLength: 1, maxLength: 128 },
                  minItems: 1,
                  maxItems: Number(rule.split(":")[1]),
                }
              : rule.startsWith("text:")
                ? { type: "string", maxLength: Number(rule.split(":")[1]) }
                : rule === "resolution"
                  ? {}
                  : rule.includes("|")
                    ? {
                        enum: rule
                          .split("|")
                          .flatMap((v) =>
                            /^\d+$/.test(v) ? [v, Number(v)] : [v],
                          ),
                      }
                    : { type: "string", maxLength: 160 };
      const ready = manifest.then((spec) => {
        for (const [name, s] of Object.entries(spec.operations)) {
          if (s.internal) continue;
          const pathKeys = [...s.path.matchAll(/\{([^}]+)\}/g)].map(
              (m) => m[1],
            ),
            props = {
              expectedGeneration: {
                type: "integer",
                minimum: 0,
                description:
                  "Optional session generation from rhvideo.state; rejects stale targets before execution",
              },
            };
          if (pathKeys.length)
            props.params = object(
              Object.fromEntries(
                pathKeys.map((k) => [k, simpleSchema(s.params?.[k] || "id")]),
              ),
              pathKeys,
            );
          for (const section of ["query", "body"])
            if (s[section])
              props[section] = object(
                Object.fromEntries(
                  Object.entries(s[section]).map(([k, v]) => [
                    k,
                    simpleSchema(v),
                  ]),
                ),
              );
          if (s.risk === "destructive")
            props.confirmation = { type: "string", enum: ["RHVIDEO:" + name] };
          action(
            "remote." + name,
            object(props, [
              ...(pathKeys.length ? ["params"] : []),
              ...(s.risk === "destructive" ? ["confirmation"] : []),
            ]),
            async (args) => {
              const wanted = args.expectedGeneration ?? state.generation;
              const version = await ensure();
              if (version !== epoch || wanted !== state.generation)
                throw Error("媒体账户已改变，操作未执行，请核对当前账户");
              const { expectedGeneration, ...operationArgs } = args;
              const result = await native("operation", {
                name,
                ...operationArgs,
              });
              if (version !== epoch)
                throw Error(
                  "媒体账户已更改，已丢弃旧响应；写操作可能已完成，请在原服务器核对，不会自动重试",
                );
              if (s.risk === "write" || s.risk === "destructive") {
                invalidateCatalog();
                gallery.loaded = false;
                const scope = mutations;
                scope.catalog ||= !!s.invalidatesCatalog;
                scope.server ||= !!$("wb-server")?.open;
                await flushWrites(scope);
                if (
                  scope.refreshError &&
                  result &&
                  typeof result === "object" &&
                  !Array.isArray(result)
                )
                  return { ...result, clientWarning: scope.refreshError };
              }
              return result;
            },
            s.risk || "read",
          );
        }
        return spec;
      });
      action(
        "catalog.resource",
        object(
          {
            kind: { type: "string", enum: ["video", "picture", "novel"] },
            refresh: { type: "boolean" },
          },
          ["kind"],
        ),
        async (args) => {
          await ensure();
          return native("catalog.resource", args);
        },
        "read",
      );
      action(
        "capabilities",
        object(),
        async () => ({
          contractVersion: (await manifest).version,
          resolutions: resolutions.info(),
          operations: Object.keys((await manifest).operations).filter(
            (n) => !awaitSpec(n)?.internal,
          ),
          nativeVideo: true,
        }),
        "read",
      );
      let cachedSpec;
      manifest.then((v) => (cachedSpec = v));
      function awaitSpec(name) {
        return cachedSpec?.operations[name];
      }
      action(
        "panel.close",
        object(
          {
            id: {
              type: "string",
              enum: [
                "wb-settings",
                "wb-server",
                "wb-info",
                "wb-preview",
                "wb-confirm",
                "wb-gallery",
                "wb-viewer",
                "wb-image-preview",
                "wb-preview-results",
              ],
            },
          },
          ["id"],
        ),
        async ({ id }) => {
          if (id === "wb-viewer") stopViewer();
          if (id === "wb-confirm") pendingConfirmation = null;
          if (id === "wb-info") detailJob = null;
          if (id === "wb-preview") { preview.load++; preview.searchTicket++; }
          if (id === "wb-image-preview") { thumbnailTicket++; $(id)?.querySelector('img')?.removeAttribute('src'); }
          $(id)?.close();
          liveRefresh.configure(liveRefresh.enabled);
          if (viewer?.videoActive && viewerIsTop()) {
            await syncPresentation();
            if (viewer.running)
              await native("presentation.control", { command: "resume" });
          }
          if(id==="wb-viewer"&&!$("image-dialog").open)await invoke("preview.commit");
          return { closed: true };
        },
      );
      action(
        "sort",
        object({ value: { type: "string", enum: I.sorts } }, ["value"]),
        async ({ value }) => {
          prefs.sort = value;
          prefs.seed = 0;
          state.offset = 0;
          save();
          applyPreferences();
          return load();
        },
      );
      action(
        "selection.toggle",
        object(
          {
            id: string,
            kind: { type: "string", enum: ["video", "picture", "novel"] },
            enabled: { type: "boolean" },
          },
          ["id", "kind", "enabled"],
        ),
        ({ id, kind, enabled }) => {
          const key = kind + ":" + id;
          enabled ? selected.add(key) : selected.delete(key);
          paintCards();
          return { count: selected.size };
        },
      );
      action("order.shuffle", object(), async () => {
        prefs.seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
        state.offset = 0;
        save();
        return load();
      });
      action("order.restore", object(), async () => {
        prefs.seed = 0;
        state.offset = 0;
        save();
        return load();
      });
      action(
        "order.save",
        object({ name: { type: "string", minLength: 1, maxLength: 100 } }, [
          "name",
        ]),
        ({ name }) => {
          const orders = prefs.orders || {};
          if (!Object.hasOwn(orders, name) && Object.keys(orders).length >= 32)
            throw Error("最多保存 32 个浏览顺序");
          prefs.orders = {
            ...orders,
            [name]: {
              ...criteria(),
              seed: config().seed,
              offset: state.offset,
            },
          };
          save();
          return { saved: name };
        },
      );
      action(
        "order.restoreNamed",
        object({ name: { type: "string", maxLength: 100 } }, ["name"]),
        async ({ name }) => {
          const saved = prefs.orders?.[name];
          if (!saved) throw Error("没有这个浏览顺序");
          await invoke("category", { kind: saved.kind });
          state.search = saved.search || "";
          state.folder = saved.folder || "";
          state.offset = saved.offset || 0;
          $("search").value = state.search;
          $("folder").value = state.folder;
          prefs.seed = saved.seed;
          prefs.sort = saved.sort;
          prefs.rule = saved.rule;
          save();
          return load();
        },
      );
      action("order.open", object(), () => {
        const root = dialog("wb-settings", "浏览顺序");
        root.replaceChildren(
          button("随机排列", "order.shuffle"),
          button("还原默认顺序", "order.restore"),
        );
        const name = input("text", "", "wb-order-name");
        root.append(
          field("保存名称", name),
          button("保存当前顺序", "order.save", () => ({ name: name.value })),
        );
        for (const name of Object.keys(prefs.orders || {})) {
          const row = serverRow(name, "浏览顺序");
          row.append(
            button("恢复", "order.restoreNamed", { name }),
            button("移除", "order.delete", { name }),
          );
          root.append(row);
        }
        return { opened: true };
      });
      action(
        "order.delete",
        object({ name: { type: "string", minLength: 1, maxLength: 100 } }, [
          "name",
        ]),
        ({ name }) => {
          delete prefs.orders?.[name];
          save();
          return { removed: name };
        },
      );
      action("selection.clear", object(), () => {
        selected.clear();
        paintCards();
        return { count: 0 };
      });
      action("selection.page", object(), () => {
        for (const row of state.items) selected.add(I.key(row));
        paintCards();
        return { count: selected.size };
      });
      async function selectedItems() {
        const version = await ensure(),
          keys = [...selected],
          items = [];
        if (!keys.length) throw Error("请先选择媒体");
        for (const kind of ["video", "picture", "novel"]) {
          if (!keys.some((key) => key.startsWith(kind + ":"))) continue;
          await rawCatalog(kind);
          const result = await send("query", {
            kind,
            selected: keys,
            search: "",
            folder: "",
            rule: {},
            sort: "nameAsc",
            seed: 0,
            allKeys: true,
            offset: 0,
            limit: 1,
          });
          if (version !== epoch) throw Error("媒体账户已更改");
          items.push(...result.queue);
        }
        if (items.length !== keys.length)
          throw Error("部分所选媒体已不存在，请刷新并重新选择");
        return items;
      }
      action(
        "selection.snapshot",
        object(),
        async () => ({ items: await selectedItems() }),
        "read",
      );
      action(
        "selection.stage",
        object(),
        async () => {
          const version = epoch;
          const items = await selectedItems();
          if (version !== epoch) throw Error("媒体账户已改变，确认未创建");
          return beginConfirmation({ name: "trash.stage", batch: items });
        },
        "destructive",
      );
      action("selection.result", object(), () => lastBatch, "read");
      action("selection.markCurrent", object(), async () => {
        if(!$("wb-viewer")?.open&&imageSession?.loading)throw Error("图片正在切换，请稍候再标记");
        const item = $("wb-viewer")?.open
          ? viewer?.current
          : imageSession?.current;
        if (!item) throw Error("当前没有可标记的预览项目");
        const kind = item.kind === "frame" ? "video" : item.kind,
          id = item.kind === "frame" ? item.videoId : item.id;
        if (!["video", "picture", "novel"].includes(kind) || !id)
          throw Error("此预览没有源文件标识");
        const result=await invoke("preview.mark",{kind,id,title:item.title||id});
        notice(result.enabled?"已标记；关闭预览时移入 RHVideo 暂存区（非永久删除）":"已取消暂存标记",true);
        return result;
      });
      action("preview.mark",object({kind:{type:"string",enum:["video","picture","novel"]},id:string,title:string,enabled:{type:"boolean"}},["kind","id","title"]),args=>native("preview.mark",args));
      action("preview.pending",object(),()=>native("preview.pending"),"read");
      action("preview.commit",object(),()=>native("preview.commit"),"destructive");
      let previewRun=0;
      function showPreviewResult(result,explicit=false){
        if(!result?.run)return result;
        const newRun=previewRun!==result.run;previewRun=result.run;
        if(!explicit&&!newRun&&!$("wb-preview-results")?.open){if(!result.running)notice(`标记暂存已结束：${result.items.filter(i=>i.success).length} 成功，${result.items.filter(i=>!i.success).length} 失败`,true);return result;}
        const root=dialog("wb-preview-results",result.running?"正在处理暂存标记":"暂存标记处理结果");
        root.replaceChildren(el("p",`${result.completed} / ${result.total} · ${result.running?"正在处理":"已结束"}。失败项目不会自动再次提交。`));
        for(const item of result.items||[]){const row=serverRow(item.title||item.id,item.success?"已移入 RHVideo 暂存区":"失败："+item.error);root.append(row);}
        return result;
      }
      action("preview.state",object(),()=>native("preview.result"),"read");
      action("preview.result",object(),async()=>showPreviewResult(await native("preview.result"),true));
      function paintCards() {
        for (const card of $("media-grid").querySelectorAll(".media-card")) {
          const key = card.dataset.kind + ":" + card.dataset.id;
          let checkbox = card.querySelector(".wb-select");
          if (!checkbox) {
            checkbox = input("checkbox", "");
            checkbox.className = "wb-select";
            checkbox.setAttribute(
              "aria-label",
              "选择 " + card.querySelector(".card-title").textContent,
            );
            listen(
              checkbox,
              "change",
              () =>
                invoke("selection.toggle", {
                  id: card.dataset.id,
                  kind: card.dataset.kind,
                  enabled: checkbox.checked,
                }).catch(notice),
              "selection",
            );
            card.prepend(checkbox);
            card
              .querySelector(".card-actions")
              .prepend(
                button(
                  "更多",
                  "media.actions",
                  { id: card.dataset.id, kind: card.dataset.kind },
                  "text-button",
                ),
              );
          }
          checkbox.checked = selected.has(key);
          card.classList.toggle("selected", checkbox.checked);
        }
        $("wb-selection-count").textContent = selected.size
          ? "已选 " + selected.size + " 项"
          : "";
        if ($("wb-selection")) $("wb-selection").hidden = selected.size === 0;
      }
      action(
        "media.actions",
        object(
          {
            id: string,
            kind: { type: "string", enum: ["video", "picture", "novel"] },
          },
          ["id", "kind"],
        ),
        async (args) => {
          const content = dialog("wb-info", "媒体操作");
          content.replaceChildren();
          const media = state.items.find(
            (v) => v.id === args.id && v.kind === args.kind,
          );
          if (!media) throw Error("请刷新后重新选择");
          content.append(el("h3", media.title));
          if (media.kind === "video")
            content.append(
              button("播放", "media.open", {id:media.id,kind:"video"}),
              button("超压播放", "media.playLow", {id:media.id}),
              button("媒体信息", "media.info", { id: media.id }),
              button("原片替换预估", "replacement.estimate", { id: media.id }),
              button("重新处理", "remote.video.reprocess", {
                params: { id: media.id },
              }),
              button("在服务器打开文件", "remote.video.open", {
                params: { id: media.id },
              }),
              button("在服务器打开所在文件夹", "remote.video.folder", {
                params: { id: media.id },
              }),
            );
          if (media.kind === "novel")
            content.append(
              button("章节速览", "novel.preview", { id: media.id, offset: 0 }),
            );
          content.append(
            button(
              "删除源文件并暂存 30 天",
              "confirm.begin",
              { name: "trash.stage", params: args },
              "button destructive",
            ),
          );
          return { opened: true };
        },
      );
      action(
        "media.reveal",
        object({id:string,kind:{type:"string",enum:["video","picture","novel"]}},["id","kind"]),
        async ({id,kind})=>{
          const version=await ensure();
          await invoke("category",{kind});
          let result=await query({allKeys:true,offset:0,limit:1}),index=result.queue.findIndex(v=>v.id===id);
          if(index<0){prefs.rule={};save();result=await query({allKeys:true,offset:0,limit:1});index=result.queue.findIndex(v=>v.id===id);}
          if(version!==epoch)throw Error("媒体账户已改变");if(index<0)throw Error("源媒体已不在服务器清单中");
          state.offset=Math.floor(index/state.limit)*state.limit;await load();
          if(version!==epoch)return {stale:true};
          if($("image-dialog").open)await invoke("image.close");if($("wb-gallery")?.open)await invoke("panel.close",{id:"wb-gallery"});
          const card=[...$("media-grid").querySelectorAll('.media-card')].find(n=>n.dataset.id===id&&n.dataset.kind===kind);
          if(card){card.scrollIntoView({behavior:"smooth",block:"center"});card.classList.add("wb-revealed");setTimeout(()=>card.classList.remove("wb-revealed"),3000);}
          return {id,kind,offset:state.offset};
        },
      );
      action(
        "media.info",
        object({ id: string }, ["id"]),
        async ({ id }) => {
          const version = epoch;
          const data = await remote("video.info", { params: { id } });
          if (version !== epoch) throw Error("媒体账户已改变，已丢弃旧信息");
          const root = dialog("wb-info", "视频信息");
          root.replaceChildren(detail(data));
          return { info: data };
        },
        "read",
      );
      function detail(value) {
        const root = el("div", undefined, "wb-details");
        for (const [key, v] of Object.entries(value || {})) {
          const row = el("div", undefined, "wb-detail");
          row.append(
            el("span", key),
            typeof v === "object"
              ? el("pre", JSON.stringify(v, null, 2))
              : el("strong", String(v ?? "—")),
          );
          root.append(row);
        }
        return root;
      }
      action(
        "preferences.set",
        object(
          { key: { type: "string", enum: Object.keys(defaults) }, value: {} },
          ["key", "value"],
        ),
        async ({ key, value }) => {
          if (
            (typeof defaults[key] === "boolean" &&
              typeof value !== "boolean") ||
            (typeof defaults[key] === "number" &&
              (!Number.isFinite(value) || Math.abs(value) > 4294967295)) ||
            (typeof defaults[key] === "string" && typeof value !== "string")
          )
            throw Error("偏好参数无效");
          if (
            (key === "sort" && !I.sorts.includes(value)) ||
            (key === "lanes" && ![1, 2].includes(value)) ||
            (key === "readerTheme" &&
              !["day", "sepia", "night"].includes(value))
          )
            throw Error("设置选项无效");
          const bounds = {
            readerFont: [13, 40],
            readerLine: [1.2, 3],
            perVideo: [1, 100],
            gridCount: [0, 9],
            volume: [0, 100],
            stay: [0.1, 30],
            videoStay: [1, 300],
            min: [0, 30],
            max: [0, 30],
            ratio: [0, 1],
            segment: [1,300],
            scrollSpeed: [0, 1000],
            seed: [0, 4294967295],
          };
          if (bounds[key] && (value < bounds[key][0] || value > bounds[key][1]))
            throw Error("设置数值超出范围");
          if (
            (["perVideo", "gridCount", "readerFont", "volume"].includes(key) &&
              !Number.isSafeInteger(value)) ||
            (key === "rotation" && ![0, 90, 180, 270].includes(value))
          )
            throw Error("设置数值无效");
          if (key === "rule")
            await send("query", { ...criteria(), rule: value, limit: 1 });
          if(!ctx.mobile&&["segment","fullLength","loop","portraitOnly"].includes(key)){
            const current=await native("player.state");if(current.queue?.options?.mode==="segments")await native("player.options",{options:{[key]:value},expectedId:current.queue.id,expectedRevision:current.queue.revision});
            await native("playlist.settings",{mode:"segments",options:{[key]:value}});
          }
          prefs[key] = value;
          save();
          applyPreferences();
          if(key==="volume")await syncVolume();
          if (["perVideo", "mixPictures"].includes(key)) {
            gallery.loaded = false;
            if ($("wb-gallery")?.open) await loadGallery(true);
          }
          if (["rule", "sort", "mediaType", "seed"].includes(key)) {
            state.offset = 0;
            await load();
          }
          return { key, value };
        },
      );
      action(
        "preferences.state",
        object(),
        () => structuredClone(config()),
        "read",
      );
      action("volume.set",object({value:{type:"integer",minimum:0,maximum:100}},["value"]),({value})=>invoke("preferences.set",{key:"volume",value}));
      action("volume.state",object(),()=>({volume:config().volume}),"read");
      action(
        "preferences.flush",
        object(),
        async () => {
          const version = await ensure(),
            value = structuredClone(prefs);
          clearTimeout(saveTimer);
          const pending = saveChain
            .catch(() => {})
            .then(() => {
              if (version !== epoch) throw Error("媒体账户已更改");
              return native("preferences", { value });
            });
          saveChain = pending.catch(notice);
          return pending;
        },
        "write",
      );
      action("preferences.reset", object(), async () => {
        prefs = {};
        save();
        applyPreferences();
        return load();
      });
      action("settings.open", object(), () => {
        const root = dialog("wb-settings", "媒体库偏好");
        root.replaceChildren();
        const c = config();
        const groups = [
          [
            "浏览",
            [
              ["mediaType", "收藏类型", "all"],
              ["perVideo", "每个视频截图数", "number"],
              ["mixPictures", "截图库混入图片", "bool"],
              ["gridCount", "同屏视频数（0：按比例自动分组，1–9：手动）", "number"],
            ],
          ],
          [
            "分段连播",
            [
              ["fullLength", "播放全长", "bool"],
              ["segment", "分段秒数", "number"],
              ["portraitOnly", "仅竖屏视频", "bool"],
              ["loop", "循环当前视频 / 片段", "bool"],
              ["super", "同屏／自动放映使用低带宽版本", "bool"],
              ["rotation", "旋转角度", "number"],
              ["resume", "单视频自动续播", "bool"],
            ],
          ],
          [
            "连续浏览与放映",
            [
              ["vertical", "竖向长卷", "bool"],
              ["lanes", "列数", "number"],
              ["scrollSpeed", "每秒滚动像素", "number"],
              ["stay", "每张停留秒数", "number"],
              ["videoStay", "混合放映每段视频秒数", "number"],
              ["kenBurns", "缓慢缩放平移", "bool"],
              ["overlap", "重叠过渡", "bool"],
              ["ratio", "过渡时长比例", "number"],
              ["min", "过渡下限秒数", "number"],
              ["max", "过渡上限秒数", "number"],
            ],
          ],
          [
            "阅读",
            [
              ["readerFont", "字号", "number"],
              ["readerLine", "行距", "number"],
            ],
          ],
        ];
        for (const [title, fields] of groups) {
          root.append(el("h3", title));
          const grid = el("div", undefined, "wb-settings-grid");
          for (const [key, label, type] of fields) {
            let control;
            if (type === "all")
              control = select(
                [
                  ["", "全部"],
                  ["video", "视频"],
                  ["picture", "图片"],
                  ["novel", "小说"],
                ],
                "preferences.set",
                (value) => ({ key, value }),
                c[key],
              );
            else {
              control = input(type === "bool" ? "checkbox" : "number", c[key]);
              if (type === "bool") control.checked = c[key];
              if (type === "number") control.step = "any";
              listen(
                control,
                "change",
                () =>
                  invoke("preferences.set", {
                    key,
                    value:
                      type === "bool" ? control.checked : Number(control.value),
                  }).catch(notice),
                "settings." + key,
              );
            }
            grid.append(field(label, control));
          }
          root.append(grid);
        }
        root.append(
          button("快捷键", "shortcuts.open"),
          field(
            "阅读主题",
            select(
              [
                ["day", "日间"],
                ["sepia", "护眼"],
                ["night", "夜间"],
              ],
              "preferences.set",
              (value) => ({ key: "readerTheme", value }),
              c.readerTheme,
            ),
          ),
          button("重置当前账户偏好", "preferences.reset"),
        );
        return { opened: true };
      });
      const shortcutDefaults = {
        viewer: { next: "ArrowRight", previous: "ArrowLeft", toggle: "Space" },
        reader: { next: "Alt+ArrowRight", previous: "Alt+ArrowLeft" },
        image: { next: "ArrowRight", previous: "ArrowLeft" },
      };
      const shortcutSchema = {
        scope: { type: "string", enum: ["viewer", "reader", "image"] },
        command: { type: "string", enum: ["next", "previous", "toggle"] },
        combo: { type: "string", maxLength: 80 },
      };
      action(
        "shortcuts.set",
        object(shortcutSchema, ["scope", "command", "combo"]),
        ({ scope, command, combo }) => {
          if (!Object.hasOwn(shortcutDefaults[scope], command))
            throw Error("此界面不支持该快捷操作");
          if (
            !/^(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?(?:Meta\+)?(?:ArrowLeft|ArrowRight|Space|PageUp|PageDown|Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/.test(
              combo,
            )
          )
            throw Error("快捷键格式无效，例如 Alt+ArrowRight");
          const map = {
            ...shortcutDefaults[scope],
            ...prefs.shortcuts?.[scope],
          };
          if (
            Object.entries(map).some(
              ([key, value]) => key !== command && value === combo,
            )
          )
            throw Error("同一界面内已有这个快捷键");
          prefs.shortcuts = {
            ...(prefs.shortcuts || {}),
            [scope]: { ...map, [command]: combo },
          };
          save();
          return { scope, command, combo };
        },
      );
      action("shortcuts.reset", object(), () => {
        delete prefs.shortcuts;
        save();
        return { reset: true };
      });
      action("shortcuts.open", object(), () => {
        const root = dialog("wb-settings", "媒体快捷键");
        root.replaceChildren();
        for (const [scope, commands] of Object.entries(shortcutDefaults)) {
          root.append(
            el(
              "h3",
              {
                viewer: "连续浏览/放映",
                reader: "小说阅读",
                image: "图片查看",
              }[scope],
            ),
          );
          for (const [command, defaultCombo] of Object.entries(commands)) {
            const value = input(
              "text",
              prefs.shortcuts?.[scope]?.[command] || defaultCombo,
            );
            listen(
              value,
              "change",
              () =>
                invoke("shortcuts.set", {
                  scope,
                  command,
                  combo: value.value,
                }).catch(notice),
              "shortcut." + scope + "." + command,
            );
            root.append(
              field(
                { next: "下一项", previous: "上一项", toggle: "暂停/继续" }[
                  command
                ],
                value,
              ),
            );
          }
        }
        root.append(button("恢复媒体快捷键", "shortcuts.reset"));
        return { opened: true };
      });
      listen(
        document,
        "keydown",
        (event) => {
          if (
            event.defaultPrevented ||
            event.target.closest?.(
              "input,textarea,select,[contenteditable=true]",
            ) ||
            $("wb-settings")?.open ||
            $("wb-confirm")?.open
          )
            return;
          const scope = $("wb-viewer")?.open
            ? "viewer"
            : $("reader-dialog").open
              ? "reader"
              : $("image-dialog").open
                ? "image"
                : null;
          if (!scope) return;
          const combo =
            (event.ctrlKey ? "Ctrl+" : "") +
            (event.altKey ? "Alt+" : "") +
            (event.shiftKey ? "Shift+" : "") +
            (event.metaKey ? "Meta+" : "") +
            event.code;
          const bindings = {
            ...shortcutDefaults[scope],
            ...prefs.shortcuts?.[scope],
          };
          const command = Object.keys(bindings).find(
            (k) => bindings[k] === combo,
          );
          if (!command) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          const name =
            scope === "viewer"
              ? command === "toggle"
                ? "viewer.toggle"
                : "viewer.step"
              : scope === "reader"
                ? "reader.step"
                : "image.step";
          void invoke(
            name,
            command === "toggle"
              ? {}
              : { direction: command === "previous" ? -1 : 1 },
          ).catch(notice);
        },
        "keyboard",
      );
      action(
        "rules.apply",
        object({ rule: { type: "object" } }, ["rule"]),
        async ({ rule }) => {
          const result = await send("query", { ...criteria(), rule, limit: 1 });
          prefs.rule = rule;
          state.offset = 0;
          save();
          await load();
          return { total: result.total };
        },
      );
      action(
        "rules.save",
        object({ name: { type: "string", minLength: 1, maxLength: 100 } }, [
          "name",
        ]),
        ({ name }) => {
          prefs.savedRules = {
            ...(prefs.savedRules || {}),
            [name]: structuredClone(config().rule),
          };
          save();
          return { saved: true };
        },
      );
      action(
        "rules.restore",
        object({ name: { type: "string", maxLength: 100 } }, ["name"]),
        ({ name }) => {
          const rule = prefs.savedRules?.[name];
          if (!rule) throw Error("没有这个筛选规则");
          return invoke("rules.apply", { rule });
        },
      );
      action("rules.open", object(), () => {
        ruleMode = config().rule.mode || "and";
        const root = dialog("wb-settings", "标签规则");
        root.replaceChildren();
        const include = input(
            "text",
            config().rule.include?.join(",") || "",
            "wb-rule-include",
          ),
          exclude = input(
            "text",
            config().rule.exclude?.join(",") || "",
            "wb-rule-exclude",
          ),
          mode = select(
            [
              ["and", "同时满足 AND"],
              ["or", "任意满足 OR"],
            ],
            "rules.mode",
            (value) => ({ value }),
            config().rule.mode || "and",
          );
        const nested = el("textarea");
        nested.id = "wb-rule-json";
        nested.rows = 7;
        nested.value = JSON.stringify(config().rule, null, 2);
        root.append(
          field("组合方式", mode),
          field("包含标签（逗号分隔）", include),
          field("排除标签（逗号分隔）", exclude),
          button("应用标签", "rules.form"),
          field("嵌套分组（JSON）", nested),
          button("应用嵌套分组", "rules.json"),
        );
        const name = input("text", "", "wb-rule-name");
        root.append(
          field("规则名称", name),
          button("保存规则", "rules.save", () => ({ name: name.value })),
        );
        for (const name of Object.keys(prefs.savedRules || {})) {
          const row = serverRow(name, "标签规则");
          row.append(
            button("应用", "rules.restore", { name }),
            button("移除", "rules.delete", { name }),
          );
          root.append(row);
        }
        return { opened: true };
      });
      action(
        "rules.delete",
        object({ name: { type: "string", minLength: 1, maxLength: 100 } }, [
          "name",
        ]),
        ({ name }) => {
          delete prefs.savedRules?.[name];
          save();
          return { removed: name };
        },
      );
      let ruleMode = "and";
      action(
        "rules.mode",
        object({ value: { type: "string", enum: ["and", "or"] } }, ["value"]),
        ({ value }) => {
          ruleMode = value;
          return { mode: value };
        },
      );
      action("rules.form", object(), () =>
        invoke("rules.apply", {
          rule: {
            mode: $("wb-rule-json") ? ruleMode : config().rule.mode,
            include: $("wb-rule-include")
              .value.split(",")
              .map((v) => v.trim())
              .filter(Boolean),
            exclude: $("wb-rule-exclude")
              .value.split(",")
              .map((v) => v.trim())
              .filter(Boolean),
          },
        }),
      );
      action("rules.json", object(), () =>
        invoke("rules.apply", { rule: JSON.parse($("wb-rule-json").value) }),
      );
      let pendingConfirmation = null,
        lastBatch = null,
        activeBatch = null;
      action("selection.progress",object(),()=>activeBatch?{...activeBatch}: {running:false},"read");
      action("selection.stop",object({ticket:string},["ticket"]),({ticket})=>{if(!activeBatch?.running||activeBatch.ticket!==ticket)throw Error("批量提交已结束或目标已改变");activeBatch.stopping=true;return {...activeBatch};});
      function beginConfirmation(args) {
        if(args.batch&&activeBatch?.running)throw Error("已有批量提交正在执行");
        const ticket = crypto.randomUUID();
        pendingConfirmation = {
          ...args,
          ticket,
          account,
          epoch,
          generation: state.generation,
          step: 0,
          created: Date.now(),
        };
        const root = dialog("wb-confirm", "确认服务器操作");
        root.replaceChildren(
          el(
            "p",
            "此操作在 RHVideo 服务器执行，不是本机文件操作。请核对目标。",
          ),
          args.batch
            ? el(
                "p",
                "将删除源文件并暂存 30 天，共 " + args.batch.length + " 项。",
              )
            : detail(args),
        );
        if (args.batch)
          for (const item of args.batch.slice(0, 200))
            root.append(
              serverRow(item.title || item.id, item.kind + " · " + item.id),
            );
        if (args.batch?.length > 200)
          root.append(el("p", "完整名单可通过 selection.snapshot 接口导出。"));
        root.append(button("核对无误，继续", "confirm.advance", { ticket }));
        return {
          ticket,
          step: 0,
          ...(args.batch ? { count: args.batch.length } : {}),
        };
      }
      action(
        "confirm.begin",
        object(
          {
            name: string,
            params: { type: "object" },
            body: { type: "object" },
            expectedGeneration: { type: "integer", minimum: 0 },
          },
          ["name"],
        ),
        async (args) => {
          const wanted = args.expectedGeneration ?? state.generation,
            version = await ensure();
          const spec = (await manifest).operations[args.name];
          if (version !== epoch || wanted !== state.generation)
            throw Error("媒体账户已改变，确认未创建");
          if (!spec || spec.risk !== "destructive")
            throw Error("不支持的确认操作");
          return beginConfirmation(args);
        },
      );
      action(
        "confirm.advance",
        object({ ticket: string }, ["ticket"]),
        async ({ ticket }) => {
          const p = pendingConfirmation;
          if (
            !p ||
            p.ticket !== ticket ||
            p.account !== account ||
            p.epoch !== epoch ||
            Date.now() - p.created > 120000
          )
            throw Error("确认已失效，请重新发起");
          if (p.step === 0) {
            p.step = 1;
            const root = dialog("wb-confirm", "最后确认");
            root.append(
              el("p", "确认后立即提交。失败只显示结果，不会自动重试。"),
              button(
                "确认执行",
                "confirm.advance",
                { ticket },
                "button destructive",
              ),
            );
            return { step: 1 };
          }
          pendingConfirmation = null;
          $("wb-confirm").close();
          if (p.batch) {
            if(activeBatch?.running)throw Error("已有批量提交正在执行");
            const batch=activeBatch={ticket:p.ticket,running:true,stopping:false,total:p.batch.length,attempted:0};
            const results = [],
              root = dialog("wb-info", "批量暂存结果");
            root.dataset.batchTicket=p.ticket;
            const progress=()=>{if(root.dataset.batchTicket!==p.ticket||!$("wb-info").open)return;root.replaceChildren(el("p",(batch.stopping?"正在停止后续提交 · ":"正在提交 ")+results.length+" / "+p.batch.length),button("停止后续提交","selection.stop",{ticket:p.ticket}));};
            progress();
            try { await batchWrites(async () => {
              for (const item of p.batch) {
                if (batch.stopping || p.epoch !== epoch || p.account !== account) break;
                try {
                  await remote("trash.stage", {
                    params: { kind: item.kind, id: item.id },
                    confirmation: "RHVIDEO:trash.stage",
                    expectedGeneration: p.generation,
                  });
                  selected.delete(item.key || I.key(item));
                  results.push({
                    id: item.id,
                    kind: item.kind,
                    title: item.title,
                    state: "succeeded",
                  });
                } catch (error) {
                  results.push({
                    id: item.id,
                    kind: item.kind,
                    title: item.title,
                    state: "failed",
                    error: String(error.message || error),
                  });
                }
                if (p.epoch !== epoch) break;
                batch.attempted=results.length;progress();
              }
            }); } catch(error) {if(root.dataset.batchTicket===p.ticket)root.replaceChildren(el("p","批量提交失败："+String(error.message||error),"wb-error"));throw error;} finally { batch.running=false;root.querySelector('[data-api-action="rhvideo.selection.stop"]')?.remove();if(activeBatch===batch)activeBatch=null; }
            if (p.epoch !== epoch)
              throw Error("账户已更改，未提交的项目不会继续执行");
            lastBatch = {
              total: p.batch.length,
              results,
              succeeded: results.filter((v) => v.state === "succeeded").length,
              failed: results.filter((v) => v.state === "failed").length,
              notAttempted: p.batch.length - results.length,
              stopped: batch.stopping,
              ...(mutations.refreshError
                ? { clientWarning: mutations.refreshError }
                : {}),
            };
            if(root.dataset.batchTicket===p.ticket)root.replaceChildren(
              el(
                "p",
                "成功 " +
                  lastBatch.succeeded +
                  " 项，失败 " +
                  lastBatch.failed +
                  " 项。不会自动重试。",
              ),
              el("p","未提交 "+lastBatch.notAttempted+" 项"+(batch.stopping?"；已停止后续提交，当前已发送的请求未撤销。":"")),
            );
            for (const result of results)if(root.dataset.batchTicket===p.ticket)
              root.append(
                serverRow(
                  result.title || result.id,
                  result.state === "succeeded" ? "已暂存" : result.error,
                ),
              );
            if (lastBatch.clientWarning&&root.dataset.batchTicket===p.ticket)
              root.append(
                el(
                  "p",
                  "写入已完成，但刷新失败：" + lastBatch.clientWarning,
                  "wb-error",
                ),
              );
            return lastBatch;
          }
          const result = await remote(p.name, {
            ...(p.params ? { params: p.params } : {}),
            ...(p.body ? { body: p.body } : {}),
            confirmation: "RHVIDEO:" + p.name,
            expectedGeneration: p.generation,
          });
          notice(
            result?.clientWarning
              ? "服务器操作已完成，但刷新失败：" + result.clientWarning
              : "服务器操作已完成",
            !result?.clientWarning,
          );
          return result;
        },
        "destructive",
      );
      // Server tools share the same registered operation handlers as CLI callers.
      const server = {
        page: "watch",
        queue: "default",
        view: "running",
        pageNumber: 1,
        q: "",
        days: 7,
        status: "all",
        load: 0,
      };
      function liveTarget() {
        if (
          document.hidden ||
          !state.connected ||
          document.activeElement?.matches("input,select,textarea") ||
          ["reader-dialog", "image-dialog", "timeline-dialog"].some(
            (id) => $(id)?.open,
          )
        )
          return null;
        const top = ctx.modalTop();
        if (top === "wb-info" && detailJob) return detailJob;
        return top === "wb-server" ? { type: "server" } : null;
      }
      function hasLiveWork(value) {
        if (!value || typeof value !== "object") return false;
        if (Array.isArray(value)) return value.some(hasLiveWork);
        return (
          value.scanning === true ||
          value.live === true ||
          ["running", "processing", "pending", "queued", "scanning"].includes(
            value.status,
          ) ||
          Number(value.counts?.running || 0) +
            Number(value.counts?.queued || 0) >
            0 ||
          ["items", "folders", "restart"].some((key) => hasLiveWork(value[key]))
        );
      }
      liveRefresh = new RHVideoRefresh.Loop({
        visible: () => !!liveTarget(),
        run: () => invoke("server.liveRefresh"),
        changed: (value) => {
          for (const node of document.querySelectorAll(".wb-live-status"))
            node.textContent = value.error
              ? "自动刷新失败（" +
                value.failures +
                "/3）：" +
                value.error +
                (value.failures >= 3
                  ? "。已停止，请手动刷新。"
                  : "。稍后仅重读状态。")
              : value.enabled
                ? value.paused
                  ? "自动刷新已暂停"
                  : "进度自动更新中"
                : "状态已更新";
        },
      });
      action(
        "server.refreshState",
        object(),
        () => liveRefresh.state(),
        "read",
      );
      action(
        "server.liveRefresh",
        object(),
        async () => {
          const target = liveTarget(),
            version = epoch;
          if (!target) return liveRefresh.enabled;
          if (target.type === "server") return renderServer(true);
          const value = await remote(
            target.type === "task" ? "tasks.detail" : "batches.detail",
            {
              params:
                target.type === "task"
                  ? { queue: target.kind, entry: target.id }
                  : { id: target.id },
            },
          );
          if (version !== epoch || detailJob !== target || !$("wb-info")?.open)
            return false;
          const root = $("wb-info").querySelector(".wb-content");
          if (target.type === "task") paintTaskDetail(root, value);
          else root.replaceChildren(detail(value));
          root.append(
            el("p", "", "wb-live-status"),
            button(
              "刷新",
              target.type === "task" ? "task.detail" : "batch.detail",
              target.type === "task"
                ? { kind: target.kind, id: target.id }
                : { id: target.id },
            ),
          );
          return hasLiveWork(value);
        },
        "read",
      );
      action(
        "server.open",
        object(
          {
            page: {
              type: "string",
              enum: [
                "watch",
                "tasks",
                "replacement",
                "trash",
                "storage",
                "system",
              ],
            },
          },
          ["page"],
        ),
        async ({ page }) => {
          server.page = page;
          server.pageNumber = 1;
          await renderServer();
          liveRefresh.configure(server.live, true);
          return { page };
        },
      );
      action(
        "server.filter",
        object(
          {
            key: {
              type: "string",
              enum: ["queue", "view", "q", "days", "status", "pageNumber"],
            },
            value: {},
          },
          ["key", "value"],
        ),
        async ({ key, value }) => {
          server[key] = value;
          if (key !== "pageNumber") server.pageNumber = 1;
          await renderServer();
          liveRefresh.configure(server.live, true);
          return { ...server };
        },
      );
      action(
        "server.refresh",
        object(),
        async () => {
          await renderServer();
          liveRefresh.configure(server.live, true);
          return { refreshed: true };
        },
        "read",
      );
      action(
        "watch.add",
        object({ path: { type: "string", maxLength: 8192 } }, ["path"]),
        async ({ path }) => {
          const result = await remote("watch.add", { body: { path } });
          return result;
        },
        "write",
      );
      async function renderServer(background = false) {
        await ensure();
        if (background && liveTarget()?.type !== "server")
          return liveRefresh.enabled;
        const token = ++server.load,
          target = background
            ? $("wb-server").querySelector(".wb-content")
            : dialog("wb-server", "服务器管理"),
          root = background ? el("section") : target;
        if (!background) root.replaceChildren();
        let active = false;
        const nav = el("nav", undefined, "wb-tabs");
        for (const [page, title] of [
          ["watch", "监控目录"],
          ["tasks", "处理队列"],
          ["replacement", "原片替换"],
          ["trash", "暂存区"],
          ["storage", "存储"],
          ["system", "服务"],
        ])
          nav.append(
            button(
              title,
              "server.open",
              { page },
              "button " + (page === server.page ? "primary" : "secondary"),
            ),
          );
        root.append(nav, button("刷新", "server.refresh"));
        const body = el("div", undefined, "wb-server-body");
        root.append(body);
        body.textContent = "正在读取…";
        try {
          const page = server.page;
          if (page === "watch") {
            const data = await remote("watch.list");
            active = hasLiveWork(data);
            if (token !== server.load) return;
            body.replaceChildren();
            const path = input("text", "", "wb-watch-path");
            path.placeholder = "服务器上的目录路径";
            body.append(
              field("添加监控目录", path),
              button("添加", "watch.add", () => ({ path: path.value })),
            );
            for (const w of data.folders || []) {
              const row = serverRow(w.path, w.enabled ? "监控中" : "已暂停");
              row.append(
                button(w.enabled ? "暂停" : "启用", "remote.watch.update", {
                  params: { id: w.id },
                  body: { enabled: !w.enabled },
                }),
                button("立即扫描", "remote.watch.scan", {
                  params: { id: w.id },
                }),
                button("移除监控", "confirm.begin", {
                  name: "watch.remove",
                  params: { id: w.id },
                }),
              );
              row.append(
                detail({ last_scan_at: w.last_scan_at, ...w.last_scan_result }),
              );
              body.append(row);
            }
            body.append(
              detail(
                Object.fromEntries(
                  Object.entries(data).filter(([k]) => k !== "folders"),
                ),
              ),
            );
          } else if (page === "tasks" || page === "replacement") {
            const kind = page === "replacement" ? "replacement" : server.queue,
              view =
                kind === "replacement" && server.view === "failed"
                  ? "history"
                  : server.view;
            const filters = el("div", undefined, "wb-filters");
            filters.append(
              select(
                [
                  ["default", "默认处理"],
                  ["replacement", "原片替换"],
                ],
                "server.filter",
                (value) => ({ key: "queue", value }),
                kind,
              ),
              select(
                [
                  ["running", "运行中"],
                  ["queued", "排队中"],
                  ...(kind === "default" ? [["failed", "失败"]] : []),
                  ["history", "历史"],
                ],
                "server.filter",
                (value) => ({ key: "view", value }),
                view,
              ),
            );
            const q = input("search", server.q);
            q.placeholder = "搜索文件名";
            listen(
              q,
              "change",
              () =>
                invoke("server.filter", { key: "q", value: q.value }).catch(
                  notice,
                ),
              "tasks.search",
            );
            filters.append(
              q,
              select(
                [
                  ["7", "7 天"],
                  ["30", "30 天"],
                  ["90", "90 天"],
                  ["0", "全部时间"],
                ],
                "server.filter",
                (value) => ({ key: "days", value: Number(value) }),
                server.days,
              ),
              select(
                [
                  ["all", "所有结果"],
                  ["succeeded", "成功"],
                  ["issues", "失败/中断"],
                  ["skipped", "跳过"],
                  ["cancelled", "已停止"],
                ],
                "server.filter",
                (value) => ({ key: "status", value }),
                server.status,
              ),
            );
            const data = await remote("tasks.list", {
              query: {
                kind,
                view,
                page: server.pageNumber,
                limit: 25,
                days: server.days,
                status: server.status,
                q: server.q,
              },
            });
            active = hasLiveWork(data);
            if (token !== server.load) return;
            body.replaceChildren(filters, detail(data.counts || {}));
            for (const t of data.items || []) {
              const row = serverRow(t.filename, t.status);
              row.append(
                el("p", t.message || ""),
                button("处理步骤与进度", "task.detail", { kind, id: t.id }),
              );
              body.append(row);
            }
            body.append(
              button("上一页", "server.filter", {
                key: "pageNumber",
                value: Math.max(1, data.page - 1),
              }),
              el("span", data.page + " / " + data.pages),
              button("下一页", "server.filter", {
                key: "pageNumber",
                value: Math.min(data.pages, data.page + 1),
              }),
            );
            if (page === "replacement") {
              const batches = await remote("batches.list", {
                query: { limit: 20 },
              });
              if (token !== server.load) return;
              active ||= hasLiveWork(batches);
              for (const batch of Array.isArray(batches)
                ? batches
                : batches.items || []) {
                const row = serverRow(batch.id, batch.status);
                row.append(
                  button("批次详情", "batch.detail", { id: batch.id }),
                  button("停止剩余项目", "remote.batches.stop", {
                    params: { id: batch.id },
                  }),
                );
                body.append(row);
              }
            }
          } else if (page === "trash") {
            const data = await remote("trash.list");
            if (token !== server.load) return;
            body.replaceChildren(
              el(
                "p",
                "源文件暂存 " + data.retention_days + " 天，到期后才能清理。",
              ),
            );
            for (const t of data.items || []) {
              const row = serverRow(t.filename, t.media_type);
              row.append(
                el("p", "到期：" + new Date(t.expires_at).toLocaleString()),
                button("恢复", "remote.trash.restore", {
                  params: { kind: t.media_type, id: t.id },
                }),
              );
              if (t.preview_url)
                row.append(
                  button("预览", "trash.preview", {
                    path: t.preview_url,
                    title: t.filename,
                  }),
                );
              body.append(row);
            }
            body.append(
              button("清理已过期项目", "confirm.begin", {
                name: "trash.expired",
              }),
            );
          } else if (page === "storage") {
            const values = await Promise.allSettled([
              remote("storage.usage"),
              remote("storage.folders"),
              remote("storage.savings"),
            ]);
            active = values.some(
              (v) => v.status === "fulfilled" && hasLiveWork(v.value),
            );
            if (token !== server.load) return;
            body.replaceChildren();
            for (let i = 0; i < values.length; i++) {
              body.append(
                el("h3", ["全库占用", "监控目录占用", "原片替换节省"][i]),
              );
              if (values[i].status === "rejected")
                body.append(el("p", String(values[i].reason)));
              else body.append(detail(values[i].value));
            }
            body.append(
              button("重新统计全库", "storage.rescan", { scope: "library" }),
              button("重新统计监控目录", "storage.rescan", { scope: "watch" }),
            );
          } else {
            const values = await Promise.allSettled([
              remote("system.health"),
              remote("system.config"),
              remote("system.restartState"),
            ]);
            active = values.some(
              (v) => v.status === "fulfilled" && hasLiveWork(v.value),
            );
            if (token !== server.load) return;
            body.replaceChildren();
            for (const v of values)
              body.append(
                v.status === "fulfilled"
                  ? detail(v.value)
                  : el("p", String(v.reason)),
              );
            const status =
              values[2].status === "fulfilled" ? values[2].value : {};
            if (status.can_manage && status.supported) {
              body.append(
                button("立即重启服务器", "confirm.begin", {
                  name: "system.restart",
                  body: { mode: "immediate", request_id: crypto.randomUUID() },
                }),
                button("处理完队列后重启", "confirm.begin", {
                  name: "system.restart",
                  body: { mode: "all", request_id: crypto.randomUUID() },
                }),
              );
              if (status.restart?.id && status.restart.can_cancel)
                body.append(
                  button("取消重启计划", "remote.system.cancelRestart", {
                    params: { id: status.restart.id },
                  }),
                );
            }
            body.append(
              button("预览缺失源文件", "cleanup.preview"),
              button("清理多余关键帧", "confirm.begin", {
                name: "frames.cleanup",
              }),
            );
          }
          if (token !== server.load) return false;
          server.live = active;
          root.append(el("p", "", "wb-live-status"));
          if (background) {
            if (liveTarget()?.type !== "server") return active;
            const scroll = target.scrollTop;
            target.replaceChildren(...root.childNodes);
            target.scrollTop = scroll;
          }
          return active;
        } catch (error) {
          if (token === server.load && !background)
            body.replaceChildren(
              el("p", String(error.message || error), "wb-error"),
            );
          throw error;
        }
      }
      function serverRow(title, badge) {
        const row = el("section", undefined, "wb-row");
        const header = el("header");
        header.append(el("strong", title), el("span", badge || "", "wb-badge"));
        row.append(header);
        return row;
      }
      action(
        "storage.rescan",
        object({ scope: { type: "string", enum: ["library", "watch"] } }, [
          "scope",
        ]),
        async ({ scope }) => {
          const result = await remote(
            scope === "library" ? "storage.usage" : "storage.folders",
            { query: { force: true } },
          );
          if ($("wb-server")?.open && server.page === "storage") {
            await renderServer();
            liveRefresh.configure(server.live, true);
          }
          return result;
        },
        "read",
      );
      function paintTaskDetail(root, t) {
        root.replaceChildren();
        if (typeof t.video_id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(t.video_id)) {
          const path="/api/v1/videos/"+t.video_id+"/thumbnail", title=t.filename||"任务缩略图";
          const previewButton=button("放大缩略图", "image.preview", {path,title}, "wb-thumbnail-preview");
          const image=el("img");image.alt=title;previewButton.prepend(image);root.append(previewButton);
          const version=epoch;
          void native("images",{paths:[path]}).then(([url])=>{if(version===epoch&&image.isConnected)image.src=url;}).catch(notice);
        }
        if (t.progress) {
          const p = el("progress");
          p.max = 100;
          p.value = Number(t.progress.percent || 0);
          root.append(p, detail(t.progress));
        }
        for (const step of t.steps || [])
          root.append(
            serverRow(step.label || step.title || step.key, step.status),
            detail(step),
          );
        root.append(
          detail(
            Object.fromEntries(
              Object.entries(t).filter(
                ([key]) => !["steps", "progress"].includes(key),
              ),
            ),
          ),
        );
      }
      action(
        "task.detail",
        object(
          {
            kind: { type: "string", enum: ["default", "replacement"] },
            id: string,
          },
          ["kind", "id"],
        ),
        async ({ kind, id }) => {
          const root = dialog("wb-info", "任务详情"),
            job = { type: "task", kind, id };
          detailJob = job;
          root.textContent = "正在读取…";
          const t = await remote("tasks.detail", {
            params: { queue: kind, entry: id },
          });
          if (detailJob !== job || !$("wb-info").open) return { stale: true };
          paintTaskDetail(root, t);
          root.append(
            el("p", "", "wb-live-status"),
            button("刷新", "task.detail", { kind, id }),
          );
          liveRefresh.configure(hasLiveWork(t), true);
          return t;
        },
        "read",
      );
      action(
        "batch.detail",
        object({ id: string }, ["id"]),
        async ({ id }) => {
          const root = dialog("wb-info", "替换批次"),
            job = { type: "batch", id };
          detailJob = job;
          root.textContent = "正在读取…";
          const data = await remote("batches.detail", { params: { id } });
          if (detailJob !== job || !$("wb-info").open) return { stale: true };
          root.replaceChildren(
            detail(data),
            el("p", "", "wb-live-status"),
            button("刷新", "batch.detail", { id }),
          );
          liveRefresh.configure(hasLiveWork(data), true);
          return data;
        },
        "read",
      );
      action(
        "cleanup.preview",
        object(),
        async () => {
          const version = epoch;
          const data = await remote("cleanup.preview");
          if (version !== epoch) throw Error("媒体账户已改变，已丢弃旧预览");
          const root = dialog("wb-info", "清理缺失源预览");
          root.replaceChildren(
            el("p", "仅清理服务器确认源文件已不存在的媒体记录和生成产物。"),
            detail(data),
            button("核对并进入清理确认", "confirm.begin", {
              name: "cleanup.execute",
            }),
          );
          return data;
        },
        "read",
      );
      action(
        "replacement.estimate",
        object({ id: string }, ["id"]),
        async ({ id }) => {
          const root = dialog("wb-info", "原片替换");
          root.replaceChildren();
          const resolution = input("text", "1280x720", "wb-replace-resolution"),
            crf = input("number", 30, "wb-replace-crf");
          root.append(
            field("最大分辨率（留空保持原分辨率）", resolution),
            field("CRF（18–38）", crf),
            button("采样预估，不写入源文件", "replacement.sample", () => ({
              id,
              resolution: resolution.value,
              crf: Number(crf.value),
            })),
            button("提交这个视频", "replacement.submit", () => ({
              ids: [id],
              resolution: resolution.value,
              crf: Number(crf.value),
            })),
            button("提交已选视频", "replacement.selected", () => ({
              resolution: resolution.value,
              crf: Number(crf.value),
            })),
            el("div", undefined, "wb-estimate"),
          );
          return { opened: true };
        },
      );
      const replacementParams = {
        resolution: { type: "string", maxLength: 20 },
        crf: { type: "integer", minimum: 18, maximum: 38 },
      };
      action(
        "replacement.sample",
        object({ id: string, ...replacementParams }, [
          "id",
          "resolution",
          "crf",
        ]),
        async ({ id, resolution, crf }) => {
          const result = await remote("video.estimate", {
            params: { id },
            body: { max_resolution: resolution, crf },
          });
          $("wb-info")
            .querySelector(".wb-estimate")
            .replaceChildren(detail(result));
          return result;
        },
        "read",
      );
      action(
        "replacement.submit",
        object(
          {
            ids: { type: "array", minItems: 1, maxItems: 1000, items: string },
            ...replacementParams,
          },
          ["ids", "resolution", "crf"],
        ),
        ({ ids, resolution, crf }) =>
          invoke("confirm.begin", {
            name: "batches.create",
            body: {
              video_ids: ids,
              max_resolution: resolution,
              crf,
              request_id: crypto.randomUUID(),
            },
          }),
      );
      action(
        "replacement.selected",
        object(replacementParams, ["resolution", "crf"]),
        (args) =>
          invoke("replacement.submit", {
            ...args,
            ids: [...selected]
              .filter((k) => k.startsWith("video:"))
              .map((k) => k.slice(6)),
          }),
      );
      action(
        "selection.export",
        object(),
        async () => {
          const version = epoch;
          const items = await selectedItems();
          if (version !== epoch) throw Error("媒体账户已改变，导出未开始");
          const text = I.exportText(items);
          if (ctx.mobile && text.length > 64000) {
            const ticket = crypto.randomUUID();
            for (
              let offset = 0, index = 0;
              offset < text.length;
              offset += 64000, index++
            ) {
              if (version !== epoch) throw Error("媒体账户已更改");
              await native("export.chunk", {
                ticket,
                index,
                reset: index === 0,
                text: text.slice(offset, offset + 64000),
              });
            }
            return native("export.finish", { ticket });
          }
          return native("export", {
            name: "RHVideo-selection.json",
            text,
          });
        },
        "write",
      );
      // Direct playback means the clicked video, exactly as playVideoLocal in
      // RHVideo. Selection/portrait/segment rules only belong to explicit queues.
      async function play(media,low=false) {
        const c=config(),version=epoch;
        const title=media.title+(low?" (超压)":"");
        let parent={};
        {
          // playVideoLocal also pushes the first matching gallery screenshot.
          // Load metadata only: do not flash a gallery or decode its thumbnails
          // merely because a video card was clicked.
          try{
            if(!gallery.loaded)await loadGallery(false,false);
            const args={kind:"gallery",search:state.search,rule:c.rule,sort:c.sort,seed:gallery.seed,allKeys:true,offset:0,limit:1};
            const result=await send("query",args),index=result.queue.findIndex(f=>f.videoId===media.id);
            if(index>=0){imageSession={args,index,total:result.total,current:result.queue[index],previewId:crypto.randomUUID(),playbackId:crypto.randomUUID()};parent={origin:"frame",deferPreviewCommit:true,parentKey:I.key(imageSession.current),parentPreview:imageSession.previewId,parentPlayback:imageSession.playbackId,parentTotal:result.total};}
          }catch(error){if(version===epoch)notice("截图队列不可用，视频仍可单独播放："+String(error));}
        }
        if(version!==epoch)throw Error("媒体账户已更改，播放未开始");
        const ticket=await prepareQueue([{...media,title}],{fullLength:true,super:low,rotation:c.rotation,...parent});
        return native("play",{id:media.id,title,playlist:ticket,super:low,resume:c.resume});
      }
      action("media.playLow",object({id:string},["id"]),({id})=>{const item=state.items.find(v=>v.id===id&&v.kind==="video");if(!item)throw Error("视频已不在当前清单，请刷新");return play(item,true);},"external");
      // Explicit playlists retain the full filtering/order snapshot, not just
      // the current card page. Never silently substitute a clicked item's ID.
      async function startPlaylist(mode="segments") {
        const version=epoch,c=config(),sequential=mode!=="segments",low=mode==="sequential-super",P=RHVideoModel.playback;
        if(sequential&&selected.size)throw Error("请先退出多选，再按当前列表顺序连播");
        const saved=await native("playlist.state",{mode});
        const initial=P.initial(mode,saved,c),{portraitOnly,fullLength,segment}=initial;
        const result=await query({kind:"video",mediaType:"video",allKeys:true,portraitOnly:false,selected:[],offset:0,limit:1});
        let ids;
        if(sequential)ids=P.listIds(result.queue);
        else{
          if(!gallery.loaded)await loadGallery();
          const frames=await send("query",{kind:"gallery",search:state.search,rule:c.rule,sort:c.sort,seed:gallery.seed,offset:0,limit:1,allKeys:true});
          const anchor=prefs.galleryResume?.mediaKey,at=anchor?frames.queue.findIndex(f=>f.key===anchor):-1;
          ids=P.galleryIds(frames.queue,at>=0?at:gallery.offset);
        }
        // Metadata is resolved in the worker once, not by fetching each video.
        const all=await send("query",{kind:"video",sort:"nameAsc",allKeys:true,offset:0,limit:1});
        const portraitIds=new Set(all.queue.filter(v=>['ready','processing'].includes(v.status)&&P.portrait(v.resolution)).map(v=>v.id));
        const visibleIds=portraitOnly?ids.filter(id=>portraitIds.has(id)):ids;
        if(visibleIds.length<(portraitOnly?2:sequential?1:2))throw Error(portraitOnly?"竖屏视频不足 2 个，无法连播":sequential?"当前列表没有可播放的视频":"需要至少 2 个视频才能分段连播");
        const signature=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(visibleIds))))).map(b=>b.toString(16).padStart(2,"0")).join("");
        if(version!==epoch)throw Error("媒体账户已更改，播放未开始");
        const entries=P.entries(ids,all.queue,{segment,fullLength,super:low});
        const index=saved?.signature===signature?Math.max(0,Math.min(visibleIds.length-1,saved.index||0)):0,current=entries.find(e=>e.id===visibleIds[index]);
        const ticket = await prepareQueue(entries, {
          reference:true,mode,signature,closeAtEnd:true,
          super:low,loop:initial.loop,rate:initial.rate,
          fullLength,segment,portraitOnly,rotation:c.rotation,
        });
        return native("play", {
          id: current.id,
          title: current.title,
          playlist: ticket,
          super:low,
          resume:false,
        });
      }
      async function prepareQueue(queue, options = {}) {
        const ticket = crypto.randomUUID(),
          version = epoch;
        for (let offset = 0; offset < queue.length; offset += 200) {
          if (version !== epoch) throw Error("媒体账户已更改");
          await native("playlist.prepare", {
            ticket,
            reset: offset === 0,
            items: queue.slice(offset, offset + 200),
            options,
          });
        }
        return ticket;
      }
      action(
        "playback.history",
        object(),
        async () => {
          const version = epoch;
          const data = await native("playback.history");
          if (version !== epoch) throw Error("媒体账户已改变，已丢弃旧记录");
          const root = dialog("wb-info", "播放记录");
          root.replaceChildren();
          for (const [id, item] of Object.entries(data).sort(
            (a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0),
          )) {
            const row = serverRow(
              item.title || id,
              Math.floor(item.seconds || 0) + " 秒",
            );
            row.append(button("继续播放", "playback.resume", { id }));
            root.append(row);
          }
          root.append(button("清除当前账户播放记录", "playback.clear"));
          return { items: data };
        },
        "read",
      );
      action(
        "playback.resume",
        object({ id: string }, ["id"]),
        async ({ id }) => {
          const version = epoch;
          const data = await native("playback.history"),
            item = data[id];
          if (version !== epoch) throw Error("媒体账户已改变，播放未开始");
          if (!item) throw Error("播放记录不存在");
          return native("play", { id, title: item.title || id, resume: true });
        },
        "external",
      );
      action(
        "playback.clear",
        object(),
        () => native("playback.clear"),
        "write",
      );
      action(
        "playlist.start",
        object(),
        ()=>startPlaylist("segments"),
        "external",
      );
      action("playlist.sequential",object({super:{type:"boolean"}}),({super:low=false})=>startPlaylist(low?"sequential-super":"sequential"),"external");
      action(
        "grid.open",
        object(),
        async () => {
          const version=epoch,c=config();if(!gallery.loaded)await loadGallery(false,false);
          const frames=await send("query",{kind:"gallery",search:state.search,rule:c.rule,sort:c.sort,seed:gallery.seed,allKeys:true,offset:0,limit:1});
          const videos=await send("query",{kind:"video",sort:"nameAsc",allKeys:true,offset:0,limit:1});
          const entries=RHVideoModel.grid.entries(frames.queue,videos.queue);if(entries.length<2)throw Error("需要至少 2 个图库视频才能同屏播放");
          if(version!==epoch)throw Error("媒体账户已改变，未开始同屏播放");
          const count=Math.max(0,Math.min(9,c.gridCount)),ticket=await prepareQueue(RHVideoModel.grid.plan(entries,count),{grid:true});
          const result=await native("grid.open", {
            playlist: ticket,
            count:count||4,
            super:c.super,
          });
          if(result.clientWarning)notice(result.clientWarning);
          return result;
        },
        "external",
      );
      action(
        "grid.page",
        object({ direction: { type: "integer", enum: [-1, 1] } }, [
          "direction",
        ]),
        (args) => native("grid.page", args),
        "external",
      );
      action("grid.state", object(), () => native("grid.state"), "read");
      action("grid.seekGroup",object({ratio:{type:"number",minimum:0,maximum:1}},["ratio"]),args=>native("grid.seekGroup",args));
      action("grid.close", object(), () => native("grid.close"));
      if(!ctx.mobile)for(const name of ['favorite','mark'])action('grid.'+name,object({target:{type:'integer',minimum:0,maximum:8}},['target']),args=>native('grid.'+name,args),'write');
      action("player.close", object(), () => native("player.close"));
      action(
        "grid.control",
        object(
          {
            target: { type: "integer", minimum: -1, maximum: 8 },
            command: {
              type: "string",
              enum: ["pause", "resume", "seek", "volume", "mute", "rate", "rotate"],
            },
            value: { type: "number" },
          },
          ["target", "command"],
        ),
        (args) => native("grid.control", args),
      );
      action(
        "grid.expand",
        object({ target: { type: "integer", minimum: -1, maximum: 8 } }, [
          "target",
        ]),
        (args) => native("grid.expand", args),
      );
      if (ctx.mobile) {
        action(
          "grid.target",
          object({ index: { type: "integer", minimum: -1, maximum: 8 } }, [
            "index",
          ]),
          ({ index }) =>
            native("grid.control", { target: index, command: "target" }),
        );
        action("player.state", object(), () => native("player.state"), "read");
        action("player.seekQueue",object({ratio:{type:"number",minimum:0,maximum:1}},["ratio"]),({ratio})=>native("player.control",{command:"seekQueue",value:ratio}));
        action("player.options",object({fullLength:{type:"boolean"},portraitOnly:{type:"boolean"},segment:{type:"number",minimum:1,maximum:300},loop:{type:"boolean"},rate:{type:"number",minimum:.25,maximum:4}}),args=>native("player.control",{command:"playlist.options",options:args}));
        const inputGuard={expectedInputId:{type:"integer",minimum:0}};
        action("player.back",object(inputGuard),args=>native("player.control",{command:"back",...args}));
        action("player.favorite",object(inputGuard),args=>native("player.control",{command:"favorite",...args}),"write");
        action("player.mark",object({...inputGuard,enabled:{type:"boolean"}}),args=>native("player.control",{command:"mark",...args}));
        action(
          "player.control",
          object(
            {
              command: {
                type: "string",
                enum: [
                  "pause",
                  "resume",
                  "next",
                  "previous",
                  "seek",
                  "volume",
                  "rate",
                  "rotate",
                  "repeat",
                  "fullscreen",
                  "fit",
                  "fill",
                  "controls.show",
                  "controls.hide",
                  "options",
                ],
              },
              value: { type: "number" },
              enabled: { type: "boolean" },
              ...inputGuard,
            },
            ["command"],
          ),
          (args) => native("player.control", args),
        );
        for (const name of ["next", "previous"])
          action("player." + name, object(), () =>
            native("player.control", { command: name }),
          );
      }
      async function image(media) {
        const args = criteria({
            kind: state.kind === "favorite" ? "favorite" : "picture",
            mediaType: "picture",
            allKeys: true,
            offset: 0,
            limit: 1,
          }),
          result = await query(args);
        imageSession = {
          previewId:crypto.randomUUID(),
          args,
          index: Math.max(
            0,
            result.queue.findIndex((v) => v.id === media.id),
          ),
          total: result.total,
          current: null,
        };
        await stepImage(0);
        ctx.openDialog("image-dialog");
        return { opened: true, total: result.total };
      }
      async function stepImage(direction,targetIndex=null) {
        if (!imageSession) throw Error("没有图片浏览队列");
        if(!imageSession.args&&imageSession.total===1)return {index:0,total:1};
        const ticket = ++imageToken,
          session = imageSession,
          index = targetIndex??RHVideoModel.playback.step(session.pendingIndex??session.index,direction,session.total);
        session.pendingIndex=index;
        session.loading=true;
        refreshImage();
        try{
          const value = await send("query", {
          ...session.args,
          allKeys: false,
          offset: index,
          limit: 1,
        });
        if (value.stale || ticket !== imageToken || session !== imageSession) return { stale: true };
        if (!value.items.length)
          throw Error("当前筛选结果中没有这张图片，请刷新清单");
        const result = session.args.kind==="gallery"
          ? {items:[{...value.items[0],cover:(await native("images",{paths:[value.items[0].path||"/storage/"+value.items[0].webp_path]}))[0]}]}
          : await native("resolve", { items: value.items });
        if (ticket !== imageToken || session !== imageSession)
          return { stale: true };
        session.index = index;
        session.current = result.items[0];
        if(session.args.kind==="gallery"){prefs.galleryResume={...prefs.galleryResume,mediaKey:session.current.key||I.key(session.current)};save();}
        ctx.resetImageZoom();
        refreshImage();
        return { index, total: session.total };
        }finally{
          if(ticket===imageToken&&session===imageSession){session.loading=false;delete session.pendingIndex;refreshImage();}
        }
      }
      function refreshImage() {
        const loading=imageSession?.loading===true;
        $("image-dialog").setAttribute("aria-busy",String(loading));
        $("full-image").setAttribute("aria-disabled",String(loading));
        const frame=imageSession?.current?.kind==="frame";for(const id of ["wb-frame-play","wb-frame-play-low"])if($(id))$(id).hidden=!frame;
        for(const id of ["wb-frame-play","wb-frame-play-low","wb-image-mark","wb-image-reveal"])if($(id))$(id).disabled=loading;
        const item=imageSession?.current,kind=frame?"video":item?.kind,id=frame?item?.videoId:item?.id,key=kind+":"+id,favorite=$("wb-image-favorite");
        if(favorite){favorite.hidden=!["video","picture","novel"].includes(kind)||!id;favorite.textContent=state.favorites.has(key)?"取消收藏":"收藏";favorite.setAttribute("aria-pressed",String(state.favorites.has(key)));favorite.disabled=loading||state.favoriteBusy.has(key);}
        if($("wb-image-mark"))$("wb-image-mark").hidden=!["video","picture","novel"].includes(kind)||!id;
        if (imageSession?.current&&!loading)
          showImage(
            imageSession.current,
            imageSession.index,
            imageSession.total,
          );
      }
      action(
        "image.order",
        object({ random: { type: "boolean" } }, ["random"]),
        async ({ random }) => {
          if (!imageSession?.args) throw Error("当前图片没有可排序的浏览队列");
          imageSession.args.seed = random
            ? crypto.getRandomValues(new Uint32Array(1))[0] || 1
            : 0;
          return stepImage(0,0);
        },
      );
      $("image-dialog")
        .querySelector(".viewer-bar>div")
        .prepend(
          button("随机", "image.order", { random: true }, "text-button"),
          button("还原顺序", "image.order", { random: false }, "text-button"),
        );
      const imageMark=button("标记/取消待删除", "selection.markCurrent", {}, "text-button");imageMark.id="wb-image-mark";
      const framePlay=button("播放此刻","image.playFrame",{},"text-button");framePlay.id="wb-frame-play";framePlay.hidden=true;
      const frameLow=button("超压播放此刻","image.playFrame",{super:true},"text-button");frameLow.id="wb-frame-play-low";frameLow.hidden=true;
      const imageFavorite=button("收藏","image.favorite",{},"text-button");imageFavorite.id="wb-image-favorite";imageFavorite.hidden=true;
      const imageReveal=button("在清单中定位","image.reveal",{},"text-button");imageReveal.id="wb-image-reveal";
      $("image-dialog").querySelector(".viewer-bar>div").prepend(framePlay,frameLow,imageFavorite,imageMark,imageReveal);
      action("image.favorite",object(),async()=>{if(imageSession?.loading)throw Error("图片正在切换，请稍候再收藏");const item=imageSession?.current;if(!$("image-dialog").open||!item?.id)throw Error("当前预览没有可收藏的媒体");return invoke("favorite.toggle",{kind:item.kind==="frame"?"video":item.kind,id:item.kind==="frame"?item.videoId:item.id});},"write");
      action("image.state",object(),()=>({opened:$("image-dialog").open,loading:imageSession?.loading===true,requestedIndex:imageSession?.pendingIndex??null,previewId:imageSession?.previewId??null,index:imageSession?.index??0,total:imageSession?.total??0,current:imageSession?.current?{id:imageSession.current.id??null,kind:imageSession.current.kind??null,videoId:imageSession.current.videoId??null,seconds:imageSession.current.seconds??null}:null}),"read");
      action("image.seek",object({ratio:{type:"number",minimum:0,maximum:1}},["ratio"]),async({ratio})=>{if(!$("image-dialog").open||!imageSession)throw Error("图片查看器未打开");return stepImage(0,RHVideoModel.playback.imageSeek(imageSession.total,ratio));});
      async function playImageVideo(low,atFrame){
        const session=imageSession,item=session?.current,version=epoch;
        if(session?.loading)throw Error("图片正在切换，请稍候再播放");if(!$("image-dialog").open||item?.kind!=="frame")throw Error("当前不是视频截图");
        const playbackId=crypto.randomUUID();session.playAttempt=playbackId;let previous,installed=false;
        try{
          const ticket=await prepareQueue([{id:item.videoId,title:item.title,duration:item.duration}],{fullLength:true,super:low,origin:"frame",deferPreviewCommit:true,parentKey:I.key(item),parentPreview:session.previewId,parentPlayback:playbackId,parentTotal:session.total});
          if(version!==epoch||imageSession!==session||session.current!==item||session.loading||session.playAttempt!==playbackId||!$("image-dialog").open)throw Error("预览目标已改变，旧播放未执行");
          // Preparing a replacement must not retire the still-playing child's
          // return. Only install its capability once the new source is ready.
          previous=session.playbackId;session.playbackId=playbackId;installed=true;
          return await native("play",{id:item.videoId,title:item.title,seconds:atFrame?item.seconds:0,super:low,playlist:ticket});
        }catch(error){if(installed&&imageSession===session&&session.playbackId===playbackId)session.playbackId=previous;throw error;}
        finally{if(session.playAttempt===playbackId)delete session.playAttempt;}
      }
      action("image.playFrame",object({super:{type:"boolean"}}),({super:low=false})=>playImageVideo(low,true),"external");
      action("image.playVideo",object({super:{type:"boolean"}}),({super:low=false})=>playImageVideo(low,false),"external");
      action("image.returnFromVideo",object({generation:{type:"integer",minimum:0},parentKey:string,parentPreview:string,parentPlayback:string,direction:{type:"integer",enum:[-1,0,1]},close:{type:"boolean"}},["generation","parentKey","parentPreview"]),async({generation,parentKey,parentPreview,parentPlayback,direction=0,close=false})=>{
        if(generation!==state.generation||!imageSession?.current||imageSession.loading||imageSession.previewId!==parentPreview||!parentPlayback||imageSession.playbackId!==parentPlayback||I.key(imageSession.current)!==parentKey)return {stale:true};
        imageSession.playbackId=null;
        if(close)return invoke("image.close");
        const result=await stepImage(direction);if(!result.stale)ctx.openDialog("image-dialog");return result;
      });
      action("image.reveal",object(),()=>{if(imageSession?.loading)throw Error("图片正在切换，请稍候再定位");const item=imageSession?.current;if(!$("image-dialog").open||!item?.id)throw Error("当前预览没有源媒体");return invoke("media.reveal",{id:item.kind==="frame"?item.videoId:item.id,kind:item.kind==="frame"?"video":item.kind});});
      action(
        "image.preview",
        object({ path: string, title: string }, ["path", "title"]),
        async ({ path, title }) => {
          const version=epoch,ticket=++thumbnailTicket,root=dialog("wb-image-preview",title);
          root.classList.add("wb-image-preview");root.textContent="正在读取预览…";
          const [url]=await native("images",{paths:[path]});
          if(version!==epoch||ticket!==thumbnailTicket||!$("wb-image-preview").open)return {stale:true};
          const image=el("img");image.alt=title;image.src=url;
          listen(image,"error",()=>{if(image.isConnected)root.textContent="预览加载失败";},"image.preview.error");
          root.replaceChildren(image);return {opened:true};
        },
        "read",
      );
      action(
        "trash.preview",
        object({ path: string, title: string }, ["path", "title"]),
        async ({ path, title }) => {
          const [url] = await native("images", { paths: [path] });
          imageSession = { current: { title, cover: url }, index: 0, total: 1,previewId:crypto.randomUUID() };
          refreshImage();
          ctx.openDialog("image-dialog");
          return { opened: true };
        },
      );
      // Paged novel previews never read every chapter's text into browser memory.
      let preview = {
        id: "",
        offset: 0,
        total: 0,
        items: [],
        flow: false,
        current: 0,
        load: 0,
        query: "",
        searchTicket: 0,
        matched: [],
      };
      action(
        "novel.preview",
        object(
          {
            id: string,
            offset: { type: "integer", minimum: 0, maximum: 100000 },
          },
          ["id", "offset"],
        ),
        async ({ id, offset }) => {
          const ticket = ++preview.load;
          if(preview.id!==id)preview.query="";
          const value = await remote("novel.previews", {
            params: { id },
            query: { skip: offset, limit: 40, preview_chars: 720 },
          });
          if (ticket !== preview.load) return { stale: true };
          preview = {
            ...preview,
            id,
            offset,
            total: value.total,
            items: value.items,
            current: 0,
          };
          await send("set",{kind:"excerpts",items:value.items.map(chapter=>({id:String(chapter.index),kind:"novel",title:chapter.title,folder:chapter.preview}))});
          if(ticket!==preview.load)return {stale:true};
          const root = dialog("wb-preview", value.title);
          root.replaceChildren();
          root.append(
            button("上一本", "novel.book", { direction: -1 }),
            button("下一本", "novel.book", { direction: 1 }),
            button(
              preview.flow ? "章节列表" : "连续试读",
              "novel.previewMode",
              () => ({ flow: !preview.flow }),
            ),
          );
          const search=input("search",preview.query,"wb-excerpt-search");search.className="wb-preview-search";search.placeholder="搜索本页章节标题和摘录（支持拼音）";search.dataset.apiAction="rhvideo.novel.previewSearch";
          listen(search,"input",()=>invoke("novel.previewSearch",{query:search.value}).catch(notice),"novel.previewSearch");
          root.append(search,el("p","","wb-preview-status"));
          const list = el("div", undefined, "wb-excerpts");
          root.append(list);
          await renderPreview();
          if(ticket!==preview.load)return {stale:true};
          root.append(
            button("上一页", "novel.preview", {
              id,
              offset: Math.max(0, offset - 40),
            }),
            el(
              "span",
              offset +
                1 +
                "–" +
                Math.min(offset + 40, value.total) +
                " / " +
                value.total,
            ),
            button("下一页", "novel.preview", {
              id,
              offset: Math.min(Math.max(0, value.total - 1), offset + 40),
            }),
          );
          return { id, offset, total: value.total };
        },
        "read",
      );
      async function renderPreview() {
        const ticket=++preview.searchTicket,load=preview.load;
        const result=await send("query",{kind:"excerpts",search:preview.query,sort:"nameAsc",allKeys:true,limit:40});
        if(ticket!==preview.searchTicket||load!==preview.load||result.stale||!$("wb-preview")?.open)return {stale:true};
        const matches=new Set(result.queue.map(v=>Number(v.id)));
        const all=preview.items.filter(v=>matches.has(v.index));preview.matched=all;
        preview.current=Math.min(preview.current,Math.max(0,all.length-1));
        const root = $("wb-preview").querySelector(".wb-excerpts");
        root.replaceChildren();
        const rows = preview.flow
          ? all.slice(preview.current, preview.current + 1)
          : all;
        $("wb-preview").querySelector(".wb-preview-status").textContent="本页 "+preview.items.length+" 章，匹配 "+all.length+" 章 · 共 "+preview.total+" 章";
        if(!rows.length)root.append(el("p","本页没有匹配的章节；可翻页继续查找。"));
        for (const chapter of rows) {
          const row = serverRow(chapter.title, chapter.word_count + " 字");
          row.append(
            el("p", chapter.preview),
            button("进入这一章", "novel.readPreview", { index: chapter.index }),
          );
          root.append(row);
        }
        if (preview.flow)
          root.append(
            button("上一章", "novel.previewStep", { direction: -1 }),
            button("下一章", "novel.previewStep", { direction: 1 }),
          );
        return {matches:all.length};
      }
      action("novel.previewSearch",object({query:{type:"string",maxLength:256}},["query"]),({query})=>{if(!$("wb-preview")?.open)throw Error("请先打开章节速览");preview.query=query;preview.current=0;$("wb-excerpt-search").value=query;return renderPreview();},"read");
      action("novel.previewState",object(),()=>({id:preview.id,offset:preview.offset,total:preview.total,query:preview.query,flow:preview.flow,current:preview.current,matches:preview.matched.length,chapters:preview.matched.map(v=>v.index)}),"read");
      action(
        "novel.previewMode",
        object({ flow: { type: "boolean" } }, ["flow"]),
        async ({ flow }) => {
          preview.flow = flow;
          await renderPreview();
          const toggle=$("wb-preview")?.querySelector('[data-api-action="rhvideo.novel.previewMode"]');if(toggle)toggle.textContent=flow?"章节列表":"连续试读";
          return { flow };
        },
      );
      action(
        "novel.previewStep",
        object({ direction: { type: "integer", enum: [-1, 1] } }, [
          "direction",
        ]),
        async ({ direction }) => {
          const next = preview.current + direction;
          if (next < 0 && preview.offset > 0)
            return invoke("novel.preview", {
              id: preview.id,
              offset: Math.max(0, preview.offset - 40),
            }).then((result) => {
              if (!result.stale) {
                preview.current = Math.max(0, preview.matched.length - 1);
                return renderPreview().then(()=>result);
              }
              return result;
            });
          if (
            next >= preview.matched.length &&
            preview.offset + preview.items.length < preview.total
          )
            return invoke("novel.preview", {
              id: preview.id,
              offset: preview.offset + 40,
            });
          preview.current = Math.max(
            0,
            Math.min(preview.matched.length - 1, next),
          );
          await renderPreview();
          return { index: preview.current };
        },
      );
      action(
        "novel.readPreview",
        object({ index: { type: "integer", minimum: 0, maximum: 100000 } }, [
          "index",
        ]),
        async ({ index }) => {
          await openMedia({ id: preview.id, kind: "novel", title: "小说" });
          await ctx.chapter(index);
          return { opened: true, chapter: index };
        },
        "external",
      );
      action(
        "novel.book",
        object({ direction: { type: "integer", enum: [-1, 1] } }, [
          "direction",
        ]),
        async ({ direction }) => {
          const result = await query({
              kind: "novel",
              mediaType: "novel",
              allKeys: true,
              offset: 0,
              limit: 1,
            }),
            index = result.queue.findIndex((v) => v.id === preview.id),
            next = result.queue[index + direction];
          if (!next) throw Error("已经到达书架边界");
          return invoke("novel.preview", { id: next.id, offset: 0 });
        },
      );
      let tocBook = "";
      action(
        "reader.search",
        object({ query: { type: "string", maxLength: 256 } }, ["query"]),
        async ({ query }) => {
          if (!reader.book) throw Error("请先打开小说");
          const select = $("chapter-select");
          if (tocBook !== reader.book.id) {
            await send("set", {
              kind: "toc",
              items: reader.book.chapters.map((c) => ({
                id: String(c.index),
                title: c.title,
                kind: "novel",
              })),
            });
            tocBook = reader.book.id;
          }
          const result = await send("query", {
            kind: "toc",
            search: query,
            allKeys: true,
            limit: 1,
          });
          const ids = new Set(result.queue.map((v) => v.id));
          for (const option of select.options)
            option.hidden = !ids.has(option.value);
          return { matches: result.total };
        },
        "read",
      );
      const chapterSearch = input("search", "", "wb-chapter-search");
      chapterSearch.placeholder = "搜索章节";
      $("reader-dialog")
        .querySelector(".reader-body>aside")
        .prepend(chapterSearch);
      listen(
        chapterSearch,
        "input",
        () =>
          invoke("reader.search", { query: chapterSearch.value }).catch(notice),
        "reader.search",
      );
      $("reader-dialog")
        .querySelector(".reader-toolbar")
        .append(button("阅读设置", "settings.open"));
      // Screenshot catalog is a separate collection; all image URLs stay opaque.
      const gallery = {
        offset: 0,
        limit: 36,
        seed: 0,
        total: 0,
        items: [],
        loaded: false,
        load: 0,
      };
      async function loadGallery(refresh = false, display = true) {
        await ensure();
        const ticket = ++gallery.load,
          c = config();
        if (!gallery.loaded || refresh) {
          const values = await remote("frames.grid", {
            query: {
              per_video: Math.max(1, Math.min(100, c.perVideo)),
              compact: true,
              rules: JSON.stringify(c.rule),
            },
          });
          const frames = [];
          for (const video of values) {
            const screenshots =
              video.screenshots ||
              video.frames?.map(([name, time]) => ({
                url: video.base_url + name,
                time_seconds: time,
              })) ||
              [];
            for (let i = 0; i < screenshots.length; i++) {
              const f = screenshots[i];
              frames.push({
                id: video.video_id + "-frame" + i,
                kind: "frame",
                videoId: video.video_id,
                title: video.filename,
                folder_label: video.folder,
                resolution: video.resolution,
                duration: video.duration,
                seconds: f.time_seconds,
                path: f.url,
              });
            }
          }
          if (c.mixPictures) {
            const p = await remote("index.picture");
            frames.push(
              ...p.items.map((v) => ({
                ...v,
                kind: "picture",
                path: "/storage/" + v.webp_path,
              })),
            );
          }
          await send("set", { kind: "gallery", items: frames });
          gallery.loaded = true;
        }
        if(!display)return {loaded:true};
        const value = await send("query", {
          kind: "gallery",
          search: state.search,
          rule: c.rule,
          sort: c.sort,
          seed: gallery.seed,
          offset: gallery.offset,
          limit: gallery.limit,
        });
        if (ticket !== gallery.load) return { stale: true };
        gallery.total = value.total;
        gallery.items = value.items;
        const urls = await native("images", {
          paths: value.items.map((v) => v.path),
        });
        const root = dialog("wb-gallery", "截图库");
        root.replaceChildren(
          button("重新读取", "gallery.refresh"),
          button("随机排列", "gallery.shuffle"),
          button("还原顺序", "gallery.restore"),
          button("浏览顺序", "gallery.orders"),
          button("恢复上次浏览", "gallery.resume"),
          button("自动放映", "viewer.open", {
            mode: "slideshow",
            source: "gallery",
          }),
          button("显示设置", "settings.open"),
        );
        const grid = el("div", undefined, "wb-gallery-grid");
        for (let i = 0; i < value.items.length; i++) {
          const f = value.items[i],
            card = button(
              f.title,
              "gallery.openItem",
              { index: i },
              "wb-frame",
            );
          const image = el("img");
          image.src = urls[i];
          image.loading = "lazy";
          image.alt = f.title;
          card.prepend(image);
          grid.append(card);
        }
        root.append(
          grid,
          button("上一页", "gallery.page", { direction: -1 }),
          el("span", gallery.offset + 1 + " / " + gallery.total),
          button("下一页", "gallery.page", { direction: 1 }),
        );
        const jump=el("form",undefined,"page-jump"),page=input("number",Math.floor(gallery.offset/gallery.limit)+1,"wb-gallery-page"),last=Math.max(1,Math.ceil(gallery.total/gallery.limit));
        page.min="1";page.max=String(last);page.required=true;page.setAttribute("aria-label","截图页码");page.dataset.apiAction="rhvideo.gallery.jump";
        const submit=el("button","跳转","button secondary");submit.type="submit";submit.dataset.apiAction="rhvideo.gallery.jump";
        jump.append(field("跳到页",page),submit);listen(jump,"submit",event=>{event.preventDefault();invoke("gallery.jump",{page:Number(page.value)}).catch(notice);},"gallery.jump");root.append(jump);
        prefs.galleryResume = { ...prefs.galleryResume,offset: gallery.offset, seed: gallery.seed };
        save();
        return { total: gallery.total, offset: gallery.offset };
      }
      action("gallery.open", object(), () => loadGallery());
      action("gallery.inspect",object({index:{type:"integer",minimum:0,maximum:99}},["index"]),async({index})=>{
        const media=gallery.items[index];if(!media)throw Error("截图不在当前页");
        const args={kind:"gallery",search:state.search,rule:config().rule,sort:config().sort,seed:gallery.seed,offset:0,limit:1,allKeys:true};
        const result=await send("query",args),at=result.queue.findIndex(v=>v.id===media.id&&v.kind===media.kind);
        if(at<0)throw Error("截图筛选结果已改变，请刷新");imageSession={args,index:at,total:result.total,current:null,previewId:crypto.randomUUID()};await stepImage(0);ctx.openDialog("image-dialog");return {opened:true,total:result.total,index:at};
      });
      action("gallery.orders", object(), () => {
        const root = dialog("wb-settings", "截图浏览顺序"),
          name = input("text", "", "wb-gallery-order-name");
        root.replaceChildren(
          field("名称", name),
          button("保存当前顺序", "gallery.save", () => ({ name: name.value })),
        );
        for (const name of Object.keys(prefs.galleryOrders || {})) {
          const row = serverRow(name, "截图顺序与浏览位置");
          row.append(
            button("恢复", "gallery.resume", { name }),
            button("移除", "gallery.deleteOrder", { name }),
          );
          root.append(row);
        }
        return { names: Object.keys(prefs.galleryOrders || {}) };
      });
      action(
        "gallery.deleteOrder",
        object({ name: { type: "string", minLength: 1, maxLength: 100 } }, [
          "name",
        ]),
        ({ name }) => {
          delete prefs.galleryOrders?.[name];
          save();
          return { removed: name };
        },
      );
      action("gallery.refresh", object(), () => loadGallery(true), "read");
      action("gallery.jump",object({page:{type:"integer",minimum:1,maximum:1000000}},["page"]),({page})=>{if(page>Math.ceil(gallery.total/gallery.limit))throw Error("页码超出截图范围");gallery.offset=(page-1)*gallery.limit;return loadGallery();});
      action(
        "gallery.page",
        object({ direction: { type: "integer", enum: [-1, 1] } }, [
          "direction",
        ]),
        ({ direction }) => {
          gallery.offset = Math.max(
            0,
            Math.min(
              Math.max(
                0,
                Math.floor((gallery.total - 1) / gallery.limit) * gallery.limit,
              ),
              gallery.offset + direction * gallery.limit,
            ),
          );
          return loadGallery();
        },
      );
      action("gallery.shuffle", object(), () => {
        gallery.seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
        gallery.offset = 0;
        return loadGallery();
      });
      action("gallery.restore", object(), () => {
        gallery.seed = 0;
        gallery.offset = 0;
        return loadGallery();
      });
      action(
        "gallery.save",
        object({ name: { type: "string", maxLength: 100 } }),
        ({ name = "默认顺序" }) => {
          prefs.galleryOrders = {
            ...(prefs.galleryOrders || {}),
            [name]: { seed: gallery.seed, offset: gallery.offset },
          };
          save();
          return { saved: name };
        },
      );
      action(
        "gallery.resume",
        object({ name: { type: "string", maxLength: 100 } }),
        ({ name }) => {
          const saved = name
            ? prefs.galleryOrders?.[name]
            : prefs.galleryResume;
          if (!saved) throw Error("没有保存的浏览进度");
          Object.assign(gallery, saved);
          return loadGallery();
        },
      );
      action(
        "gallery.openItem",
        object({ index: { type: "integer", minimum: 0, maximum: 99 } }, [
          "index",
        ]),
        async ({ index }) => {
          return invoke("gallery.inspect",{index});
        },
        "external",
      );
      // The strip is virtualized: at most 80 nearby tiles + two slideshow layers.
      let viewer = null,
        animation = 0,
        viewerToken = 0;
      function stopViewer() {
        viewerToken++;
        cancelAnimationFrame(animation);
        animation = 0;
        if (viewer) {
          if (state.connected && account && viewer.signature) {
            const v = viewer,
              extent = v.vertical
                ? v.surface.clientHeight
                : v.surface.clientWidth;
            prefs.viewerResume = {
              ...(prefs.viewerResume || {}),
              [v.mode + ":" + v.source]: {
                signature: v.signature,
                index: v.index,
                key: v.queue[v.index]?.key,
                ratio: v.layout
                  ? (v.vertical ? v.surface.scrollTop : v.surface.scrollLeft) /
                    Math.max(1, v.physicalMax)
                  : 0,
              },
            };
            save();
          }
          viewer.running = false;
          viewer.tiles.clear();
          viewer.observer?.disconnect();
          clearTimeout(viewer.resizeTimer);
          if (viewer.videoActive)
            void native("presentation.close").catch(notice);
        }
        viewer = null;
      }
      action(
        "viewer.open",
        object(
          {
            mode: { type: "string", enum: ["strip", "slideshow"] },
            source: {
              type: "string",
              enum: ["picture", "favorite", "gallery"],
            },
          },
          ["mode", "source"],
        ),
        async ({ mode, source }) => {
          await ensure();
          stopViewer();
          const token = ++viewerToken,
            c = config(),
            kind = source === "gallery" ? "gallery" : source;
          if (kind === "gallery" && !gallery.loaded) await loadGallery();
          if (kind !== "gallery") await rawCatalog(kind);
          const args = {
            ...criteria(),
            kind,
            mediaType:
              mode === "strip" && kind !== "gallery"
                ? "picture"
                : kind === "favorite"
                  ? ""
                  : kind === "gallery"
                    ? ""
                    : "picture",
            allKeys: true,
            offset: 0,
            limit: 1,
          };
          let result = await send("query", args);
          if (token !== viewerToken) return { stale: true };
          const signature = I.canonical({
              ...args,
              offset: 0,
              limit: 1,
              allKeys: true,
            }),
            resume = prefs.viewerResume?.[mode + ":" + source];
          const root = dialog(
            "wb-viewer",
            mode === "strip" ? "连续浏览" : "自动放映",
          );
          root.replaceChildren();
          const controls = el("div", undefined, "wb-viewer-controls");
          controls.append(
            button("暂停/继续", "viewer.toggle"),
            button("上一个", "viewer.step", { direction: -1 }),
            button("下一个", "viewer.step", { direction: 1 }),
            button("切换方向", "viewer.direction"),
            button("单列/双列", "viewer.lanes"),
            button("标记/取消待删除", "selection.markCurrent"),
            button("从头浏览", "viewer.restart"),
            button("设置", "settings.open"),
          );
          const surface = el("div", undefined, "wb-viewer-surface");
          root.append(controls, surface);
          viewer = {
            token,
            signature,
            mode,
            source,
            vertical: c.vertical,
            kind,
            args,
            queue: result.queue.filter((v) => v.kind !== "novel"),
            index: 0,
            running: true,
            clock: performance.now(),
            surface,
            tiles: new Map(),
            loading: new Set(),
            length: result.queue.filter((v) => v.kind !== "novel").length,
            at: 0,
            elapsed: 0,
            last: performance.now(),
          };
          viewer.observer = new ResizeObserver(() => {
            if (viewer?.token === token && viewer.videoActive)
              void syncPresentation().catch(notice);
          });
          viewer.observer.observe(surface);
          if (!viewer.length) {
            surface.textContent = "没有符合筛选条件的图片或视频";
            return { total: 0 };
          }
          if (mode === "strip") {
            const raws = viewer.queue;
            viewer.layoutItems = raws;
            viewer.lanes = c.lanes;
            viewer.layout = I.stripLayout(raws, {
              vertical: c.vertical,
              lanes: c.lanes,
              extent: c.vertical ? surface.clientWidth : surface.clientHeight,
            });
            const spacer = el("div", undefined, "wb-strip-spacer");
            surface.append(spacer);
            viewer.spacer = spacer;
            layoutStrip();
            listen(
              surface,
              "scroll",
              () => {
                if (viewer?.token === token) void renderStrip().catch(notice);
              },
              "viewer.scroll",
            );
            const map = el("input");
            map.type = "range";
            map.min = 0;
            map.max = 1000;
            map.value = 0;
            map.setAttribute("aria-label", "连续浏览位置");
            listen(
              map,
              "input",
              () =>
                invoke("viewer.seek", {
                  ratio: Number(map.value) / 1000,
                }).catch(notice),
              "viewer.minimap",
            );
            controls.append(map);
            viewer.map = map;
            const minimap = el("canvas", undefined, "wb-strip-minimap");
            minimap.setAttribute("aria-hidden", "true");
            minimap.dataset.apiAction = "rhvideo.viewer.seek";
            listen(
              minimap,
              "pointerdown",
              (event) => {
                const bounds = minimap.getBoundingClientRect();
                void invoke("viewer.seek", {
                  ratio: Math.min(
                    1,
                    Math.max(0, (event.clientX - bounds.left) / bounds.width),
                  ),
                }).catch(notice);
              },
              "viewer.visualMap",
            );
            root.append(minimap);
            viewer.minimap = minimap;
            await renderStrip();
            if (resume?.signature === signature)
              await invoke("viewer.seek", {
                ratio: Math.max(0, Math.min(1, resume.ratio || 0)),
              });
          } else {
            const remembered =
              resume?.signature === signature
                ? viewer.queue.findIndex((v) => v.key === resume.key)
                : -1;
            await slide(remembered >= 0 ? remembered : 0);
          }
          animation = requestAnimationFrame(tick);
          return { total: result.total, mode };
        },
      );
      function layoutStrip() {
        const v = viewer,
          c = config();
        if (!v?.layout) return;
        const metrics = I.scrollMetrics(
          v.layout.length,
          c.vertical ? v.surface.clientHeight : v.surface.clientWidth,
        );
        v.scrollScale = metrics.scale;
        v.physicalMax = metrics.physicalMax;
        v.surface.classList.toggle("vertical", c.vertical);
        v.spacer.style.width = c.vertical ? "100%" : metrics.spacer + "px";
        v.spacer.style.height = c.vertical ? metrics.spacer + "px" : "100%";
      }
      async function renderStrip() {
        const v = viewer;
        if (!v?.layout) return;
        if (v.renderBusy) {
          v.renderAgain = true;
          return;
        }
        v.renderBusy = true;
        try {
          do {
            v.renderAgain = false;
            await renderStripFrame(v);
          } while (viewer === v && v.renderAgain);
        } finally {
          v.renderBusy = false;
        }
      }
      async function renderStripFrame(v) {
        if (!v?.layout) return;
        const c = config(),
          position = c.vertical ? v.surface.scrollTop : v.surface.scrollLeft,
          start = position * v.scrollScale,
          length = c.vertical ? v.surface.clientHeight : v.surface.clientWidth,
          visible = I.visible(v.layout, start, length).slice(0, 80),
          keys = new Set(visible.map((t) => t.key));
        for (const [key, node] of v.tiles)
          if (!keys.has(key)) {
            node.remove();
            v.tiles.delete(key);
          }
        const missing = visible.filter(
          (t) => !v.tiles.has(t.key) && !v.loading.has(t.key),
        );
        missing.forEach((t) => v.loading.add(t.key));
        try {
          const paths = missing.map(
            (t) => t.item.path || "/storage/" + t.item.webp_path,
          );
          const urls = paths.length ? await native("images", { paths }) : [];
          if (viewer !== v) return;
          const currentPosition = c.vertical
            ? v.surface.scrollTop
            : v.surface.scrollLeft;
          if (
            Math.abs(currentPosition - position) * v.scrollScale >
            length / 2
          ) {
            v.renderAgain = true;
            return;
          }
          for (let i = 0; i < missing.length; i++) {
            const tile = missing[i],
              node = el("div", undefined, "wb-strip-tile"),
              img = el("img");
            node.dataset.key = tile.key;
            node.dataset.logicalStart = String(tile.start);
            img.src = urls[i];
            img.alt = tile.item.title;
            img.decoding = "async";
            node.style.cssText = c.vertical
              ? `top:${tile.start - start + position}px;left:${tile.lane * (tile.cross + 8)}px;width:${tile.cross}px;height:${tile.length}px`
              : `left:${tile.start - start + position}px;top:${tile.lane * (tile.cross + 8)}px;height:${tile.cross}px;width:${tile.length}px`;
            if (tile.cuts > 1) {
              img.style.height = 100 * tile.cuts + "%";
              img.style.width = "100%";
              img.style.transform = `translateY(-${(tile.part * 100) / tile.cuts}%)`;
            }
            node.append(img);
            v.spacer.append(node);
            v.tiles.set(tile.key, node);
          }
          for (const tile of visible) {
            const node = v.tiles.get(tile.key);
            if (node)
              node.style[c.vertical ? "top" : "left"] =
                tile.start - start + position + "px";
          }
          if (v.map)
            v.map.value = String(
              Math.round(
                (start / Math.max(1, v.layout.length - length)) * 1000,
              ),
            );
          drawMinimap(v, start, length, visible);
        } finally {
          missing.forEach((t) => v.loading.delete(t.key));
        }
      }
      function drawMinimap(v, start, length, visible) {
        const canvas = v.minimap;
        if (!canvas) return;
        const width = Math.min(
            2048,
            Math.max(1, Math.round(canvas.clientWidth)),
          ),
          scale = width / Math.max(1, v.layout.length),
          lanes = config().lanes;
        if (!v.minimapBase || v.minimapBase.width !== width) {
          const base = document.createElement("canvas");
          base.width = width;
          base.height = 40;
          const paint = base.getContext("2d"),
            used = new Set();
          paint.fillStyle = "#182332";
          paint.fillRect(0, 0, width, 40);
          // One sample per pixel/lane. This is drawn only once, never per frame.
          for (const tile of v.layout.items) {
            const x = Math.floor(tile.start * scale),
              key = tile.lane + ":" + x;
            if (used.has(key)) continue;
            used.add(key);
            paint.fillStyle = tile.lane % 2 ? "#789fae" : "#8e9ab9";
            paint.fillRect(
              x,
              (tile.lane * 40) / lanes,
              Math.max(1, tile.length * scale),
              40 / lanes - 2,
            );
          }
          v.minimapBase = base;
        }
        canvas.width = width;
        canvas.height = 40;
        const paint = canvas.getContext("2d");
        paint.drawImage(v.minimapBase, 0, 0);
        // Reuse only already-decoded visible thumbnails; no extra media requests.
        for (const tile of visible) {
          const image = v.tiles.get(tile.key)?.querySelector("img");
          if (image?.complete && image.naturalWidth)
            paint.drawImage(
              image,
              tile.start * scale,
              (tile.lane * 40) / lanes,
              Math.max(1, tile.length * scale),
              40 / lanes - 2,
            );
        }
        paint.strokeStyle = "#ffffff";
        paint.lineWidth = 2;
        paint.strokeRect(start * scale, 1, Math.max(3, length * scale), 38);
      }
      async function slide(index) {
        const v = viewer;
        if (!v) return;
        const c = config();
        const transitionTicket = (v.transitionTicket || 0) + 1;
        v.transitionTicket = transitionTicket;
        v.index = (index + v.length) % v.length;
        v.elapsed = 0;
        v.loadingMedia = true;
        const result = await send("query", {
            ...v.args,
            allKeys: false,
            selected: [v.queue[v.index].key],
            offset: 0,
            limit: 1,
          }),
          media = result.items[0];
        if (viewer !== v) return;
        v.current = media;
        const layer = el("div", undefined, "wb-slide");
        layer.style.setProperty("--stay", c.stay + "s");
        layer.style.setProperty("--fade", I.transition(c).fade + "s");
        layer.classList.toggle("ken-burns", c.kenBurns);
        if (media.kind === "video") {
          await invoke("viewer.video", { id: media.id, title: media.title });
          const deadline = performance.now() + 15000;
          while (viewer === v && transitionTicket === v.transitionTicket) {
            const status = await native("presentation.state");
            if (status.error) throw Error(status.error);
            if (status.renderedFrames > 0) break;
            if (performance.now() >= deadline) {
              v.running = false;
              throw Error("视频首帧等待超时，放映已暂停");
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
          v.videoFadeStart = performance.now();
          v.videoFadeSeconds = I.transition(c).fade;
          await syncPresentation(c.overlap ? 0 : 1);
          if (!v.running)
            await native("presentation.control", { command: "pause" });
        } else {
          const [url] = await native("images", {
            paths: [media.path || "/storage/" + media.webp_path],
          });
          if (viewer !== v || transitionTicket !== v.transitionTicket) return;
          const image = el("img");
          image.src = url;
          image.alt = media.title;
          await image.decode();
          if (viewer !== v || transitionTicket !== v.transitionTicket) return;
          layer.append(image);
          if (v.videoActive) {
            await native("presentation.close");
            v.videoActive = false;
          }
        }
        if (viewer !== v || transitionTicket !== v.transitionTicket) return;
        // Keep the old image opaque until the next frame is actually decoded.
        // Slow networks and rapid manual navigation must not fade to black.
        const old = v.surface.querySelector(".wb-slide:not(.outgoing)");
        v.surface.append(layer);
        v.elapsed = 0;
        v.loadingMedia = false;
        if (old) {
          old.classList.add("outgoing");
          if (c.overlap) old.classList.add("holding");
          setTimeout(() => old.remove(), I.transition(c).fade * 1000 + 50);
        }
        while (v.surface.children.length > 3) v.surface.firstChild.remove();
        v.surface.style.setProperty(
          "--slide-progress",
          (v.index + 1) / v.length,
        );
        return { index: v.index, total: v.length };
      }
      function tick(now) {
        const v = viewer;
        if (!v) return;
        const dt = Math.min(0.1, (now - v.last) / 1000);
        v.last = now;
        if (v.running && !document.hidden && !v.loadingMedia && viewerIsTop()) {
          const c = config();
          if (v.mode === "strip") {
            const prop = c.vertical ? "scrollTop" : "scrollLeft",
              extent = c.vertical
                ? v.surface.clientHeight
                : v.surface.clientWidth;
            v.surface[prop] += (dt * c.scrollSpeed) / v.scrollScale;
            if (v.surface[prop] >= v.physicalMax) v.surface[prop] = 0;
          } else {
            v.elapsed += dt;
            if (
              v.videoActive &&
              !v.boundsBusy &&
              now - (v.boundsAt || 0) > 100
            ) {
              const alpha =
                v.videoFadeSeconds > 0
                  ? Math.min(
                      1,
                      (now - v.videoFadeStart) / 1000 / v.videoFadeSeconds,
                    )
                  : 1;
              if (alpha < 1 || !v.faded) {
                v.boundsAt = now;
                v.boundsBusy = true;
                v.faded = alpha >= 1;
                syncPresentation(alpha)
                  .catch(notice)
                  .finally(() => (v.boundsBusy = false));
              }
            }
            if (
              v.elapsed >=
                (v.current?.kind === "video"
                  ? c.videoStay
                  : I.transition(c).stay) &&
              !v.busy
            ) {
              v.busy = true;
              slide(v.index + 1)
                .catch((error) => {
                  v.running = false;
                  v.loadingMedia = false;
                  notice(error);
                })
                .finally(() => {
                  v.busy = false;
                });
            }
          }
        }
        animation = requestAnimationFrame(tick);
      }
      action("viewer.toggle", object(), () => {
        if (!viewer) throw Error("浏览器未打开");
        viewer.running = !viewer.running;
        viewer.surface.classList.toggle("paused", !viewer.running);
        if (viewer.videoActive)
          void native("presentation.control", {
            command: viewer.running ? "resume" : "pause",
          }).catch(notice);
        return { running: viewer.running };
      });
      function viewerSnapshot() {
        const v = viewer;
        if (!v) return { opened: false };
        const extent = config().vertical
          ? v.surface.clientHeight
          : v.surface.clientWidth;
        return {
          opened: true,
          mode: v.mode,
          source: v.source,
          index: v.index,
          total: v.length,
          running: v.running,
          loading: !!v.loadingMedia,
          nativeVideo: !!v.videoActive,
          tiles: v.tiles.size,
          ratio: v.layout
            ? (v.vertical ? v.surface.scrollTop : v.surface.scrollLeft) /
              Math.max(1, v.physicalMax)
            : (v.index + 1) / Math.max(1, v.length),
        };
      }
      action("viewer.state", object(), viewerSnapshot, "read");
      action("viewer.restart", object(), () => {
        if (!viewer) throw Error("浏览器未打开");
        delete prefs.viewerResume?.[viewer.mode + ":" + viewer.source];
        save();
        return viewer.mode === "strip"
          ? invoke("viewer.seek", { ratio: 0 })
          : slide(0);
      });
      action(
        "viewer.step",
        object({ direction: { type: "integer", enum: [-1, 1] } }, [
          "direction",
        ]),
        ({ direction }) => {
          if (!viewer) throw Error("浏览器未打开");
          return viewer.mode === "slideshow"
            ? slide(viewer.index + direction)
            : invoke("viewer.seek", {
                ratio: Math.max(
                  0,
                  Math.min(
                    1,
                    viewerSnapshot().ratio +
                      (direction * 500) /
                        Math.max(
                          1,
                          viewer.layout.length -
                            (viewer.vertical
                              ? viewer.surface.clientHeight
                              : viewer.surface.clientWidth),
                        ),
                  ),
                ),
              });
        },
      );
      action(
        "viewer.seek",
        object({ ratio: { type: "number", minimum: 0, maximum: 1 } }, [
          "ratio",
        ]),
        ({ ratio }) => {
          if (!viewer) throw Error("浏览器未打开");
          const c = config(),
            v = viewer;
          if (v.mode === "slideshow")
            return slide(Math.min(v.length - 1, Math.floor(ratio * v.length)));
          v.surface[c.vertical ? "scrollTop" : "scrollLeft"] =
            ratio * v.physicalMax;
          return { ratio };
        },
      );
      action("viewer.direction", object(), () => {
        prefs.vertical = !config().vertical;
        save();
        if (viewer)
          return invoke("viewer.open", {
            mode: viewer.mode,
            source: viewer.source,
          });
        return { vertical: prefs.vertical };
      });
      action("viewer.lanes", object(), () => {
        prefs.lanes = config().lanes === 1 ? 2 : 1;
        save();
        if (viewer)
          return invoke("viewer.open", {
            mode: viewer.mode,
            source: viewer.source,
          });
        return { lanes: prefs.lanes };
      });
      action(
        "viewer.video",
        object({ id: string, title: string }, ["id", "title"]),
        async (args) => {
          if (!viewer) throw Error("放映没有打开");
          const v = viewer;
          await native("presentation.open", { ...args, super: config().super });
          if (viewer !== v) {
            await native("presentation.close");
            return { stale: true };
          }
          v.videoActive = true;
          v.faded = false;
          return syncPresentation(0);
        },
        "external",
      );
      function syncPresentation(opacity = 1, visible = true) {
        const v = viewer;
        if (!v?.videoActive) return Promise.resolve({ opened: false });
        const rect = v.surface.getBoundingClientRect();
        return native("presentation.bounds", {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          viewportWidth: innerWidth,
          opacity,
          visible,
        });
      }
      function viewerIsTop() {
        return ctx.modalTop() === "wb-viewer";
      }
      action(
        "viewer.mediaState",
        object(),
        () => native("presentation.state"),
        "read",
      );
      action(
        "viewer.mediaControl",
        object(
          {
            command: {
              type: "string",
              enum: ["pause", "resume", "seek", "volume", "rate"],
            },
            value: { type: "number" },
          },
          ["command"],
        ),
        (args) => native("presentation.control", args),
      );
      listen(
        document,
        "visibilitychange",
        () => {
          liveRefresh.configure(liveRefresh.enabled);
          if (viewer?.videoActive)
            void native("presentation.control", {
              command: document.hidden || !viewer.running ? "pause" : "resume",
            }).catch(notice);
        },
        "viewer.visibility",
      );
      for (const event of ["focusin", "focusout"])
        listen(
          document,
          event,
          () => liveRefresh.configure(liveRefresh.enabled),
          "server." + event,
        );
      api.provideState("rhvideoWorkbench", () => ({
        selected: [...selected],
        sort: config().sort,
        rule: config().rule,
        gallery: { offset: gallery.offset, total: gallery.total },
        viewer: viewer
          ? {
              mode: viewer.mode,
              index: viewer.index,
              total: viewer.length,
              running: viewer.running,
              tiles: viewer.tiles.size,
            }
          : null,
      }));
      const toolbar = el("div", undefined, "wb-toolbar");
      action(
        "browse.mode",
        object(
          {
            mode: {
              type: "string",
              enum: ["cards", "screenshots", "strip", "slideshow"],
            },
          },
          ["mode"],
        ),
        ({ mode }) =>
          mode === "cards"
            ? { mode }
            : mode === "screenshots"
              ? invoke("gallery.open")
              : invoke("viewer.open", {
                  mode: mode === "strip" ? "strip" : "slideshow",
                  source: state.kind === "favorite" ? "favorite" : "picture",
                }),
      );
      action(
        "play.mode",
        object(
          { mode: { type: "string", enum: ["choose", "playlist", "sequential", "sequential-super", "grid"] } },
          ["mode"],
        ),
        ({ mode }) =>
          mode === "choose"
            ? { mode }
            : mode==="grid"?invoke("grid.open"):mode==="playlist"?invoke("playlist.start"):invoke("playlist.sequential",{super:mode==="sequential-super"}),
      );
      action("selection.mode", object(), () => {
        const bar = $("wb-selection");
        bar.hidden = !bar.hidden;
        return { visible: !bar.hidden };
      });
      const sortLabels = [
        "名称 A→Z",
        "名称 Z→A",
        "最新在前",
        "最早在前",
        "最大在前",
        "最小在前",
        "时长从长到短",
        "时长从短到长",
      ];
      const sort = select(
        I.sorts.map((key, i) => [key, sortLabels[i]]),
        "sort",
        (value) => ({ value }),
        defaults.sort,
      );
      sort.id = "wb-sort";
      toolbar.append(
        sort,
        button("标签筛选", "rules.open"),
        button("顺序", "order.open"),
        button("播放记录", "playback.history"),
        select(
          [
            ["cards", "卡片浏览"],
            ["screenshots", "截图库"],
            ["strip", "连续浏览"],
            ["slideshow", "自动放映"],
          ],
          "browse.mode",
          (mode) => ({ mode }),
          "cards",
        ),
        button("分段连播", "playlist.start"),
        button("按列表顺序连播", "playlist.sequential"),
        button("按列表顺序连播（超压）", "playlist.sequential", {super:true}),
        button("多视频同屏", "grid.open"),
        button("多选", "selection.mode"),
      );
      $("library-controls")?.after(toolbar);
      if (!toolbar.isConnected)
        document.querySelector(".library-controls").after(toolbar);
      const selectionCount = el("span");
      selectionCount.id = "wb-selection-count";
      const selectionBar = el("div", undefined, "wb-toolbar wb-selection");
      selectionBar.id = "wb-selection";
      selectionBar.hidden = true;
      toolbar.after(selectionBar);
      selectionBar.append(
        selectionCount,
        button("选择本页", "selection.page"),
        button("清除选择", "selection.clear"),
        button("导出所选", "selection.export"),
        button("删除源文件并暂存", "selection.stage", {}, "button destructive"),
      );
      document
        .querySelector(".header-actions")
        .prepend(
          button("媒体设置", "settings.open"),
          button("服务器", "server.open", { page: "watch" }),
        );
      const master=input("range",config().volume,"wb-page-volume");master.min="0";master.max="100";master.step="1";master.setAttribute("aria-label","统一音量");master.dataset.apiAction="rhvideo.volume.set";
      const masterField=field("音量",master);masterField.classList.add("rhvideo-master-volume");document.querySelector(".header-actions").prepend(masterField);
      listen(master,"input",()=>invoke("volume.set",{value:Number(master.value)}).catch(notice),"page.volume");
      const register = button("注册并连接", "account.register", () => ({
        server: $("server").value,
        username: $("username").value,
        password: $("password").value,
        email: $("wb-register-email").value,
      }));
      const email = input("email", "", "wb-register-email");
      email.placeholder = "注册邮箱（仅注册时填写）";
      $("connection-form").append(field("注册新账户", email), register);
      action(
        "account.register",
        object(
          {
            server: string,
            username: string,
            password: { type: "string", maxLength: 4096 },
            email: { type: "string", maxLength: 320 },
          },
          ["server", "username", "password", "email"],
        ),
        async (args) => {
          const connection = ctx.beginConnection();
          try {
            const result = await native("register", args);
            if (!ctx.connectionCurrent(connection)) return { stale: true };
            ctx.updateConnection(result);
            $("connection-dialog").close();
            await reset(true);
            await load(true, true);
            return result;
          } catch (error) {
            if (ctx.connectionCurrent(connection)) {
              ctx.updateConnection({
                connected: false,
                nativePlayback: state.nativePlayback,
                server: args.server,
                username: args.username,
                generation: 0,
              });
              await reset(false);
              state.total = 0;
              state.items = [];
              await load();
            }
            throw error;
          } finally {
            if (ctx.connectionCurrent(connection)) $("password").value = "";
          }
        },
        "external",
      );
      action(
        "workbench.diagnostics",
        object(),
        async () => ({
          index: await send("info"),
          requests: requests.size,
          selected: selected.size,
          contractVersion: (await manifest).version,
        }),
        "read",
      );
      action(
        "ui.contract",
        object(),
        async () => {
          await ready;
          const controls = [
            ...document.querySelectorAll(
              "button,input:not([type=hidden]),select,textarea,summary,a[href],[role=button],[data-api-action]",
            ),
          ].map((node) => ({
            label:
              node.getAttribute("aria-label") ||
              node.textContent?.trim().slice(0, 100) ||
              node.tagName,
            action:
              node.dataset.apiAction ||
              (["INPUT", "TEXTAREA"].includes(node.tagName)
                ? "ui.set"
                : node.closest("form")?.dataset.apiAction || ""),
          }));
          const ids = new Set(api.list().map((v) => v.id));
          return {
            controls: controls.length,
            missing: controls.filter((v) => !ids.has(v.action)),
            operations: api
              .list()
              .filter((v) => v.id.startsWith("rhvideo."))
              .map(({ id, params, risk }) => ({ id, params, risk })),
          };
        },
        "read",
      );
      window.addEventListener("pagehide", () => {
        liveRefresh.stop();
        stopViewer();
        worker?.terminate();
        clearTimeout(saveTimer);
      });
      return {
        invalidateSession() {
          sessionSnapshot = null;
          sessionCheckedAt = 0;
          resolutions.clear();
        },
        acceptSession(value) {
          sessionSnapshot = value;
          sessionCheckedAt = performance.now();
        },
        catalog,
        reset,
        paintCards,
        play,
        image,
        stepImage,
        refreshImage,
        closeImage(){const id=imageSession?.previewId;imageSession=null;imageToken++;return id;},
        canPlayImage(){return !imageSession?.loading&&imageSession?.current?.kind==="frame";},
        previewTarget(kind,id){const item=$("image-dialog").open?imageSession?.current:null;if(!item)return null;return (item.kind==="frame"?kind==="video"&&item.videoId===id:item.kind===kind&&item.id===id)?{kind,id}:null;},
        async receivePreviewResult(result){showPreviewResult(result);if(!result.running&&result.items.some(i=>i.success)){invalidateCatalog();await load();}},
        invalidate(kind) {
          invalidateCatalog(kind);
        },
        back() {
          const id = ctx.modalTop();
          if (id?.startsWith("wb-") && $(id)?.open) {
            void invoke("panel.close", { id }).catch(notice);
            return true;
          }
          return false;
        },
      };
    },
  };
})();
