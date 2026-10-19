/* Bounded report pages and independent scan ownership for the two panes. */
const androidUsage=(()=>{
  let app,generation=0,pageSerial=0,timer,root='',status=null,report=null,parentId=1,view='folders',offset=0,rows=[],breadcrumbs=[],mounted=false;
  const $=id=>document.getElementById(id),active=s=>['queued','indexing','analyzing','canceling'].includes(s?.state);
  const owner=()=>typeof workbench!=='undefined'&&workbench.id==='second'?'second':'first';
  const labels={queued:'准备分析',indexing:'预扫描',analyzing:'分析中',canceling:'正在取消',completed:'分析完成',canceled:'已取消 · 部分结果',failed:'分析失败',interrupted:'上次分析被中断'};
  const types={folder:'文件夹',image:'图片',video:'视频',audio:'音频',document:'文档与电子书',archive:'压缩包',apps:'安装包',other:'其他'};
  const decode=path=>app.pathLabel(path);
  const valid=token=>mounted&&token===generation&&app.state.route.tool==='usage';
  const button=(label,icon,fn,cls='')=>app.button(label,icon,fn,cls);
  function leave(){mounted=false;generation++;pageSerial++;clearTimeout(timer);}
  async function enter(path){
    leave();mounted=true;root=path;status=null;report=null;parentId=1;view='folders';offset=0;rows=[];breadcrumbs=[];
    const token=generation;build();
    if(!api.analysisAvailable())return;
    try{const latest=await api.native('analysis.latest',{root,owner:owner()});if(!valid(token))return;status=latest;paintStatus();if(status?.ready)await load();if(active(status))schedule(token);}
    catch(e){if(valid(token))showError(e);}
  }
  function build(){
    const node=$('tool-usage');node.replaceChildren();
    const heading=ui.el('div','usage-heading'),symbol=ui.el('span','usage-symbol');symbol.innerHTML=ui.icon('chart');
    const copy=ui.el('div');copy.append(ui.el('h2','','空间分析'),ui.el('p','muted','看清每个文件夹的大小'));heading.append(symbol,copy);node.append(heading);
    const target=ui.el('div','usage-target'),path=ui.el('p','usage-path',decode(root));path.id='scan-root';target.append(path,button('选择位置','folder',choose,'usage-choose'));node.append(target);
    const actions=ui.el('div','button-row usage-actions'),start=button('开始分析','chart',startScan,'primary');start.id='btn-scan';
    const cancel=button('取消分析','close',cancelScan);cancel.id='scan-cancel';cancel.hidden=true;actions.append(start,cancel);node.append(actions);
    const progress=ui.el('section','usage-progress');progress.id='scan-progress';progress.hidden=true;progress.setAttribute('aria-live','polite');node.append(progress);
    const result=ui.el('section');result.id='scan-result';node.append(result);
    const note=ui.el('p','usage-footnote muted','按文件大小统计，不等于磁盘实际占用。不会读取文件内容；未授权、无法读取或达到安全上限的项目会单独列出。文件变更后请重新分析。');node.append(note);
    paintStatus();
  }
  function showError(e){$('scan-progress').hidden=false;$('scan-progress').replaceChildren(ui.el('p','danger',fmt.displayPathText(e.message||String(e))));}
  function paintStatus(){
    const running=active(status),start=$('btn-scan'),cancel=$('scan-cancel');start.disabled=running;start.querySelector('span').textContent=status?'重新分析':'开始分析';cancel.hidden=!running;cancel.disabled=status?.state==='canceling';
    const node=$('scan-progress');node.hidden=!status;if(!status)return;
    const title=ui.el('div','usage-progress-title');title.append(ui.el('strong','',labels[status.state]||status.state));
    const known=Number.isFinite(status.percent)&&status.phase!=='indexing'&&status.state!=='queued';
    if(known&&running&&status.state!=='canceling')title.append(ui.el('strong','usage-percent',status.percent+'%'));
    const progress=document.createElement('progress');progress.max=100;if(known)progress.value=status.percent;progress.setAttribute('aria-label',known?'分析进度':'预扫描：总量尚未确定');
    let text=status.phase==='indexing'?'总量尚未确定 · 已发现 '+fmt.count(status.discovered||0)+' 项 · 已读 '+fmt.count(status.indexedFolders||0)+' 个文件夹':fmt.count(status.processed||0)+' / '+fmt.count(status.total||0)+' 项';
    if(status.state==='canceling')text='正在停止读取并整理已发现项目，不会把部分结果当作完整报告。';
    else if(status.state==='canceled')text='仅包含取消前已发现的项目，请勿作为完整目录大小。';
    const elapsed=Math.max(0,Math.floor(((running?Date.now():status.updated)-status.started)/1000));text+=' · '+(elapsed>=60?Math.floor(elapsed/60)+' 分 '+elapsed%60+' 秒':elapsed+' 秒');
    node.replaceChildren(title,progress,ui.el('p','muted',text));
    if(status.current&&running)node.append(ui.el('p','usage-current muted',decode(status.current)));
    if(status.message||status.issues||status.truncated)node.append(ui.el('p','usage-warning',fmt.displayPathText(status.message||'部分项目未能完整读取，请查看异常明细。')));
  }
  function choose(){
    const seen=new Set(),locations=[...app.state.roots.map(r=>({path:r.path,name:r.label||r.path})),...app.state.favorites.filter(e=>e.isDir)];
    ui.openSheet('选择分析位置',locations.filter(e=>!seen.has(e.path)&&seen.add(e.path)).map(e=>app.action(e.label||e.name,'folder',async()=>{
      if(active(status)){ui.toast('请先取消当前分析，或等待完成后再切换位置');return;}
      await app.go({screen:'tool',tool:'usage',path:e.path},{replace:true});
    })));
  }
  async function startScan(){
    if(active(status))return;const token=generation;
    $('btn-scan').disabled=true;
    try{
      if(root.startsWith('remote://')&&!await androidFeatures.beforeRemoteNavigate(root,()=>valid(token)))return;
      if(!valid(token))return;
      if(!api.analysisAvailable()){
        $('scan-result').textContent='正在分析…';const value=await api.scanStorageSizes({root,maxEntries:400000});if(!valid(token))return;
        $('scan-result').replaceChildren(ui.el('p','','总计 '+fmt.size(value.totalBytes)+' · '+fmt.count(value.files)+' 个文件'));
        for(const c of value.categories||[])$('scan-result').append(ui.el('p','',c.name+' · '+fmt.size(c.bytes)+' · '+fmt.count(c.files)+' 项'));
        $('scan-result').append(ui.el('p','muted','此旧版内核不支持详细报告与进度；请更新应用。'));return;
      }
      const next=await api.native('analysis.start',{root,owner:owner()});if(!valid(token))return;
      status=next;report=null;parentId=1;offset=0;rows=[];breadcrumbs=[];$('scan-result').replaceChildren();paintStatus();schedule(token,0);
    }catch(e){if(valid(token))showError(e);}finally{if(valid(token))$('btn-scan').disabled=active(status);}
  }
  async function cancelScan(){
    const token=generation,id=status?.id;if(!active(status)||!id)return;
    try{const next=await api.native('analysis.cancel',{id});if(valid(token)&&status?.id===id){status=next;paintStatus();schedule(token,0);}}catch(e){if(valid(token))showError(e);}
  }
  function schedule(token,delay=650){clearTimeout(timer);timer=setTimeout(()=>poll(token),delay);}
  async function poll(token){
    if(!valid(token))return;if(document.hidden){schedule(token,1500);return;}
    const id=status?.id;if(!id)return;
    try{const next=await api.native('analysis.status',{id});if(!valid(token)||status?.id!==id)return;status=next;paintStatus();if(active(status))schedule(token);else if(status.ready)await load();}
    catch(e){if(valid(token)){showError(e);schedule(token,2500);}}
  }
  async function load(more=false){
    if(!status?.ready)return;const token=generation,serial=++pageSerial,id=status.id,requestedParent=parentId,requestedView=view;
    try{
      const page=await api.native('analysis.page',{id,parentId,view,offset:more?offset:0,limit:100});
      if(!valid(token)||serial!==pageSerial||status?.id!==id||parentId!==requestedParent||view!==requestedView)return;
      report=page;rows=more?[...rows,...page.entries]:page.entries;offset=rows.length;breadcrumbs=page.breadcrumbs;paintReport();
    }catch(e){if(valid(token)&&serial===pageSerial)showError(e);}
  }
  function drill(id){parentId=id;offset=0;rows=[];load();}
  function paintReport(){
    if(!report)return;const node=$('scan-result'),folder=report.folder,total=folder.size||0;node.replaceChildren();
    const crumbs=ui.el('nav','usage-breadcrumbs');crumbs.setAttribute('aria-label','报告中的目录');
    for(const crumb of breadcrumbs)crumbs.append(button(crumb.name,'folder',()=>drill(crumb.id)));node.append(crumbs);
    const metrics=ui.el('div','usage-metrics');
    for(const [label,value] of [['文件大小',fmt.size(total)],['文件',fmt.count(folder.files)],['子文件夹',fmt.count(folder.directories)]]){const card=ui.el('div');card.append(ui.el('small','',label),ui.el('strong','',value));metrics.append(card);}node.append(metrics);
    if(folder.issues){const alert=button(fmt.count(folder.issues)+' 项读取异常 · 查看明细','info',()=>{view='issues';load();},'usage-warning-link');node.append(alert);}
    const tabs=ui.el('div','usage-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','分析视图');
    for(const [key,label] of [['folders','文件夹'],['largest','大文件'],['types','类型'],['issues','异常']]){const b=button(label,'other',()=>{view=key;load();});b.querySelector('svg')?.remove();b.setAttribute('role','tab');b.setAttribute('aria-selected',String(view===key));tabs.append(b);}node.append(tabs);
    const list=ui.el('div','usage-list');node.append(list);
    const entries=view==='types'?(report.groups||[]).map(g=>({name:types[g.kind]||g.kind,size:g.bytes,kind:g.kind,files:g.files})):rows;
    const bar=ui.el('div','usage-distribution');bar.setAttribute('aria-label','大小分布');
    // Only immediate children/type groups are disjoint. Biggest files/issues
    // are not a complete partition and must not imply a full distribution.
    if(['folders','types'].includes(view)&&total>0){let shown=0;for(const e of entries){if(e.size<=0)continue;const share=Math.min(100-shown,e.size/total*100);if(share<=0)continue;shown+=share;const segment=ui.el('span','usage-color-'+(e.kind||'other'));segment.style.width=share+'%';segment.title=e.name+' · '+fmt.size(e.size);bar.append(segment);}if(shown<99.99){const remainder=ui.el('span','usage-color-remainder');remainder.style.width=(100-shown)+'%';bar.append(remainder);}node.insertBefore(bar,tabs);}
    if(!entries.length)list.append(ui.el('p','usage-empty muted',view==='issues'?'此范围没有记录到读取异常':view==='folders'?'此文件夹没有已统计的内容':'没有已统计的文件'));
    for(const entry of entries){
      const row=ui.el('article','usage-row'),open=ui.el('button','usage-row-open');open.type='button';open.dataset.path=entry.path||'';
      const symbol=ui.el('span','usage-file-icon usage-color-'+(entry.isDir?'folder':entry.kind||'other'));symbol.innerHTML=ui.icon(entry.isDir?'folder':entry.kind||'other');
      const copy=ui.el('span','usage-row-copy'),top=ui.el('span','usage-row-top');top.append(ui.el('strong','',entry.name),ui.el('strong','usage-size',fmt.size(entry.size)));
      const percent=total?Math.min(100,entry.size/total*100):0;
      const detail=entry.issue||((entry.isDir?fmt.count(entry.files)+' 个文件 · '+fmt.count(entry.directories)+' 个文件夹':view==='types'?fmt.count(entry.files)+' 个文件':view==='largest'?decode(entry.path):types[entry.kind]||'文件')+' · '+(percent<.1&&percent>0?'<0.1':percent.toFixed(1))+'%');
      const track=ui.el('span','usage-size-track'),fill=ui.el('span','usage-color-'+(entry.isDir?'folder':entry.kind||'other'));fill.style.width=percent+'%';track.append(fill);copy.append(top,ui.el('small',entry.issue?'usage-warning':'muted',detail),track);open.append(symbol,copy);
      if(view==='types')open.disabled=true;else open.onclick=()=>entry.isDir?drill(entry.id):rowActions(entry);row.append(open);
      if(view!=='types'){const more=button('更多操作','more',()=>rowActions(entry),'icon-btn usage-more');more.setAttribute('aria-label',entry.name+' 的更多操作');more.querySelector('span')?.remove();row.append(more);}list.append(row);
    }
    if(report.hasMore){const more=button('加载更多','download',async()=>{more.disabled=true;await load(true);if(more.isConnected)more.disabled=false;},'usage-load-more');node.append(more);}
    node.append(ui.el('p','usage-footnote muted','报告生成于 '+new Date(status.updated).toLocaleString('zh-CN')+(status.state==='canceled'?' · 已取消，仅为部分结果':'')));
  }
  function rowActions(entry){ui.openSheet(entry.name,[
    ...(entry.isDir?[app.action('查看文件夹分析','chart',()=>drill(entry.id))]:[]),
    app.action(entry.isDir?'打开此文件夹':'打开所在文件夹','folder',()=>app.go({screen:'folder',path:entry.isDir?entry.path:entry.parentPath||fmt.parentOf(entry.path)})),
    app.action('复制路径','copy',()=>ui.copyText(entry.path)),
  ],entry.issue||decode(entry.path));}
  function back(){if(!mounted||app.state.route.tool!=='usage'||breadcrumbs.length<2)return false;drill(breadcrumbs.at(-2).id);return true;}
  return {init(context){app=context;},enter,leave,back};
})();
