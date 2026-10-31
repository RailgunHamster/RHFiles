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
      // Only bounded list pages, never complete playback/export orders. The
      // worker still owns filtering and sorting; repeat paints need not pay a
      // thread round trip for the same immutable catalog revision.
      const pageResults = new Map();
      let configuration=null,favoriteExports=null,rulesEditor=null,duplicates=null,taskPriority=null,taskPresentation=null,taskCenter=null;
      const ruleProcessId=crypto.randomUUID();
      let ruleRefreshTimer=0,ruleRefreshWaiter=null,ruleEditIntent=0,ruleApplyIntent=0;
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
        selectionMode = false,
        raw = new Map(),
        imageSession = null,
        imageToken = 0,
        singlePlayIntent = 0,
        confirmationIntent = 0,
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
        favoriteStay: 5,
        favoriteFadeMs: 800,
        videoStay: 15,
        overlap: true,
        ratio: 0.3,
        min: 1,
        max: 2.5,
        kenBurns: true,
        lanes: 1,
        vertical: false,
        scrollSpeed: 400,
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
        autoRotate: false,
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
          () => {
            const pending=invoke(name,typeof args==="function"?args():args);
            // DOM dispatch ignores the return value; automation awaits it.
            // Observe errors for the UI without replacing their rejection.
            void pending.catch(notice);
            return pending;
          },
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
          () => {const pending=invoke(name,args(node.value));void pending.catch(notice);return pending;},
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
      function invalidatePendingConfirmation() {
        // A later user panel owns the UI. Invalidate only preparation that has
        // not created its confirmation; never cancel an accepted batch.
        confirmationIntent++;
      }
      function dialog(id, title) {
        invalidatePendingConfirmation();
        if (id === "wb-info") detailJob = null;
        if (id !== "wb-viewer" && viewer?.videoActive) {
          void presentationRequest("control", { command: "pause" }).catch(
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
        pageResults.clear();
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
        ruleApplyIntent++;
        cancelRuleRefresh();
        rulesEditor?.reset();
        configuration?.reset();
        favoriteExports?.reset();
        duplicates?.reset();
        taskPriority?.reset();
        taskPresentation?.reset();
        taskCenter?.reset();
        ctx.invalidateReads();
        const version=++epoch;
        abortPictureOrders();
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
        selectionMode = false;
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
        invalidateGallery();
        gallery.items = [];
        gallery.offset = 0;
        gallery.total = 0;
        gallery.seed = 0;
        $("gallery-content")?.replaceChildren();
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
          if(version!==epoch)return {stale:true};
          ctx.updateConnection(s);
          sessionSnapshot = s;
          sessionCheckedAt = performance.now();
          account = s.server + "\n" + s.username;
          accountGeneration = s.generation ?? null;
          resolutionRevision =
            String(s.generation) + ":" + String(s.assetRevision);
          const saved=await native("preferences");
          if(version!==epoch)return {stale:true};
          const restored=RHVideoRulesModel.restorePreferences(RHTagFilter,saved);
          prefs = restored.value;
          if(restored.warning)notice(restored.warning);
          applyPreferences();
          restoreGalleryPreferences();
          warmGallery();
        }
        return { reset: true };
      }
      async function ensure(force = false) {
        if(ctx.connectionReady)await ctx.connectionReady();
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
          if((await reset(true)).stale)throw Error("媒体账户已更改，已丢弃旧读取");
        }
        const active = sessionSnapshot || s;
        const revision =
          String(active.generation) + ":" + String(active.assetRevision);
        if (resolutionRevision !== revision) {
          resolutions.clear();
          resolutionRevision = revision;
        }
        resolutionGeneration = active.generation ?? state.generation;
        const version=epoch;
        await ready;
        if(version!==epoch)throw Error("媒体账户已更改，已丢弃旧读取");
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
        rulesEditor?.changed();
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
        paintStripSpeed(viewer);
        void syncVolume().catch(error=>{volumeKey="";notice(error);});
      }
      function save(immediate = false) {
        clearTimeout(saveTimer);
        const session = epoch;
        const enqueue = () => {
          saveTimer = 0;
          const value = structuredClone(prefs);
          const pending = saveChain
            .catch(() => {})
            .then(() => {
              if (session !== epoch || !state.connected) throw Error("媒体账户已改变，偏好未保存");
              return native("preferences", { value });
            });
          saveChain = pending.catch(error=>{if(!immediate&&session===epoch)notice(error);});
          return pending;
        };
        if(immediate)return enqueue();
        saveTimer = setTimeout(enqueue, 150);
      }
      function invalidateCatalog(kind) {
        catalogRevision++;
        pageResults.clear();
        rulesEditor?.catalogChanged();
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
      async function query(extra = {}, verifiedToken, cachePage = false) {
        const token = verifiedToken ?? (await ensure()),
          args = criteria(extra),
          revision = catalogRevision;
        await rawCatalog(args.kind);
        const current = () => {
          if (token !== epoch || revision !== catalogRevision)
            throw Error("媒体账户或清单已更改，已丢弃旧读取");
        };
        current();
        const cacheKey = cachePage && args.latest === true && !args.allKeys && !args.locate &&
          ["video", "picture", "novel", "favorite"].includes(args.kind)
          ? JSON.stringify([token, revision, args]) : null;
        if (cacheKey && pageResults.has(cacheKey)) {
          const result = pageResults.get(cacheKey);
          pageResults.delete(cacheKey); pageResults.set(cacheKey, result);
          return { ...result, items: result.items.slice() };
        }
        const result = await send("query", args);
        current();
        if (cacheKey && cacheKey.length <= 32768 && !result.stale && Array.isArray(result.items) && result.items.length <= 100 && !result.queue && JSON.stringify(result).length <= 262144) {
          if (pageResults.size >= 8) pageResults.delete(pageResults.keys().next().value);
          pageResults.set(cacheKey, { ...result, items: result.items.slice() });
          return { ...result, items: result.items.slice() };
        }
        return result;
      }
      async function catalog(refresh,locate) {
        const navigation=state.loadId,kind=state.kind;
        const token = await ensure(refresh);
        const current=()=>{
          if(token!==epoch)throw Error("媒体账户已更改，已丢弃旧读取");
          if(locate&&(navigation!==state.loadId||kind!==state.kind||state.view!=="catalog"))throw Error("媒体浏览位置已改变，已丢弃旧定位");
        };
        current();
        await rawCatalog(kind, refresh);
        const version = epoch,
          revision = catalogRevision;
        let offset,result;
        if(locate){
          current();
          if(locate.kind!==kind)throw Error("媒体定位分类无效");
          const args={locate:{key:kind+":"+locate.id},offset:0,limit:1};
          let target=await query(args,token);current();
          if(!target.located){prefs.rule={};invalidateGallery();warmGallery();save();target=await query(args,token);current();}
          if(!target.located)throw Error("源媒体已不在服务器清单中");
          offset=Math.floor(target.located.index/state.limit)*state.limit;
          result=await query({latest:true,offset},token,true);current();
        }else result = await query({latest:true}, token, true);
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
        current();
        let index = 0;
        resolved.items = cached.map((item) => item || resolved.items[index++]);
        if (version !== epoch || revision !== catalogRevision)
          throw Error("媒体账户或清单已更改，已丢弃旧读取");
        return { ...resolved, total: result.total, ...(locate?{offset}:{}) };
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
                invalidateGallery();
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
                "wb-rules",
                "wb-server",
                "wb-info",
                "wb-preview",
                "wb-confirm",
                "wb-gallery",
                "wb-viewer",
                "wb-image-preview",
                "wb-preview-results",
                "wb-exports",
                "wb-duplicates",
                "wb-duplicate-review",
              ],
            },
          },
          ["id"],
        ),
        async ({ id }) => {
          invalidatePendingConfirmation();
          if(id==="wb-duplicates")duplicates?.closed();
          if(id==="wb-server"){server.session++;server.load++;taskCenter?.closed();}
          if (id === "wb-viewer") stopViewer();
          if (id === "wb-confirm") pendingConfirmation = null;
          if (id === "wb-info") detailJob = null;
          if (id === "wb-preview") { preview.load++; preview.searchTicket++; }
          if (id === "wb-gallery") gallery.load++;
          if (id === "wb-image-preview") { thumbnailTicket++; $(id)?.querySelector('img')?.removeAttribute('src'); }
          $(id)?.close();
          liveRefresh.configure(liveRefresh.enabled);
          if (viewer?.videoActive && viewerIsTop()) {
            const v=viewer;
            await syncPresentation(1,true,v);
            if (viewer===v&&v.running&&viewerIsTop())
              await presentationRequest("control", { command: "resume" },v);
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
          const result=await load();if(galleryVisible())await loadGallery();return result;
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
          if (enabled) selectionMode = true;
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
          invalidateGallery();gallery.offset=0;
          if(galleryVisible())await loadGallery();else warmGallery();
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
        selectionMode = true;
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
          const version = epoch, intent = ++confirmationIntent;
          const items = await selectedItems();
          if (version !== epoch) throw Error("媒体账户已改变，确认未创建");
          if (intent !== confirmationIntent) return { stale: true };
          return beginConfirmation({ name: "trash.stage", batch: items });
        },
        "destructive",
      );
      action("selection.result", object(), () => lastBatch, "read");
      action("selection.markCurrent", object({expectedViewer:{type:"integer",minimum:1}}), async ({expectedViewer}={}) => {
        if(expectedViewer!==undefined&&viewer?.token!==expectedViewer)throw Error("浏览窗口已改变，旧标记未执行");
        const top=ctx.modalTop(),fromViewer=top==="wb-viewer";
        if(!["wb-viewer","image-dialog"].includes(top)||!$(top)?.open||expectedViewer!==undefined&&!fromViewer)throw Error("预览不是当前可见窗口，标记未执行");
        if(fromViewer&&viewer?.loadingMedia)throw Error("放映正在切换，请稍候再标记");
        if(!fromViewer&&imageSession?.loading)throw Error("图片正在切换，请稍候再标记");
        const item = fromViewer?viewer?.current:imageSession?.current;
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
        syncContext();
        favoriteExports?.sync();
        for (const card of $("media-grid").querySelectorAll(".media-card")) {
          const key = card.dataset.kind + ":" + card.dataset.id;
          let checkbox = card.querySelector(".wb-select");
          if (!checkbox) {
            checkbox = input("checkbox", "");
            checkbox.className = "wb-select";
            checkbox.dataset.apiAction = "rhvideo.selection.toggle";
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
          checkbox.hidden = !selectionMode;
          card.classList.toggle("selected", checkbox.checked);
        }
        $("wb-selection-count").textContent = selected.size
          ? "已选 " + selected.size + " 项"
          : "";
        if ($("wb-selection")) $("wb-selection").hidden = !selectionMode || !state.connected || state.view === "gallery";
      }
      function selectCard(media) {
        if (!selectionMode) return null;
        return invoke("selection.toggle", { id: media.id, kind: media.kind, enabled: !selected.has(I.key(media)) });
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
          const intent=epoch,initialNavigation=state.loadId,preview=imageSession;let previewToken=imageToken;
          const version=await ensure();
          if(intent!==version||state.loadId!==initialNavigation||imageSession!==preview||imageToken!==previewToken)return {stale:true};
          // Category reset and folder choices are shared with normal navigation,
          // but locate in the worker BEFORE resolving/painting the final page.
          const pending=ctx.loadCategory(kind,{kind,id}),navigation=state.loadId;
          const current=()=>version===epoch&&navigation===state.loadId&&state.kind===kind&&state.view==="catalog"&&imageToken===previewToken;
          await pending;
          if(!current()||imageSession!==preview)return {stale:true};
          if(state.error)throw Error(state.error);
          if(!state.items.some(item=>item.id===id&&item.kind===kind))throw Error("源媒体已不在服务器清单中");
          if($("image-dialog").open){const closing=invoke("image.close");previewToken=imageToken;await closing;if(!current())return {stale:true};}
          if($("wb-gallery")?.open){await invoke("panel.close",{id:"wb-gallery"});if(!current())return {stale:true};}
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
            favoriteStay: [1, 60],
            favoriteFadeMs: [100, 5000],
            min: [0, 30],
            max: [0, 60],
            ratio: [0, 1],
            segment: [1,300],
            scrollSpeed: [0, 2000],
            seed: [0, 4294967295],
          };
          if (bounds[key] && (value < bounds[key][0] || value > bounds[key][1]))
            throw Error("设置数值超出范围");
          if (
            (["perVideo", "gridCount", "readerFont", "volume"].includes(key) &&
              !Number.isSafeInteger(value))
          )
            throw Error("设置数值无效");
          if (key === "rule") {
            const result=await invoke("rules.apply",{rule:value});return {key,value:config().rule,...result};
          }
          if(viewer?.mode==="strip"&&["vertical","lanes"].includes(key)){layoutStrip({[key]:value});pauseStrip(viewer);void renderStrip().catch(notice);}
          if(key==="autoRotate")await native("rotation.preference",{enabled:value});
          if(!ctx.mobile&&["segment","fullLength","loop","portraitOnly"].includes(key)){
            const current=await native("player.state");if(current.queue?.options?.mode==="segments")await native("player.options",{options:{[key]:value},expectedId:current.queue.id,expectedRevision:current.queue.revision});
            await native("playlist.settings",{mode:"segments",options:{[key]:value}});
          }
          prefs[key] = value;
          if(key==="mixPictures"&&value&&!gallery.seed)gallery.autoShufflePending=true;
          save();
          applyPreferences();
          if(key==="volume")await syncVolume();
          if (["perVideo", "mixPictures", "rule"].includes(key)) {
            invalidateGallery();
            gallery.offset=0;
            if (galleryVisible()) await loadGallery();
            else warmGallery();
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
      action("rotation.state",object(),()=>native("rotation.preference"),"read");
      action("rotation.set",object({enabled:{type:"boolean"}},["enabled"]),async({enabled})=>{const value=await native("rotation.preference",{enabled});prefs.autoRotate=value.enabled;applyPreferences();return value;});
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
        await native("rotation.preference",{enabled:false});
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
              ["autoRotate", "智能旋转（更适合窗口比例时旋转）", "bool"],
              ["resume", "单视频自动续播", "bool"],
            ],
          ],
          [
            "连续浏览与放映",
            [
              ["vertical", "竖向长卷", "bool"],
              ["lanes", "列数", "number"],
              ["scrollSpeed", "每秒滚动像素", "number"],
              ["stay", "图片放映每张停留秒数", "number"],
              ["kenBurns", "缓慢缩放平移", "bool"],
              ["overlap", "重叠过渡", "bool"],
              ["ratio", "过渡时长比例", "number"],
              ["min", "过渡下限秒数", "number"],
              ["max", "过渡上限秒数", "number"],
            ],
          ],
          [
            "喜爱自动放映",
            [["favoriteStay","每张图片停留秒数","number"],["videoStay","每段视频停留秒数","number"],["favoriteFadeMs","交叉淡化毫秒数","number"]],
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
            control.dataset.preference=key;
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
        configuration.render(root);
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
            $("wb-rules")?.open ||
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
          // These are semantic navigation keys, as in the reference viewer.
          // Keypad / virtual keyboards need not expose a physical Home/End code.
          const navigationKey=event.key&&event.key!=='Unidentified'?event.key:event.code;
          if(scope==='viewer'&&['Home','End'].includes(navigationKey)&&!event.ctrlKey&&!event.altKey&&!event.shiftKey&&!event.metaKey){event.preventDefault();event.stopImmediatePropagation();void invoke('viewer.seek',{ratio:navigationKey==='Home'?0:1}).catch(notice);return;}
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
      function ruleIdentity(){return state.connected&&account&&accountGeneration===state.generation?ruleProcessId+':'+epoch+':'+state.generation:null;}
      const ruleOwnerSchema={expectedOwner:{type:'string',maxLength:128}};
      function checkRuleOwner(args={},allowPreparing=false){const identity=ruleIdentity();if(args.expectedOwner!==undefined&&args.expectedOwner!==identity)throw Error('媒体账户已改变，标签操作未执行');if(!identity&&!allowPreparing)throw Error('请先连接并等待媒体账户准备完成');}
      function cancelRuleRefresh(){clearTimeout(ruleRefreshTimer);ruleRefreshTimer=0;ruleEditIntent++;ruleRefreshWaiter?.resolve({stale:true});ruleRefreshWaiter=null;}
      function publishRule(rule){
        if(!ruleIdentity())throw Error("媒体账户正在改变，标签操作未执行");
        const normalized=RHTagFilter.normalize(rule),changed=RHTagFilter.key(normalized)!==RHTagFilter.key(config().rule);
        ruleApplyIntent++;
        prefs.rule=normalized;save();rulesEditor?.changed();
        if(!changed)return Promise.resolve({total:state.total,changed:false});
        invalidateGallery();gallery.offset=0;state.offset=0;state.loadId++;
        cancelRuleRefresh();const intent=ruleEditIntent,version=epoch;
        return new Promise((resolve,reject)=>{ruleRefreshWaiter={resolve,reject};ruleRefreshTimer=setTimeout(async()=>{
          ruleRefreshTimer=0;ruleRefreshWaiter=null;const current=()=>intent===ruleEditIntent&&version===epoch;
          try{if(!current()){resolve({stale:true});return;}if(galleryVisible())await loadGallery();else warmGallery();if(!current()){resolve({stale:true});return;}const result=await load();if(!current()){resolve({stale:true});return;}if(result?.error)throw Error(result.error);resolve({total:state.total,changed:true});}
          catch(error){if(!current())resolve({stale:true});else{rulesEditor?.error(error);reject(error);}}
        },150);});
      }
      async function tagCatalog(args,current=()=>true){
        if(!current())return {stale:true};
        const identity=ruleIdentity(),version=await ensure(),revision=catalogRevision;if(!identity||identity!==ruleIdentity())throw Error("媒体账户已改变，标签读取未继续");
        if(!current())return {stale:true};
        const kinds=args.source==='gallery'?['video',...(config().mixPictures?['picture']:[])]:[args.source];
        await Promise.all(kinds.map(kind=>rawCatalog(kind)));
        if(!current())return {stale:true};
        const result=await send('tags',{...args,kinds,mediaType:args.source==='favorite'?config().mediaType:'',latest:true});
        if(version!==epoch||revision!==catalogRevision||identity!==ruleIdentity())throw Error("媒体账户或清单已改变，旧标签读取已丢弃");return result;
      }
      action("rules.apply",object({...ruleOwnerSchema,rule:{type:"object"}},["rule"]),async({rule,expectedOwner})=>{
        const generation=state.generation,intent=++ruleApplyIntent;
        try{checkRuleOwner({expectedOwner},true);const normalized=RHTagFilter.normalize(rule);await ensure();checkRuleOwner({expectedOwner});if(generation!==state.generation||intent!==ruleApplyIntent)throw Error("媒体账户或筛选意图已改变，旧规则未应用");return await publishRule(normalized);}catch(e){if(generation===state.generation&&(!expectedOwner||expectedOwner===ruleIdentity()))rulesEditor?.error(e);throw e;}
      });
      action(
        "rules.save",
        object({ ...ruleOwnerSchema,name: { type: "string", minLength: 1, maxLength: 100 } }, [
          "name",
        ]),
        ({ name,expectedOwner }) => {
          checkRuleOwner({expectedOwner});
          prefs.savedRules = {
            ...(prefs.savedRules || {}),
            [name]: structuredClone(config().rule),
          };
          save();
          rulesEditor?.changed();
          return { saved: true };
        },
      );
      action(
        "rules.restore",
        object({ ...ruleOwnerSchema,name: { type: "string", maxLength: 100 } }, ["name"]),
        ({ name,expectedOwner }) => {
          checkRuleOwner({expectedOwner});
          const rule = prefs.savedRules?.[name];
          if (!rule) throw Error("没有这个筛选规则");
          return invoke("rules.apply", { rule,expectedOwner:ruleIdentity() });
        },
      );
      action("rules.open", object(ruleOwnerSchema), args => {checkRuleOwner(args,true);return rulesEditor.open();});
      action(
        "rules.delete",
        object({ ...ruleOwnerSchema,name: { type: "string", minLength: 1, maxLength: 100 } }, [
          "name",
        ]),
        ({ name,expectedOwner }) => {
          checkRuleOwner({expectedOwner});
          delete prefs.savedRules?.[name];
          save();
          rulesEditor?.changed();
          return { removed: name };
        },
      );
      action(
        "rules.mode",
        object({ ...ruleOwnerSchema,value: { type: "string", enum: ["and", "or"] } }, ["value"]),
        async ({ value,expectedOwner }) => {checkRuleOwner({expectedOwner});await invoke("rules.apply",{rule:{...config().rule,mode:value},expectedOwner:ruleIdentity()});return {mode:value};},
      );
      action("rules.form", object(ruleOwnerSchema), args => {checkRuleOwner(args);return invoke("rules.apply", {
          expectedOwner:ruleIdentity(),
          rule: {
            mode: config().rule.mode,
            include: $("wb-rule-include")
              .value.split(",")
              .map((v) => v.trim())
              .filter(Boolean),
            exclude: $("wb-rule-exclude")
              .value.split(",")
              .map((v) => v.trim())
              .filter(Boolean),
          },
        });});
      action("rules.json", object(ruleOwnerSchema), args => {checkRuleOwner(args);try{return invoke("rules.apply",{rule:JSON.parse($("wb-rule-json").value),expectedOwner:ruleIdentity()});}catch(e){rulesEditor?.error(e);throw e;}});
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
          const intent = ++confirmationIntent,
            wanted = args.expectedGeneration ?? state.generation,
            version = await ensure();
          if (version !== epoch || wanted !== state.generation)
            throw Error("媒体账户已改变，确认未创建");
          if (intent !== confirmationIntent) return { stale: true };
          const spec = (await manifest).operations[args.name];
          if (version !== epoch || wanted !== state.generation)
            throw Error("媒体账户已改变，确认未创建");
          if (intent !== confirmationIntent) return { stale: true };
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
        session: 0,
        page: "watch",
        queue: "default",
        view: "running",
        pageNumber: 1,
        q: "",
        days: 7,
        status: "all",
        load: 0,
        renderedLoad: 0,
      };
      action('server.state',object(),()=>({...server,loading:server.load!==server.renderedLoad}),'read');
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
          taskPresentation?.connection(value.error);
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
          if (target.type === "task") {paintTaskDetail(root, value, target.kind);taskDetailFooter(root,target.kind,target.id);}
          else {root.replaceChildren(detail(value));root.append(
            el("p", "", "wb-live-status"),
            button(
              "刷新",
              target.type === "task" ? "task.detail" : "batch.detail",
              target.type === "task"
                ? { kind: target.kind, id: target.id }
                : { id: target.id },
            ),
          );}
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
          server.session++;
          server.page = page;
          taskCenter?.closed();
          if(['tasks','replacement'].includes(page)){server.queue=page==='replacement'?'replacement':'default';server.view='running';server.q='';server.days=7;server.status='all';}
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
          RHVideoTaskPriority.filter(key,value);
          if(key==='status'&&server.queue==='default'&&!RHVideoTaskCenter.statusOptions('default').some(([id])=>id===value))throw Error('默认处理队列不支持此历史结果筛选');
          if(key==='queue'&&value!==server.queue){server.view='running';if(value==='default'&&['skipped','cancelled'].includes(server.status))server.status='all';}
          server[key] = value;
          if(key==='queue'&&value==='default'&&server.page==='replacement')server.page='tasks';
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
        if(['tasks','replacement'].includes(server.page))return renderTaskServer(background);
        $('wb-server')?.classList.remove('rv-task-center-panel');
        liveRefresh.delay=3000;
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
          syncTaskPriorityUI();
          if(token===server.load)server.renderedLoad=token;
          return active;
        } catch (error) {
          if (token === server.load && !background)
            body.replaceChildren(
              el("p", String(error.message || error), "wb-error"),
            );
          throw error;
        }
      }
      async function renderTaskServer(background){
        const token=++server.load,version=epoch,session=server.session;
        const root=background?$('wb-server').querySelector('.wb-content'):dialog('wb-server','任务中心');
        $('wb-server').classList.add('rv-task-center-panel');
        if(!root.querySelector('.rv-task-center')){
          root.replaceChildren();const nav=el('nav',undefined,'wb-tabs');
          for(const [page,title]of [['watch','监控目录'],['tasks','处理队列'],['replacement','原片替换'],['trash','暂存区'],['storage','存储'],['system','服务']])nav.append(button(title,'server.open',{page},'button '+(page===server.page?'primary':'secondary')));
          const body=el('div',undefined,'wb-server-body rv-task-center'),batches=el('details',undefined,'rv-task-batches'),summary=el('summary','替换批次');summary.dataset.apiAction='rhvideo.task.batchesVisibility';listen(summary,'click',event=>{event.preventDefault();invoke('task.batchesVisibility',{visible:!batches.open}).catch(notice);},'tasks.batches.visibility');batches.append(summary,el('div',undefined,'rv-task-batch-list'));batches.hidden=true;
          root.append(nav,button('刷新','server.refresh'),body,batches,el('p','','wb-live-status'));
        }
        [...root.querySelector('.wb-tabs').children].forEach((button,index)=>{const active=['watch','tasks','replacement','trash','storage','system'][index]===server.page;button.classList.toggle('primary',active);button.classList.toggle('secondary',!active);});
        liveRefresh.delay=server.view==='history'?15000:4000;server.live=true;
        const valid=()=>version===epoch&&session===server.session&&token===server.load&&$('wb-server')?.open&&['tasks','replacement'].includes(server.page);
        try{
          const result=await taskCenter.render(root.querySelector('.rv-task-center'),{...server},valid);if(!valid()||result.stale)return false;
          const batches=root.querySelector('.rv-task-batches');batches.hidden=server.page!=='replacement';
          if(server.page==='replacement'){
            try{const value=await remote('batches.list',{query:{limit:20}});if(!valid())return false;const signature=JSON.stringify(value),list=batches.querySelector('.rv-task-batch-list');if(list.dataset.signature!==signature){list.dataset.signature=signature;list.replaceChildren();for(const batch of Array.isArray(value)?value:value.items||[]){const row=serverRow(batch.id,RHVideoTaskPresentation.labels[batch.status]||batch.status);row.append(button('批次详情','batch.detail',{id:batch.id}));if(['queued','running','stopping','paused'].includes(batch.status))row.append(button('停止剩余项目','remote.batches.stop',{params:{id:batch.id},expectedGeneration:state.generation}));list.append(row);}}}
            catch(error){if(valid()){const list=batches.querySelector('.rv-task-batch-list');list.replaceChildren(el('p','读取替换批次失败：'+String(error.message||error),'wb-error'));delete list.dataset.signature;}}
          }
          syncTaskPriorityUI();return true;
        }finally{if(valid())server.renderedLoad=token;}
      }
      action('task.batchesVisibility',object({visible:{type:'boolean'}},['visible']),({visible})=>{const node=$('wb-server')?.querySelector('.rv-task-batches');if(!$('wb-server')?.open||!node||node.hidden)throw Error('当前没有显示替换批次');node.open=visible;return {visible:node.open};});
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
      function syncTaskPriorityUI(){
        const value=taskPriority?.state();if(!value)return;
        for(const button of document.querySelectorAll('[data-task-priority-key]')){
          button.disabled=!!value.pending;
          button.textContent=value.pending&&button.dataset.taskPriorityKey===value.pending.kind+':'+value.pending.id?'正在置顶…':'置顶此项';
        }
        for(const node of document.querySelectorAll('.wb-task-priority-message')){
          node.textContent=value.target?.kind===node.dataset.queue&&value.target.session===Number(node.dataset.prioritySession)?value.error||value.message:'';
          node.hidden=!node.textContent;node.setAttribute('role',value.error?'alert':'status');
          node.classList.toggle('wb-error',!!value.error);
        }
      }
      function taskPriorityMessage(kind){const node=el('p',undefined,'wb-task-priority-message');node.dataset.queue=kind;node.dataset.prioritySession=String(server.session);node.hidden=true;queueMicrotask(syncTaskPriorityUI);return node;}
      function taskPriorityButton(task,kind){
        const node=button('置顶此项','task.prioritize',{kind,id:task.id,expectedRevision:taskPriority.state().revision});
        node.dataset.taskPriorityKey=kind+':'+task.id;node.title='移到等待队列最前面，当前任务继续处理';node.disabled=!!taskPriority.state().pending;return node;
      }
      function paintTaskThumbnail(root,t,previous){
        root.replaceChildren();
        if (typeof t.video_id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(t.video_id)) {
          const path="/api/v1/videos/"+t.video_id+"/thumbnail", title=t.filename||"任务缩略图";
          const identity=JSON.stringify([epoch,state.generation,t.video_id,t.status,t.started_at,t.queued_at,t.finished_at]),phase=String(t.progress?.stage||'');
          if(previous?.dataset.taskThumbnailIdentity===identity&&(previous.dataset.loaded==='true'||previous.dataset.phase===phase))root.append(previous);
          else {
            const previewButton=button("", "image.preview", {path,title}, "wb-thumbnail-preview"),image=el("img"),label=el('span','正在读取缩略图…'),fallback=el('span',undefined,'wb-task-thumb-fallback');
            fallback.innerHTML=icon('video');image.alt=title;previewButton.disabled=true;previewButton.dataset.taskThumbnailIdentity=identity;previewButton.dataset.phase=phase;
            // Keep a single reserved media frame: an image may acquire its
            // dimensions before load fires and hides the placeholder.
            const frame=el('span',undefined,'wb-task-thumb-frame');frame.append(image,fallback);previewButton.append(frame,label);root.append(previewButton);
            const failed=()=>{image.hidden=true;fallback.hidden=false;previewButton.disabled=true;label.textContent='暂未生成缩略图';};
            listen(image,'load',()=>{previewButton.dataset.loaded='true';previewButton.disabled=false;fallback.hidden=true;label.textContent='放大缩略图';},'tasks.thumbnail.loaded');
            listen(image,'error',failed,'tasks.thumbnail.error');
            const version=epoch;
            void native("images",{paths:[path]}).then(([url])=>{if(version===epoch&&image.isConnected)image.src=url;}).catch(()=>{if(version===epoch&&image.isConnected)failed();});
          }
        }
      }
      function paintTaskDetail(root,t,kind){return taskPresentation.paint(root,t,kind);}
      function taskDetailFooter(root,kind,id,name='task.detail'){if(root.querySelector('.rv-task-footer'))return;const footer=el('footer',undefined,'rv-task-footer wb-toolbar');footer.append(el('p','','wb-live-status'),button('刷新',name,name==='task.detail'?{kind,id}:{}));root.append(footer);}
      action('task.detailState',object(),()=>{const opened=detailJob?.type==='task'&&!!$('wb-info')?.open;return {opened,loading:opened&&!!detailJob.loading,kind:opened?detailJob.kind:null,id:opened?detailJob.id:null,detail:opened?taskPresentation.snapshot($('wb-info').querySelector('.wb-content')):null};},'read');
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
          const prior=detailJob;
          const root = dialog("wb-info", "任务详情"),
            job = { type: "task", kind, id,loading:true };
          detailJob = job;
          if(prior?.type!=='task'||prior.kind!==kind||prior.id!==id)root.textContent = "正在读取…";
          try {
          const t = await remote("tasks.detail", {
            params: { queue: kind, entry: id },
          });
          if (detailJob !== job || !$("wb-info").open) return { stale: true };
          job.loading=false;
          root.querySelector('.rv-task-read-error')?.remove();
          paintTaskDetail(root, t, kind);
          taskDetailFooter(root,kind,id);
          liveRefresh.configure(hasLiveWork(t), true);
          return t;
          }catch(error){if(detailJob===job&&$('wb-info')?.open){job.loading=false;let problem=root.querySelector('.rv-task-read-error');if(!problem){problem=el('p',undefined,'rv-task-read-error wb-error');problem.setAttribute('role','alert');root.prepend(problem);}problem.textContent='读取任务失败：'+String(error.message||error);taskPresentation.connection(String(error.message||error));taskDetailFooter(root,kind,id);}throw error;}
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
        async (args) => {
          // Like showBatchReplaceModal, freeze selected IDs at the click, then
          // order known videos by the full list, not click order/current page
          // or search/tag filters. Keep missing IDs for backend validation.
          const version = epoch, intent = ++confirmationIntent,
            keys = [...selected].filter(key => key.startsWith("video:")),
            c = config();
          if (!keys.length) throw Error("请先选择视频");
          if (keys.length > 1000) throw Error("批量替换最多选择 1000 个视频，请减少所选项目");
          await ensure();
          if (version !== epoch) throw Error("媒体账户已改变，替换确认未创建");
          if (intent !== confirmationIntent) return { stale: true };
          const snapshot = await query({
            kind:"video", search:"", folder:"", rule:{},
            sort:c.sort, seed:c.seed, mediaType:"video", portraitOnly:false,
            selected:keys, allKeys:true, offset:0, limit:1,
          }, version);
          if (version !== epoch) throw Error("媒体账户已改变，替换确认未创建");
          if (intent !== confirmationIntent) return { stale: true };
          const order = new Map(snapshot.queue.map((item, index) => [item.id, index])),
            ids = keys.map(key => key.slice(6));
          ids.sort((a,b) => (order.get(a) ?? order.size) - (order.get(b) ?? order.size));
          return invoke("replacement.submit", {...args, ids});
        },
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
        if(state.kind==="favorite")return favoriteBrowse(media,low);
        const c=config(),version=epoch,intent=++singlePlayIntent;
        const title=media.title+(low?" (超压)":"");
        let parent={},parentSession=null;
        if(galleryReady()){
          // Like playVideoLocal, borrow an ALREADY loaded screenshot snapshot.
          // The original synchronous click never fetches the whole gallery
          // before starting a video; a cold pool means no implicit parent.
          try{
            const args={kind:"gallery",search:state.search,rule:c.rule,sort:"source",seed:gallery.seed,offset:0,limit:1};
            const result=await send("query",{...args,locate:{videoId:media.id}}),match=result.located;
            if(intent!==singlePlayIntent)return {stale:true};
            if(match){parentSession={args,index:match.index,total:result.total,current:match.item,previewId:crypto.randomUUID(),playbackId:crypto.randomUUID()};parent={origin:"frame",deferPreviewCommit:true,parentKey:I.key(parentSession.current),parentPreview:parentSession.previewId,parentPlayback:parentSession.playbackId,parentTotal:result.total};}
          }catch(error){if(version===epoch&&intent===singlePlayIntent)notice("截图队列不可用，视频仍可单独播放："+String(error));}
        }
        if(version!==epoch)throw Error("媒体账户已更改，播放未开始");
        if(intent!==singlePlayIntent)return {stale:true};
        const ticket=await prepareQueue([{...media,title}],{fullLength:true,super:low,...parent});
        if(version!==epoch)throw Error("媒体账户已更改，播放未开始");
        if(intent!==singlePlayIntent){await discardPrepared(ticket,version);return {stale:true};}
        const previous=imageSession;imageSession=parentSession;
        try{return await native("play",{id:media.id,title,playlist:ticket,super:low,resume:c.resume});}
        catch(error){if(version===epoch&&intent===singlePlayIntent&&imageSession===parentSession)imageSession=previous;await discardPrepared(ticket,version);throw error;}
      }
      action("media.playLow",object({id:string},["id"]),({id})=>{const item=state.items.find(v=>v.id===id&&v.kind==="video");if(!item)throw Error("视频已不在当前清单，请刷新");return play(item,true);},"external");
      // Explicit playlists retain the full filtering/order snapshot, not just
      // the current card page. Never silently substitute a clicked item's ID.
      async function startPlaylist(mode="segments") {
        const version=epoch,intent=++singlePlayIntent,c=config(),sequential=mode!=="segments",low=mode==="sequential-super",P=RHVideoModel.playback;
        if(sequential&&selected.size)throw Error("请先退出多选，再按当前列表顺序连播");
        const saved=await native("playlist.state",{mode});
        const initial=P.initial(mode,saved,c),{portraitOnly,fullLength,segment}=initial;
        const result=await query({kind:"video",mediaType:"video",allKeys:true,portraitOnly:false,selected:[],offset:0,limit:1});
        let ids;
        if(sequential)ids=P.listIds(result.queue);
        else{
          if(!galleryReady())await loadGallery(false,false);
          const frames=await send("query",{kind:"gallery",search:state.search,rule:c.rule,sort:"source",seed:gallery.seed,offset:0,limit:1,allKeys:true});
          const position=prefs.galleryResume;
          let at=position?.orderKey?frames.queue.findIndex(f=>f.orderKey===position.orderKey):position?.mediaKey?frames.queue.findIndex(f=>f.key===position.mediaKey):-1;
          if(at<0&&position?.videoId)at=frames.queue.findIndex(f=>f.videoId===position.videoId);
          if(at<0)at=Number.isSafeInteger(position?.index)&&position.index>=0&&position.index<frames.total?position.index:0;
          ids=P.galleryIds(frames.queue,at);
        }
        // Metadata is resolved in the worker once, not by fetching each video.
        const all=await send("query",{kind:"video",sort:"nameAsc",allKeys:true,offset:0,limit:1});
        const portraitIds=new Set(all.queue.filter(v=>['ready','processing'].includes(v.status)&&P.portrait(v.resolution)).map(v=>v.id));
        const visibleIds=portraitOnly?ids.filter(id=>portraitIds.has(id)):ids;
        if(visibleIds.length<(portraitOnly?2:sequential?1:2))throw Error(portraitOnly?"竖屏视频不足 2 个，无法连播":sequential?"当前列表没有可播放的视频":"需要至少 2 个视频才能分段连播");
        const signature=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(visibleIds))))).map(b=>b.toString(16).padStart(2,"0")).join("");
        if(version!==epoch)throw Error("媒体账户已更改，播放未开始");
        if(intent!==singlePlayIntent)return {stale:true};
        const entries=P.entries(ids,all.queue,{segment,fullLength,super:low});
        const index=saved?.signature===signature?Math.max(0,Math.min(visibleIds.length-1,saved.index||0)):0,current=entries.find(e=>e.id===visibleIds[index]);
        const ticket = await prepareQueue(entries, {
          reference:true,mode,signature,closeAtEnd:true,
          super:low,loop:initial.loop,rate:initial.rate,
          fullLength,segment,portraitOnly,
        });
        if(version!==epoch)throw Error("媒体账户已更改，播放未开始");
        if(intent!==singlePlayIntent){await discardPrepared(ticket,version);return {stale:true};}
        try{return await native("play", {
          id: current.id,
          title: current.title,
          playlist: ticket,
          super:low,
          resume:false,
        });}catch(error){await discardPrepared(ticket,version);throw error;}
      }
      async function prepareQueue(queue, options = {}) {
        const ticket = crypto.randomUUID(),
          version = epoch;
        try{for (let offset = 0; offset < queue.length; offset += 200) {
          if (version !== epoch) throw Error("媒体账户已更改");
          await native("playlist.prepare", {
            ticket,
            reset: offset === 0,
            items: queue.slice(offset, offset + 200),
            options,
          });
        }return ticket;}catch(error){await discardPrepared(ticket,version);throw error;}
      }
      async function discardPrepared(ticket,version){
        if(!ticket||version!==epoch)return;
        try{await native("playlist.discard",{ticket});}
        catch(error){if(version===epoch)notice("释放旧播放准备失败："+String(error));}
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
          const version = epoch,intent=++singlePlayIntent;
          const data = await native("playback.history"),
            item = data[id];
          if (version !== epoch) throw Error("媒体账户已改变，播放未开始");
          if(intent!==singlePlayIntent)return {stale:true};
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
          const version=epoch,c=config();if(!galleryReady())await loadGallery(false,false);
          const frames=await send("query",{kind:"gallery",search:state.search,rule:c.rule,sort:"source",seed:gallery.seed,allKeys:true,offset:0,limit:1});
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
      const gridInputGuard={expectedInput:{type:"integer",minimum:1},inputTarget:{type:"integer",minimum:0,maximum:8},...(ctx.mobile?{expectedInputs:{type:"array",minItems:1,maxItems:9,items:{type:"integer",minimum:1}},expectedOffset:{type:"integer",minimum:0},expectedLease:{type:"string",minLength:1,maxLength:128}}:{})};
      action("grid.seekGroup",object({...gridInputGuard,ratio:{type:"number",minimum:0,maximum:1}},["ratio"]),args=>native("grid.seekGroup",args));
      action("grid.close", object(), () => native("grid.close"));
      for(const name of ['favorite','mark'])action('grid.'+name,object({...gridInputGuard,target:{type:'integer',minimum:0,maximum:8},...(name==='mark'?{enabled:{type:'boolean'}}:{})},['target']),args=>native('grid.'+name,args),'write');
      action("player.close", object(), () => {singlePlayIntent++;return native("player.close");});
      const parentGuard={expectedId:{type:"string",maxLength:128},expectedRevision:{type:"integer",minimum:1},expectedInput:{type:"integer",minimum:1}};
      action("player.seekParent",object({ratio:{type:"number",minimum:0,maximum:1},...(ctx.mobile?{expectedInputId:{type:"integer",minimum:1}}:parentGuard)},["ratio"]),args=>ctx.mobile?native("player.control",{command:"seekParent",value:args.ratio,...(args.expectedInputId?{expectedInputId:args.expectedInputId}:{})}):native("player.seekParent",args));
      if(!ctx.mobile){
        action("player.state",object(),()=>native("player.state"),"read");
        action("player.back",object({expectedInput:parentGuard.expectedInput}),args=>native("player.back",args));
        for(const direction of ["next","previous"])action("player."+direction,object(parentGuard),args=>native("player."+direction,args));
        action("player.favorite",object(parentGuard),async args=>{const current=await native("player.state");if(!current.opened||!current.queue?.id)throw Error("播放器尚未就绪");return native("player.favorite",{id:args.expectedId??current.queue.id,revision:args.expectedRevision??current.queue.revision,...(args.expectedInput?{expectedInput:args.expectedInput}:{})});},"write");
      }
      action(
        "grid.control",
        object(
          {
            ...gridInputGuard,
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
        object({ ...gridInputGuard, target: { type: "integer", minimum: -1, maximum: 8 } }, [
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
        action("player.rotate",object({...inputGuard,enabled:{type:"boolean"}}),args=>native("player.control",{command:"autoRotate",...args}));
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
                  "autoRotate",
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
        if(state.kind==="favorite")return favoriteBrowse(media);
        const version=epoch,intent=++singlePlayIntent;
        const args = criteria({
            kind: state.kind === "favorite" ? "favorite" : "picture",
            mediaType: "picture",
            offset: 0,
            limit: 1,
          }),
          result = await query({...args,locate:{key:I.key(media)}});
        if(version!==epoch||intent!==singlePlayIntent)return {stale:true};
        if(!result.located)throw Error("这张图片已不在当前清单中，请刷新");
        const session=imageSession = {
          previewId:crypto.randomUUID(),
          args,
          index: result.located.index,
          total: result.total,
          current: null,
          pendingTarget:{...media,index:result.located.index,total:result.total},
        };
        ctx.openDialog("image-dialog");
        const displayed=await stepImage(0);
        if(displayed.stale||version!==epoch||intent!==singlePlayIntent||imageSession!==session)return {stale:true};
        return { opened: true, total: result.total };
      }
      async function favoriteBrowse(media=null,low=false,start=0){
        const version=epoch,intent=++singlePlayIntent,args=criteria({kind:"favorite",allKeys:true,offset:0,limit:1}),result=await query(args);
        if(version!==epoch||intent!==singlePlayIntent)return {stale:true};
        const items=result.queue.filter(row=>["video","picture"].includes(row.kind)),index=media?items.findIndex(row=>I.key(row)===I.key(media)):Math.min(start,items.length-1);
        if(index<0)throw Error("此项目已不在当前收藏筛选中，请刷新");
        await retireFavoriteChild(imageSession);if(version!==epoch||intent!==singlePlayIntent)return {stale:true};
        imageToken++;imageSession={favorite:true,args,items,index,total:items.length,current:null,pendingTarget:{...items[index],index,total:items.length},previewId:crypto.randomUUID(),low};
        ctx.openDialog("image-dialog");const shown=await stepImage(0);
        return shown.stale?shown:{opened:true,total:items.length};
      }
      action("favorite.browse",object({index:{type:"integer",minimum:0,maximum:999999}}),({index=0})=>favoriteBrowse(null,false,index),"external");
      async function retireFavoriteChild(session){
        if(!session?.favorite||!session.playbackId)return;
        const playbackId=session.playbackId;session.playbackId=null;
        await native("player.closeParent",{parentPreview:session.previewId,parentPlayback:playbackId});
      }
      async function playFavoriteVideo(session,item,index,ticket){
        const version=epoch,playbackId=crypto.randomUUID();let prepared;
        const active=()=>version===epoch&&ticket===imageToken&&imageSession===session;
        try{
          prepared=await prepareQueue([item],{fullLength:true,super:!!session.low,origin:"favorite",deferPreviewCommit:true,parentKey:I.key(item),parentPreview:session.previewId,parentPlayback:playbackId,parentIndex:index,parentTotal:session.total});
          if(!active()){await discardPrepared(prepared,version);return {stale:true};}
          const previous={current:session.current,index:session.index,playbackId:session.playbackId};session.current=item;session.index=index;session.playbackId=playbackId;
          try{await native("play",{id:item.id,title:item.title,playlist:prepared,super:!!session.low});}
          catch(error){if(active()&&session.playbackId===playbackId)Object.assign(session,previous);throw error;}
          if(!active()){await native("player.closeParent",{parentPreview:session.previewId,parentPlayback:playbackId});return {stale:true};}
          return {index,total:session.total};
        }catch(error){await discardPrepared(prepared,version);throw error;}
      }
      async function stepImage(direction,targetIndex=null) {
        if (!imageSession) throw Error("没有图片浏览队列");
        if(!imageSession.args&&imageSession.total===1)return {index:0,total:1};
        const ticket = ++imageToken,
          session = imageSession,
          index = targetIndex??RHVideoModel.playback.step(session.pendingIndex??session.index,direction,session.total);
        ctx.cancelImageDecode();
        const previousTarget=session.pendingTarget?.index===index?session.pendingTarget:session.favorite?session.items[index]:null;
        session.pendingTarget={...previousTarget,index,total:session.total};delete session.failedTarget;
        session.pendingIndex=index;
        session.loading=true;
        session.error="";
        refreshImage();
        try{
          const value = session.favorite?{items:[session.items[index]]}:await send("query", {
          ...session.args,
          allKeys: false,
          offset: index,
          limit: 1,
        });
        if (value.stale || ticket !== imageToken || session !== imageSession) return { stale: true };
        if (!value.items.length)
          throw Error("当前筛选结果中没有这张图片，请刷新清单");
        session.pendingTarget={...value.items[0],index,total:session.total};refreshImage();
        if(session.favorite&&value.items[0].kind==="video")return await playFavoriteVideo(session,value.items[0],index,ticket);
        // A picture reached from a native favorite video retires that child.
        if(session.favorite&&session.current?.kind==="video")await retireFavoriteChild(session);
        if(ticket!==imageToken||session!==imageSession)return {stale:true};
        const result = session.favorite||session.args.kind==="gallery"
          ? {items:[{...value.items[0],cover:(await native("images",{paths:[value.items[0].path||"/storage/"+value.items[0].webp_path]}))[0]}]}
          : await native("resolve", { items: value.items });
        if (ticket !== imageToken || session !== imageSession)
          return { stale: true };
        session.pendingTarget={...result.items[0],index,total:session.total};refreshImage();
        const decoded=await ctx.prepareImage(result.items[0],()=>ticket===imageToken&&session===imageSession);
        if(decoded?.stale||ticket!==imageToken||session!==imageSession)return {stale:true};
        session.index = index;
        session.current = result.items[0];
        if(session.args.kind==="gallery"){prefs.galleryResume={mediaKey:I.key(session.current),orderKey:I.galleryKey(session.current),videoId:session.current.videoId??null,index,offset:Math.floor(index/gallery.limit)*gallery.limit};save();}
        ctx.resetImageZoom();
        refreshImage();
        return { index, total: session.total };
        }catch(error){
          if(ticket!==imageToken||session!==imageSession)return {stale:true};
          session.failedTarget=session.pendingTarget;session.error=String(error?.message||error);throw error;
        }finally{
          if(ticket===imageToken&&session===imageSession){session.loading=false;delete session.pendingIndex;delete session.pendingTarget;refreshImage();}
        }
      }
      function imageTarget(item,index,total){
        return {id:typeof item?.id==='string'?item.id:null,kind:typeof item?.kind==='string'?item.kind:null,title:typeof item?.title==='string'?item.title:'',videoId:typeof item?.videoId==='string'?item.videoId:null,seconds:Number.isFinite(item?.seconds)?item.seconds:null,duration:Number.isFinite(item?.duration)?item.duration:null,index,total};
      }
      function imagePresentation(){
        const s=imageSession,requested=s?.loading?imageTarget(s.pendingTarget,s.pendingIndex??s.index,s.total):null,failed=s?.error&&s.failedTarget?imageTarget(s.failedTarget,s.failedTarget.index,s.total):null;
        const displayed=s?.current?imageTarget(s.current,s.index,s.total):null,target=displayed||requested||failed;
        const caption={...(target||imageTarget(null,null,0)),title:target?.title||(target?'第 '+(target.index+1)+' 张':'图片预览'),source:displayed?'current':requested?'requested':failed?'failed':'empty'};
        const describe=value=>value?[(value.index+1)+' / '+value.total,value.title].filter(Boolean).join(' · '):'';
        const status=s?.loading?'正在加载 '+describe(requested):s?.error?(describe(failed)?describe(failed)+'：':'')+s.error:'';
        return {caption,requested,failed,status};
      }
      function refreshImage() {
        const loading=imageSession?.loading===true,presentation=imagePresentation();
        const status=$("image-load-status");status.hidden=!loading&&!imageSession?.error;status.textContent=presentation.status;status.classList.toggle("is-error",!loading&&!!imageSession?.error);
        $("image-dialog").setAttribute("aria-busy",String(loading));
        $("full-image").setAttribute("aria-disabled",String(loading));
        const frame=imageSession?.current?.kind==="frame";for(const id of ["wb-frame-play","wb-frame-play-low"])if($(id))$(id).hidden=!frame;
        for(const id of ["wb-frame-play","wb-frame-play-low","wb-image-mark","wb-image-reveal"])if($(id))$(id).disabled=loading||!imageSession?.current;
        const item=imageSession?.current,kind=frame?"video":item?.kind,id=frame?item?.videoId:item?.id,key=kind+":"+id,favorite=$("wb-image-favorite");
        const video=item?.kind==="video";$("full-image").hidden=video;
        for(const control of $("image-dialog").querySelectorAll('[data-api-action="rhvideo.image.order"]'))control.hidden=!!imageSession?.favorite;
        if(favorite){favorite.hidden=!["video","picture","novel"].includes(kind)||!id;favorite.textContent=state.favorites.has(key)?"取消收藏":"收藏";favorite.setAttribute("aria-pressed",String(state.favorites.has(key)));favorite.disabled=loading||state.favoriteBusy.has(key);}
        if($("wb-image-mark"))$("wb-image-mark").hidden=!["video","picture","novel"].includes(kind)||!id;
        if (imageSession?.current&&!loading&&!video)
          showImage(
            imageSession.current,
            imageSession.index,
            imageSession.total,
          );
        ctx.showImageCaption(presentation.caption,presentation.caption.index,presentation.caption.total);
      }
      action(
        "image.order",
        object({ random: { type: "boolean" } }, ["random"]),
        async ({ random }) => {
          if (!imageSession?.args) throw Error("当前图片没有可排序的浏览队列");
          if (imageSession.favorite) throw Error("收藏浏览保持打开时的筛选顺序；请返回收藏列表调整排序");
          const value=random?crypto.getRandomValues(new Uint32Array(1))[0]:0;
          imageSession.args.seed=random&&imageSession.args.kind==="gallery"?value.toString(16).padStart(8,"0"):value;
          if(imageSession.args.kind==="gallery"){gallery.seed=imageSession.args.seed;gallery.offset=0;rememberGalleryBrowser();save();}
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
      action("image.state",object(),()=>({opened:$("image-dialog").open,loading:imageSession?.loading===true,error:imageSession?.error||"",requestedIndex:imageSession?.pendingIndex??null,previewId:imageSession?.previewId??null,index:imageSession?.index??0,total:imageSession?.total??0,current:imageSession?.current?{id:imageSession.current.id??null,kind:imageSession.current.kind??null,videoId:imageSession.current.videoId??null,seconds:imageSession.current.seconds??null}:null,...imagePresentation()}),"read");
      action("image.seek",object({ratio:{type:"number",minimum:0,maximum:1}},["ratio"]),async({ratio})=>{if(!$("image-dialog").open||!imageSession)throw Error("图片查看器未打开");return stepImage(0,RHVideoModel.playback.imageSeek(imageSession.total,ratio));});
      async function playImageVideo(low,atFrame){
        const session=imageSession,item=session?.current,version=epoch;
        if(session?.loading)throw Error("图片正在切换，请稍候再播放");if(!$("image-dialog").open||item?.kind!=="frame")throw Error("当前不是视频截图");
        const intent=++singlePlayIntent,playbackId=crypto.randomUUID();session.playAttempt=playbackId;let ticket,previous,installed=false;
        try{
          ticket=await prepareQueue([{id:item.videoId,title:item.title,duration:item.duration}],{fullLength:true,super:low,origin:"frame",deferPreviewCommit:true,parentKey:I.key(item),parentPreview:session.previewId,parentPlayback:playbackId,parentTotal:session.total});
          if(version!==epoch||intent!==singlePlayIntent||imageSession!==session||session.current!==item||session.loading||session.playAttempt!==playbackId||!$("image-dialog").open)throw Error("预览目标已改变，旧播放未执行");
          // Preparing a replacement must not retire the still-playing child's
          // return. Only install its capability once the new source is ready.
          previous=session.playbackId;session.playbackId=playbackId;installed=true;
          return await native("play",{id:item.videoId,title:item.title,seconds:atFrame?item.seconds:0,super:low,playlist:ticket});
        }catch(error){if(installed&&imageSession===session&&session.playbackId===playbackId)session.playbackId=previous;await discardPrepared(ticket,version);throw error;}
        finally{if(session.playAttempt===playbackId)delete session.playAttempt;}
      }
      action("image.playFrame",object({super:{type:"boolean"}}),({super:low=false})=>playImageVideo(low,true),"external");
      action("image.playVideo",object({super:{type:"boolean"}}),({super:low=false})=>playImageVideo(low,false),"external");
      action("image.returnFromVideo",object({generation:{type:"integer",minimum:0},parentKey:string,parentPreview:string,parentPlayback:string,direction:{type:"integer",enum:[-1,0,1]},targetIndex:{type:"integer",minimum:0,maximum:1000000},close:{type:"boolean"}},["generation","parentKey","parentPreview"]),async({generation,parentKey,parentPreview,parentPlayback,direction=0,targetIndex,close=false})=>{
        if(generation!==state.generation||!imageSession?.current||imageSession.loading||imageSession.previewId!==parentPreview||!parentPlayback||imageSession.playbackId!==parentPlayback||I.key(imageSession.current)!==parentKey)return {stale:true};
        if(targetIndex!==undefined&&(!imageSession.favorite||targetIndex>=imageSession.total))throw Error("收藏浏览位置无效");
        imageSession.playbackId=null;
        if(close||(imageSession.favorite&&direction===0&&targetIndex===undefined))return invoke("image.close");
        const result=await stepImage(direction,targetIndex??null);if(!result.stale&&imageSession?.current?.kind!=="video")ctx.openDialog("image-dialog");return result;
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
        revision: 0,
        pending: null,
        scope: "",
        error: "",
        count: 0,
      };
      function galleryScope(c=config()){
        return I.canonical({perVideo:c.perVideo,mixPictures:c.mixPictures,rule:c.rule});
      }
      function galleryReady(){return gallery.loaded&&gallery.scope===galleryScope();}
      function galleryOrderScope(c=config()){
        const rule=RHTagFilter.normalize(c.rule),single=!(rule.groups||[]).some(RHTagFilter.active)&&!rule.exclude.length&&rule.include.length<=1;
        return (single?rule.include[0]||"":"tags:"+RHTagFilter.key(rule))+"|"+(c.mixPictures?"pictures":"videos");
      }
      function validGallerySeed(seed){return Number.isSafeInteger(seed)&&seed>=0&&seed<=4294967295||typeof seed==="string"&&/^[a-f0-9]{8}$/.test(seed);}
      function galleryOrders(create=false){
        const scope=galleryOrderScope(),scopes=prefs.galleryOrdersByScope;
        if(scopes&&Object.hasOwn(scopes,scope)&&scopes[scope]&&typeof scopes[scope]==="object")return scopes[scope];
        if(!create)return {};
        prefs.galleryOrdersByScope={...scopes,[scope]:{}};return prefs.galleryOrdersByScope[scope];
      }
      function restoreGalleryPreferences(){
        if(prefs.galleryOrders&&typeof prefs.galleryOrders==="object"){
          const scope=galleryOrderScope();prefs.galleryOrdersByScope={...prefs.galleryOrdersByScope,[scope]:{...prefs.galleryOrders,...galleryOrders()}};
          delete prefs.galleryOrders;
        }
        const saved=prefs.galleryBrowser??prefs.galleryResume;
        gallery.seed=validGallerySeed(saved?.seed)?saved.seed:0;
        gallery.offset=Number.isSafeInteger(saved?.offset)&&saved.offset>=0?Math.floor(saved.offset/gallery.limit)*gallery.limit:0;
        gallery.autoShufflePending=!saved||!Object.hasOwn(saved,"seed");
      }
      function rememberGalleryBrowser(){prefs.galleryBrowser={version:2,seed:gallery.seed,offset:gallery.offset};}
      async function resumeGallery(saved){
        const version=await ensure(),intent=++singlePlayIntent,revision=gallery.revision,view=state.view;
        let expectedView=gallery.load;
        const args={kind:"gallery",search:state.search,rule:config().rule,sort:"source",seed:gallery.seed,offset:0,limit:1};
        const scope=I.canonical({rule:args.rule,search:args.search,seed:args.seed});
        const current=()=>version===epoch&&intent===singlePlayIntent&&revision===gallery.revision&&view===state.view&&expectedView===gallery.load&&scope===I.canonical({rule:config().rule,search:state.search,seed:gallery.seed});
        await loadGallery(false,false);if(!current())return {stale:true};
        let value,match;
        const selectors=saved.orderKey?[{orderKey:saved.orderKey}]:saved.mediaKey?[{key:saved.mediaKey}]:[];
        if(saved.videoId)selectors.push({videoId:saved.videoId});
        for(const locate of selectors){value=await send("query",{...args,locate});if(!current())return {stale:true};if(value.located){match=value.located;break;}}
        if(!value){value=await send("query",args);if(!current())return {stale:true};}
        if(!value.total)throw Error("当前图库没有可恢复的图片");
        const index=match?.index??(Number.isSafeInteger(saved.index)&&saved.index>=0&&saved.index<value.total?saved.index:0);
        gallery.offset=Math.floor(index/gallery.limit)*gallery.limit;expectedView++;
        const shown=await loadGallery();if(shown.stale||!current())return {stale:true};
        const session=imageSession={args,index,total:value.total,current:null,previewId:crypto.randomUUID()};
        const displayed=await stepImage(0);if(displayed.stale||!current()||imageSession!==session)return {stale:true};
        ctx.openDialog("image-dialog");return {opened:true,index,total:value.total};
      }
      function paintGalleryStatus(){
        const node=$("wb-gallery-status");if(!node)return;
        node.hidden=!gallery.error;node.textContent=gallery.error?"截图库加载失败："+gallery.error:"";
      }
      function invalidateGallery(keepSnapshot=false){
        gallery.revision++;gallery.pending=null;gallery.error="";
        if(!keepSnapshot){gallery.loaded=false;gallery.scope="";gallery.count=0;}
        paintGalleryStatus();
      }
      function warmGallery(){
        const version=epoch;
        // Like showApp/loadGrid(false): prepare metadata in the background,
        // never await it on login/video clicks or open a gallery dialog.
        queueMicrotask(()=>{if(version===epoch&&state.connected)void loadGallery(false,state.view==="gallery").catch(error=>{if(version===epoch)notice("截图库后台加载失败："+String(error));});});
      }
      function galleryVisible(){return state.view==="gallery"||$("wb-gallery")?.open;}
      async function prepareGallery(refresh,version){
        if(version!==epoch)return {stale:true};
        if(refresh)invalidateGallery(true);
        const c=config(),scope=galleryScope(c);
        if(gallery.pending?.scope===scope)return gallery.pending.promise;
        if(!refresh&&galleryReady())return {loaded:true};
        const task={scope,version,revision:gallery.revision,promise:null};gallery.pending=task;gallery.error="";paintGalleryStatus();
        const current=()=>task===gallery.pending&&version===epoch&&task.revision===gallery.revision&&scope===galleryScope();
        task.promise=(async()=>{try{
          const values = await remote("frames.grid", {
            query: {
              per_video: Math.max(1, Math.min(100, c.perVideo)),
              compact: true,
              rules: JSON.stringify(c.rule),
            },
          });
          if(!current())return {stale:true};
          let pictures=[];
          if (c.mixPictures) {
            const p = await remote("index.picture");
            if(!current())return {stale:true};
            pictures=p.items;
          }
          // Flatten compact rows in the worker, not on the interactive thread.
          const installed=await send("gallery", { videos: values, pictures });
          if(!current())return {stale:true};
          if(c.mixPictures&&pictures.length&&gallery.autoShufflePending&&!gallery.seed){
            gallery.seed=crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8,"0");
            rememberGalleryBrowser();save();
          }
          if(c.mixPictures)gallery.autoShufflePending=false;
          gallery.loaded = true;gallery.scope=scope;gallery.count=installed.count;
          return {loaded:true};
        }catch(error){if(!current())return {stale:true};gallery.error=String(error?.message||error);paintGalleryStatus();throw error;}
        finally{if(gallery.pending===task)gallery.pending=null;}})();
        return task.promise;
      }
      async function loadGallery(refresh = false, display = true) {
        const version=await ensure(),ticket=display?++gallery.load:gallery.load,c=config(),inline=state.view==="gallery";
        const loadingRoot=display?(inline?$("gallery-content"):dialog("wb-gallery","截图库")):null;
        if(loadingRoot){const message=el("p","正在读取截图库…");message.setAttribute("role","status");loadingRoot.replaceChildren(message);loadingRoot.setAttribute("aria-busy","true");}
        let viewRevision;
        const ownsView=()=>display&&inline===(state.view==="gallery")&&ticket===gallery.load&&version===epoch&&galleryScope(c)===galleryScope()&&(viewRevision===undefined||viewRevision===gallery.revision);
        try{
        const prepared=await prepareGallery(refresh,version);
        if(prepared.stale||version!==epoch)return {stale:true};
        if(!display)return {loaded:true};
        const revision=gallery.revision,scope=galleryScope(c);viewRevision=revision;
        const current=()=>inline===(state.view==="gallery")&&ticket===gallery.load&&version===epoch&&revision===gallery.revision&&scope===galleryScope();
        const value = await send("query", {
          kind: "gallery",
          search: state.search,
          rule: c.rule,
          sort: "source",
          seed: gallery.seed,
          offset: gallery.offset,
          limit: gallery.limit,
          latest: true,
        });
        if (!current()) return { stale: true };
        if(value.total>0&&gallery.offset>=value.total){gallery.offset=Math.floor((value.total-1)/gallery.limit)*gallery.limit;return loadGallery(false,display);}
        const urls = await native("images", {
          paths: value.items.map((v) => v.path),
        });
        if(!current())return {stale:true};
        gallery.total = value.total;
        gallery.items = value.items;
        if(inline)$("result-count").textContent=value.total.toLocaleString()+" 张截图";
        const root = loadingRoot;
        const tools=el("div",undefined,"wb-gallery-tools");
        tools.append(
          button("标签筛选", "rules.open"),
          button("分段连播", "playlist.start"),
          button("多视频同屏", "grid.open"),
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
        root.replaceChildren(tools);
        const grid = el("div", undefined, "wb-gallery-grid");
        for (let i = 0; i < value.items.length; i++) {
          const f = value.items[i],
            card = button(
              "",
              "gallery.openItem",
              { index: i },
              "wb-frame",
            );
          const image = el("img");
          image.src = urls[i];
          image.loading = "lazy";
          image.alt = f.title;
          const title=(f.folder?"["+f.folder+"] ":"")+f.title;
          const info=f.kind==="frame"?RHVideoModel.clock(f.seconds)+" / "+RHVideoModel.clock(f.duration):f.resolution+(f.size?" · "+(f.size/1048576).toFixed(1)+" MB":"");
          card.title=title+" · "+info;card.setAttribute("aria-label",title+"，"+info);
          card.append(image,el("span",f.title,"wb-frame-title"),el("span",info,"wb-frame-info"));
          grid.append(card);
        }
        const navigation=el("div",undefined,"wb-gallery-nav");
        const previous=button("上一页","gallery.page",{direction:-1}),next=button("下一页","gallery.page",{direction:1});
        previous.disabled=gallery.offset<=0;next.disabled=gallery.offset+gallery.limit>=gallery.total;
        navigation.append(previous,el("span",gallery.total?`${gallery.offset+1} / ${gallery.total}`:"没有符合条件的截图"),next);
        const jump=el("form",undefined,"page-jump"),page=input("number",Math.floor(gallery.offset/gallery.limit)+1,"wb-gallery-page"),last=Math.max(1,Math.ceil(gallery.total/gallery.limit));
        page.min="1";page.max=String(last);page.required=true;page.setAttribute("aria-label","截图页码");page.dataset.apiAction="rhvideo.gallery.jump";
        const submit=el("button","跳转","button secondary");submit.type="submit";submit.dataset.apiAction="rhvideo.gallery.jump";
        page.disabled=!gallery.total;submit.disabled=page.disabled;
        jump.append(field("跳到页",page),submit);listen(jump,"submit",event=>{event.preventDefault();invoke("gallery.jump",{page:Number(page.value)}).catch(notice);},"gallery.jump");navigation.append(jump);root.append(grid,navigation);
        rememberGalleryBrowser();
        save();
        return { total: gallery.total, offset: gallery.offset };
        }catch(error){
          if(display&&!ownsView())return {stale:true};
          if(ownsView())loadingRoot.replaceChildren(el("p","截图库加载失败："+String(error?.message||error),"wb-gallery-error"));
          throw error;
        }finally{if(ownsView())loadingRoot.removeAttribute("aria-busy");}
      }
      action("gallery.open", object(), () => loadGallery());
      action("gallery.show",object(),()=>{
        gallery.load++;state.view="gallery";$("wb-gallery")?.close();ctx.syncSection();
        return state.connected?loadGallery():{view:"gallery",connected:false};
      });
      action("gallery.state",object(),()=>({loaded:galleryReady(),loading:!!gallery.pending,error:gallery.error,count:gallery.count,total:gallery.total,revision:gallery.revision,offset:gallery.offset,limit:gallery.limit,seed:gallery.seed,orderScope:galleryOrderScope(),orders:Object.keys(galleryOrders())}),"read");
      action("gallery.inspect",object({index:{type:"integer",minimum:0,maximum:99}},["index"]),async({index})=>{
        const version=epoch,intent=++singlePlayIntent,view=gallery.load,revision=gallery.revision;
        const media=gallery.items[index];if(!media)throw Error("截图不在当前页");
        const args={kind:"gallery",search:state.search,rule:config().rule,sort:"source",seed:gallery.seed,offset:0,limit:1};
        const result=await send("query",{...args,locate:{key:I.key(media)}});
        const current=()=>version===epoch&&intent===singlePlayIntent&&view===gallery.load&&revision===gallery.revision;
        if(result.stale||!current())return {stale:true};
        if(!result.located)throw Error("截图筛选结果已改变，请刷新");
        const at=result.located.index,session=imageSession={args,index:at,total:result.total,current:null,pendingTarget:{...media,index:at,total:result.total},previewId:crypto.randomUUID()};
        ctx.openDialog("image-dialog");
        const displayed=await stepImage(0);if(displayed.stale||!current()||imageSession!==session)return {stale:true};
        return {opened:true,total:result.total,index:at};
      });
      action("gallery.orders", object(), () => {
        const root = dialog("wb-settings", "截图浏览顺序"),
          name = input("text", "", "wb-gallery-order-name");
        root.replaceChildren(
          field("名称", name),
          button("保存当前顺序", "gallery.save", () => ({ name: name.value })),
        );
        for (const name of Object.keys(galleryOrders())) {
          const row = serverRow(name, "截图顺序与浏览位置");
          row.append(
            button("恢复", "gallery.resume", { name }),
            button("移除", "gallery.deleteOrder", { name }),
          );
          root.append(row);
        }
        return { names: Object.keys(galleryOrders()) };
      });
      action(
        "gallery.deleteOrder",
        object({ name: { type: "string", minLength: 1, maxLength: 100 } }, [
          "name",
        ]),
        async ({ name }) => {
          const version=epoch,orders=galleryOrders(),previous=Object.hasOwn(orders,name)?orders[name]:undefined;
          delete orders[name];
          try{await save(true);}catch(error){if(version===epoch&&!Object.hasOwn(orders,name)&&previous!==undefined)orders[name]=previous;throw error;}
          if(version===epoch&&$("wb-settings")?.querySelector(".wb-dialog-head h2")?.textContent==="截图浏览顺序")await invoke("gallery.orders");
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
        gallery.seed = crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8,"0");
        gallery.autoShufflePending=false;
        gallery.offset = 0;
        return loadGallery();
      });
      action("gallery.restore", object(), () => {
        gallery.seed = 0;
        gallery.autoShufflePending=false;
        gallery.offset = 0;
        return loadGallery();
      });
      action(
        "gallery.save",
        object({ name: { type: "string", maxLength: 100 } }),
        async ({ name = "默认顺序" }) => {
          name=name.trim().slice(0,80);if(!name)throw Error("请输入顺序名称");
          const version=await ensure();await loadGallery(false,false);
          const content=await send("query",{kind:"gallery",search:state.search,rule:config().rule,sort:"source",seed:gallery.seed,limit:1});
          if(version!==epoch)throw Error("媒体账户已改变，顺序未保存");if(!content.total)throw Error("当前没有可保存的截图顺序");
          const orders=galleryOrders(true),previous=Object.hasOwn(orders,name)?orders[name]:undefined;
          const record=orders[name]={version:2,seed:gallery.seed,scope:galleryOrderScope(),savedAt:Date.now()};
          try{await save(true);}catch(error){if(version===epoch&&orders[name]===record){if(previous===undefined)delete orders[name];else orders[name]=previous;}throw error;}
          if(version===epoch&&$("wb-settings")?.querySelector(".wb-dialog-head h2")?.textContent==="截图浏览顺序")await invoke("gallery.orders");
          return { saved: name };
        },
      );
      action(
        "gallery.resume",
        object({ name: { type: "string", maxLength: 100 } }),
        async ({ name }) => {
          const requestVersion=epoch;await ensure();if(requestVersion!==epoch)return {stale:true};
          const orders=galleryOrders(),saved=name?(Object.hasOwn(orders,name)?orders[name]:null):prefs.galleryResume;
          if (!saved) throw Error("没有保存的浏览进度");
          if(!name)return resumeGallery(saved);
          if(!validGallerySeed(saved.seed))throw Error("保存的随机种子无效");
          gallery.seed=saved.seed;gallery.offset=0;
          gallery.autoShufflePending=false;
          const result=await loadGallery();if(result.stale)return result;await save(true);
          if($("wb-settings")?.querySelector(".wb-dialog-head h2")?.textContent==="截图浏览顺序")await invoke("panel.close",{id:"wb-settings"});
          return result;
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
      const pictureOrderTransactions=new Map();
      function abortPictureOrders(owner){for(const [transaction,record]of pictureOrderTransactions)if(arguments.length===0||record===owner)try{transaction.abort();}catch{}}
      function pictureOrderStorage(mode,key,ids=null,valid=()=>true,owner=null){
        return new Promise((resolve,reject)=>{
          let db=null,transaction=null,settled=false,result=null;
          const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(transaction)pictureOrderTransactions.delete(transaction);db?.close();error?reject(error):resolve(value);};
          const timer=setTimeout(()=>{try{transaction?.abort();}catch{}finish(Error("图片顺序存储超时，未自动重试"));},15000);
          let opening;try{opening=indexedDB.open("rhfiles-rhvideo-orders",1);}catch(error){finish(error);return;}
          opening.onupgradeneeded=()=>{if(!opening.result.objectStoreNames.contains("pictures"))opening.result.createObjectStore("pictures");};
          opening.onblocked=()=>finish(Error("图片顺序数据库被另一窗口占用"));opening.onerror=()=>finish(opening.error||Error("无法打开图片顺序数据库"));
          opening.onsuccess=()=>{
            db=opening.result;if(settled){db.close();return;}db.onversionchange=()=>db.close();if(!valid()){finish(null,{stale:true});return;}
            try{
              // Unlike an acknowledged localStorage write, transaction
              // completion with strict durability is a disk-commit boundary.
              transaction=mode==="read"?db.transaction("pictures","readonly"):db.transaction("pictures","readwrite",{durability:"strict"});pictureOrderTransactions.set(transaction,owner);
              transaction.onabort=()=>finish(transaction.error||Error("图片顺序存储已中止"));transaction.onerror=()=>finish(transaction.error||Error("无法保存图片顺序"));transaction.oncomplete=()=>finish(null,{ids:result});
              const store=transaction.objectStore("pictures");if(mode==="read"){const request=store.get(key);request.onsuccess=()=>{result=request.result??null;};}else if(ids===null)store.delete(key);else store.put(ids,key);
            }catch(error){try{transaction?.abort();}catch{}finish(error);}
          };
        });
      }
      function pictureOrderKey(){if(!account)throw Error("媒体账户尚未就绪");return "rhfiles.rhvideo.picture-order.v1:"+encodeURIComponent(account);}
      async function readPictureOrder(valid=()=>true){
        try{const result=await pictureOrderStorage("read",pictureOrderKey(),null,valid);if(result.stale)return {ids:null,warning:"",stale:true};const ids=result.ids;if(ids===null)return {ids:null,warning:""};if(!Array.isArray(ids)||ids.length>1000000||ids.some(id=>typeof id!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(id)))throw Error("保存的图片编号无效");return {ids,warning:""};}
        catch(error){if(!valid())return {ids:null,warning:"",stale:true};const warning="无法读取已保存的图片顺序，正在使用默认顺序："+String(error.message||error);notice(warning);return {ids:null,warning};}
      }
      function pictureStripSignature(v){return I.canonical({version:2,rule:RHTagFilter.key(v.args.rule),search:v.args.search||"",folder:v.args.folder||"",vertical:v.vertical,lanes:v.lanes,order:v.pictureOrder.signature});}
      function rememberViewer(v){
        if(!state.connected||!account||viewer!==v||!v.signature)return;
        if(v.mode==="strip"&&!v.rows?.[0])return;
        prefs.viewerResume={...(prefs.viewerResume||{}),[v.mode+":"+v.source]:{signature:v.mode==="strip"&&v.source==="picture"?pictureStripSignature(v):v.signature,index:v.index,key:v.queue[v.index]?.key,ratio:v.mode==="strip"?stripRatio(v):0,...(v.mode==="strip"?{position:stripPosition(v,v.rows[0])}:{})}};save();
      }
      function restoreStripPosition(v,resume=prefs.viewerResume?.[v.mode+":"+v.source]){
        const signature=v.source==="picture"?pictureStripSignature(v):v.signature;
        if(resume?.signature!==signature)return;
        const first=v.rows[0];if(Number.isFinite(resume.position)&&resume.position>=0)setStripPosition(v,first,resume.position);else if(Number.isFinite(resume.ratio))setStripPosition(v,first,Math.max(0,Math.min(1,resume.ratio))*(v.vertical?first.metrics.logicalMax:first.model.mainLength));syncStripRows(v,first);
      }
      function stopViewer(invalidate=true) {
        if(invalidate)viewerToken++;
        cancelAnimationFrame(animation);
        animation = 0;
        if (viewer) {
          abortPictureOrders(viewer);
          rememberViewer(viewer);
          viewer.running = false;
          viewer.layoutRevision=(viewer.layoutRevision||0)+1;
          for(const node of viewer.tiles.values())retireStripTile(node);
          viewer.tiles.clear();
          viewer.observer?.disconnect();
          clearTimeout(viewer.resizeTimer);
          if (viewer.videoActive)
            void presentationRequest("close").catch(notice);
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
          if(mode==="strip"&&source==="favorite")return invoke("favorite.browse");
          await ensure();
          const version=epoch,token = ++viewerToken,
            c = config(),
            kind = source === "gallery" ? "gallery" : source;
          if (kind === "gallery" && !galleryReady()) await loadGallery(false,false);
          if (kind !== "gallery") await rawCatalog(kind);
          const args = {
            ...criteria(),
            kind,
            sort:["gallery","picture"].includes(kind)?"source":c.sort,
            seed:kind==="gallery"?gallery.seed:kind==="picture"?0:c.seed,
            mediaType:
              mode === "strip" && kind !== "gallery"
                ? "picture"
                : kind === "favorite"
                  ? c.mediaType
                  : kind === "gallery"
                    ? ""
                    : "picture",
            allKeys: true,
            offset: 0,
            limit: 1,
          };
          let result = await send("query", args);
          if (token !== viewerToken || version!==epoch) return { stale: true };
          let queue=result.queue.filter(item=>item.kind!=="novel");
          if(!queue.length){notice("当前筛选中没有符合条件的图片或视频");return {opened:false,total:0,empty:true};}
          const pictureOrder=source==="picture"?await readPictureOrder(()=>token===viewerToken&&version===epoch):null;
          if(token!==viewerToken||version!==epoch||pictureOrder?.stale)return {stale:true};
          if(pictureOrder)pictureOrder.signature=I.pictureOrderSignature(pictureOrder.ids,result.sourceTotal??result.total);
          if(pictureOrder)queue=I.pictureOrder(queue,pictureOrder.ids);
          stopViewer(false);
          const signature = I.canonical({
              ...args,
              offset: 0,
              limit: 1,
              allKeys: true,
              ...(pictureOrder?{pictureOrder:pictureOrder.signature}:{}),
            }),
            resume = prefs.viewerResume?.[mode + ":" + source];
          const root = dialog(
            "wb-viewer",
            mode === "strip" ? "连续浏览" : "自动放映",
          );
          root.replaceChildren();
          const controls = el("div", undefined, "wb-viewer-controls");
          const toggle=button(mode==="strip"?"自动滚动":"暂停", "viewer.toggle");toggle.id="wb-viewer-toggle";
          const favorite=button("收藏","viewer.favorite",{expectedViewer:token});favorite.id="wb-viewer-favorite";favorite.disabled=mode==="strip";
          const mark=button("标记/取消待删除", "selection.markCurrent",{expectedViewer:token});mark.id="wb-viewer-mark";mark.disabled=mode==="strip";
          const lanesButton=button("单列/双列", "viewer.lanes");lanesButton.id="wb-viewer-lanes";lanesButton.hidden=c.vertical;
          const shuffle=button("随机打乱","viewer.order",{random:true,expectedViewer:token}),restore=button("恢复顺序","viewer.order",{random:false,expectedViewer:token});shuffle.id="wb-viewer-shuffle";restore.id="wb-viewer-restore";
          controls.append(
            toggle,
            button("上一个", "viewer.step", { direction: -1 }),
            button("下一个", "viewer.step", { direction: 1 }),
            ...(mode==='strip'?[button("切换方向", "viewer.direction"),lanesButton]:[]),
            ...(mode==='strip'&&source==='picture'?[shuffle,restore]:[]),
            favorite,
            mark,
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
            queue,
            index: 0,
            running: mode!=="strip",
            pictureOrder,
            pictureSourceTotal:result.sourceTotal??result.total,
            clock: performance.now(),
            surface,
            tiles: new Map(),
            loading: new Set(),
            length: queue.length,
            at: 0,
            elapsed: 0,
            last: performance.now(),
          };
          viewer.observer = new ResizeObserver(() => {
            if (viewer?.token === token && viewer.videoActive)
              void syncPresentation().catch(notice);
            if(viewer?.token===token&&viewer.mode==="strip"){
              const v=viewer,size=stripDimensions(v);
              if(v.stripSize&&size.every((value,index)=>Math.abs(value-v.stripSize[index])<1))return;
              clearTimeout(v.resizeTimer);v.resizeTimer=setTimeout(()=>{
                if(viewer!==v)return;const positions=v.rows?.map(row=>stripPosition(v,row))||[];
                const ratios=v.rows?.map(row=>row.metrics.logicalMax?stripPosition(v,row)/row.metrics.logicalMax:0)||[];
                layoutStrip();for(let i=0;i<v.rows.length;i++)setStripPosition(v,v.rows[i],v.vertical?positions[i]||0:(ratios[i]||0)*v.rows[i].metrics.logicalMax);
                void renderStrip().catch(notice);
              },150);
            }
          });
          viewer.observer.observe(surface);
          if (mode === "strip") {
            const speed=input("range",c.scrollSpeed,"wb-strip-speed"),label=el("span");speed.min=0;speed.max=2000;speed.step="any";speed.setAttribute("aria-label","连续浏览速度倍率");speed.dataset.apiAction="rhvideo.preferences.set";viewer.speed=speed;viewer.speedLabel=label;paintStripSpeed(viewer);
            listen(speed,"input",()=>{if(viewer?.token!==token)return;label.textContent="×"+(Number(speed.value)/200).toFixed(1);void invoke("preferences.set",{key:"scrollSpeed",value:Number(speed.value)}).catch(notice);},"viewer.speed");controls.append(speed,label);
            viewer.lanes=c.lanes;viewer.rowLookup=new Map(viewer.queue.map((item,index)=>[item.key||I.key(item),{item,index}]));
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
            minimap.hidden=viewer.vertical;
            layoutStrip();
            await renderStrip();
            restoreStripPosition(viewer,resume);void renderStrip().catch(notice);
          } else {
            const progress=input("range",0,"wb-slideshow-progress");progress.min=0;progress.max=1000;progress.setAttribute("aria-label","放映总进度");progress.dataset.apiAction="rhvideo.viewer.seek";
            const label=el("span");label.id="wb-slideshow-position";
            listen(progress,"change",()=>viewer?.token===token?invoke("viewer.seek",{ratio:Number(progress.value)/1000}).catch(notice):{stale:true},"viewer.progress");
            controls.append(progress,label);viewer.progress=progress;viewer.progressLabel=label;
            const remembered =
              source!=="favorite"&&resume?.signature === signature
                ? viewer.queue.findIndex((v) => v.key === resume.key)
                : -1;
            await slide(remembered >= 0 ? remembered : 0);
          }
          animation = requestAnimationFrame(tick);
          return { total: viewer.length, mode };
        },
      );
      function layoutStrip(options={}) {
        const v=viewer;if(!v||v.mode!=="strip")return;
        const vertical=options.vertical??v.vertical,lanes=options.lanes??v.lanes,queue=options.queue??v.queue,lanesControl=$("wb-viewer-lanes"),oldMapHidden=v.minimap?.hidden,oldLanesHidden=lanesControl?.hidden;
        if(v.minimap)v.minimap.hidden=vertical;if(lanesControl)lanesControl.hidden=vertical;
        let size,layout;try{size=stripDimensions(v);layout=options.layout??I.stripLayout(queue,{vertical,lanes,extent:vertical?size[0]:size[1],viewport:vertical?size[1]:size[0]});}catch(error){if(v.minimap)v.minimap.hidden=oldMapHidden;if(lanesControl)lanesControl.hidden=oldLanesHidden;throw error;}
        if(options.queue){const current=v.current&&I.key(v.current);v.queue=queue;v.length=queue.length;v.rowLookup=new Map(queue.map((item,index)=>[I.key(item),{item,index}]));const selected=v.rowLookup.get(current);v.current=selected?.item;v.index=selected?.index??0;}
        v.vertical=vertical;v.lanes=lanes;v.layoutRevision=(v.layoutRevision||0)+1;v.stripSize=size;for(const node of v.tiles.values())retireStripTile(node);v.tiles.clear();
        v.stripUrls??=new Map();v.failedPaths??=new Map();
        v.surface.classList.add("strip");v.surface.classList.toggle("vertical",v.vertical);
        v.surface.classList.toggle("paused",!v.running);
        v.layout=layout;
        v.rows=v.layout.rows.map(model=>{
          const node=el("div",undefined,"wb-strip-row"),spacer=el("div",undefined,"wb-strip-spacer"),viewport=v.vertical?v.stripSize[1]:v.stripSize[0],metrics=I.scrollMetrics(model.length,viewport),row={model,node,spacer,metrics,expected:null};
          node.dataset.row=String(model.lane);node.dataset.apiAction="rhvideo.viewer.scroll";node.tabIndex=0;node.setAttribute("aria-label",v.vertical?"图片竖卷":"图片条带第 "+(model.lane+1)+" 行");
          node.style.flex=v.vertical?"1 1 0":"0 0 "+model.cross+"px";
          spacer.style.width=v.vertical?"100%":metrics.spacer+"px";spacer.style.height=v.vertical?metrics.spacer+"px":"100%";node.append(spacer);
          listen(node,"scroll",()=>{
            if(viewer!==v||!v.rows.includes(row))return;
            const position=v.vertical?node.scrollTop:node.scrollLeft;
            if(row.expected===null||Math.abs(position-row.expected)>1){pauseStrip(v);syncStripRows(v,row);rememberViewer(v);}
            void renderStrip().catch(notice);
          },"viewer.scroll");
          RHFilesUI.listen(node,"wheel",event=>{
            if(viewer!==v||!v.rows.includes(row))return;event.preventDefault();event.stopPropagation();
            const delta=Math.abs(event.deltaY)>Math.abs(event.deltaX)?event.deltaY:event.deltaX;
            void invoke("viewer.scroll",{delta,row:model.lane,expectedViewer:v.token}).catch(notice);
          },{passive:false},"rhvideo.workbench.viewer.wheel");
          return row;
        });
        v.surface.replaceChildren(...v.rows.map(row=>row.node));
        if(v.minimap)v.minimap.hidden=v.vertical;
        if(lanesControl)lanesControl.hidden=v.vertical;
        v.minimapBase=null;
      }
      function stripDimensions(v){return [Math.max(1,v.surface.clientWidth),Math.max(1,v.surface.clientHeight)];}
      function retireStripTile(node){node.dataset.retired="true";const img=node.querySelector("img");if(img){img.__stripRetired=true;img.removeAttribute("src");}node.remove();}
      function failStripSource(v,path,message){
        v.failedPaths.set(path,message);
        for(const node of v.tiles.values())if(node.dataset.mediaPath===path){const img=node.querySelector("img");if(img){img.__stripRetired=true;img.removeAttribute("src");}node.classList.add("error");node.title=message;if(!node.querySelector(".wb-strip-error"))node.append(el("span","图片加载失败","wb-strip-error"));}
      }
      function paintStripSpeed(v){if(!v?.speed)return;const value=config().scrollSpeed;if(Number(v.speed.value)!==value)v.speed.value=String(value);v.speed.title=value+" px/s";v.speedLabel.textContent="×"+(value/200).toFixed(1);}
      function stripPosition(v,row){return (v.vertical?row.node.scrollTop:row.node.scrollLeft)*row.metrics.scale;}
      function stripRatio(v){const row=v.rows?.[0];return row?Math.max(0,Math.min(1,stripPosition(v,row)/Math.max(1,v.vertical?row.metrics.logicalMax:row.model.mainLength))):0;}
      function pauseStrip(v){v.running=false;v.surface.classList.add("paused");refreshViewer();}
      function setStripPosition(v,row,value){const property=v.vertical?"scrollTop":"scrollLeft";row.node[property]=Math.max(0,Math.min(row.metrics.logicalMax,value))/row.metrics.scale;row.expected=row.node[property];}
      function syncStripRows(v,source){
        const ratio=source.metrics.logicalMax?stripPosition(v,source)/source.metrics.logicalMax:0;
        for(const row of v.rows)if(row!==source)setStripPosition(v,row,ratio*row.metrics.logicalMax);
      }
      function requireStrip(expected){if(!viewer||viewer.mode!=="strip")throw Error("图片连续浏览未打开");if(expected!==undefined&&viewer.token!==expected)throw Error("浏览窗口已改变，旧操作未执行");return viewer;}
      const stripGuard={expectedViewer:{type:"integer",minimum:1}};
      action("viewer.scroll",object({...stripGuard,row:{type:"integer",minimum:0,maximum:1},delta:{type:"number",minimum:-1000000,maximum:1000000}},["delta"]),({delta,row:index=0,expectedViewer})=>{
        const v=requireStrip(expectedViewer),row=v.rows[index];if(!row)throw Error("图片条带行不存在");pauseStrip(v);setStripPosition(v,row,stripPosition(v,row)+I.stripInput(delta,config().scrollSpeed));syncStripRows(v,row);rememberViewer(v);void renderStrip().catch(notice);return viewerSnapshot();
      });
      action("viewer.items",object({...stripGuard,offset:{type:"integer",minimum:0,maximum:1000000},limit:{type:"integer",minimum:1,maximum:100}}),({expectedViewer,offset=0,limit=100}={})=>{const v=viewer;if(!v)throw Error("浏览器未打开");if(expectedViewer!==undefined&&v.token!==expectedViewer)throw Error("浏览窗口已改变，旧操作未执行");return {total:v.queue.length,items:v.queue.slice(offset,offset+limit).map(item=>({key:I.key(item),id:item.id,kind:item.kind,title:item.title}))};},"read");
      action("viewer.order",object({...stripGuard,random:{type:"boolean"}},["random"]),async({random,expectedViewer})=>{
        const v=requireStrip(expectedViewer);if(v.source!=="picture")throw Error("此顺序操作仅适用于图片连续浏览");const version=epoch,intent=v.orderIntent=(v.orderIntent||0)+1;abortPictureOrders(v);pauseStrip(v);const valid=()=>viewer===v&&version===epoch&&intent===v.orderIntent;
        // The reference Restore uses the complete server picture catalog, not
        // the active strip's filtered pool. Card filters themselves stay put.
        const result=random?null:await query({kind:"picture",sort:"source",seed:0,search:"",folder:"",rule:{},mediaType:"picture",allKeys:true,offset:0,limit:1},version);
        if(viewer!==v||version!==epoch||intent!==v.orderIntent)return {stale:true};
        const queue=random?I.shufflePictures(v.queue):result.queue,vertical=v.vertical,lanes=v.lanes,size=stripDimensions(v),layout=I.stripLayout(queue,{vertical,lanes,extent:vertical?size[0]:size[1],viewport:vertical?size[1]:size[0]}),ids=random?queue.map(item=>item.id):null;
        try{const persisted=await pictureOrderStorage("write",pictureOrderKey(),ids,valid,v);if(persisted.stale||!valid())return {stale:true};}catch(error){if(!valid())return {stale:true};throw Error("无法保存图片顺序，当前队列未更改："+String(error.message||error));}
        const currentSize=stripDimensions(v);let committedLayout=layout;
        if(v.vertical!==vertical||v.lanes!==lanes||size.some((value,index)=>value!==currentSize[index]))try{committedLayout=I.stripLayout(queue,{vertical:v.vertical,lanes:v.lanes,extent:v.vertical?currentSize[0]:currentSize[1],viewport:v.vertical?currentSize[1]:currentSize[0]});}catch(error){const warning="图片顺序已保存，但新窗口尺寸下无法显示："+String(error.message||error);notice(warning);return {saved:true,displayed:false,warning};}
        if(result)v.pictureSourceTotal=result.sourceTotal;v.pictureOrder={ids,warning:"",signature:I.pictureOrderSignature(ids,v.pictureSourceTotal)};layoutStrip({queue,layout:committedLayout});rememberViewer(v);await renderStrip();if(viewer!==v||intent!==v.orderIntent)return {stale:true};refreshViewer();return viewerSnapshot();
      });
      action("viewer.select",object({...stripGuard,key:string},["key"]),({key,expectedViewer})=>{
        const v=requireStrip(expectedViewer),target=v.rowLookup.get(key);if(!target)throw Error("图片已不在当前浏览队列中");v.current=target.item;v.index=target.index;refreshViewer();return viewerSnapshot();
      });
      action("viewer.inspect",object({...stripGuard,key:string},["key"]),async args=>{
        const v=requireStrip(args.expectedViewer),item=v.rowLookup.get(args.key)?.item;if(!item)throw Error("图片已不在当前浏览队列中");await invoke("viewer.select",args);if(viewer!==v)return {stale:true};pauseStrip(v);return invoke("image.preview",{path:item.path||"/storage/"+item.webp_path,title:item.title||item.id});
      });
      function stripWindow(v){
        const candidates=[];
        for(const row of v.rows){
          const start=stripPosition(v,row),extent=v.vertical?row.node.clientHeight:row.node.clientWidth;
          for(const tile of I.visible({lanes:[row.model.items]},start,extent,Math.max(1200,extent*1.5)))candidates.push({tile,row,start,extent,distance:Math.max(0,start-(tile.start+tile.length),tile.start-(start+extent))});
        }
        candidates.sort((a,b)=>a.distance-b.distance);const visible=candidates.slice(0,80),keys=new Set(visible.map(entry=>entry.tile.key));
        // Reuse the decoded leading-copy nodes at the loop boundary before any
        // asynchronous image resolution, so wrapping cannot expose a blank gap.
        for(const {tile,row}of visible)if(!v.tiles.has(tile.key)){
          const other=tile.tail?tile.baseKey:tile.baseKey+":tail",node=v.tiles.get(other);
          if(node&&!keys.has(other)){v.tiles.delete(other);v.tiles.set(tile.key,node);node.dataset.key=tile.key;row.spacer.append(node);}
        }
        for(const [key,node]of v.tiles)if(!keys.has(key)){retireStripTile(node);v.tiles.delete(key);}
        for(const entry of visible){const node=v.tiles.get(entry.tile.key);if(node)positionStripTile(v,entry,node);}
        if(v.map&&document.activeElement!==v.map)v.map.value=String(Math.round(stripRatio(v)*1000));
        const first=v.rows[0];if(first)drawMinimap(v,stripPosition(v,first),v.vertical?first.node.clientHeight:first.node.clientWidth,visible.filter(entry=>entry.row===first).map(entry=>entry.tile));
        return visible;
      }
      function positionStripTile(v,{tile,row,start},node){
        const position=(v.vertical?row.node.scrollTop:row.node.scrollLeft)+tile.start-start;
        node.style.cssText=v.vertical?`top:${position}px;left:0;width:${tile.cross}px;height:${tile.length}px`:`left:${position}px;top:0;width:${tile.length}px;height:${tile.cross}px`;
        node.dataset.logicalStart=String(tile.start);node.dataset.tail=String(tile.tail);node.dataset.mediaKey=I.key(tile.item);node.classList.toggle("selected",I.key(v.current||{})===I.key(tile.item));
        const image=node.querySelector("img");if(image)image.style.cssText=tile.cuts>1?`position:absolute;left:0;top:${-tile.part*tile.cross}px;width:100%;height:${tile.cross*tile.cuts}px;object-fit:fill`:"";
      }
      async function renderStrip() {
        const v = viewer;
        if (!v?.rows) return;
        stripWindow(v);
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
        if (!v?.rows) return;
        const revision=v.layoutRevision,visible=stripWindow(v),missing=visible.filter(({tile})=>!v.tiles.has(tile.key)),paths=[...new Set(missing.map(({tile})=>tile.item.path||"/storage/"+tile.item.webp_path))].filter(path=>!v.stripUrls.has(path)&&!v.failedPaths.has(path));
        try {
          if(paths.length){
            try{
              const urls=await native("images",{paths});if(viewer!==v||revision!==v.layoutRevision)return;
              for(let i=0;i<paths.length;i++)if(typeof urls[i]==="string"&&urls[i]){v.stripUrls.delete(paths[i]);v.stripUrls.set(paths[i],urls[i]);}else v.failedPaths.set(paths[i],"图片地址未返回");
            }catch(error){if(viewer!==v||revision!==v.layoutRevision)return;for(const path of paths)v.failedPaths.set(path,String(error.message||error));notice(error);}
          }
          if(viewer!==v||revision!==v.layoutRevision)return;
          const current=stripWindow(v);
          for(const entry of current){
            const {tile,row}=entry;if(v.tiles.has(tile.key))continue;
            const path=tile.item.path||"/storage/"+tile.item.webp_path,url=v.stripUrls.get(path),failure=v.failedPaths.get(path);if(!url&&!failure){v.renderAgain=true;continue;}
            const node=el("div",undefined,"wb-strip-tile"),img=el("img"),key=I.key(tile.item);
            node.dataset.key = tile.key;
            node.dataset.mediaPath=path;
            node.dataset.apiAction="rhvideo.viewer.select";node.title=(tile.item.title||tile.item.id)+" · 双击放大";
            listen(node,"click",event=>{if(!event.target.closest("button"))void invoke("viewer.select",{key,expectedViewer:v.token}).catch(notice);},"viewer.select");
            listen(node,"dblclick",event=>{if(event.target.closest("button"))return;event.preventDefault();event.stopPropagation();void invoke("viewer.inspect",{key,expectedViewer:v.token}).catch(notice);},"viewer.inspect");
            if(failure){node.classList.add("error");node.append(el("span","图片加载失败","wb-strip-error"));node.title=failure;}
            else{img.src=url;img.alt=tile.item.title;img.decoding="async";img.draggable=false;listen(img,"error",()=>{if(viewer===v&&!img.__stripRetired)failStripSource(v,path,"图片解码或读取失败");},"viewer.imageError");node.append(img);}
            const favorite=button("收藏","viewer.favorite",{key,expectedViewer:v.token},"wb-strip-favorite");favorite.setAttribute("aria-label","收藏 "+(tile.item.title||tile.item.id));node.append(favorite);
            row.spacer.append(node);
            v.tiles.set(tile.key, node);
            positionStripTile(v,entry,node);
          }
          refreshViewer();stripWindow(v);
        } finally {
          while(v.stripUrls.size>512)v.stripUrls.delete(v.stripUrls.keys().next().value);
          while(v.failedPaths.size>512)v.failedPaths.delete(v.failedPaths.keys().next().value);
        }
      }
      function drawMinimap(v, start, length, visible) {
        const canvas = v.minimap;
        if (!canvas || v.vertical || !v.rows?.[0]) return;
        const first=v.rows[0].model;
        const width = Math.min(
            2048,
            Math.max(1, Math.round(canvas.clientWidth)),
          ),
          scale = width / Math.max(1, first.mainLength),
          lanes = 1;
        if (!v.minimapBase || v.minimapBase.width !== width) {
          const base = document.createElement("canvas");
          base.width = width;
          base.height = 40;
          const paint = base.getContext("2d"),
            used = new Set();
          paint.fillStyle = "#182332";
          paint.fillRect(0, 0, width, 40);
          // One sample per pixel/lane. This is drawn only once, never per frame.
          for (const tile of first.cells) {
            const x = Math.floor(tile.start * scale),
              key = x;
            if (used.has(key)) continue;
            used.add(key);
            paint.fillStyle = "hsl("+(I.hash(tile.item.folder_label||tile.item.id)%360)+",35%,48%)";
            paint.fillRect(
              x,
              0,
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
              0,
              Math.max(1, tile.length * scale),
              40 / lanes - 2,
            );
        }
        paint.strokeStyle = "#ffffff";
        paint.lineWidth = 2;
        paint.strokeRect(start * scale, 1, Math.max(3, length * scale), 38);
      }
      function slideshowPlan(v){
        const c=config(),signature=JSON.stringify([v.source,c.stay,c.favoriteStay,c.videoStay]);
        if(v.planSignature!==signature){v.planSignature=signature;v.plan=I.slideshowPlan(v.queue,c,v.source);}
        return v.plan;
      }
      function paintSlideshowProgress(v){
        if(!v.progress)return;
        const plan=slideshowPlan(v),elapsed=(plan.prefix[v.index]||0)+Math.min(plan.durations[v.index]||0,v.elapsed);
        if(document.activeElement!==v.progress)v.progress.value=String(Math.round(elapsed/Math.max(0.001,plan.total)*1000));
        v.progressLabel.textContent=`${v.index+1}/${v.length} · ${RHVideoModel.clock(elapsed)} / ${RHVideoModel.clock(plan.total)}`;
      }
      function refreshViewer(){
        const v=viewer,button=$("wb-viewer-favorite");if(!v||!button)return;
        const toggle=$("wb-viewer-toggle");if(toggle){toggle.textContent=v.mode==="strip"?(v.running?"暂停滚动":"自动滚动"):(v.running?"暂停":"继续");toggle.setAttribute("aria-pressed",String(v.running));}
        const item=v.current,target=item?.kind==="frame"?{kind:"video",id:item.videoId}:item,key=target&&I.key(target);
        const eligible=["video","picture"].includes(target?.kind)&&!!target?.id;button.hidden=v.mode!=="strip"&&!eligible;
        button.textContent=state.favorites.has(key)?"取消收藏":"收藏";
        button.setAttribute("aria-pressed",String(state.favorites.has(key)));
        button.disabled=!eligible||!!v.loadingMedia||state.favoriteBusy.has(key);
        if(v.mode==="strip"){
          const mark=$("wb-viewer-mark");if(mark)mark.disabled=!target?.id;
          for(const node of v.tiles.values()){
            node.classList.toggle("selected",node.dataset.mediaKey===I.key(v.current||{}));
            const item=v.rowLookup.get(node.dataset.mediaKey)?.item,target=item?.kind==="frame"?{kind:"video",id:item.videoId}:item,star=node.querySelector(".wb-strip-favorite");if(!star||!target)continue;
            const key=I.key(target),enabled=state.favorites.has(key);star.textContent=enabled?"★":"☆";star.setAttribute("aria-label",(enabled?"取消收藏 ":"收藏 ")+(item.title||item.id));star.setAttribute("aria-pressed",String(enabled));star.disabled=state.favoriteBusy.has(key);
          }
        }
      }
      action("viewer.favorite",object({...stripGuard,key:string}),async({key,expectedViewer}={})=>{
        const v=viewer;if(expectedViewer!==undefined&&v?.token!==expectedViewer)throw Error("浏览窗口已改变，旧收藏操作未执行");
        if(key&&v?.mode!=="strip")throw Error("指定图片收藏仅适用于连续浏览");
        const current=key&&v?.mode==="strip"?v.rowLookup.get(key)?.item:v?.current,item=current?.kind==="frame"?{kind:"video",id:current.videoId}:current;
        if(!$("wb-viewer")?.open||!item||!["video","picture"].includes(item.kind))throw Error("当前没有可收藏的浏览项目");
        if(v.loadingMedia)throw Error("放映正在切换，请稍候再收藏");
        try{return await invoke("favorite.toggle",{kind:item.kind,id:item.id});}
        finally{if(viewer===v)refreshViewer();}
      },"write");
      async function slide(index,elapsed=0) {
        const v = viewer;
        if (!v) return;
        if(!v.length)throw Error("没有符合筛选条件的放映项目");
        const c = I.slideshowSettings(config(),v.source);
        const transitionTicket = (v.transitionTicket || 0) + 1;
        v.transitionTicket = transitionTicket;
        v.index = (index + v.length) % v.length;
        v.elapsed = 0;
        v.loadingMedia = true;
        refreshViewer();
        // Like favshowItems, this is the queue captured when opening the viewer.
        // Removing a favorite must not remove it from an already-open slideshow.
        const media = v.queue[v.index];
        const layer = el("div", undefined, "wb-slide");
        layer.style.setProperty("--stay", c.stay + "s");
        layer.style.setProperty("--fade", c.fade + "s");
        layer.classList.toggle("ken-burns", c.kenBurns);
        if (media.kind === "video") {
          const opened=await invoke("viewer.video", { id: media.id, title: media.title });
          if(opened?.stale||viewer!==v||transitionTicket!==v.transitionTicket)return {stale:true};
          const deadline = performance.now() + 15000;
          while (viewer === v && transitionTicket === v.transitionTicket) {
            const status = await presentationRequest("state",{},v);
            if(status.stale)return {stale:true};
            if (status.error) throw Error(status.error);
            if (status.renderedFrames > 0) break;
            if (performance.now() >= deadline) {
              v.running = false;
              throw Error("视频首帧等待超时，放映已暂停");
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
          if (viewer !== v || transitionTicket !== v.transitionTicket) return {stale:true};
          v.videoFadeStart = performance.now();
          // A manually selected paused frame has no running fade clock. Keep
          // it opaque, including on resume; ordinary playback still fades in.
          v.videoFadeSeconds = v.running && c.overlap ? c.fade : 0;
          await syncPresentation(v.videoFadeSeconds > 0 ? 0 : 1,true,v);
          if (viewer !== v || transitionTicket !== v.transitionTicket) return {stale:true};
          if (!v.running||!viewerIsTop())
            await presentationRequest("control", { command: "pause" },v);
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
            const input=v.videoInput;
            await presentationRequest("close",{},v);
            if(v.videoInput===input){v.videoActive=false;v.videoInput=null;}
          }
        }
        if (viewer !== v || transitionTicket !== v.transitionTicket) return;
        // Keep the old image opaque until the next frame is actually decoded.
        // Slow networks and rapid manual navigation must not fade to black.
        const old = v.surface.querySelector(".wb-slide:not(.outgoing)");
        v.surface.append(layer);
        v.elapsed = Math.max(0,Math.min(slideshowPlan(v).durations[v.index],elapsed));
        v.current = media;
        v.loadingMedia = false;
        refreshViewer();
        if (old) {
          old.classList.add("outgoing");
          if (c.overlap&&v.source!=='favorite') old.classList.add("holding");
          setTimeout(() => old.remove(), c.fade * 1000 + 50);
        }
        while (v.surface.children.length > 3) v.surface.firstChild.remove();
        v.surface.style.setProperty(
          "--slide-progress",
          (v.index + 1) / v.length,
        );
        paintSlideshowProgress(v);
        return { index: v.index, total: v.length };
      }
      function tick(now) {
        const v = viewer;
        if (!v) return;
        const dt = Math.max(0,Math.min(0.1, (now - v.last) / 1000));
        v.last = now;
        if (v.running && !document.hidden && !v.loadingMedia && viewerIsTop()) {
          const c = I.slideshowSettings(config(),v.source);
          if (v.mode === "strip") {
            let running=false;
            for(const row of v.rows){const next=I.stripAdvance(stripPosition(v,row),dt*c.scrollSpeed,{maximum:row.metrics.logicalMax,loopOffset:v.vertical?0:row.model.mainLength,vertical:v.vertical});setStripPosition(v,row,next.position);running||=next.running;}
            if(!running)pauseStrip(v);void renderStrip().catch(notice);
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
                syncPresentation(alpha,true,v)
                  .catch(notice)
                  .finally(() => (v.boundsBusy = false));
              }
            }
            if (
              v.elapsed >=
                (v.current?.kind === "video"
                  ? c.videoStay
                  : c.stay) &&
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
          if(v.mode==='slideshow')paintSlideshowProgress(v);
        }
        animation = requestAnimationFrame(tick);
      }
      action("viewer.toggle", object(), () => {
        if (!viewer) throw Error("浏览器未打开");
        viewer.running = !viewer.running;
        viewer.surface.classList.toggle("paused", !viewer.running);
        refreshViewer();
        if (viewer.videoActive)
          void presentationRequest("control", {
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
          token:v.token,
          mode: v.mode,
          source: v.source,
          index: v.index,
          total: v.length,
          ...(v.pictureOrder?{order:{random:v.pictureOrder.ids!==null,warning:v.pictureOrder.warning||"",sourceTotal:v.pictureSourceTotal}}:{}),
          running: v.running,
          loading: !!v.loadingMedia,
          nativeVideo: !!v.videoActive,
          ...(v.current?{current:{id:v.current.id,kind:v.current.kind,title:v.current.title,...(v.current.kind==="frame"?{videoId:v.current.videoId}:{})},favorite:state.favorites.has(v.current.kind==="frame"?"video:"+v.current.videoId:I.key(v.current))}:{}),
          ...(v.mode==='slideshow'?{elapsed:v.elapsed,duration:slideshowPlan(v).durations[v.index],totalDuration:slideshowPlan(v).total}:{}),
          tiles: v.tiles.size,
          ...(v.mode==="strip"?{vertical:v.vertical,lanes:v.rows?.length||0,rows:v.rows?.map(row=>({position:stripPosition(v,row),maximum:row.metrics.logicalMax,loopOffset:row.model.mainLength,tail:row.model.items.length-row.model.cells.length,viewport:v.vertical?row.node.clientHeight:row.node.clientWidth})),errors:Array.from(v.failedPaths?.entries()||[]).slice(0,10).map(([path,message])=>({path,message}))}:{}),
          ratio: v.mode === "strip"
            ? stripRatio(v)
            : ((slideshowPlan(v).prefix[v.index]||0)+v.elapsed)/Math.max(0.001,slideshowPlan(v).total),
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
          if(viewer.mode==="slideshow")return slide(viewer.index+direction);
          const v=viewer,row=v.rows[0],delta=I.stripInput(direction*innerWidth*.8,config().scrollSpeed),target=Math.max(0,Math.min(row.metrics.logicalMax,stripPosition(v,row)+delta));pauseStrip(v);row.expected=null;
          row.node.scrollBy({[v.vertical?"top":"left"]:delta/row.metrics.scale,behavior:"smooth"});return {target,running:false};
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
            {const target=I.slideshowTarget(slideshowPlan(v),ratio);return slide(target.index,target.elapsed);}
          const row=v.rows[0];setStripPosition(v,row,ratio*(v.vertical?row.metrics.logicalMax:row.model.mainLength));syncStripRows(v,row);rememberViewer(v);void renderStrip().catch(notice);
          return { ratio };
        },
      );
      action("viewer.direction", object(), () => {
        if(viewer&&viewer.mode!=='strip')throw Error("切换方向仅适用于连续浏览");
        const vertical=viewer?!viewer.vertical:!config().vertical;
        if(viewer){layoutStrip({vertical});pauseStrip(viewer);restoreStripPosition(viewer);}
        prefs.vertical = vertical;
        save();
        if(viewer){void renderStrip().catch(notice);return viewerSnapshot();}
        return { vertical: prefs.vertical };
      });
      action("viewer.lanes", object(), () => {
        if(viewer&&viewer.mode!=='strip')throw Error("单列／双列仅适用于连续浏览");
        if(viewer?.vertical)throw Error("竖卷始终为单列；请切换为横向后调整行数");
        const lanes=(viewer?viewer.lanes:config().lanes)===1?2:1;
        if(viewer){layoutStrip({lanes});pauseStrip(viewer);restoreStripPosition(viewer);}
        prefs.lanes = lanes;
        save();
        if(viewer){void renderStrip().catch(notice);return viewerSnapshot();}
        return { lanes: prefs.lanes };
      });
      function presentationRequest(action,args={},v=viewer){
        const explicit=Object.hasOwn(args,"expectedInput"),input=explicit?args.expectedInput:v?.videoInput;
        if(!explicit&&(!Number.isSafeInteger(input)||input<1)){
          if(action==="state")return native("presentation.state",args);
          return Promise.resolve({opened:false,stale:true});
        }
        // Resume intent can also arrive through scripts or visibilitychange,
        // while a newer panel owns the UI. A hidden decoder must stay paused;
        // closing that panel restores the viewer's separate running intent.
        if(action==="control"&&args.command==="resume"&&
          (document.hidden||!viewerIsTop()))args={...args,command:"pause"};
        return native("presentation."+action,{...args,expectedInput:input});
      }
      action(
        "viewer.video",
        object({ id: string, title: string }, ["id", "title"]),
        async (args) => {
          if (!viewer) throw Error("放映没有打开");
          const v = viewer;
          const transition=v.transitionTicket,attempt=(v.videoAttempt||0)+1;v.videoAttempt=attempt;
          const opened=await native("presentation.open", { ...args, super: config().super });
          if(!Number.isSafeInteger(opened?.inputId)||opened.inputId<1)throw Error("原生放映没有返回有效输入标识");
          if (viewer !== v||v.videoAttempt!==attempt||v.transitionTicket!==transition) {
            await presentationRequest("close",{expectedInput:opened.inputId},v);
            return { stale: true };
          }
          v.videoInput=opened.inputId;
          v.videoActive = true;
          v.faded = false;
          const projected=await syncPresentation(0,true,v);
          if(viewer!==v||v.videoAttempt!==attempt||v.transitionTicket!==transition)return {stale:true};
          return {...projected,inputId:opened.inputId};
        },
        "external",
      );
      function syncPresentation(opacity = 1, visible = true,v=viewer) {
        if (!v?.videoActive) return Promise.resolve({ opened: false });
        // Native child surfaces sit above WebView dialogs. Recheck the modal
        // owner after each async boundary instead of reviving a hidden plane.
        visible=visible&&viewerIsTop();
        if(!visible)opacity=0;
        const rect = v.surface.getBoundingClientRect();
        return presentationRequest("bounds", {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          viewportWidth: innerWidth,
          opacity,
          visible,
        },v);
      }
      function viewerIsTop() {
        return ctx.modalTop() === "wb-viewer";
      }
      action(
        "viewer.mediaState",
        object(),
        () => presentationRequest("state"),
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
            expectedInput:{type:"integer",minimum:1,maximum:9007199254740991},
          },
          ["command"],
        ),
        (args) => presentationRequest("control", args),
      );
      listen(
        document,
        "visibilitychange",
        () => {
          liveRefresh.configure(liveRefresh.enabled);
          if (viewer?.videoActive)
            void presentationRequest("control", {
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
      const galleryStatus=el("span",undefined,"wb-gallery-error");galleryStatus.id="wb-gallery-status";galleryStatus.hidden=true;galleryStatus.setAttribute("role","status");
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
      action("selection.mode", object({ enabled: { type: "boolean" } }), ({ enabled } = {}) => {
        selectionMode = enabled ?? !selectionMode;
        if (!selectionMode) selected.clear();
        paintCards();
        return { visible: selectionMode, count: selected.size };
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
      const contextualControls = [];
      function contextButton(label, name, args, kinds) {
        const node = button(label, name, args);
        node.dataset.libraryKinds = kinds.join(" ");
        contextualControls.push(node);
        return node;
      }
      function syncContext() {
        duplicates?.contextChanged();
        rulesEditor?.changed();
        const visible = state.connected && state.view !== "gallery";
        toolbar.hidden = !visible;
        for (const node of contextualControls)
          node.hidden = !visible || !node.dataset.libraryKinds.split(" ").includes(state.kind);
        const toggle = toolbar.querySelector('[data-api-action="rhvideo.selection.mode"]');
        if (toggle) { toggle.textContent = selectionMode ? "退出多选" : "多选"; toggle.setAttribute("aria-pressed", String(selectionMode)); }
        const bar = $("wb-selection");
        if (bar) bar.hidden = !visible || !selectionMode;
      }
      toolbar.append(
        sort,
        button("标签筛选", "rules.open"),
        button("顺序", "order.open"),
        button("播放记录", "playback.history"),
        contextButton("按列表顺序连播", "playlist.sequential", {}, ["video"]),
        contextButton("按列表顺序连播（超压）", "playlist.sequential", {super:true}, ["video"]),
        contextButton("连续浏览", "browse.mode", {mode:"strip"}, ["picture", "favorite"]),
        contextButton("自动放映", "browse.mode", {mode:"slideshow"}, ["picture", "favorite"]),
        button("多选", "selection.mode"),
      );
      toolbar.append(galleryStatus);
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
      let registrationBusy = false;
      const register = button("注册", "account.register", () => ({
        server: $("server").value,
        username: $("username").value,
        password: $("password").value,
      }));
      $("connection-form").querySelector(".dialog-actions").prepend(register);
      action(
        "account.register",
        object(
          {
            server: string,
            username: string,
            password: { type: "string", maxLength: 4096 },
            email: { type: "string", maxLength: 320 },
          },
          ["server", "username", "password"],
        ),
        async (args) => {
          if (registrationBusy) throw Error("正在提交注册，请稍候");
          const connection = ctx.connectionVersion();
          registrationBusy = true; register.disabled = true;
          const message = $("connection-error");message.textContent = "";message.classList.remove("success");
          try {
            if (args.username.trim().length < 3 || args.password.length < 6) throw Error("用户名至少3字符，密码至少6字符");
            const result = await native("register", args);
            if (!ctx.connectionCurrent(connection)) return { stale: true };
            if (result.registered !== true) throw Error("服务器未确认注册结果，请在服务器核对");
            message.textContent = "注册成功，请登录";message.classList.add("success");
            return result;
          } catch (error) {
            if (ctx.connectionCurrent(connection)) message.textContent = String(error.message || error);
            throw error;
          } finally {
            registrationBusy = false; register.disabled = false;
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
        duplicates?.closed();
        taskCenter?.closed();
        liveRefresh.stop();
        stopViewer();
        worker?.terminate();
        clearTimeout(saveTimer);
      });
      async function favoriteExportSelection(){
        const snapshot=structuredClone(criteria({kind:'favorite',allKeys:true,offset:0,limit:1}));
        const version=await ensure();
        // The original export dialog reloads favorites before capturing its
        // filtered snapshot. Another client may have changed server favorites.
        await rawCatalog('favorite',true);
        return query(snapshot,version);
      }
      favoriteExports=RHVideoExports.install({action,object,native,selection:favoriteExportSelection,dialog,el,button,listen,invoke,notice,state,toolbar,mobile:ctx.mobile,Refresh:RHVideoRefresh,
        listenNative:(name,fn)=>(ctx.mobile?window.RHVideoNative.listen:window.__TAURI__.event.listen)(name,fn)
      });
      duplicates=RHVideoDuplicates.install({action,object,native,dialog,el,button,listen,invoke,notice,icon,entryParent:$("library-nav"),connected:()=>state.connected,ready:ensure,Refresh:RHVideoRefresh,
        async mediaChanged(){invalidateCatalog();await load(true);}
      });
      taskPriority=RHVideoTaskPriority.install({action,object,native,ready:ensure,identity:()=>epoch+':'+state.generation,changed:syncTaskPriorityUI,
        capture:()=>({session:server.session,page:server.page,queue:server.queue,view:server.view,pageNumber:server.pageNumber,q:server.q,days:server.days,status:server.status,detail:detailJob}),
        async applied(result,target,capture){
          if(detailJob===capture.detail&&detailJob?.type==='task'&&detailJob.kind===target.kind&&detailJob.id===target.id&&$('wb-info')?.open){await invoke('server.liveRefresh');return;}
          if(!capture||!$('wb-server')?.open||ctx.modalTop()!=='wb-server'||document.activeElement?.matches('input,select,textarea'))return;
          if(!Object.keys(capture).filter(key=>key!=='detail').every(key=>server[key]===capture[key])||server.view!=='queued'||(server.page==='replacement'?'replacement':server.queue)!==target.kind)return;
          taskCenter.retainSelection(target.kind,target.id);server.pageNumber=1;await renderServer(true);liveRefresh.configure(server.live,true);
          if(server.session===capture.session&&server.pageNumber===1){$('wb-server').scrollTop=0;$('wb-server').querySelector('.wb-content').scrollTop=0;}
        }
      });
      taskPresentation=RHVideoTaskPresentation.install({el,thumbnail:paintTaskThumbnail,priorityMessage:taskPriorityMessage,changed:syncTaskPriorityUI,visible:root=>!document.hidden&&ctx.modalTop()===root.closest('dialog')?.id,
        actions(root,task,kind){if(task.can_prioritize===true&&task.status==='pending')root.append(taskPriorityButton(task,kind));if(kind==='replacement'&&['pending','running'].includes(task.status)&&typeof task.batch_id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(task.batch_id))root.append(button('停止此批次剩余任务','remote.batches.stop',{params:{id:task.batch_id},expectedGeneration:state.generation}));}
      });
      taskCenter=RHVideoTaskCenter.install({el,button,select,listen,action,object,invoke,notice,remote,presentation:taskPresentation,P:RHVideoTaskPresentation,thumbnail:paintTaskThumbnail,priorityMessage:taskPriorityMessage,priorityButton:taskPriorityButton,detailFooter:taskDetailFooter,hasLiveWork,changed:syncTaskPriorityUI,
        refreshed:()=>liveRefresh.configure(true,true),
        identity:()=>epoch+':'+state.generation+':'+server.session,opened:()=>!!$('wb-server')?.open&&['tasks','replacement'].includes(server.page),page:value=>{server.pageNumber=value;}
      });
      rulesEditor=RHVideoRules.install({action,object,button,el,input,field,select,listen,invoke,toolbar,dialog,config,identity:ruleIdentity,revision:()=>catalogRevision,ready:ensure,connected:()=>state.connected,source:()=>state.view==='gallery'?'gallery':state.kind,catalog:tagCatalog,publish:publishRule,
        settings(value){if(!ruleIdentity())throw Error("媒体账户已改变，标签偏好未保存");prefs.tagEditor=RHVideoRulesModel.settings(value);save();}
      });
      configuration=RHVideoConfiguration.install({api,action,native,object,string,state,button,el,listen,notice,mobile:ctx.mobile,config,
        rawPreferences:()=>prefs.referencePreferences||{},
        async applyPreferences(patch,original){const version=epoch;await ensure();if(version!==epoch)throw Error("媒体账户已改变");clearTimeout(saveTimer);await saveChain.catch(()=>{});if(version!==epoch)throw Error("媒体账户已改变");
          const value={...prefs,...patch,referencePreferences:original};await native("preferences",{value});if(version!==epoch)throw Error("媒体账户已改变");prefs=value;if(Object.hasOwn(patch,"autoRotate"))await native("rotation.preference",{enabled:patch.autoRotate});applyPreferences();await syncVolume();},
        async refresh(){invalidateCatalog();await load();}
      });
      return {
        invalidatePendingConfirmation,
        syncContext,
        selectCard,
        ready(){return favoriteExports.ready();},
        leaveGallery(){gallery.load++;},
        refreshGallery(refresh=false,resetPage=false){if(resetPage)gallery.offset=0;return loadGallery(refresh);},
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
        cancelPendingPlayback(){singlePlayIntent++;},
        rotationChanged(enabled){prefs.autoRotate=!!enabled;const control=document.querySelector('[data-preference="autoRotate"]');if(control)control.checked=!!enabled;},
        closeImage(){const id=imageSession?.previewId;singlePlayIntent++;imageSession=null;imageToken++;ctx.cancelImageDecode();return id;},
        canPlayImage(){return !imageSession?.loading&&imageSession?.current?.kind==="frame";},
        refreshViewer,
        previewTarget(kind,id){const top=ctx.modalTop();if(!$(top)?.open)return null;const item=top==="wb-viewer"&&!viewer?.loadingMedia?viewer?.current:top==="image-dialog"&&!imageSession?.loading?imageSession?.current:null;if(!item)return null;return (item.kind==="frame"?kind==="video"&&item.videoId===id:item.kind===kind&&item.id===id)?{kind,id}:null;},
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
