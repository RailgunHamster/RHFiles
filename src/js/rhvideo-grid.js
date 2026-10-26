(() => {
  "use strict";
  const api = RHFilesAPI,
    $ = (id) => document.getElementById(id),
    object = (properties = {}, required = []) => ({
      type: "object",
      properties,
      required,
      additionalProperties: false,
    }),
    native = (action, args = {}) =>
      window.__TAURI__.core.invoke("rhvideo_request", { action, args });
  let state = { cells: [] },
    closed = false;
  api.provideState("application", () => ({
    platform: "windows",
    window: "window-rhvideo-grid",
    ready: true,
  }));
  api.provideState("grid", () => state);
  const register = (name, params, fn) =>
    api.register("rhvideo.grid." + name, fn, {
      params,
      description: "RHVideo native multi-video " + name,
    });
  function paint(value) {
    state = value;
    const selected = $("target").value;
    if ($("target").options.length !== value.cells.length + 1) {
      $("target").replaceChildren(new Option("全部视频", "-1"));
      value.cells.forEach((v, i) =>
        $("target").append(new Option(i + 1 + " · " + v.title, String(i))),
      );
      $("target").value = selected;
    }
    $("previous").disabled = !value.hasPrevious;
    $("next").disabled = !value.hasNext;
    $("summary").textContent =
      (value.total
        ? value.offset +
          1 +
          "–" +
          Math.min(value.offset + value.cells.length, value.total) +
          " / " +
          value.total +
          "　"
        : "") +
      value.cells
        .map(
          (v, i) =>
            i +
            1 +
            ": " +
            Math.floor(v.positionMs / 1000) +
            "s · " +
            v.renderedFrames +
            " 帧",
        )
        .join("　");
    return value;
  }
  register("state", object(), async () => paint(await native("grid.state")));
  register(
    "target",
    object({ index: { type: "integer", minimum: -1, maximum: 8 } }, ["index"]),
    ({ index }) => {
      if (index >= state.cells.length) throw Error("目标视频不存在");
      $("target").value = String(index);
      return { index };
    },
  );
  register(
    "control",
    object(
      {
        target: { type: "integer", minimum: -1, maximum: 8 },
        command: {
          type: "string",
          enum: ["pause", "resume", "seek", "volume", "rate", "rotate"],
        },
        value: { type: "number" },
      },
      ["target", "command"],
    ),
    async (args) => paint(await native("grid.control", args)),
  );
  register(
    "expand",
    object({ target: { type: "integer", minimum: -1, maximum: 8 } }, [
      "target",
    ]),
    async (args) => paint(await native("grid.expand", args)),
  );
  register("close", object(), () => native("grid.close"));
  for (const [id, name] of Object.entries({
    previous: "page",
    next: "page",
    target: "target",
    pause: "control",
    resume: "control",
    expand: "expand",
    restore: "expand",
    seek: "seekRatio",
    volume: "control",
    rate: "control",
  }))
    $(id).dataset.apiAction = "rhvideo.grid." + name;
  api.register(
    "rhvideo.ui.contract",
    () => {
      const ids = new Set(api.list().map((v) => v.id)),
        controls = [...document.querySelectorAll("button,input,select")].map(
          (n) => ({
            label: n.getAttribute("aria-label") || n.id || n.textContent,
            action: n.dataset.apiAction,
          }),
        );
      return {
        controls: controls.length,
        missing: controls.filter((v) => !ids.has(v.action)),
        operations: api.list(),
      };
    },
    {
      params: object(),
      risk: "read",
      description: "Native grid UI/public API coverage",
    },
  );
  register(
    "page",
    object({ direction: { type: "integer", enum: [-1, 1] } }, ["direction"]),
    async (args) => paint(await native("grid.page", args)),
  );
  register(
    "seekRatio",
    object(
      {
        target: { type: "integer", minimum: -1, maximum: 8 },
        ratio: { type: "number", minimum: 0, maximum: 1 },
      },
      ["target", "ratio"],
    ),
    async ({ target, ratio }) => {
      for (let i = 0; i < state.cells.length; i++)
        if (target === -1 || target === i)
          await api.invoke("rhvideo.grid.control", {
            target: i,
            command: "seek",
            value: Math.floor(state.cells[i].durationMs * ratio),
          });
      return state;
    },
  );
  const call = (name, args) =>
    api.invoke("rhvideo.grid." + name, args).catch((e) => {
      $("error").textContent = String(e.message || e);
    });
  for (const command of ["pause", "resume"])
    RHFilesUI.listen(
      $(command),
      "click",
      () => call("control", { target: Number($("target").value), command }),
      undefined,
      "rhvideo.grid." + command,
    );
  for (const [id, direction] of [
    ["previous", -1],
    ["next", 1],
  ])
    RHFilesUI.listen(
      $(id),
      "click",
      () => call("page", { direction }),
      undefined,
      "rhvideo.grid." + id,
    );
  RHFilesUI.listen(
    $("target"),
    "change",
    () => call("target", { index: Number($("target").value) }),
    undefined,
    "rhvideo.grid.target",
  );
  for (const command of ["volume", "rate"])
    RHFilesUI.listen(
      $(command),
      "change",
      () =>
        call("control", {
          target: Number($("target").value),
          command,
          value: Number($(command).value),
        }),
      undefined,
      "rhvideo.grid." + command,
    );
  RHFilesUI.listen(
    $("seek"),
    "change",
    () =>
      call("seekRatio", {
        target: Number($("target").value),
        ratio: Number($("seek").value) / 1000,
      }),
    undefined,
    "rhvideo.grid.seek",
  );
  for (const [id, target] of [
    ["expand", () => Math.max(0, Number($("target").value))],
    ["restore", () => -1],
  ])
    RHFilesUI.listen(
      $(id),
      "click",
      () => call("expand", { target: target() }),
      undefined,
      "rhvideo.grid." + id,
    );
  window.addEventListener("pagehide", () => {
    closed = true;
  });
  async function poll() {
    try {
      await api.invoke("rhvideo.grid.state");
    } catch (e) {
      $("error").textContent = String(e.message || e);
    }
    if (!closed) setTimeout(poll, 1000);
  }
  void poll();
})();
