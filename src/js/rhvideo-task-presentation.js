/* Packaged task presentation. Native transport/authorization remains outside. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.RHVideoTaskPresentation=value;})(globalThis,()=>{
  'use strict';
  const labels={processing:'处理中',running:'处理中',pending:'等待',queued:'排队中',succeeded:'已完成',completed:'已完成',failed:'失败',interrupted:'已中断',skipped:'已跳过',cancelled:'已取消',done:'完成',warning:'有警告',not_run:'未执行',unrecorded:'未记录'};
  const stages={probe:'读取视频信息',compress:'普通压缩',super_compress:'超压压缩',keyframes:'提取截图',transcode:'原片转码',validate:'校验输出',backup:'备份原片',replace:'写入原片',save:'保存文件',commit:'更新记录',cleanup_variants:'清理旧压缩版',cleanup:'清理过期备份',done:'完成',failed:'失败'};
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const text=value=>typeof value==='string'?value:'';
  const number=value=>value.toLocaleString('zh-CN',{maximumFractionDigits:2});
  function duration(value){if(!finite(value)||value<0)return '—';return value<60?number(value)+' 秒':(value>=3600?Math.floor(value/3600)+' 小时 ':'')+Math.floor(value/60)%60+' 分 '+Math.floor(value%60)+' 秒';}
  function date(value){const parsed=typeof value==='string'?new Date(value):null;return parsed&&Number.isFinite(parsed.getTime())?parsed.toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';}
  function metric(item){
    if(!item||item.value===null||item.value===undefined||item.value===''||!['string','number','boolean'].includes(typeof item.value)||typeof item.value==='number'&&!finite(item.value))return null;
    const value=item.value,format=item.format||'',numeric=['bytes','duration','bitrate','percent','fps','speed','count','frames'].includes(format);let formatted;
    if(numeric&&!finite(value))return null;
    if(format==='bytes'){const index=value?Math.min(4,Math.max(0,Math.floor(Math.log(Math.abs(value))/Math.log(1024)))):0;formatted=number(value/1024**index)+' '+['B','KiB','MiB','GiB','TiB'][index];}
    else if(format==='duration')formatted=duration(value);
    else if(format==='bitrate')formatted=number(value/(Math.abs(value)>=1000000?1000000:1000))+(Math.abs(value)>=1000000?' Mbps':' kbps');
    else if(format==='datetime')formatted=date(value);
    else {const suffix={percent:'%',fps:' fps',speed:'×',count:' 个',frames:' 帧'}[format];formatted=suffix!==undefined?number(value)+suffix:typeof value==='number'?number(value):typeof value==='boolean'?value?'是':'否':value;}
    return {label:text(item.label),value:formatted};
  }
  const metrics=items=>(Array.isArray(items)?items:[]).map(metric).filter(Boolean).slice(0,24);
  const kindLabel=(task,kind)=>task.kind==='legacy'?'历史处理摘要':task.kind==='rebuild'?'原片替换后重建':kind==='replacement'||task.kind==='replacement'?'原片替换':'默认处理';
  function progress(task,{delta=0,error=''}={}){
    const p=task.progress&&typeof task.progress==='object'?task.progress:null,active=['processing','running'].includes(task.status);
    if(!active&&!p)return {visible:false};
    delta=finite(delta)?Math.max(0,delta):0;
    const age=(finite(p?.heartbeat_age_seconds)?Math.max(0,p.heartbeat_age_seconds):0)+delta;
    const unchanged=(finite(p?.unchanged_seconds)?Math.max(0,p.unchanged_seconds):0)+delta;
    const stalled=!!p?.stalled||p?.process_running===true&&unchanged>=30,offline=!!error||p?.process_running===true&&age>=5;
    const percent=finite(p?.percent)&&p.percent>=0&&p.percent<=100?p.percent:null;
    const stage=text(p?.stage),phase=(stages[stage]||stage||(active?'等待实时数据':'处理结果'))+(text(p?.resolution)?' '+p.resolution:'');
    const live=metrics([{label:'已处理时长',value:p?.processed_seconds,format:'duration'},{label:'当前输出',value:p?.output_bytes,format:'bytes'},{label:'处理帧数',value:p?.frame,format:'frames'},{label:'处理帧率',value:p?.fps,format:'fps'},{label:'编码速度',value:p?.speed,format:'speed'},{label:'当前编码器',value:p?.encoder}]);
    const elapsed=finite(p?.stage_elapsed_seconds)?p.stage_elapsed_seconds+delta:null;
    const summary=metrics([{label:'已处理时长',value:p?.processed_seconds,format:'duration'},{label:'总时长',value:p?.duration_seconds>0?p.duration_seconds:null,format:'duration'},
      {label:stalled||offline?'上次速度':'编码速度',value:p?.speed>0?p.speed:null,format:'speed'},
      {label:'预计剩余',value:active&&!stalled&&!offline?p?.eta_seconds:null,format:'duration'},
      {label:'阶段已用',value:percent===null?elapsed:null,format:'duration'}]);
    const heartbeat=!active?'':offline?(error?'读取中断：'+error:Math.floor(age)+' 秒未收到心跳'):stalled?'已 '+Math.floor(unchanged)+' 秒未推进'+(p?.process_running===true?'（进程仍有心跳）':'（尚未确认进程状态）'):p?.process_running?'心跳 '+Math.floor(age)+' 秒前':p?'处理中':'等待进度数据';
    return {visible:true,active,phase,stage,percent,percentLabel:percent===null?'—':percent.toFixed(1)+'%',state:offline?'offline':stalled?'stalled':active?'active':'idle',heartbeat,summary,live,elapsed};
  }
  function model(task,kind,options={}){
    if(!task||typeof task!=='object'||!Array.isArray(task.steps||[]))throw Error('任务详情格式无效');
    const summary=kind==='replacement'?metrics([{label:'替换前',value:task.before_size>0?task.before_size:null,format:'bytes'},{label:'替换后',value:task.after_size>0?task.after_size:null,format:'bytes'},
      {label:'节省空间',value:task.status==='succeeded'&&task.before_size>0&&task.after_size>0?task.before_size-task.after_size:null,format:'bytes'}]):[];
    const note=task.legacy?'历史摘要 · 当时未记录分步信息':task.details_archived?'此记录已超过 90 天，详细步骤已归档为摘要':task.status==='pending'?'下方为计划参数，实际执行时记录结果':task.steps_provisional&&task.live?'该任务开始时未记录分步数据，当前步骤来自实时进度':'按实际执行情况记录，参数与结果随任务留存';
    const steps=(task.steps||[]).map((step,index)=>{
      if(!step||typeof step!=='object'||Array.isArray(step))throw Error('任务步骤格式无效');
      const start=Date.parse(step.started_at),end=Date.parse(step.finished_at),elapsed=finite(step.elapsed_seconds)?step.elapsed_seconds:Number.isFinite(start)&&Number.isFinite(end)?Math.max(0,(end-start)/1000):null;
      return {key:text(step.key)||String(index),label:text(step.label)||text(step.title)||text(step.key)||'处理步骤',status:text(step.status),statusLabel:labels[step.status]||text(step.status)||'未知状态',message:text(step.message),elapsed:elapsed===null?'':'耗时 '+duration(elapsed),metrics:metrics(step.metrics),note:step.status==='pending'?'执行后显示结果':step.status==='running'?'正在获取数据':'本次未记录更多数据'};
    });
    return {id:text(task.id),filename:text(task.filename)||'任务详情',kind:kindLabel(task,kind),status:text(task.status),statusLabel:labels[task.status]||text(task.status)||'未知状态',message:text(task.message),note,summary,
      dates:task.kind==='legacy'?[{label:'记录时间',value:date(task.finished_at)}]:[{label:task.started_at?'开始':'入队',value:date(task.started_at||task.queued_at)},{label:'结束',value:date(task.finished_at)}],
      replacementNote:kind==='replacement'?'替换成功后，压缩版重建会进入默认压缩队列。':'',steps,progress:progress(task,options)};
  }
  function install(ctx){
    const roots=new Set();let views=new WeakMap();
    const el=ctx.el;
    function paintMetrics(node,values){const signature=JSON.stringify(values);if(node.dataset.signature===signature)return;node.dataset.signature=signature;node.replaceChildren();node.hidden=!values.length;for(const value of values){const entry=el('div');entry.append(el('dt',value.label),el('dd',value.value));node.append(entry);}}
    function badge(status,label){const node=el('span',label,'rv-task-badge');node.dataset.status=Object.hasOwn(labels,status)?status:'unknown';return node;}
    function live(view,value){
      const nodes=view.nodes,p=value.progress;nodes.live.hidden=!p.visible;if(!p.visible)return;
      nodes.live.dataset.state=p.state;nodes.phase.textContent=p.phase;nodes.percent.textContent=p.percentLabel;
      if(p.percent===null)nodes.bar.removeAttribute('value');else nodes.bar.value=p.percent;
      nodes.heartbeat.textContent=p.heartbeat;nodes.heartbeat.hidden=!p.heartbeat;paintMetrics(nodes.liveMetrics,p.summary);
      for(let index=0;index<value.steps.length;index++){
        const step=value.steps[index],node=nodes.steps[index],active=p.stage===step.key&&p.active;
        paintMetrics(node.live,active?p.live:[]);node.elapsed.textContent=active&&p.elapsed!==null?'已用 '+duration(p.elapsed):step.elapsed;
      }
    }
    function paint(root,task,kind){
      const value=model(task,kind),signature=JSON.stringify([kind,{...task,progress:null}]);let view=views.get(root);
      root.querySelector('.rv-task-read-error')?.remove();
      const dialog=root.closest('dialog'),scroll=root.scrollTop,dialogScroll=dialog?.scrollTop;
      if(!view||!root.contains(view.nodes.overview)||signature!==view.signature){
        const previous=root.querySelector('.wb-thumbnail-preview');root.replaceChildren();
        root.append(ctx.priorityMessage(kind));
        const overview=el('header',undefined,'rv-task-overview'),cover=el('div',undefined,'rv-task-cover'),intro=el('div');
        ctx.thumbnail(cover,task,previous);cover.hidden=!cover.hasChildNodes();intro.append(el('p',value.kind,'rv-task-eyebrow'),badge(value.status,value.statusLabel),el('h3',value.filename));
        const dates=el('dl',undefined,'rv-task-dates');paintMetrics(dates,value.dates);intro.append(dates);overview.append(cover,intro);root.append(overview);
        const summary=el('dl',undefined,'rv-task-metrics rv-task-summary');paintMetrics(summary,value.summary);root.append(summary);
        const liveBox=el('section',undefined,'rv-task-live'),head=el('div',undefined,'rv-task-live-head'),phase=el('strong'),percent=el('strong'),bar=el('progress'),liveMetrics=el('dl',undefined,'rv-task-metrics'),heartbeat=el('p',undefined,'rv-task-heartbeat');bar.max=100;bar.setAttribute('aria-label',kind==='replacement'?'原片替换进度':'默认压缩进度');head.append(phase,percent);liveBox.append(head,bar,liveMetrics,heartbeat);root.append(liveBox);
        if(value.message)root.append(el('p',value.message,'rv-task-result'+(['failed','interrupted'].includes(value.status)?' is-error':'')));
        const actions=el('div',undefined,'wb-toolbar');ctx.actions(actions,task,kind);root.append(actions);
        const heading=el('div',undefined,'rv-task-flow-heading');heading.append(el('h4','处理流程'),el('p',value.note));root.append(heading);
        const flow=el('ol',undefined,'rv-task-steps'),steps=[];
        value.steps.forEach((step,index)=>{const row=el('li',undefined,'rv-task-step'),mark=el('span',step.status==='done'?'✓':step.status==='skipped'?'−':String(index+1),'rv-task-step-mark'),body=el('div',undefined,'rv-task-step-body'),title=el('div',undefined,'rv-task-step-title'),elapsed=el('span',step.elapsed,'rv-task-step-elapsed'),recorded=el('dl',undefined,'rv-task-metrics'),current=el('dl',undefined,'rv-task-metrics rv-task-step-live');row.dataset.step=step.key;row.dataset.status=Object.hasOwn(labels,step.status)?step.status:'unknown';title.append(el('strong',step.label),elapsed,badge(step.status,step.statusLabel));body.append(title);if(step.message)body.append(el('p',step.message));paintMetrics(recorded,step.metrics);body.append(recorded);if(!step.metrics.length&&!step.message)body.append(el('p',step.note,'rv-task-note'));body.append(current);row.append(mark,body);flow.append(row);steps.push({elapsed,live:current});});
        root.append(flow);if(!value.steps.length)root.append(el('p',value.note,'rv-task-note'));if(value.replacementNote)root.append(el('p',value.replacementNote,'rv-task-note'));
        views.set(root,view={signature,task,kind,value,thumbnailPhase:text(task.progress?.stage),nodes:{overview,cover,live:liveBox,phase,percent,bar,liveMetrics,heartbeat,steps}});roots.add(root);
      }
      if(view.thumbnailPhase!==text(task.progress?.stage)){view.thumbnailPhase=text(task.progress?.stage);ctx.thumbnail(view.nodes.cover,task,view.nodes.cover.querySelector('.wb-thumbnail-preview'));}
      view.task=task;view.value=value;live(view,value);root.scrollTop=scroll;if(dialog)dialog.scrollTop=dialogScroll;ctx.changed?.();return JSON.parse(JSON.stringify(value));
    }
    function connection(error){for(const root of roots){if(!root.isConnected){roots.delete(root);continue;}const view=views.get(root);if(view&&(ctx.visible?.(root)??true)){view.value=model(view.task,view.kind,{error});live(view,view.value);}}}
    return {paint,connection,snapshot:root=>views.has(root)&&root.contains(views.get(root).nodes.overview)?JSON.parse(JSON.stringify(views.get(root).value)):null,reset:()=>{views=new WeakMap();roots.clear();}};
  }
  return {labels,kindLabel,duration,date,metric,metrics,model,progress,install};
});
