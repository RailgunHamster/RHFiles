// The real Windows Recycle Bin, exposed as a tabbed virtual location.
// Its opaque IDs are never passed to ordinary filesystem operations.
const RECYCLE_COPY = {
  en: {
    title:'Recycle Bin', subtitle:'Deleted files from this Windows account', restore:'Restore selected', keepBoth:'Restore · keep both', restoreAll:'Restore all', remove:'Delete permanently', empty:'Empty Recycle Bin', refresh:'Refresh', close:'Close', system:'Open Windows Recycle Bin', search:'Search names or original locations', name:'Name', folder:'Original location', date:'Date deleted', size:'Size', type:'Type', ascending:'Ascending', descending:'Descending', all:'Select visible results', clear:'Clear selection', count:'{count} items', filtered:'{shown} of {total} items', selected:'{count} selected', loading:'Reading Recycle Bin…', emptyTitle:'Your Recycle Bin is empty', emptyHelp:'Files deleted from local drives appear here.', noMatch:'No matching items', noMatchHelp:'Try another name or original folder.', failed:'Could not read Recycle Bin: {error}', partial:'Only part of the Recycle Bin could be read. Use Windows Recycle Bin for the full list; empty-all is disabled.', more:'Show more · {count} remaining', copy:'Copy original paths', copied:'Original paths copied', working:'Processing Recycle Bin…', restoring:'Restoring {count} items', deleting:'Permanently deleting {count} items', report:'{done} completed · {skipped} skipped · {failed} failed', conflict:'The original path already exists. It was not overwritten; use “Restore · keep both” to recover another copy.', missing:'The item changed or is no longer in Recycle Bin.', details:'Operation details', deleteTitle:'Delete permanently?', emptyTitleConfirm:'Empty Recycle Bin?', deleteMessage:'Permanently delete {count} items?', warning:'These items cannot be recovered with Undo. Only the items in this confirmation will be deleted.', finalTitle:'Confirm permanent deletion', finalWarning:'This is the final confirmation. The selected data will be permanently removed.', continue:'Continue', cancel:'Cancel', done:'Operation complete', cancelled:'Cancelled; completed items are kept', readOnly:'Network-share deletions do not appear in the Windows Recycle Bin.', busy:'A Recycle Bin operation is already running.', choose:'Select an item first', select:'Select {name}', newest:'Newest first', loadError:'The operation failed: {error}', showTasks:'View file tasks', closeHelp:'Close this view; file tasks continue in the background', visible:'Visible results', confirmRestoreAll:'Restore all {count} items? Existing destinations will be skipped.', restoreAllTitle:'Restore all items?', folderType:'Folder', fileType:'File', reopen:'Refresh to view the remaining items.'
  },
  zh: {
    title:'回收站', subtitle:'当前 Windows 账号已删除的文件', restore:'恢复所选', keepBoth:'恢复并保留两者', restoreAll:'全部恢复', remove:'永久删除', empty:'清空回收站', refresh:'刷新', close:'关闭', system:'在 Windows 回收站中打开', search:'搜索名称或原始位置', name:'名称', folder:'原始位置', date:'删除时间', size:'大小', type:'类型', ascending:'升序', descending:'降序', all:'全选搜索结果', clear:'取消选择', count:'共 {count} 项', filtered:'显示 {shown} 项，共 {total} 项', selected:'已选 {count} 项', loading:'正在读取回收站…', emptyTitle:'回收站是空的', emptyHelp:'从本地磁盘删除的文件会显示在这里。', noMatch:'没有匹配的项目', noMatchHelp:'试试其他名称或原始文件夹。', failed:'无法读取回收站：{error}', partial:'仅能读取部分回收站内容。请在 Windows 回收站中查看完整列表；此处已禁用全部清空。', more:'继续显示 · 剩余 {count} 项', copy:'复制原始路径', copied:'已复制原始路径', working:'正在处理回收站…', restoring:'正在恢复 {count} 项', deleting:'正在永久删除 {count} 项', report:'已完成 {done} 项 · 跳过 {skipped} 项 · 失败 {failed} 项', conflict:'原始位置已有同名项目，未覆盖。可选择“恢复并保留两者”找回另一份副本。', missing:'此项目已变化或已不在回收站中。', details:'操作详情', deleteTitle:'永久删除？', emptyTitleConfirm:'清空回收站？', deleteMessage:'永久删除 {count} 项？', warning:'这些项目无法通过撤销找回。仅删除本次确认列表里的项目，不会连带删除之后进入回收站的新文件。', finalTitle:'再次确认永久删除', finalWarning:'这是最后一次确认，所选数据将被永久移除。', continue:'继续', cancel:'取消', done:'操作完成', cancelled:'已取消，已完成的项目会保留', readOnly:'网络共享上删除的文件不会进入 Windows 回收站。', busy:'已有回收站任务正在运行。', choose:'请先选择项目', select:'选择 {name}', newest:'最新删除优先', loadError:'操作失败：{error}', showTasks:'查看文件任务', closeHelp:'关闭此界面，文件任务会继续在后台运行', visible:'搜索结果', confirmRestoreAll:'恢复全部 {count} 项？已有同名项目会跳过，不会覆盖。', restoreAllTitle:'恢复全部项目？', folderType:'文件夹', fileType:'文件', reopen:'刷新可查看剩余项目。'
  }
};
_builtinEn['recycle.title']='Recycle Bin';
RECYCLE_COPY.zh.restoreFirst='请先恢复项目，再打开、编辑、复制或移动；回收站不接受直接粘贴。';
RECYCLE_COPY.en.restoreFirst='Restore items before opening, editing, copying or moving them. Paste is unavailable in the Recycle Bin.';
RECYCLE_COPY.zh.previousPage='显示上一批';RECYCLE_COPY.en.previousPage='Show previous items';
function recycleText(key,params={}) {
  let value=(RECYCLE_COPY[String(_lang||'').startsWith('zh')?'zh':'en'][key]||RECYCLE_COPY.en[key]||key);
  for(const [name,text]of Object.entries(params))value=value.replaceAll('{'+name+'}',String(text));
  return value;
}
function recycleVisibleItems(items,query='',sort='deletedAt',descending=true,language='en') {
  const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase(language);
  const terms=normalize(query).split(/\s+/).filter(Boolean);
  const collator=new Intl.Collator(language,{numeric:true,sensitivity:'base'});
  return items.filter(item=>{const text=normalize(item.name+' '+item.originalPath+' '+item.itemType);return terms.every(term=>text.includes(term));}).sort((a,b)=>{
    const left=a[sort],right=b[sort];
    if(left==null&&right!=null)return 1;if(right==null&&left!=null)return -1;
    const order=sort==='size'||sort==='deletedAt'?(Number(left||0)-Number(right||0)):collator.compare(String(left||''),String(right||''));
    return (descending?-order:order)||collator.compare(a.name,b.name)||String(a.id).localeCompare(String(b.id));
  });
}
function recycleClickSelection(items,selected,id,anchor,shift=false,additive=false) {
  const ids=items.map(item=>item.id),index=ids.indexOf(id);
  if(index<0)return {selected:new Set(selected),anchor};
  const selection=additive?new Set(selected):new Set();
  if(shift&&ids.includes(anchor)){
    const start=ids.indexOf(anchor);for(let i=Math.min(start,index);i<=Math.max(start,index);i++)selection.add(ids[i]);
  }else if(additive&&selection.has(id))selection.delete(id);else selection.add(id);
  return {selected:selection,anchor:shift&&ids.includes(anchor)?anchor:id};
}
function recycleIcon(name) {
  const paths={trash:'M5 7h14M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6',restore:'M4 8h9a7 7 0 0 1 0 14M4 8l4-4M4 8l4 4',refresh:'M20 10a8 8 0 1 0-2 8M20 4v6h-6',close:'M6 6l12 12M18 6 6 18',external:'M14 4h6v6M20 4 10 14M10 4H4v16h16v-6',folder:'M3 6h7l2 3h9v11H3z',file:'M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.file}"/></svg>`;
}
// Recycle Bin is a virtual location, not a modal or a writable disk path.
const RECYCLE_ROOT='recycle://';
let recycleBusy=false;
function isRecyclePath(path){return /^recycle:\/\//i.test(String(path||''));}
function recyclePane(){return G.dualOn&&G.lastActivePane==='right'?G.rp:getTab();}
function recycleRequireLocation(pane){if(!isRecyclePath(pane?.path))throw Error('Open recycle:// first');}
function recycleModel(pane=recyclePane()){
  if(!pane._recycle)pane._recycle={items:[],total:0,truncated:false,query:'',sort:'deletedAt',descending:true,limit:200,loading:false,error:'',report:null,loadToken:0};
  return pane._recycle;
}
function recycleIsRight(pane){return G.dualOn&&G.rp===pane;}
function recycleActive(pane){return recycleIsRight(pane)||getTab()===pane;}
function recycleRoot(pane){const list=document.getElementById(recycleIsRight(pane)?'right-file-list':'file-list');return list?.querySelector('.recycle-browser');}
function recycleSelectedIds(pane=recyclePane()){return [...(pane.sel||[])].map(i=>pane.entries[i]?.recycle_id).filter(Boolean);}
function recycleViewItems(pane=recyclePane()){const state=recycleModel(pane);return recycleVisibleItems(state.items,state.query,state.sort,state.descending,_lang||'en');}
function recycleViewState(pane=recyclePane()){const state=recycleModel(pane);return {opened:isRecyclePath(pane.path),path:pane.path,tabId:pane.id,busy:recycleBusy,loading:state.loading,selection:recycleSelectedIds(pane),query:state.query,sort:state.sort,descending:state.descending,total:state.total,truncated:state.truncated,error:state.error};}
function recycleEntry(item){
  return {path:RECYCLE_ROOT+item.id,recycle_id:item.id,name:item.name,is_dir:item.isDirectory,size:item.size||0,size_display:item.isDirectory||item.size==null?'—':fmtSize(item.size),modified_ts:item.deletedAt,modified:'',created:'',extension:item.isDirectory?'':item.name.split('.').slice(1).at(-1)||'',original_path:item.originalPath};
}
function recycleRebuild(pane,selected=recycleSelectedIds(pane)){
  const ids=new Set(selected);pane.entries=recycleViewItems(pane).map(recycleEntry);pane.sel=new Set();
  pane.entries.forEach((entry,index)=>{if(ids.has(entry.recycle_id))pane.sel.add(index);});
  pane.lastIdx=[...pane.sel].at(-1)??-1;
}
function recyclePaint(pane=recyclePane()){
  if(!isRecyclePath(pane.path)||!recycleActive(pane))return;
  const right=recycleIsRight(pane),list=document.getElementById(right?'right-file-list':'file-list');
  if(!list)return;const scroll=list.scrollTop,focused=list.contains(document.activeElement);
  renderFiles(pane,list.id,right?'right-status-count':'status-count',right?null:'status-selection',right);
  list.scrollTop=scroll;if(focused)list.focus({preventScroll:true});
}
function recycleSetSelection(ids,mode='replace',pane=recyclePane()){
  recycleRequireLocation(pane);
  const known=new Set(pane.entries.map(e=>e.recycle_id));if(ids.some(id=>!known.has(id)))throw Error('Recycle Bin item is not in the current listing');
  const selected=mode==='replace'?new Set():new Set(recycleSelectedIds(pane));
  ids.forEach(id=>mode==='remove'?selected.delete(id):selected.add(id));recycleRebuild(pane,[...selected]);recyclePaint(pane);return recycleViewState(pane);
}
function recycleSetQuery(query,pane=recyclePane()){recycleRequireLocation(pane);const state=recycleModel(pane);state.query=String(query);state.limit=200;state.start=0;recycleRebuild(pane,[]);recyclePaint(pane);return recycleViewState(pane);}
function recycleSetSort(field,descending,pane=recyclePane()){
  recycleRequireLocation(pane);
  if(!['name','originalFolder','deletedAt','size','itemType'].includes(field))throw Error('Unknown Recycle Bin sort');
  const state=recycleModel(pane);state.sort=field;state.descending=!!descending;recycleRebuild(pane);recyclePaint(pane);return recycleViewState(pane);
}
async function recycleRefresh(pane=recyclePane()){
  if(!isRecyclePath(pane.path))throw Error('Open recycle:// first');
  const state=recycleModel(pane),token=++state.loadToken,selected=recycleSelectedIds(pane);
  state.loading=true;state.error='';recyclePaint(pane);
  try{
    const snapshot=await call('recycle_bin_list',{});
    if(token!==state.loadToken||!isRecyclePath(pane.path))return;
    Object.assign(state,{items:snapshot.items,total:snapshot.total,truncated:!!snapshot.truncated});
    recycleRebuild(pane,selected);pane._loaded=true;
  }catch(error){if(token===state.loadToken)state.error=String(error);}
  finally{if(token===state.loadToken){state.loading=false;recyclePaint(pane);}}
  return recycleViewState(pane);
}
async function navigateRecycleLocation(pane,pushHistory,right){
  if(IS_MAC){showNotice('This location currently uses the Windows Recycle Bin.');return false;}
  const wasRecycle=isRecyclePath(pane.path);
  if(pushHistory!==false&&!wasRecycle){const key=right?'histIdx':'historyIdx';pane.history=pane.history.slice(0,pane[key]+1);pane.history.push(RECYCLE_ROOT);pane[key]=pane.history.length-1;}
  pane.path=RECYCLE_ROOT;pane.archivePath=null;delete pane._columnSelection;
  if(!wasRecycle){pane.entries=[];pane.sel.clear();pane.lastIdx=-1;}
  if(!right){hideHomePage();showFileContent();}
  document.getElementById(right?'right-path-input':'path-input').value=RECYCLE_ROOT;
  renderBreadcrumb(RECYCLE_ROOT,right?'right-breadcrumb':undefined,undefined,undefined,right);
  if(!right){const input=document.getElementById('filter-input');if(input)input.value='';}
  renderTabs();updateSidebarSelection();saveTabState();updateSearchScopeUI();
  syncDiskUsageWithActiveFolder(RECYCLE_ROOT,right);updatePreviewForSelection();
  if(typeof scheduleFileDialogIntegrationSync==='function')scheduleFileDialogIntegrationSync();
  await recycleRefresh(pane);return !recycleModel(pane).error;
}
async function openRecycleBin(right=G.dualOn&&G.lastActivePane==='right',newTab=false){
  if(newTab){addTab(RECYCLE_ROOT,right);return {opened:true,path:RECYCLE_ROOT};}
  await(right?rpNavigateTo(RECYCLE_ROOT):navigateTo(RECYCLE_ROOT));return recycleViewState(right?G.rp:getTab());
}
async function closeRecycleBin(){const pane=recyclePane(),right=recycleIsRight(pane);if(isRecyclePath(pane.path)){const tabs=right?G.rpTabs:G.tabs;if(tabs.length>1)closeTab(pane.id,right);else await(right?rpNavigateTo(FS_ROOT):navigateTo('home://'));}return {closed:true};}
function recycleControl(root,name){return root.querySelector('[data-recycle-control="'+name+'"]');}
function recycleRender(pane,list,right){
  const state=recycleModel(pane),selected=new Set(recycleSelectedIds(pane)),busy=recycleBusy||state.loading||!!state.error;
  const root=document.createElement('section');root.className='recycle-browser';root.dataset.tabId=pane.id;
  const button=(id,key,icon,disabled)=>'<button class="dialog-btn '+(id==='restore'?'primary':'')+'" data-recycle-control="'+id+'"'+(disabled?' disabled':'')+'>'+(icon?recycleIcon(icon):'')+'<span>'+esc(recycleText(key))+'</span></button>';
  root.innerHTML='<div class="recycle-toolbar" data-recycle-controls>'+button('restore','restore','restore',busy||!selected.size)+button('keep','keepBoth','',busy||!selected.size)+button('restore-all','restoreAll','',busy||!state.items.length||state.truncated)+'<span class="recycle-flex"></span>'+button('refresh','refresh','refresh',state.loading)+button('system','system','external',false)+'</div>'+
    '<div class="recycle-filters" data-recycle-controls><input type="search" data-recycle-control="search" placeholder="'+esc(recycleText('search'))+'" aria-label="'+esc(recycleText('search'))+'" value="'+esc(state.query)+'"><select data-recycle-control="sort" aria-label="'+esc(recycleText('date'))+'">'+[['deletedAt','date'],['name','name'],['originalFolder','folder'],['size','size'],['itemType','type']].map(([field,key])=>'<option value="'+field+'"'+(field===state.sort?' selected':'')+'>'+esc(recycleText(key))+'</option>').join('')+'</select><button class="tb" data-recycle-control="direction" aria-label="'+esc(recycleText(state.descending?'descending':'ascending'))+'">'+(state.descending?'↓':'↑')+'</button></div>'+
    (state.truncated?'<div class="recycle-banner">'+esc(recycleText('partial'))+'</div>':'')+
    (state.error?'<div class="recycle-banner recycle-error" role="alert">'+esc(recycleText('failed',{error:state.error}))+'</div>':'')+
    '<div class="recycle-items" role="grid" aria-label="'+esc(recycleText('title'))+'"></div>'+
    '<div class="recycle-report" data-recycle-control="report" hidden></div>'+
    '<footer class="recycle-footer" data-recycle-controls><label class="recycle-check-all"><input type="checkbox" data-recycle-control="all"'+(busy?' disabled':'')+'><span>'+esc(recycleText('all'))+'</span></label><span class="recycle-flex"></span>'+button('remove','remove','',busy||!selected.size)+button('empty','empty','trash',busy||!state.items.length||state.truncated)+'</footer>';
  list.append(root);
  const bind=(name,type,fn)=>RHFilesUI.listen(recycleControl(root,name),type,fn,undefined,'src.js.recycle.location.'+name+'.'+type);
  bind('restore','click',()=>recycleRestore(false,false,pane).catch(()=>{}));bind('keep','click',()=>recycleRestore(true,false,pane).catch(()=>{}));
  bind('restore-all','click',()=>recycleRestore(false,true,pane).catch(()=>{}));bind('remove','click',()=>recycleDelete(false,pane).catch(()=>{}));bind('empty','click',()=>recycleDelete(true,pane).catch(()=>{}));
  bind('refresh','click',()=>recycleRefresh(pane));bind('system','click',()=>call('recycle_bin_open_system',{}).catch(error=>showNotice(String(error))));
  bind('sort','change',e=>recycleSetSort(e.target.value,state.descending,pane));bind('direction','click',()=>recycleSetSort(state.sort,!state.descending,pane));
  bind('search','input',event=>{const start=event.target.selectionStart;recycleSetQuery(event.target.value,pane);const input=recycleControl(recycleRoot(pane),'search');input.focus();try{input.setSelectionRange(start,start);}catch{}});
  bind('all','change',event=>recycleSetSelection(event.target.checked?pane.entries.map(e=>e.recycle_id):[],'replace',pane));
  const all=recycleControl(root,'all');all.checked=pane.entries.length>0&&pane.entries.every(e=>selected.has(e.recycle_id));all.indeterminate=selected.size>0&&!all.checked;
  const items=root.querySelector('.recycle-items'),visible=recycleViewItems(pane);
  if(state.loading||!visible.length){const empty=document.createElement('div');empty.className='recycle-empty-state';empty.innerHTML=recycleIcon(state.loading?'refresh':'trash')+'<h2>'+esc(recycleText(state.loading?'loading':state.items.length?'noMatch':'emptyTitle'))+'</h2><p>'+esc(recycleText(state.items.length?'noMatchHelp':'emptyHelp'))+'</p>';items.append(empty);}
  else{
    const head=document.createElement('div');head.className='recycle-columns';head.setAttribute('role','row');head.append(document.createElement('span'));
    for(const [field,key]of [['name','name'],['originalFolder','folder'],['deletedAt','date'],['size','size']]){
      const button=document.createElement('button');button.textContent=recycleText(key)+(state.sort===field?(state.descending?' ↓':' ↑'):'');button.setAttribute('role','columnheader');button.setAttribute('aria-sort',state.sort===field?(state.descending?'descending':'ascending'):'none');
      RHFilesUI.listen(button,'click',()=>recycleSetSort(field,state.sort===field?!state.descending:field==='size'||field==='deletedAt',pane),undefined,'src.js.recycle.location.columnSort');head.append(button);
    }items.append(head);
    if(state.renderedFocus!==pane.lastIdx&&pane.lastIdx>=0&&(pane.lastIdx<(state.start||0)||pane.lastIdx>=(state.start||0)+200))state.start=Math.max(0,pane.lastIdx-100);
    const start=Math.min(state.start||0,Math.max(0,visible.length-1));state.renderedFocus=pane.lastIdx;
    for(const [offset,item]of visible.slice(start,start+200).entries()){
      const index=start+offset;
      const row=document.createElement('div');row.className='file-row recycle-row'+(selected.has(item.id)?' selected':'');row.dataset.index=index;row.dataset.path=RECYCLE_ROOT+item.id;row.dataset.recycleId=item.id;row.setAttribute('role','row');row.setAttribute('aria-selected',String(selected.has(item.id)));
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.has(item.id);checkbox.tabIndex=-1;checkbox.disabled=recycleBusy;checkbox.setAttribute('aria-label',recycleText('select',{name:item.name}));
      const name=document.createElement('span');name.className='recycle-item-name row-name';name.innerHTML=recycleIcon(item.isDirectory?'folder':'file');const text=document.createElement('span');text.textContent=item.name;name.append(text);name.title=item.name;
      const folder=document.createElement('span');folder.className='recycle-item-folder';folder.textContent=item.originalFolder;folder.title=item.originalPath;
      const date=document.createElement('span');date.className='recycle-date';date.textContent=item.deletedAt?new Date(item.deletedAt).toLocaleString(_lang==='zh'?'zh-CN':_lang,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
      const size=document.createElement('span');size.className='recycle-size';size.textContent=pane.entries[index].size_display;
      row.append(checkbox,name,folder,date,size);
      RHFilesUI.listen(row,'click',event=>{if(recycleBusy)return;handleRowClick(event.target===checkbox&&!event.shiftKey?{ctrlKey:true,metaKey:event.metaKey}:event,index,pane.sel,pane,right);recyclePaint(pane);},undefined,'src.js.recycle.location.select');
      RHFilesUI.listen(row,'contextmenu',event=>{event.preventDefault();event.stopPropagation();if(!selected.has(item.id))recycleSetSelection([item.id],'replace',pane);G.lastActivePane=right?'right':'left';recycleShowMenu(event.clientX,event.clientY,pane);},undefined,'src.js.recycle.location.context');
      RHFilesUI.listen(row,'dblclick',()=>recycleInspect(pane.entries[index],pane).catch(()=>{}),undefined,'src.js.recycle.location.open');
      items.append(row);
    }
    for(const [direction,label]of [[-1,'previousPage'],[1,'more']]){
      if(direction<0?start===0:start+200>=visible.length)continue;
      const more=document.createElement('button');more.className='dialog-btn recycle-more';more.textContent=recycleText(label,{count:visible.length-start-200});
      RHFilesUI.listen(more,'click',()=>{state.start=Math.max(0,start+direction*200);recyclePaint(pane);},undefined,'src.js.recycle.location.page');items.append(more);
    }
  }
  if(state.report){
    const result=state.report,report=recycleControl(root,'report');report.hidden=false;
    const summary=document.createElement('div');summary.textContent=result.error?recycleText('loadError',{error:result.error}):recycleText('report',{done:result.completed.length,skipped:result.skipped.length,failed:result.failed.length});report.append(summary);
    for(const item of [...(result.skipped||[]),...(result.failed||[])]){const p=document.createElement('p');p.textContent=item.name+' — '+(item.code==='conflict'?recycleText('conflict'):item.message);report.append(p);}
  }
}
function recycleShowMenu(x,y,pane=recyclePane()){
  const hasSelection=recycleSelectedIds(pane).length>0;
  showMenuAt(x,y,[{label:recycleText('restore'),icon:'undo',disabled:!hasSelection||recycleBusy,action:()=>recycleRestore(false,false,pane)},{label:recycleText('keepBoth'),icon:'copy',disabled:!hasSelection||recycleBusy,action:()=>recycleRestore(true,false,pane)},{label:recycleText('copy'),icon:'copyPath',disabled:!hasSelection,action:()=>recycleCopyPaths(pane)},{label:recycleText('remove'),icon:'delete',disabled:!hasSelection||recycleBusy,action:()=>recycleDelete(false,pane)},{label:recycleText('empty'),icon:'delete',disabled:recycleBusy||!recycleModel(pane).items.length||recycleModel(pane).truncated,action:()=>recycleDelete(true,pane)}]);
}
async function recycleInspect(entry,pane=recyclePane()){
  if(!entry?.recycle_id||recycleBusy)return;const item=recycleModel(pane).items.find(item=>item.id===entry.recycle_id);if(!item)return;
  let confirmed;recycleBusy=true;recyclePaintAll();
  try{confirmed=await showConfirmDialog({kind:'restore',title:item.name,message:item.originalPath,detail:recycleText('date')+': '+(item.deletedAt?new Date(item.deletedAt).toLocaleString(_lang==='zh'?'zh-CN':_lang):'—')+'\n'+recycleText('size')+': '+entry.size_display+'\n\n'+recycleText('restoreFirst'),confirmLabel:recycleText('restore')});}
  finally{recycleBusy=false;recyclePaintAll();}
  if(confirmed)return recycleRunOperation([item.id],true,false,null,pane);
}
async function recycleCopyPaths(pane=recyclePane()){
  const selected=new Set(recycleSelectedIds(pane));const paths=recycleModel(pane).items.filter(item=>selected.has(item.id)).map(item=>item.originalPath);
  if(paths.length){await navigator.clipboard.writeText(paths.join('\r\n'));showNotice(recycleText('copied'));}
}
function recyclePaintAll(){for(const pane of [...G.tabs,...(G.rpTabs||[])])if(isRecyclePath(pane.path))recyclePaint(pane);}
async function recycleRunOperation(ids,restore,keepBoth,plan,pane=recyclePane()){
  if(recycleBusy)throw Error(recycleText('busy'));if(!ids.length)return;
  recycleBusy=true;const state=recycleModel(pane);state.report=null;recyclePaintAll();
  const taskId=showProgress(recycleText(restore?'restoring':'deleting',{count:ids.length}),{indeterminate:true,cancellable:true,totalItems:ids.length,aggregateProgress:true});
  try{
    const result=await call(restore?'recycle_bin_restore':'recycle_bin_delete',restore?{ids,policy:keepBoth?'keepBoth':'skip',operationId:taskId}:{planId:plan.planId,confirmed:true,operationId:taskId});state.report=result;
    if(result.cancelled)cancelOperationTask(taskId,recycleText('cancelled'));
    else if(result.failed.length||result.skipped.length)completeOperationTask(taskId,{status:'failed',error:recycleText('report',{done:result.completed.length,skipped:result.skipped.length,failed:result.failed.length})});
    else completeOperationTask(taskId);return result;
  }catch(error){state.report={error:String(error)};failOperationTask(taskId,error);throw error;}
  finally{
    recycleBusy=false;
    const panes=[...G.tabs,...(G.rpTabs||[])].filter(tab=>isRecyclePath(tab.path));
    await Promise.all(panes.map(tab=>recycleRefresh(tab)));
    // Recovering files can affect an ordinary tab shown beside the bin.
    for(const [tab,right]of [[getTab(),false],[G.dualOn?G.rp:null,true]])if(tab&&!isRecyclePath(tab.path))void _refreshTabInBackground(tab,right);
  }
}
async function recycleRestore(keepBoth=false,all=false,pane=recyclePane()){
  recycleRequireLocation(pane);
  const state=recycleModel(pane);if(recycleBusy||state.loading)throw Error(recycleText('busy'));
  const ids=all?state.items.map(item=>item.id):recycleSelectedIds(pane);if(!ids.length)return;
  if(all){let confirmed;recycleBusy=true;recyclePaintAll();try{confirmed=await showConfirmDialog({kind:'restore',title:recycleText('restoreAllTitle'),message:recycleText('confirmRestoreAll',{count:ids.length}),confirmLabel:recycleText('restoreAll')});}finally{recycleBusy=false;recyclePaintAll();}if(!confirmed)return;}
  try{return await recycleRunOperation(ids,true,keepBoth,null,pane);}catch(error){showNotice(String(error));throw error;}
}
async function recycleDelete(all=false,pane=recyclePane()){
  recycleRequireLocation(pane);
  const state=recycleModel(pane);if(recycleBusy||state.loading)throw Error(recycleText('busy'));if(all&&state.truncated)throw Error(recycleText('partial'));
  const ids=all?state.items.map(item=>item.id):recycleSelectedIds(pane);if(!ids.length)return;
  let plan;recycleBusy=true;recyclePaintAll();
  try{
    plan=await call('recycle_bin_prepare_delete',{ids});
    if(!await showConfirmDialog({title:recycleText(all?'emptyTitleConfirm':'deleteTitle'),message:recycleText('deleteMessage',{count:plan.count}),detail:recycleText('warning')+'\n\n'+plan.names.join('\n'),confirmLabel:recycleText('continue')}))return;
    if(!await showConfirmDialog({title:recycleText('finalTitle'),message:recycleText('deleteMessage',{count:plan.count}),detail:recycleText('finalWarning'),confirmLabel:recycleText('remove')}))return;
    recycleBusy=false;return await recycleRunOperation(ids,false,false,plan,pane);
  }catch(error){state.report={error:String(error)};showNotice(String(error));throw error;}
  finally{if(plan)await call('recycle_bin_discard_plan',{planId:plan.planId}).catch(()=>{});recycleBusy=false;recyclePaintAll();}
}
