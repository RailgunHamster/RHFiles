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
      window.__TAURI__.core.invoke("rhvideo_request", { action, args:state.generation?{...args,_sessionGeneration:state.generation}:args });
  let state = { cells: [] },
    closed = false;
  api.provideRunLookup(query=>window.__TAURI__.core.invoke('automation_receipt',{query}));
  api.provideRunTransport(()=>window.__TAURI__.core.invoke('automation_receipt_transport'));
  function paused(value){return value.pauseRequested??(value.state===4);}
  function toggleCommand(value){return value.cells.every(v=>!paused(v)&&![5,6,7].includes(v.state))?'pause':'resume';}
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
    if(value.generation&&state.generation&&value.generation<state.generation)return state;
    state = value;
    const count=Math.max(1,value.count||1),groups=value.groupTotal??Math.max(1,Math.ceil((value.total||0)/count)),group=value.groupIndex??Math.floor((value.offset||0)/count);
    if(document.activeElement!==$('group-seek'))$('group-seek').value=String(groups>1?Math.round(group/(groups-1)*1000):0);
    $('group-seek').disabled=groups<=1;$('group-position').textContent=`第 ${group+1}/${groups} 组`;
    const selected = $("target").value;
    if ($("target").dataset.ids !== JSON.stringify(value.cells.map(v=>[v.id,v.title]))) {
      $("target").replaceChildren(new Option("全部视频", "-1"));
      value.cells.forEach((v, i) =>
        $("target").append(new Option(i + 1 + " · " + v.title, String(i))),
      );
      $("target").value = Number(selected)<value.cells.length?selected:'-1';
      $("target").dataset.ids=JSON.stringify(value.cells.map(v=>[v.id,v.title]));
    }
    const target=Number($('target').value),cells=target<0?value.cells:value.cells.slice(target,target+1);
    $('mute').setAttribute('aria-pressed',String(cells.length>0&&cells.every(v=>v.muted||v.volume===0)));
    for(const [name,field,yes,no]of [['favorite','favorite','取消收藏','收藏'],['mark','marked','取消暂存标记','标记暂存']]){const button=$(name);button.disabled=target<0||cells.length!==1;button.setAttribute('aria-pressed',String(cells.length===1&&!!cells[0][field]));button.textContent=cells.length===1&&cells[0][field]?yes:no;}
    if(cells.length===1){if(document.activeElement!==$('volume'))$('volume').value=String(cells[0].volume);if(document.activeElement!==$('rate'))$('rate').value=String(cells[0].rate);if(document.activeElement!==$('seek'))$('seek').value=String(Math.round(cells[0].positionMs/Math.max(1,cells[0].durationMs)*1000));}
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
            " 帧 · " + (v.state===7||(v.state===6&&!v.durationMs&&!v.renderedFrames)?"加载失败":v.seekError?"定位失败："+v.seekError:v.restoringPausedFrame?"正在恢复暂停画面":paused(v)?v.state===4?"已暂停":"正在暂停":v.state===4?"正在继续":v.state===1||v.state===2?"缓冲中":"播放中"),
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
      paint(state);
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
          enum: ["pause", "resume", "seek", "volume", "mute", "rate", "rotate"],
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
  register("close", object(), (_,run) => native("grid.close",run?{_automationRun:run}:{}));
  let mutationBusy=false;
  for(const name of ['favorite','mark'])register(name,object({target:{type:'integer',minimum:0,maximum:8}},['target']),async({target})=>{
    if(mutationBusy)throw Error('视频标记正在处理');mutationBusy=true;
    // Bind to the cell the user actually saw, not whichever cell occupies the
    // same index after an already-running group transition finishes.
    try{const cell=state.cells[target];if(!cell)throw Error('目标视频不存在');await native('grid.'+name,{target,inputTarget:target,expectedInput:cell.inputId});return paint(await native('grid.state'));}finally{mutationBusy=false;}
  });
  register('seekGroup',object({ratio:{type:'number',minimum:0,maximum:1}},['ratio']),async args=>paint(await native('grid.seekGroup',args)));
  let inputBusy=false;
  register('input',object({inputId:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},target:{type:'integer',minimum:0,maximum:8},intent:{type:'string',enum:['next','previous','first','last','toggle','close','expand','mark']}},['inputId','target','intent']),async({inputId,target,intent})=>{
    if(inputBusy)return {ignored:true};inputBusy=true;
    try{
      const current=await native('grid.state');paint(current);
      if(current.cells[target]?.inputId!==inputId)return {stale:true};
      const guard={expectedInput:inputId,inputTarget:target};let value;
      if(intent==='expand')value=await native('grid.expand',{...guard,target,toggle:true});
      else if(intent==='close'){if(current.expanded!=null)value=await native('grid.expand',{...guard,target:-1});else return await native('grid.close',guard);}
      else if(intent==='next'||intent==='previous')value=await native('grid.page',{...guard,direction:intent==='next'?1:-1});
      else if(intent==='first'||intent==='last')value=await native('grid.seekGroup',{...guard,ratio:intent==='first'?0:1});
      else if(intent==='toggle')value=await native('grid.control',{...guard,target:-1,command:toggleCommand(current)});
      else if(intent==='mark'){await native('grid.mark',{...guard,target});value=await native('grid.state');}
      else return {ignored:true};
      return paint(value);
    }finally{inputBusy=false;}
  });
  window.__TAURI__.event.listen('rhvideo-native-input',({payload})=>{void api.invoke('rhvideo.grid.input',payload).catch(e=>{$('error').textContent=String(e.message||e);});}).catch(e=>{$('error').textContent=String(e.message||e);});
  window.__TAURI__.event.listen('rhvideo-grid-session',({payload})=>{
    if(!Number.isSafeInteger(payload?.generation)||payload.generation<(state.generation||0))return;
    state={...state,generation:payload.generation};void api.invoke('rhvideo.grid.state').catch(e=>{$('error').textContent=String(e.message||e);});
  }).catch(e=>{$('error').textContent=String(e.message||e);});
  for (const [id, name] of Object.entries({
    previous: "page",
    next: "page",
    target: "target",
    pause: "control",
    resume: "control",
    mute: "control",
    favorite: "favorite",
    mark: "mark",
    expand: "expand",
    restore: "expand",
    seek: "seekRatio",
    volume: "control",
    rate: "control",
    'group-seek':'seekGroup',
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
  for(const name of ['favorite','mark'])RHFilesUI.listen($(name),'click',()=>call(name,{target:Number($('target').value)}),undefined,'rhvideo.grid.'+name);
  for (const command of ["pause", "resume", "mute"])
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
  RHFilesUI.listen($('group-seek'),'change',()=>call('seekGroup',{ratio:Number($('group-seek').value)/1000}),undefined,'rhvideo.grid.seekGroup');
  RHFilesUI.listen(document,'keydown',event=>{
    if(event.target.closest('input,select,textarea')||event.ctrlKey||event.altKey||event.metaKey)return;
    const key=event.key&&event.key!=='Unidentified'?(event.key===' '?'Space':event.key):event.code;
    const intent={Escape:'close',Space:'toggle',ArrowLeft:'previous',ArrowRight:'next',Home:'first',End:'last'}[key];
    if(!intent||event.repeat||!state.cells.length)return;event.preventDefault();void call('input',{inputId:state.cells[0].inputId,target:0,intent});
  },undefined,'rhvideo.grid.keyboard');
  RHFilesUI.listen(document,'contextmenu',event=>event.preventDefault(),undefined,'rhvideo.grid.contextmenu');
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
