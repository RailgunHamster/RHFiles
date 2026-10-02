/* Android capability pages. Every visible operation reaches a real native command. */
const androidFeatures = (() => {
  let app, jobTimer, toolGeneration = 0, mediaController, lastShare = '', lastJobs = [];
  const refreshedJobs = new Set();
  const $ = id => document.getElementById(id);
  const textFile = name => /\.(txt|md|csv|log|json|xml|ini|cfg|toml|ya?ml|js|ts|rs|py|java|kt|c|h|cpp|css|html|sh)$/i.test(name);
  const active = j => ['queued','scanning','running','paused'].includes(j.state);
  const names = {copy:'复制',move:'移动',delete:'永久删除',trash:'移入回收站',restore:'恢复',zip:'压缩',extract:'解压',backup:'备份应用'};
  const states = {queued:'排队',scanning:'计算大小',running:'进行中',paused:'已暂停',completed:'完成',failed:'失败',canceled:'已取消',interrupted:'上次运行中断'};
  const destinations = [
    ['remote','网络位置','computer','SMB / FTP / WebDAV'], ['providers','外置存储与网盘','sd','系统授权与文件提供者'],
    ['apps','应用管理','grid','启动、卸载与备份'], ['tasks','文件任务','recent','进度、失败与重试'], ['trash','回收站','trash','恢复本机文件'],
  ];
  const button = (label, fn, cls = '') => app.button(label,'',fn,cls || 'setting-row');
  const notice = (node, message) => node.append(ui.el('p','muted',message));
  const panel = () => $('sheet-panel');
  async function form(title, fields, submit, caption = '保存') {
    ui.openSheet(title, [app.action('取消','close',()=>{})]);
    const root=ui.el('form','feature-form');
    for(const f of fields) {
      const label=ui.el('label','',f.label), input=document.createElement(f.options?'select':'input');
      input.name=f.name;
      if(f.options) for(const [value,text] of f.options) {const option=ui.el('option','',text);option.value=value;input.append(option);}
      else input.type=f.type || 'text';
      if(f.value!==undefined)input.value=f.value;else if(!f.options)input.value='';
      input.required=!!f.required;input.autocomplete='off';input.spellcheck=false;
      if(f.type==='checkbox') input.checked=!!f.value;
      label.append(input);root.append(label);
    }
    const error=ui.el('p','danger');error.setAttribute('role','alert');
    const send=ui.el('button','primary',caption);send.type='submit';root.append(error,send);
    root.addEventListener('submit',async e=>{
      e.preventDefault();send.disabled=true;error.textContent='';
      const values=Object.fromEntries([...root.elements].filter(e=>e.name).map(e=>[e.name,e.type==='checkbox'?e.checked:e.value]));
      try {await submit(values);if(root.isConnected)ui.closeSheet();}catch(err){error.textContent=err.message || String(err);}finally{send.disabled=false;}
    });panel().append(root);return root;
  }
  async function enqueue(op,args) {
    const id=await api.native('job.start',{op,args});ui.toast('已加入文件任务');await pollJobs();return id;
  }
  async function pollJobs() {
    if(!api.featuresAvailable())return;
    lastJobs=await api.native('jobs');
    const running=lastJobs.filter(active), incomplete=lastJobs.filter(j=>['failed','interrupted'].includes(j.state));
    const chip=$('native-task-chip');
    chip.hidden=!running.length&&!incomplete.length;
    chip.textContent=running.length?'文件任务 '+running.length+' · '+states[running[0].state]+' · '+fmt.size(running[0].bytes):incomplete.length+' 个任务需要处理';
    if(app.state.route.tool==='tasks') paintJobs($('tool-extra'));
    const completed=lastJobs.filter(j=>j.state==='completed' && !refreshedJobs.has(j.id));
    completed.forEach(j=>refreshedJobs.add(j.id));
    if(completed.length) {
      if(app.state.route.screen==='folder' && !app.state.task) await app.refresh();
      const status=await api.indexStatus();
      if(!status.indexing && completed.some(j=>j.finished>(status.lastFinishedMs || 0))) await api.indexStart({roots:app.state.roots.filter(r=>!api.isVirtual(r.path)).map(r=>r.path)});
    }
  }
  function paintJobs(node) {
    const scroll=node.parentElement.scrollTop;node.replaceChildren(ui.el('h2','','文件任务'));
    notice(node,'关闭页面不会中断任务。暂停/取消在下一次读写检查时生效。系统强制停止或超时后会保留记录，不会擅自重做移动或删除。');
    if(!lastJobs.length)notice(node,'暂无任务');
    for(const j of lastJobs.slice(0,100)) {
      const card=ui.el('article','task-card');card.append(ui.el('strong','',(names[j.op]||j.op)+' · '+states[j.state]));
      const seconds=Math.max(1,((j.finished || Date.now())-j.started)/1000);
      card.append(ui.el('p','muted',j.current || ''),ui.el('p','',fmt.size(j.bytes)+(j.total?' / '+fmt.size(j.total):'')+' · '+(j.state==='paused'?'已暂停':fmt.size(j.bytes/seconds)+'/s（平均）')+' · '+j.done+'/'+j.files+' 项'));
      const progress=document.createElement('progress');progress.max=Math.max(j.total,j.bytes,1);
      if(j.total>0)progress.value=j.bytes;else if(!active(j))progress.value=j.state==='completed'?1:0;
      card.append(progress);
      if(j.message)notice(card,j.message);
      for(const failure of j.failures || [])notice(card,failure.path+'\n'+failure.message);
      const actions=ui.el('div','button-row');
      if(active(j)) {
        actions.append(button(j.state==='paused'?'继续':'暂停',async()=>{await api.native('job.control',{id:j.id,action:j.state==='paused'?'resume':'pause'});await pollJobs();}),
          button('取消',async()=>{if(await ui.confirm('取消任务？','已完成的文件会保留；未完成的移动来源不会主动删除。','取消任务')){await api.native('job.control',{id:j.id,action:'cancel'});await pollJobs();}}));
      } else if(['failed','canceled','interrupted'].includes(j.state)) actions.append(button('重试未完成项',async()=>{
        if(!await ui.confirm('重试未完成项？','已完成的项目不会重复执行。中断时已经发布的副本会保留；同名文件将另存，不会覆盖。请先检查下方输出位置。','重试'))return;
        const args={...j.args};if(args.sources)args.sources=args.sources.filter(p=>!j.completed.includes(p));
        if(args.sources && !args.sources.length)return ui.toast('没有剩余来源');await enqueue(j.op,args);
      }));
      if(j.outputs?.length) {
        const details=ui.el('details');details.append(ui.el('summary','','输出位置'),ui.el('pre','',j.outputs.join('\n')));card.append(details);
      }
      card.append(actions);node.append(card);
    }
    node.parentElement.scrollTop=scroll;
  }
  async function renderTool(tool) {
    const generation=++toolGeneration,node=$('tool-extra');node.replaceChildren(ui.el('p','','正在读取…'));
    const valid=()=>generation===toolGeneration && app.state.route.tool===tool;
    if(tool==='tasks'){await pollJobs();return;}
    if(tool==='remote') {
      const connections=await api.native('connections');if(!valid())return;
      node.replaceChildren(button('添加网络位置',addRemote,'primary'));notice(node,'密码由 Android Keystore 加密保存。FTPS / HTTPS 验证服务器证书；不提供忽略证书开关。');
      for(const c of connections) {
        const row=ui.el('article','task-card');row.append(button(c.name+' · '+c.type,()=>c.path?app.go({screen:'folder',path:c.path,label:c.name}):undefined));
        row.append(button('移除连接',async()=>{if(await ui.confirm('移除此连接？','只删除登录配置，不会删除服务器文件。','移除')){await api.native('connection.delete',{id:c.id});await renderTool(tool);}}));node.append(row);
      }
      return;
    }
    if(tool==='providers') {
      const roots=await api.storageRoots();if(!valid())return;
      node.replaceChildren(ui.el('h2','','系统存储与网盘'));
      notice(node,'在系统选择器中选择 SD 卡、USB 或网盘。网盘需要安装已登录的系统文件提供者；部分网盘只允许选择文件，不能授权整个目录。');
      node.append(button('授权文件夹 / 外置存储',async()=>{const paths=await api.native('tree.pick');app.state.roots=await api.storageRoots();if(paths?.length)await app.go({screen:'folder',path:paths[0],label:'授权文件夹'});}),
        button('从系统网盘导入文件',async()=>{const paths=await api.native('document.pick');if(paths?.length){app.setClipboard('copy',paths);await app.go({screen:'folder',path:app.state.root});}}));
      for(const root of roots.filter(r=>r.provider)) {
        node.append(button(root.label,()=>app.go({screen:'folder',path:root.path,label:root.label})),button('撤销授权：'+root.label,async()=>{
          if(await ui.confirm('撤销此存储授权？','不会删除其中的文件。','撤销')){await api.native('tree.forget',{path:root.path});app.state.roots=await api.storageRoots();await renderTool(tool);}
        }));
      }return;
    }
    if(tool==='apps') {
      const apps=await api.native('apps');if(!valid())return;
      node.replaceChildren(ui.el('h2','','应用管理'));
      notice(node,'默认显示用户应用。未授权用量访问时只显示安装包大小，不把它冒充完整占用。分包应用备份为包含所有 APK 的 ZIP，不是可直接安装的单个 APK。');
      node.append(button('授权应用占用统计',()=>api.native('usage.settings')));
      const query=document.createElement('input');query.type='search';query.placeholder='搜索应用名或包名';query.setAttribute('aria-label','搜索应用');node.append(query);
      let system=false;const toggle=button('显示系统应用：关',()=>{system=!system;toggle.querySelector('span').textContent='显示系统应用：'+(system?'开':'关');paint();});node.append(toggle);
      const list=ui.el('div');node.append(list);
      function paint(){
        list.replaceChildren();for(const a of apps.filter(a=>(system||!a.system)&&(a.name+' '+a.package).toLocaleLowerCase().includes(query.value.toLocaleLowerCase())).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))) {
          const size=Number.isFinite(a.appBytes)?'占用 '+fmt.size(a.appBytes+a.dataBytes)+' · 缓存 '+fmt.size(a.cacheBytes):'安装包 '+fmt.size(a.apkBytes);
          list.append(button(a.name+' · '+a.version+'\n'+size,()=>ui.openSheet(a.name,[
            app.action('启动','open',()=>api.native('app.action',{package:a.package,action:'launch'})),
            app.action('应用信息 / 权限','settings',()=>api.native('app.action',{package:a.package,action:'settings'})),
            app.action('备份 '+(a.split?'全部分包 APK':'APK'),'archive',async()=>{
              const destination=await ui.prompt('备份到本地文件夹',app.state.root+'/Download','开始备份');
              if(destination)await enqueue('backup',{package:a.package,destination});
            }),
            app.action('卸载（系统确认）','trash',()=>api.native('app.action',{package:a.package,action:'uninstall'}),true),
          ],a.package)));
        }
      }query.addEventListener('input',paint);paint();return;
    }
    if(tool==='trash') {
      const items=await api.native('trash.list');if(!valid())return;
      node.replaceChildren(ui.el('h2','','RHFiles 回收站'));notice(node,'这里只包含通过 RHFiles 移入回收站的本地文件。不会自动清空。恢复遇到同名文件会停止，不覆盖。');
      if(!items.length)notice(node,'回收站为空');
      for(const item of items)node.append(button(item.name+'\n'+item.original,()=>ui.openSheet(item.name,[
        app.action('恢复原位置','refresh',()=>enqueue('restore',{id:item.id})),
        app.action('永久删除','trash',async()=>{if(await ui.confirm('永久删除？','无法恢复：'+item.name,'继续') && await ui.confirm('最后确认','永久删除回收站中的这项内容。','永久删除'))await enqueue('delete',{sources:[item.path]});},true),
      ],fmt.date(item.at))));return;
    }
  }
  function addRemote() {
    return form('添加网络位置',[
      {name:'name',label:'名称',required:true},
      {name:'type',label:'协议',options:[['smb','SMB2 / SMB3'],['ftps','FTPS（显式 TLS）'],['ftp','FTP（明文）'],['webdav','WebDAV / HTTPS']]},
      {name:'host',label:'主机名 / IP（SMB、FTP）'}, {name:'port',label:'端口（留空使用协议默认值）',type:'number'},
      {name:'share',label:'SMB 共享名称（例如 Public）'}, {name:'domain',label:'SMB 域（可选）'},
      {name:'url',label:'WebDAV 地址（完整 HTTPS URL）'}, {name:'username',label:'用户名'}, {name:'password',label:'密码',type:'password'},
      {name:'insecure',label:'我允许此连接使用明文 FTP / HTTP，仅在可信网络使用',type:'checkbox'},
    ],async values=>{if(!values.port)delete values.port;else values.port=Number(values.port);await api.native('connection.save',values);await renderTool('remote');},'保存连接');
  }
  async function archive(entry) {
    ui.openSheet(entry.name,[app.action('关闭','close',()=>{}),app.action('解压到新文件夹','archive',()=>extract(entry))],'正在读取压缩包目录…');
    const identity=panel().firstChild;
    try {const entries=await api.native('archive.list',{path:entry.path});if(panel().firstChild!==identity)return;
      panel().querySelector('.sheet-note').textContent=entries.length+' 项；内容只读';
      const list=ui.el('div','archive-entries');for(const e of entries)list.append(ui.el('p','',e.name+(e.isDir?'/':' · '+fmt.size(e.size))));panel().append(list);
    }catch(e){if(panel().firstChild===identity)panel().querySelector('.sheet-note').textContent='无法浏览：'+e.message;}
  }
  function extract(entry) {
    return form('解压到新文件夹',[
      {name:'destination',label:'目标父目录',value:fmt.parentOf(entry.path),required:true},
      {name:'name',label:'新文件夹名称',value:entry.name.replace(/\.(tar\.)?(zip|gz|xz|tar|tgz|txz)$/i,''),required:true},
    ],v=>enqueue('extract',{path:entry.path,...v}),'开始解压');
  }
  function compress(paths) {
    return form('压缩为 ZIP',[
      {name:'destination',label:'目标文件夹',value:app.state.route.screen==='folder'?app.state.route.path:app.state.root,required:true},
      {name:'name',label:'压缩包名称',value:(paths.length===1?fmt.baseName(paths[0]):'文件')+'.zip',required:true},
      {name:'level',label:'压缩级别',value:'6',options:[['0','仅打包（最快）'],['1','快速压缩'],['6','标准压缩'],['9','最大压缩']]},
    ],v=>enqueue('zip',{sources:paths,...v,level:Number(v.level)}),'开始压缩');
  }
  async function edit(entry,draft,revision) {
    const data=revision?{text:draft,revision}:await api.native('text.read',{path:entry.path});
    ui.openSheet('编辑 '+entry.name,[]);panel().classList.add('editor');
    const status=ui.el('p','muted','UTF-8 · 最大 1 MB · 保存前检查外部修改');
    const area=ui.el('textarea','text-editor');area.value=data.text;area.spellcheck=false;area.setAttribute('aria-label','文件文本');
    let saved=revision?null:data.text, saving=false;
    const close=button('关闭',()=>ui.closeSheet());
    const save=button('保存',async()=>{if(saving)return;saving=true;save.disabled=true;try{
      await api.native('text.save',{path:entry.path,text:area.value,revision:data.revision});saved=area.value;
      ui.setCloseGuard(null);ui.closeSheet();ui.toast('文件已保存');await app.refresh();
    }catch(e){status.textContent='未保存：'+e.message;}finally{saving=false;save.disabled=false;}});
    const toolbar=ui.el('div','button-row');toolbar.append(close,save);panel().append(toolbar,status,area);
    ui.setCloseGuard(()=>{
      if(saving)return false;
      if(area.value===saved)return true;
      const value=area.value;ui.setCloseGuard(null);
      queueMicrotask(async()=>{if(!await ui.confirm('放弃未保存的修改？','文本尚未写入文件。','放弃修改'))await edit(entry,value,data.revision);});return false;
    });
  }
  function media(entry,entries) {
    ui.openSheet(entry.name,[]);panel().classList.add('viewer');
    const controller=new AbortController();mediaController=controller;
    let zoom=1,rotation=0,x=0,y=0,index=entries.findIndex(e=>e.path===entry.path),current=entry;
    const images=entry.kind==='image'?entries.filter(e=>e.kind==='image'&&!e.isDir):[entry];index=Math.max(0,images.findIndex(e=>e.path===entry.path));
    const toolbar=ui.el('div','viewer-toolbar'),viewport=ui.el('div','media-viewport'),info=ui.el('div','viewer-info');
    const element=document.createElement(entry.kind==='image'?'img':entry.kind);element.className='full-media';
    if(entry.kind!=='image'){element.controls=true;element.preload='metadata';}else element.alt=entry.name;
    viewport.append(element);panel().append(toolbar,viewport,info);
    const transform=()=>{element.style.transform=`translate(${x}px,${y}px) scale(${zoom}) rotate(${rotation}deg)`;};
    const load=()=>{current=images[index];element.src=api.assetUrl(current.path);zoom=1;x=0;y=0;rotation=0;transform();info.textContent=current.name+(images.length>1?' · '+(index+1)+' / '+images.length:'');};
    const next=delta=>{index=(index+delta+images.length)%images.length;load();};
    toolbar.append(button('关闭',()=>ui.closeSheet()));
    if(entry.kind==='image') {
      toolbar.append(button('上一张',()=>next(-1)),button('下一张',()=>next(1)),button('缩小',()=>{zoom=Math.max(.25,zoom/1.4);transform();}),button('放大',()=>{zoom=Math.min(8,zoom*1.4);transform();}),
        button('适应',()=>{zoom=1;x=0;y=0;transform();}),button('旋转',()=>{rotation=(rotation+90)%360;transform();}));
      const points=new Map();let origin,distance=0;
      viewport.addEventListener('pointerdown',e=>{points.set(e.pointerId,[e.clientX,e.clientY]);viewport.setPointerCapture(e.pointerId);origin=[e.clientX,e.clientY,x,y];if(points.size===2){const [a,b]=[...points.values()];distance=Math.hypot(a[0]-b[0],a[1]-b[1]);}});
      viewport.addEventListener('pointermove',e=>{if(!points.has(e.pointerId))return;points.set(e.pointerId,[e.clientX,e.clientY]);if(points.size===2){const [a,b]=[...points.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(distance>0)zoom=Math.max(.25,Math.min(8,zoom*d/distance));distance=d;transform();}else if(zoom>1&&origin){x=origin[2]+e.clientX-origin[0];y=origin[3]+e.clientY-origin[1];transform();}});
      const release=e=>{if(points.size===1&&zoom===1&&origin&&Math.abs(e.clientX-origin[0])>70&&Math.abs(e.clientY-origin[1])<70)next(e.clientX>origin[0]?-1:1);points.delete(e.pointerId);origin=null;distance=0;};
      viewport.addEventListener('pointerup',release);viewport.addEventListener('pointercancel',()=>{points.clear();origin=null;distance=0;});
      viewport.addEventListener('dblclick',()=>{zoom=zoom===1?2:1;x=0;y=0;transform();});
      viewport.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.25,Math.min(8,zoom*(e.deltaY>0?.9:1.1)));transform();},{passive:false});
      document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')next(1);if(e.key==='ArrowLeft')next(-1);},{signal:controller.signal});
    } else {
      toolbar.append(button('后退 10 秒',()=>{element.currentTime=Math.max(0,element.currentTime-10);}),button('前进 10 秒',()=>{element.currentTime=Math.min(element.duration || Infinity,element.currentTime+10);}),button('循环：关',()=>{element.loop=!element.loop;ui.toast('循环播放：'+(element.loop?'开':'关'));}));
      const rate=document.createElement('select');rate.setAttribute('aria-label','播放速度');for(const value of [.5,1,1.25,1.5,2]){const o=ui.el('option','',value+'×');o.value=value;rate.append(o);}rate.value='1';rate.onchange=()=>{element.playbackRate=Number(rate.value);};toolbar.append(rate);
    }
    element.addEventListener('error',()=>{info.textContent='设备不支持此格式或无法读取。可返回文件菜单选择“打开方式”。';});
    ui.onClosed(()=>{controller.abort();if(entry.kind!=='image'){element.pause();element.removeAttribute('src');element.load();}else element.removeAttribute('src');mediaController=null;});load();
  }
  function entryActions(entry) {
    const options=[];
    if(!api.isVirtual(entry.path)) {
      options.push(app.action('压缩为 ZIP','archive',()=>compress([entry.path])));
      if(!entry.isDir&&/\.(zip|tar|gz|xz|tgz|txz)$/i.test(entry.name))options.push(app.action('解压到新文件夹','archive',()=>extract(entry)));
      if(!entry.isDir&&textFile(entry.name))options.push(app.action('编辑文本','rename',()=>edit(entry)));
    }
    if(entry.path.startsWith('remote://')&&!entry.isDir)options.push(app.action('下载到本机','download',()=>download(entry)));
    return options;
  }
  function selectionActions(paths) {
    const options=[];
    if(paths.every(p=>!api.isVirtual(p))) options.push(app.action('压缩为 ZIP','archive',()=>compress(paths)));
    if(paths.every(p=>!p.startsWith('remote://')&&!app.state.entries.find(e=>e.path===p)?.isDir))options.push(app.action('系统分享','share',()=>api.native('share',{paths})));
    return options;
  }
  async function download(entry) {app.setClipboard('copy',[entry.path]);await app.go({screen:'folder',path:app.state.root});ui.toast('请选择本机目标文件夹，然后粘贴');}
  async function receiveShares() {
    if(!api.featuresAvailable())return;
    const paths=await api.native('shares');const key=JSON.stringify(paths);if(!paths.length||key===lastShare)return;lastShare=key;
    if(await ui.confirm('接收 '+paths.length+' 个分享文件？','选择目标文件夹后点击粘贴；不会删除来源。','选择目标')){app.setClipboard('copy',paths);await app.go({screen:'folder',path:app.state.root});}
    await api.native('shares.clear');lastShare='';
  }
  async function onResume() {
    app.state.roots=await api.storageRoots();app.state.permissions=await api.permissionStatus();await receiveShares();
    if(['home','library','folder'].includes(app.state.route.screen)&&!app.state.selected.size&&!ui.isSheetOpen()) {
      if(app.state.route.screen==='folder')app.state.route.scroll=$('filelist').scrollTop;
      await app.refresh();
    }await pollJobs();
  }
  function init(context) {
    app=context;
    const chip=ui.el('button','native-task-chip');chip.id='native-task-chip';chip.hidden=true;chip.onclick=()=>app.go({screen:'tool',tool:'tasks'});$('app').append(chip);
    if(api.featuresAvailable()){pollJobs().catch(app.error);jobTimer=setInterval(()=>{if(!document.hidden)pollJobs().catch(()=>{});},1500);}
    window.addEventListener('rhfiles-storage-changed',()=>{if(!document.hidden&&api.featuresAvailable())onResume().catch(app.error);});
  }
  return {init,destinations,renderTool,entryActions,selectionActions,archive,media,download,receiveShares,onResume};
})();
