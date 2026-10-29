/* Native-session duplicate review. No token, arbitrary fetch, automatic write
 * retry, client-side hashing/deletion, or dependence on the visible card page. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.RHVideoDuplicates=value;})(globalThis,()=>{
  'use strict';
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const active=job=>['queued','running'].includes(job?.status);
  const statuses=['queued','running','completed','partial','failed','cancelled'];
  const labels={queued:'排队中',running:'处理中',completed:'已完成',partial:'部分完成',failed:'失败',cancelled:'已取消',pending:'等待',done:'已暂存',skipped:'已跳过'};
  const copy=value=>JSON.parse(JSON.stringify(value));
  const integer=value=>Number.isSafeInteger(value)&&value>=0;
  function identity(value){if(typeof value!=='string'||!uuid.test(value))throw Error('疑似重复任务标识无效');return value;}
  function previewPath(item){
    if(!['video','picture'].includes(item?.media_type)||typeof item.id!=='string'||!(/^[A-Za-z0-9_-]{1,128}$/).test(item.id)||item.key!==item.media_type+':'+item.id||item.key.length>50)throw Error('疑似重复成员标识无效');
    const path='/api/v1/duplicates/preview/'+item.media_type+'/'+item.id;
    if(typeof item.preview_url!=='string'||!(item.preview_url===path||item.preview_url.startsWith(path+'?v=')&&/^[a-f0-9]{64}$/i.test(item.preview_url.slice(path.length+3))))throw Error('疑似重复预览地址无效');
    return item.preview_url;
  }
  function validateJob(value,review=false){
    if(!value||!uuid.test(value.id)||!statuses.includes(value.status))throw Error('疑似重复任务格式无效');
    if(review){identity(value.group_id);if(!integer(value.total)||!integer(value.done)||!integer(value.failed)||value.done+value.failed>value.total)throw Error('复核进度无效');}
    return value;
  }
  function validatePage(value,groups=false){
    if(!value||!Array.isArray(value.items)||value.items.length>(groups?12:25)||!integer(value.page)||value.page<1||!integer(value.pages)||value.pages<1||value.page>value.pages||groups&&!integer(value.total))throw Error('疑似重复分页无效');
    const seen=new Set();if(groups)for(const group of value.items){
      identity(group.id);identity(group.scan_id);
      if(seen.has(group.id))throw Error('重复分组编号无效');seen.add(group.id);
      if(!['video','picture'].includes(group.media_type)||!integer(group.member_count)||group.member_count<2||!Number.isFinite(group.similarity)||group.similarity<0||group.similarity>100)throw Error('疑似重复分组无效');
      validateMembers(group.members,group.media_type);
    }
    return value;
  }
  function validateMembers(value,kind){
    if(!value||!Array.isArray(value.items)||value.items.length>24)throw Error('重复成员分页无效');
    const seen=new Set();for(const item of value.items){previewPath(item);if(item.media_type!==kind||seen.has(item.key))throw Error('重复成员列表无效');seen.add(item.key);}
    return value;
  }
  function install(ctx){
    const {action,object,native}=ctx;
    let epoch=0,revision=0,kind='all',page=1,pages=1,total=0,groups=[],status={scan:null,reviews:[]};
    let opened=false,busy=false,loading=false,supported=null,error='',actionError='',root=null,entry=null,groupSignature='',jobSignature='',statusFlight=null,listFlight=null,listTicket=0;
    let reviewId='',reviewPage=1,reviewPages=1,reviewTicket=0;
    const choices=new Map(),choiceScans=new Map(),previews=new Map(),pendingPreviews=new Map(),loadingMembers=new Set(),processId=ctx.processId||crypto.randomUUID();
    let previewFlight=null;
    const idSchema={type:'string',minLength:36,maxLength:36,pattern:uuid.source};
    const stamp=()=>processId+':'+epoch+':'+revision;
    const guard=version=>{if(version!==epoch)throw Error('媒体账户已改变，旧重复项操作未继续');};
    const snapshot=()=>({opened,busy,loading,supported,error,kind,page,pages,total,revision:stamp(),...copy(status),groups:copy(groups),choices:Object.fromEntries(choices),review:{id:reviewId,page:reviewPage,pages:reviewPages},refresh:loop?.state()||null});
    const read=async(name,args={})=>{try{return await native('operation',{name:'duplicates.'+name,...args});}catch(failure){if(name==='status'&&/\b404\b/.test(String(failure.message||failure)))throw Error('疑似重复接口尚不可用，请更新 RHVideo 后端（HTTP 404）');throw failure;}};
    const loop=ctx.Refresh?new ctx.Refresh.Loop({visible:()=>opened&&!document.hidden,delay:10000,run:async()=>{await refresh(false);return opened;},changed:value=>{if(value.error)error=(actionError?actionError+'\n':'')+value.error+(value.failures>=3?'；自动刷新已暂停，请手动刷新':'');render();}}):null;
    function changed(){ctx.changed?.(snapshot());render();}
    function groupFor(args,selected=false){
      if(args.expectedRevision!==stamp())throw Error('分组内容已改变，请重新选择保留项');
      const group=groups.find(group=>group.id===args.groupId);if(!group||group.stale)throw Error('分组已过期，请更新检测后复核');
      if(selected&&(args.scanId!==group.scan_id||choices.get(group.id)!==args.keeperKey||!group.members.items.some(item=>item.key===args.keeperKey)))throw Error('保留项或扫描快照已改变，未提交暂存');
      return group;
    }
    async function exclusive(work){
      if(busy)throw Error('疑似重复操作正在处理');const version=epoch;busy=true;error=actionError='';changed();
      try{await ctx.ready?.();guard(version);return await work(version);}
      catch(failure){if(version===epoch){error=actionError=String(failure.message||failure);changed();}throw failure;}
      finally{if(version===epoch){busy=false;loop?.configure(opened);changed();}}
    }
    async function loadGroups(){
      const version=epoch,key=version+':'+kind+':'+page;
      if(listFlight?.key===key)return listFlight.promise;
      const ticket=++listTicket,previous=listFlight;
      if(previous){await previous.promise.catch(()=>{});if(version!==epoch||ticket!==listTicket)return {stale:true};}
      const target={kind,page};loading=true;changed();
      const flight={key,promise:null};
      flight.promise=(async()=>{
        const result=validatePage(await read('groups',{query:{kind:target.kind,page:target.page,limit:6}}),true);
        guard(version);if(ticket!==listTicket||target.kind!==kind)return {stale:true};
        page=result.page;pages=result.pages;total=result.total;
        const signature=JSON.stringify(result);
        if(signature!==groupSignature){groupSignature=signature;groups=copy(result.items);revision++;for(const group of groups)if(group.stale||choiceScans.get(group.id)!==group.scan_id){choices.delete(group.id);choiceScans.delete(group.id);}}
        return result;
      })().catch(failure=>{if(version===epoch&&ticket===listTicket)error=String(failure.message||failure);throw failure;}).finally(()=>{if(listFlight===flight){listFlight=null;loading=false;changed();}});
      listFlight=flight;return flight.promise;
    }
    async function refresh(force=true){
      if(statusFlight)return statusFlight;
      const version=epoch;
      const work=(async()=>{
        const value=await read('status');guard(version);
        if(!value||!Array.isArray(value.reviews)||value.reviews.length>10)throw Error('疑似重复状态无效');
        if(value.scan)validateJob(value.scan);value.reviews.forEach(job=>validateJob(job,true));
        const before=JSON.stringify([status.scan?.id,status.scan?.status,status.reviews.map(job=>[job.id,job.status])]);
        const completed=status.reviews.some(old=>active(old)&&value.reviews.some(job=>job.id===old.id&&!active(job)));
        supported=true;error=actionError;status=copy(value);changed();
        const after=JSON.stringify([status.scan?.id,status.scan?.status,status.reviews.map(job=>[job.id,job.status])]);
        if(force||!groupSignature||before!==after||!active(status.scan)&&!status.reviews.some(active))await loadGroups();
        guard(version);if(completed)await ctx.mediaChanged?.();
        if(loop)loop.delay=active(status.scan)||status.reviews.some(active)?1000:10000;
        return snapshot();
      })().catch(failure=>{if(version===epoch){error=String(failure.message||failure);if(error.includes('后端（HTTP 404）'))supported=false;changed();}throw failure;}).finally(()=>{if(statusFlight===work)statusFlight=null;});
      statusFlight=work;return work;
    }
    action('duplicates.state',object(),snapshot,'read');
    action('duplicates.refresh',object(),async()=>{const result=await refresh();loop?.configure(opened,true);return result;},'read');
    action('duplicates.open',object(),async()=>{const version=epoch;await ctx.ready?.();guard(version);opened=true;if(ctx.dialog){root=ctx.dialog('wb-duplicates','疑似重复');root.classList.add('wb-duplicates');mount();}changed();const result=await refresh();loop?.configure(true,true);return result;});
    action('duplicates.close',object(),async()=>{closed();if(ctx.invoke)await ctx.invoke('panel.close',{id:'wb-duplicates'});return {closed:true};});
    action('duplicates.filter',object({kind:{type:'string',enum:['all','video','picture']}},['kind']),async args=>{if(!['all','video','picture'].includes(args.kind))throw Error('重复项类型无效');kind=args.kind;page=1;groupSignature='';revision++;changed();return loadGroups();});
    action('duplicates.page',object({page:{type:'integer',minimum:1,maximum:100000}},['page']),async args=>{if(!Number.isSafeInteger(args.page)||args.page<1||args.page>pages)throw Error('重复项页码无效');page=args.page;groupSignature='';revision++;changed();return loadGroups();});
    const groupArgs={groupId:idSchema,expectedRevision:{type:'string',minLength:1,maxLength:200}};
    action('duplicates.keep',object({...groupArgs,key:{type:'string',minLength:1,maxLength:50}},['groupId','key','expectedRevision']),args=>{const group=groupFor(args);if(busy||status.reviews.some(job=>job.group_id===group.id&&active(job)))throw Error('分组正在处理');if(!group.members.items.some(item=>item.key===args.key))throw Error('请先加载并核对该保留项');choices.set(group.id,args.key);choiceScans.set(group.id,group.scan_id);error=actionError='';changed();return snapshot();});
    action('duplicates.clear',object(groupArgs,['groupId','expectedRevision']),args=>{const group=groupFor(args);choices.delete(group.id);choiceScans.delete(group.id);changed();return snapshot();});
    action('duplicates.scan',object(),()=>exclusive(async version=>{
      if(supported!==true)throw Error('请先读取可用的疑似重复状态');if(active(status.scan)||status.reviews.some(active))throw Error('后台任务尚未结束，未提交新的检测');
      const result=validateJob(await read('scan',{body:{request_id:(ctx.requestId||(()=>crypto.randomUUID()))()}}));guard(version);status.scan=copy(result);changed();if(opened)void refresh(false).catch(()=>{});return result;
    }),'write');
    action('duplicates.cancelScan',object({id:idSchema},['id']),args=>exclusive(async version=>{
      identity(args.id);if(status.scan?.id!==args.id||!status.scan.can_cancel||status.scan.cancel_requested)throw Error('该检测已改变或不允许取消');
      const result=validateJob(await read('cancel',{params:{id:args.id}}));guard(version);if(result.id!==args.id)throw Error('取消检测回执不匹配');status.scan=copy(result);changed();return result;
    }),'write');
    action('duplicates.confirm',object({...groupArgs,scanId:idSchema,keeperKey:{type:'string',minLength:1,maxLength:50}},['groupId','scanId','keeperKey','expectedRevision']),args=>exclusive(async version=>{
      const group=groupFor(args,true);if(status.reviews.some(job=>job.group_id===group.id&&active(job)))throw Error('该分组已有后台复核任务');
      let result;
      try{result=validateJob(await read('confirm',{confirmation:'RHVIDEO:duplicates.confirm',body:{request_id:(ctx.requestId||(()=>crypto.randomUUID()))(),group_id:group.id,scan_id:group.scan_id,keeper_key:args.keeperKey}}),true);}
      catch(failure){if(version===epoch){choices.delete(group.id);choiceScans.delete(group.id);}throw Error(String(failure.message||failure)+'；请刷新任务核对结果，不会自动重发');}
      guard(version);if(result.group_id!==group.id||result.keeper_key!==args.keeperKey)throw Error('复核回执与保留项不匹配，请查看任务结果；不会自动重发');
      choices.delete(group.id);choiceScans.delete(group.id);status.reviews=[copy(result),...status.reviews.filter(job=>job.id!==result.id)].slice(0,10);changed();if(opened)void refresh(false).catch(()=>{});return result;
    }),'destructive');
    action('duplicates.more',object(groupArgs,['groupId','expectedRevision']),async args=>{
      const version=epoch,group=groupFor(args),page=(group.morePage||0)+1;
      if(loadingMembers.has(group.id))throw Error('成员正在读取');loadingMembers.add(group.id);changed();
      try{const result=validateMembers(await read('members',{params:{id:group.id},query:{page,limit:12}}),group.media_type);guard(version);groupFor(args);
        if(result.page!==page||!integer(result.total))throw Error('成员分页没有返回请求的位置');
        const seen=new Set(group.members.items.map(item=>item.key)),added=copy(result.items).filter(item=>!seen.has(item.key));if(!added.length&&group.members.items.length<result.total)throw Error('成员分页没有继续前进，请刷新检测结果');
        group.members.items.push(...added);group.morePage=page;group.stale ||= result.total!==group.member_count||result.items.some(item=>item.stale);revision++;changed();return snapshot();
      }finally{if(version===epoch){loadingMembers.delete(group.id);changed();}}
    },'read');
    action('duplicates.preview',object({...groupArgs,key:{type:'string',maxLength:50}},['groupId','key','expectedRevision']),async args=>{
      const group=groupFor(args),item=group.members.items.find(item=>item.key===args.key);if(!item)throw Error('预览成员已改变');return ctx.invoke('image.preview',{path:previewPath(item),title:item.filename||item.key});
    },'read');
    action('duplicates.play',object({...groupArgs,key:{type:'string',maxLength:50}},['groupId','key','expectedRevision']),async args=>{
      const group=groupFor(args),item=group.members.items.find(item=>item.key===args.key);if(item?.media_type!=='video')throw Error('该项不是视频');return ctx.invoke('media.open',{kind:'video',id:item.id});
    });
    action('duplicates.review',object({id:idSchema,page:{type:'integer',minimum:1,maximum:100000}},['id']),async args=>{
      identity(args.id);const version=epoch,ticket=++reviewTicket,result=validatePage(await read('review',{params:{id:args.id},query:{page:args.page||1}}));validateJob(result,true);guard(version);if(ticket!==reviewTicket)return {stale:true};if(result.id!==args.id)throw Error('复核结果回执不匹配');
      reviewId=args.id;reviewPage=result.page;reviewPages=result.pages;renderReview(result);changed();return result;
    },'read');
    function closed(){opened=false;listTicket++;reviewTicket++;loop?.stop();previews.clear();pendingPreviews.clear();}
    function reset(){epoch++;revision++;closed();busy=false;loading=false;supported=null;error=actionError='';kind='all';page=pages=1;total=0;groups=[];status={scan:null,reviews:[]};choices.clear();choiceScans.clear();loadingMembers.clear();statusFlight=null;listFlight=null;previewFlight=null;groupSignature=jobSignature='';reviewId='';reviewPage=reviewPages=1;root=null;changed();}
    let groupPaint='',jobsPaint='';
    function mount(){
      root.replaceChildren();groupPaint=jobsPaint='';
      const head=ctx.el('div',undefined,'wb-toolbar'),scan=ctx.button('开始检测','duplicates.scan'),cancel=ctx.button('取消检测','duplicates.cancelScan',()=>({id:status.scan?.id}));scan.dataset.duplicate='scan';cancel.dataset.duplicate='cancel';
      head.append(ctx.el('span','图片按画面、视频按首帧比对'),ctx.button('刷新','duplicates.refresh'),scan,cancel);
      const progress=ctx.el('div',undefined,'dup-progress');progress.dataset.duplicate='progress';progress.setAttribute('aria-live','polite');
      const problem=ctx.el('p',undefined,'dup-error');problem.dataset.duplicate='error';problem.setAttribute('role','status');
      const filter=ctx.el('div',undefined,'wb-toolbar');for(const [value,title]of [['all','全部'],['picture','图片'],['video','视频首帧']]){const button=ctx.button(title,'duplicates.filter',{kind:value});button.dataset.duplicateKind=value;filter.append(button);}
      const container=ctx.el('div',undefined,'dup-groups');container.dataset.duplicate='groups';
      const pager=ctx.el('div',undefined,'wb-toolbar');const previous=ctx.button('上一页','duplicates.page',()=>({page:page-1})),next=ctx.button('下一页','duplicates.page',()=>({page:page+1})),counter=ctx.el('span');previous.dataset.duplicate='previous';next.dataset.duplicate='next';counter.dataset.duplicate='counter';pager.append(previous,counter,next);
      const jobs=ctx.el('div',undefined,'dup-jobs');jobs.dataset.duplicate='jobs';root.append(head,progress,problem,filter,container,pager,ctx.el('h3','最近的复核任务'),jobs);
    }
    function render(){
      if(entry)entry.disabled=ctx.connected?.()===false;
      if(!root?.isConnected||!opened)return;
      const find=key=>root.querySelector('[data-duplicate="'+key+'"]');if(!find('scan'))return;
      find('scan').textContent=status.scan?'更新检测':'开始检测';find('scan').disabled=busy||supported!==true||active(status.scan)||status.reviews.some(active);
      find('cancel').hidden=!status.scan?.can_cancel;find('cancel').disabled=busy||!!status.scan?.cancel_requested;
      find('error').textContent=error;find('previous').disabled=loading||page<=1;find('next').disabled=loading||page>=pages;find('counter').textContent=page+' / '+pages+' · '+total+' 组';
      for(const button of root.querySelectorAll('[data-duplicate-kind]'))button.setAttribute('aria-pressed',String(button.dataset.duplicateKind===kind));
      const progress=find('progress');progress.replaceChildren();
      const scan=status.scan,p=scan?.progress||{};
      progress.append(ctx.el('strong',scan?(scan.cancel_requested&&active(scan)?'正在取消':labels[scan.status]||scan.status):'首次检测在后台建立画面指纹'));
      if(scan){progress.append(ctx.el('span',(integer(p.done)&&integer(p.total)?' '+p.done+' / '+p.total+' 项 · ':' ')+String(p.current||p.error||(active(scan)?'关闭界面后任务仍继续':'新建 '+(p.indexed||0)+' · 复用 '+(p.reused||0)+' · 跳过 '+(p.skipped||0)))));if(active(scan)){const bar=ctx.el('progress');bar.max=100;if(p.total>0)bar.value=Math.min(100,Number(p.done||0)/p.total*100);bar.setAttribute('aria-label','检测进度');progress.append(bar);}}
      const signature=JSON.stringify([groups,[...choices],busy,[...loadingMembers],status.reviews.map(job=>[job.group_id,job.status]),stamp()]);
      if(signature!==groupPaint){groupPaint=signature;renderGroups(find('groups'));}
      const jobSignature=JSON.stringify(status.reviews);if(jobSignature!==jobsPaint){jobsPaint=jobSignature;const jobs=find('jobs');jobs.replaceChildren();for(const job of status.reviews){const button=ctx.button('保留 1 项 · 暂存 '+job.total+' 项 · '+(labels[job.status]||job.status)+' · 已暂存 '+job.done+(job.failed?' · 失败 '+job.failed:''),'duplicates.review',{id:job.id});jobs.append(button);}}
    }
    function renderGroups(container){
      container.replaceChildren();if(!groups.length){container.append(ctx.el('p',loading?'正在读取分组…':status.scan?.status==='completed'?'当前没有待复核的高相似组':'开始检测后，在这里选择保留项并复核。','wb-empty'));return;}
      for(const group of groups){
        const section=ctx.el('section',undefined,'dup-group'),head=ctx.el('header');head.append(ctx.el('h3',(group.media_type==='video'?'视频首帧相似':'图片相似')+' · '+group.member_count+' 项'),ctx.el('span',group.similarity.toFixed(1)+'% 匹配'));section.append(head);
        if(group.stale)section.append(ctx.el('p','文件或分组内容已变化，请更新检测后复核。','dup-error'));
        const cards=ctx.el('div',undefined,'dup-members'),keeper=choices.get(group.id),locked=busy||group.stale||status.reviews.some(job=>job.group_id===group.id&&active(job));
        const args={groupId:group.id,expectedRevision:stamp()};
        for(const item of group.members.items){
          const card=ctx.el('article',undefined,'dup-member'+(keeper===item.key?' is-keeper':keeper?' is-delete':''));card.dataset.memberKey=item.key;
          const preview=ctx.button('', 'duplicates.preview',{...args,key:item.key},'dup-preview'),image=ctx.el('img');image.alt=item.filename||item.key;image.loading='lazy';preview.append(image);loadPreview(image,item);card.append(preview);
          const info=ctx.el('div',undefined,'dup-member-body');info.append(ctx.el('strong',(item.favorite?'♡ ':'')+(item.filename||item.key)),ctx.el('p',item.folder_label||item.source_path||'未分类'),ctx.el('p',String(item.size??0)+' 字节 · '+String(item.resolution||'')+(item.duration_seconds!=null?' · '+Math.round(item.duration_seconds)+' 秒':'')));
          if(item.busy)info.append(ctx.el('small','正在处理或已排队替换'));
          const keep=ctx.button(keeper===item.key?'✓ 已选保留':'保留此项','duplicates.keep',{...args,key:item.key});keep.disabled=!!locked;info.append(keep);
          if(item.media_type==='video')info.append(ctx.button('播放核对','duplicates.play',{...args,key:item.key}));card.append(info);cards.append(card);
        }
        section.append(cards);if(group.members.items.length<group.member_count){const more=ctx.button('查看更多（还有 '+(group.member_count-group.members.items.length)+' 项）','duplicates.more',args);more.disabled=!!busy||loadingMembers.has(group.id);section.append(more);}
        const selected=group.members.items.find(item=>item.key===keeper);
        if(selected){const foot=ctx.el('footer',undefined,'dup-confirm');foot.append(ctx.el('span','保留 '+selected.filename+'，其余 '+(group.member_count-1)+' 项移入暂存区，30 天内可恢复。'));const clear=ctx.button('取消选择','duplicates.clear',args),confirm=ctx.button('确认暂存其余 '+(group.member_count-1)+' 项','duplicates.confirm',{...args,scanId:group.scan_id,keeperKey:keeper},'button destructive');clear.disabled=confirm.disabled=!!locked;foot.append(clear,confirm);section.append(foot);}
        container.append(section);
      }
    }
    function loadPreview(image,item){
      const path=previewPath(item),version=epoch;
      ctx.listen(image,'error',()=>{image.alt='预览加载失败';image.classList.add('failed');},'duplicates.preview.error');
      if(previews.has(path)){image.src=previews.get(path);return;}
      if(!pendingPreviews.has(path))pendingPreviews.set(path,new Set());pendingPreviews.get(path).add(image);queueMicrotask(pumpPreviews);
    }
    function pumpPreviews(){
      if(previewFlight||!opened||!pendingPreviews.size)return;
      const version=epoch,rows=[...pendingPreviews].slice(0,100),flight={};for(const [path]of rows)pendingPreviews.delete(path);previewFlight=flight;
      native('images',{paths:rows.map(([path])=>path)}).then(values=>{
        if(version!==epoch||!opened)return;if(!Array.isArray(values)||values.length!==rows.length||values.some(url=>typeof url!=='string'))throw Error('预览地址无效');
        rows.forEach(([path,images],index)=>{previews.set(path,values[index]);for(const image of images)if(image.isConnected)image.src=values[index];});while(previews.size>128)previews.delete(previews.keys().next().value);
      }).catch(failure=>{if(version===epoch)for(const [,images]of rows)for(const image of images)if(image.isConnected){image.alt='预览失败：'+String(failure.message||failure);image.classList.add('failed');}}).finally(()=>{if(previewFlight===flight){previewFlight=null;queueMicrotask(pumpPreviews);}});
    }
    function renderReview(value){
      if(!ctx.dialog)return;const content=ctx.dialog('wb-duplicate-review','复核结果 · '+(labels[value.status]||value.status));content.replaceChildren();
      for(const item of value.items){const row=ctx.el('div',undefined,'dup-review-row');row.append(ctx.el('strong',item.filename||item.key),ctx.el('span',item.message||labels[item.status]||item.status));content.append(row);}
      const pager=ctx.el('div',undefined,'wb-toolbar'),previous=ctx.button('上一页','duplicates.review',{id:reviewId,page:reviewPage-1}),next=ctx.button('下一页','duplicates.review',{id:reviewId,page:reviewPage+1});previous.disabled=reviewPage<=1;next.disabled=reviewPage>=reviewPages;pager.append(previous,ctx.el('span',reviewPage+' / '+reviewPages),next);content.append(pager);
    }
    if(ctx.button&&ctx.entryParent){entry=ctx.button('疑似重复','duplicates.open',{},'nav-item');entry.id='duplicates-nav';entry.setAttribute('aria-haspopup','dialog');if(ctx.icon){const icon=ctx.el('span');icon.innerHTML=ctx.icon('duplicates');entry.prepend(icon);}ctx.entryParent.append(entry);}
    if(ctx.listen&&typeof document!=='undefined')ctx.listen(document,'visibilitychange',()=>loop?.configure(opened),'duplicates.visibility');
    changed();return {snapshot,reset,closed,contextChanged:render};
  }
  return {install,active,previewPath,validateJob,validatePage};
});
