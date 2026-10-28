(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.RHVideoExports=value;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  const maximum=50000,chunkSize=200;
  const uuid=/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;
  const active=job=>['queued','running'].includes(job.status);
  const downloadStates=['queued','downloading','publishing','cancelling','cancelled','saved','failed'];
  function mergeTask(map,task){
    if(!task||!uuid.test(task.id)||!uuid.test(task.exportId)||!downloadStates.includes(task.state)||!Number.isSafeInteger(task.revision)||task.revision<0||!Number.isSafeInteger(task.bytes)||!Number.isSafeInteger(task.total)||task.bytes<0||task.total<4||task.bytes>task.total)throw Error('本机下载状态无效');
    if((map.get(task.id)?.revision??-1)>task.revision)return false;
    map.set(task.id,JSON.parse(JSON.stringify(task)));
    while(map.size>64){const old=[...map.values()].filter(t=>['saved','failed','cancelled'].includes(t.state)).sort((a,b)=>a.started-b.started)[0];if(!old)break;map.delete(old.id);}return true;
  }
  const bytes=value=>{let n=Math.max(0,Number(value)||0),unit=0;while(n>=1024&&unit<4){n/=1024;unit++;}return n.toFixed(unit?1:0)+' '+['B','KB','MB','GB','TB'][unit];};

  function selection(result){
    if(!Number.isSafeInteger(result?.total)||result.total<1||result.total>maximum||!Array.isArray(result.queue)||result.queue.length!==result.total)
      throw Error(result?.total===0?'没有可导出的收藏':'导出需要完整筛选结果，一次最多 50000 项；请缩小筛选范围');
    const seen=new Set();
    return result.queue.map(item=>{
      const type=item.kind,id=item.id;
      if(!['video','picture','novel'].includes(type)||typeof id!=='string'||[...id].length<1||[...id].length>36||id.includes('\0'))throw Error('筛选结果包含无效的收藏项目');
      const key=JSON.stringify([type,id]);if(seen.has(key))throw Error('筛选结果包含重复的收藏项目');seen.add(key);
      return {type,id};
    });
  }

  function install(ctx){
    const {action,object,native}=ctx;
    let epoch=0,busy=false,phase='idle',lastJob=null,message='';
    let root=null,dialogNode=null,entry=null,viewRevision=0,mutation=0,loading=false,scope='filtered',captured=null,jobs=[],pollError='',downloadWarning='',waitingPick=null,pickerStarting=false;
    const tasks=new Map(),earlyPicks=new Map();
    const idSchema={type:'string',pattern:uuid.source,maxLength:36,minLength:36};
    const current=version=>version===epoch;
    const snapshot=()=>({busy,phase,lastJob:lastJob?JSON.parse(JSON.stringify(lastJob)):null,message,opened:!!dialogNode?.open,loading,scope,selectionCount:captured?.length??0,jobs:JSON.parse(JSON.stringify(jobs)),downloads:[...tasks.values()].map(v=>JSON.parse(JSON.stringify(v))),refresh:loop?.state(),pollDelay:loop?.delay});
    const changed=()=>{ctx.changed?.(snapshot());renderUI();};
    const ensure=version=>{if(!current(version))throw Error('媒体账户已改变，旧导出操作未继续');};
    const loop=ctx.Refresh?new ctx.Refresh.Loop({visible:()=>!!dialogNode?.open&&!document.hidden,delay:10000,run:refreshUI,changed:value=>{pollError=value.error+(value.failures>=3?'；自动刷新已暂停，请手动刷新任务':'');renderUI();}}):null;

    action('exports.state',object(),snapshot,'read');
    action('exports.list',object({limit:{type:'integer',minimum:1,maximum:100}}),async({limit=20})=>{
      const version=epoch;const result=await native('operation',{name:'exports.list',query:{limit}});
      return current(version)?result:{stale:true};
    },'read');
    action('exports.get',object({id:idSchema},['id']),async({id})=>{
      if(!uuid.test(id))throw Error('导出任务编号无效');const version=epoch;
      const result=await native('operation',{name:'exports.get',params:{id}});return current(version)?result:{stale:true};
    },'read');
    action('exports.cancel',object({id:idSchema},['id']),args=>exclusive(async version=>{
      if(!uuid.test(args.id))throw Error('导出任务编号无效');phase='cancelling';changed();
      const result=await native('operation',{name:'exports.cancel',params:{id:args.id}});ensure(version);lastJob=result;jobs=jobs.map(v=>v.id===result.id?result:v);phase='idle';return result;
    }),'write');
    action('exports.create',object({scope:{type:'string',enum:['all','filtered']}},['scope']),({scope})=>exclusive(async version=>{
      if(!['all','filtered'].includes(scope))throw Error('导出范围无效');
      let ticket=null,submitted=false;
      try{
        if(scope==='filtered'){
          phase='preparing';changed();
          // The provider captures the filter before awaiting I/O and queries all
          // keys. Never substitute visible cards or a selection checkbox page.
          const rows=dialogNode?.open&&captured?captured:selection(await ctx.selection());ensure(version);
          ticket=(ctx.requestId||(()=>crypto.randomUUID()))();
          if(!uuid.test(ticket))throw Error('无法生成导出准备标识');
          for(let offset=0;offset<rows.length;offset+=chunkSize){
            ensure(version);
            const items=rows.slice(offset,offset+chunkSize),result=await native('exports.prepare',{ticket,offset,total:rows.length,items});ensure(version);
            if(result.ticket!==ticket||result.count!==offset+items.length||result.total!==rows.length||result.ready!==(offset+items.length===rows.length))throw Error('导出选择没有完整准备，打包未提交');
          }
        }
        ensure(version);const requestId=(ctx.requestId||(()=>crypto.randomUUID()))();if(!uuid.test(requestId))throw Error('无法生成导出请求标识');
        phase='submitting';changed();submitted=true;
        const result=await native('exports.create',{requestId,...(ticket?{ticket}:{})});ensure(version);
        lastJob=result;jobs=[result,...jobs.filter(v=>v.id!==result.id)];phase='idle';message='已提交服务端后台打包，关闭界面不会取消。';return result;
      }catch(error){
        if(current(version)){
          if(ticket&&!submitted){try{await native('exports.discard',{ticket});}catch(discard){if(current(version))message='释放导出准备失败：'+String(discard.message||discard);}}
          if(submitted)message='打包结果未确认，请查看最近导出核对；不会自动重发。';
        }
        throw error;
      }
    }),'write');

    action('exports.downloads',object(),async()=>{
      const version=epoch,result=await native('exports.downloads');ensure(version);acceptTasks(result);changed();return result;
    },'read');
    action('exports.download',object({id:idSchema,path:{type:'string',minLength:1,maxLength:32768}},['id']),args=>exclusive(async version=>{
      if(!uuid.test(args.id))throw Error('导出任务编号无效');phase='choosing';pickerStarting=true;earlyPicks.clear();changed();
      try{
        const result=await native('exports.download',args);ensure(version);pickerStarting=false;
        if(result.requested){
          if(!uuid.test(result.pickId))throw Error('系统保存选择器没有返回有效标识');waitingPick=result.pickId;message='请选择 ZIP 的保存位置。';
          const early=earlyPicks.get(waitingPick);earlyPicks.clear();if(early)pickerResult(early);
        }else acceptDownload(result);
        return result;
      }finally{if(current(version))pickerStarting=false;}
    }),'write');
    action('exports.download.cancel',object({taskId:idSchema},['taskId']),args=>exclusive(async version=>{
      if(!uuid.test(args.taskId))throw Error('下载任务标识无效');const task=await native('exports.download.cancel',args);ensure(version);mergeTask(tasks,task);phase='idle';message='已请求取消该下载；不会删除已经保存的文件。';return task;
    }),'write');

    async function exclusive(work){
      if(busy)throw Error('导出操作正在进行');
      const version=epoch;busy=true;message='';mutation++;changed();
      try{return await work(version);}catch(error){if(current(version)){phase='failed';message=String(error.message||error)+(message?'；'+message:'');}throw error;}
      finally{if(current(version)){mutation++;busy=waitingPick!==null;if(loop&&dialogNode?.open){loop.delay=jobs.some(active)?1000:10000;loop.configure(true,phase!=='failed');}changed();}}
    }
    function acceptTasks(result){if(!Array.isArray(result?.items)||result.items.length>64)throw Error('本机下载列表格式无效');for(const task of result.items)mergeTask(tasks,task);downloadWarning=String(result.warning||'');}
    function acceptDownload(result){
      if(result?.error)throw Error(result.error);
      if(result?.picked===false){phase='idle';message='已取消选择保存位置，未开始下载。';return;}
      if(!result?.task)throw Error('下载没有返回有效的本机任务');mergeTask(tasks,result.task);phase=result.task.state==='failed'?'failed':'idle';message=result.task.state==='failed'?String(result.task.error||'下载未能启动'):'已加入本机下载，可在下方查看进度。';
    }
    function pickerResult(payload){
      if(!waitingPick||payload.pickId!==waitingPick)return;
      waitingPick=null;busy=false;try{acceptDownload(payload.result);}catch(e){phase='failed';message=String(e.message||e);}changed();if(dialogNode?.open)loop?.configure(true);
    }
    if(ctx.listenNative){
      ctx.listenNative('rhvideo-download-progress',({payload})=>{if(payload.generation!==ctx.state.generation)return;try{mergeTask(tasks,payload.task);changed();}catch(e){ctx.notice?.(e);}}).catch(ctx.notice);
      if(ctx.mobile){
        ctx.listenNative('rhvideo-download-picker',({payload})=>{if(payload.generation!==ctx.state.generation)return;if(pickerStarting&&!waitingPick){if(earlyPicks.size<4)earlyPicks.set(payload.pickId,payload);return;}pickerResult(payload);}).catch(ctx.notice);
        ctx.listenNative('rhvideo-export-open',()=>{void ready().catch(ctx.notice);}).catch(ctx.notice);
      }
    }
    async function ready(){
      if(!ctx.mobile)return;
      const result=await native('exports.uiReady');
      if(result.pending&&result.pending._sessionGeneration===ctx.state.generation){waitingPick=result.pending.pickId;busy=true;phase='choosing';message='请选择 ZIP 的保存位置。';}
      if(result.open||result.pending)await ctx.invoke('exports.open');
    }
    async function refreshUI(){
      if(busy)return true;const version=epoch,view=viewRevision,revision=mutation;
      const [listed,downloaded]=await Promise.all([native('operation',{name:'exports.list',query:{limit:20}}),native('exports.downloads')]);
      if(!current(version)||view!==viewRevision||revision!==mutation)return true;
      if(!Array.isArray(listed?.items)||listed.items.length>100)throw Error('导出列表格式无效');jobs=listed.items;acceptTasks(downloaded);if(loop)loop.delay=jobs.some(active)?1000:10000;changed();return true;
    }
    function closeUI(){viewRevision++;loading=false;loop?.stop();}
    function renderUI(){
      if(!root?.isConnected||!dialogNode?.open)return;
      const info=root.querySelector('[data-export-message]');info.textContent=[message,pollError,downloadWarning].filter(Boolean).join('\n');info.classList.toggle('form-error',phase==='failed'||!!pollError||!!downloadWarning);
      root.querySelector('[data-export-count]').textContent=loading?'正在读取完整筛选结果…':`${captured?.length??0} 项，包含所有页`;
      for(const radio of root.querySelectorAll('input[name=rhvideo-export-scope]')){radio.checked=radio.value===scope;radio.disabled=busy||loading;}
      const create=root.querySelector('[data-export-create]');create.disabled=busy||loading||scope==='filtered'&&!captured?.length;
      const focus=document.activeElement,key=focus?.dataset?.exportKey,command=focus?.dataset?.apiAction;
      const backend=root.querySelector('[data-export-jobs]');backend.replaceChildren();
      for(const job of jobs){
        const article=ctx.el('article',undefined,'wb-export-job'),head=ctx.el('div',undefined,'wb-export-job-head'),title=ctx.el('div'),actions=ctx.el('div',undefined,'wb-export-job-actions');
        const label=job.cancel_requested&&active(job)?'正在取消':({queued:'等待打包',running:'正在打包',completed:'可以下载',failed:'导出失败',cancelled:'已取消',expired:'已过期'})[job.status]||job.status;
        title.append(ctx.el('strong',`喜爱文件 · ${job.total} 项`),ctx.el('small',new Date(job.created_at).toLocaleString('zh-CN')+' · '+label));head.append(ctx.el('span','ZIP','wb-export-badge'),title,actions);article.append(head);
        if(job.can_download){const b=ctx.button('下载 '+bytes(job.archive_bytes),'exports.download',{id:job.id});b.dataset.exportKey=job.id;actions.append(b);}else if(active(job)){const b=ctx.button('取消打包','exports.cancel',{id:job.id});b.dataset.exportKey=job.id;b.disabled=!!job.cancel_requested;actions.append(b);}
        const p=job.progress||{};
        if(job.status==='running'){const line=ctx.el('div',undefined,'wb-export-progress'),bar=ctx.el('progress');bar.max=100;bar.value=Math.min(100,Math.max(0,Number(p.percent)||0));bar.setAttribute('aria-label','ZIP 打包进度');line.append(bar,ctx.el('b',bar.value.toFixed(1)+'%'));article.append(line,ctx.el('p',p.current||'正在准备文件…','wb-export-current'),ctx.el('small',`${bytes(p.bytes_done)} / ${bytes(p.bytes_total)} · 已检查 ${p.done||0}/${job.total} 项`));}
        else if(job.status==='completed')article.append(ctx.el('small',`已打包 ${p.included||0} 项${p.skipped?' · 缺失跳过 '+p.skipped+' 项（详见包内清单）':''} · 保留至 ${new Date(job.expires_at).toLocaleString('zh-CN')}`));
        else if(job.status==='queued')article.append(ctx.el('small','服务端后台排队中，关闭界面后仍会继续。'));
        else if(job.status==='expired')article.append(ctx.el('small','临时 ZIP 已清理，可重新创建导出。'));
        if(job.error_message)article.append(ctx.el('p',job.error_message,'form-error'));backend.append(article);
      }
      if(!jobs.length)backend.append(ctx.el('p','还没有导出任务。','wb-export-empty'));
      const local=root.querySelector('[data-export-downloads]');local.replaceChildren();
      for(const task of [...tasks.values()].sort((a,b)=>b.started-a.started)){
        const article=ctx.el('article',undefined,'wb-export-job'),head=ctx.el('div',undefined,'wb-export-job-head'),title=ctx.el('div'),actions=ctx.el('div',undefined,'wb-export-job-actions');
        title.append(ctx.el('strong',task.name||task.path.split(/[\\/]/).at(-1)||'喜爱 ZIP'),ctx.el('small',({queued:'等待下载',downloading:'正在下载',publishing:'正在保存',saved:'已保存',failed:'下载失败',cancelling:'正在取消',cancelled:'已取消'})[task.state]));head.append(title,actions);article.append(head);
        if(['queued','downloading'].includes(task.state)){const b=ctx.button('取消下载','exports.download.cancel',{taskId:task.id});b.dataset.exportKey=task.id;actions.append(b);}
        const bar=ctx.el('progress');bar.max=100;bar.value=task.state==='saved'?100:Math.min(99.9,task.bytes/Math.max(1,task.total)*100);bar.setAttribute('aria-label','本机 ZIP 下载进度');article.append(bar,ctx.el('small',`${bar.value.toFixed(1)}% · ${bytes(task.bytes)} / ${bytes(task.total)}${task.speed>0?' · '+bytes(task.speed)+'/s':''}`));
        if(task.state==='saved')article.append(ctx.el('p',task.path.startsWith('content:')?'已保存到系统选择的位置':task.path,'wb-export-current'));if(task.error)article.append(ctx.el('p',task.error,'form-error'));local.append(article);
      }
      if(!tasks.size)local.append(ctx.el('p','尚无本机下载记录。','wb-export-empty'));
      for(const button of root.querySelectorAll('[data-export-jobs] button,[data-export-downloads] button'))button.disabled=busy||button.disabled;
      if(key&&command)[...root.querySelectorAll('button')].find(v=>v.dataset.exportKey===key&&v.dataset.apiAction===command)?.focus({preventScroll:true});
    }
    function buildUI(){
      root=ctx.dialog('wb-exports','打包喜爱');dialogNode=root.closest('dialog');if(root.querySelector('[data-export-jobs]'))return;
      root.classList.add('wb-exports');ctx.listen(dialogNode,'close',closeUI,'exports.closed');
      const options=ctx.el('div',undefined,'wb-export-options');
      for(const [value,label]of [['filtered','当前筛选结果'],['all','全部喜爱']]){const field=ctx.el('label'),radio=ctx.el('input'),text=ctx.el('div');radio.type='radio';radio.name='rhvideo-export-scope';radio.value=value;radio.dataset.apiAction='rhvideo.exports.scope';ctx.listen(radio,'change',()=>ctx.invoke('exports.scope',{value}).catch(ctx.notice),'exports.scope.'+value);text.append(ctx.el('strong',label));if(value==='filtered'){const count=ctx.el('small');count.dataset.exportCount='';text.append(count);}else text.append(ctx.el('small','忽略类型、搜索和标签筛选'));field.append(radio,text);options.append(field);}
      const toolbar=ctx.el('div',undefined,'wb-toolbar'),create=ctx.button('开始打包 ZIP','exports.create',()=>({scope})),refresh=ctx.button('刷新任务','exports.refresh');create.id='wb-export-create';refresh.id='wb-export-refresh';create.dataset.exportCreate='';toolbar.append(create,refresh);
      const status=ctx.el('p',undefined,'wb-export-message');status.dataset.exportMessage='';status.setAttribute('role','status');const backend=ctx.el('div'),local=ctx.el('div');backend.dataset.exportJobs='';local.dataset.exportDownloads='';
      root.append(options,ctx.el('p','服务端后台打包 · 临时 ZIP 保留 24 小时','wb-export-note'),toolbar,status,ctx.el('h3','最近的导出'),backend,ctx.el('h3','本机下载'),local);
    }
    if(ctx.dialog){
      action('exports.scope',object({value:{type:'string',enum:['all','filtered']}},['value']),({value})=>{if(busy||loading)throw Error('导出操作正在准备');if(!['all','filtered'].includes(value))throw Error('导出范围无效');scope=value;changed();return {scope};});
      action('exports.open',object(),async()=>{
        if(dialogNode?.open)return snapshot();const version=epoch,view=++viewRevision;captured=null;loading=true;if(!busy){phase='idle';message='';}buildUI();changed();
        try{captured=selection(await ctx.selection());}catch(e){if(current(version)&&view===viewRevision){captured=[];message=String(e.message||e);}}
        if(!current(version)||view!==viewRevision)return {stale:true};loading=false;scope=captured.length?'filtered':'all';changed();loop.configure(true,true);await loop.tick();return snapshot();
      });
      action('exports.close',object(),async()=>{if(dialogNode?.open)await ctx.invoke('panel.close',{id:'wb-exports'});closeUI();return {closed:true};});
      action('exports.refresh',object(),async()=>{if(!dialogNode?.open)throw Error('导出窗口未打开');loop.configure(true,true);await loop.tick();return snapshot();},'read');
      entry=ctx.button('打包导出','exports.open');entry.id='wb-favorite-export';ctx.toolbar.append(entry);ctx.listen(document,'visibilitychange',()=>loop.configure(!!dialogNode?.open),'exports.visibility');
    }
    function sync(){if(entry)entry.hidden=ctx.state.kind!=='favorite';}
    sync();
    return {state:snapshot,ready,sync,reset(){epoch++;viewRevision++;busy=false;loading=false;phase='idle';lastJob=null;message='';pollError='';jobs=[];tasks.clear();captured=null;waitingPick=null;pickerStarting=false;earlyPicks.clear();downloadWarning='';dialogNode?.close();loop?.stop();changed();}};
  }
  return {maximum,chunkSize,selection,mergeTask,install};
});
