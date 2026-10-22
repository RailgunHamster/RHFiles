// A dedicated view of the real Windows Recycle Bin. Its IDs are never treated
// as normal file paths, so generic Cut/Paste/Delete cannot touch recycled data.
const RECYCLE_COPY = {
  en: {
    title:'Recycle Bin', subtitle:'Deleted files from this Windows account', restore:'Restore selected', keepBoth:'Restore · keep both', restoreAll:'Restore all', remove:'Delete permanently', empty:'Empty Recycle Bin', refresh:'Refresh', close:'Close', system:'Open Windows Recycle Bin', search:'Search names or original locations', name:'Name', folder:'Original location', date:'Date deleted', size:'Size', type:'Type', ascending:'Ascending', descending:'Descending', all:'Select visible results', clear:'Clear selection', count:'{count} items', filtered:'{shown} of {total} items', selected:'{count} selected', loading:'Reading Recycle Bin…', emptyTitle:'Your Recycle Bin is empty', emptyHelp:'Files deleted from local drives appear here.', noMatch:'No matching items', noMatchHelp:'Try another name or original folder.', failed:'Could not read Recycle Bin: {error}', partial:'Only part of the Recycle Bin could be read. Use Windows Recycle Bin for the full list; empty-all is disabled.', more:'Show more · {count} remaining', copy:'Copy original paths', copied:'Original paths copied', working:'Processing Recycle Bin…', restoring:'Restoring {count} items', deleting:'Permanently deleting {count} items', report:'{done} completed · {skipped} skipped · {failed} failed', conflict:'The original path already exists. It was not overwritten; use “Restore · keep both” to recover another copy.', missing:'The item changed or is no longer in Recycle Bin.', details:'Operation details', deleteTitle:'Delete permanently?', emptyTitleConfirm:'Empty Recycle Bin?', deleteMessage:'Permanently delete {count} items?', warning:'These items cannot be recovered with Undo. Only the items in this confirmation will be deleted.', finalTitle:'Confirm permanent deletion', finalWarning:'This is the final confirmation. The selected data will be permanently removed.', continue:'Continue', cancel:'Cancel', done:'Operation complete', cancelled:'Cancelled; completed items are kept', readOnly:'Network-share deletions do not appear in the Windows Recycle Bin.', busy:'A Recycle Bin operation is already running.', choose:'Select an item first', select:'Select {name}', newest:'Newest first', loadError:'The operation failed: {error}', showTasks:'View file tasks', closeHelp:'Close this view; file tasks continue in the background', visible:'Visible results', confirmRestoreAll:'Restore all {count} items? Existing destinations will be skipped.', restoreAllTitle:'Restore all items?', folderType:'Folder', fileType:'File', reopen:'Refresh to view the remaining items.'
  },
  zh: {
    title:'回收站', subtitle:'当前 Windows 账号已删除的文件', restore:'恢复所选', keepBoth:'恢复并保留两者', restoreAll:'全部恢复', remove:'永久删除', empty:'清空回收站', refresh:'刷新', close:'关闭', system:'在 Windows 回收站中打开', search:'搜索名称或原始位置', name:'名称', folder:'原始位置', date:'删除时间', size:'大小', type:'类型', ascending:'升序', descending:'降序', all:'全选搜索结果', clear:'取消选择', count:'共 {count} 项', filtered:'显示 {shown} 项，共 {total} 项', selected:'已选 {count} 项', loading:'正在读取回收站…', emptyTitle:'回收站是空的', emptyHelp:'从本地磁盘删除的文件会显示在这里。', noMatch:'没有匹配的项目', noMatchHelp:'试试其他名称或原始文件夹。', failed:'无法读取回收站：{error}', partial:'仅能读取部分回收站内容。请在 Windows 回收站中查看完整列表；此处已禁用全部清空。', more:'继续显示 · 剩余 {count} 项', copy:'复制原始路径', copied:'已复制原始路径', working:'正在处理回收站…', restoring:'正在恢复 {count} 项', deleting:'正在永久删除 {count} 项', report:'已完成 {done} 项 · 跳过 {skipped} 项 · 失败 {failed} 项', conflict:'原始位置已有同名项目，未覆盖。可选择“恢复并保留两者”找回另一份副本。', missing:'此项目已变化或已不在回收站中。', details:'操作详情', deleteTitle:'永久删除？', emptyTitleConfirm:'清空回收站？', deleteMessage:'永久删除 {count} 项？', warning:'这些项目无法通过撤销找回。仅删除本次确认列表里的项目，不会连带删除之后进入回收站的新文件。', finalTitle:'再次确认永久删除', finalWarning:'这是最后一次确认，所选数据将被永久移除。', continue:'继续', cancel:'取消', done:'操作完成', cancelled:'已取消，已完成的项目会保留', readOnly:'网络共享上删除的文件不会进入 Windows 回收站。', busy:'已有回收站任务正在运行。', choose:'请先选择项目', select:'选择 {name}', newest:'最新删除优先', loadError:'操作失败：{error}', showTasks:'查看文件任务', closeHelp:'关闭此界面，文件任务会继续在后台运行', visible:'搜索结果', confirmRestoreAll:'恢复全部 {count} 项？已有同名项目会跳过，不会覆盖。', restoreAllTitle:'恢复全部项目？', folderType:'文件夹', fileType:'文件', reopen:'刷新可查看剩余项目。'
  }
};
_builtinEn['recycle.title']='Recycle Bin';
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
const recycleState={items:[],total:0,truncated:false,query:'',sort:'deletedAt',descending:true,selected:new Set(),anchor:null,focus:null,limit:200,busy:false,loading:false,error:'',report:null,loadToken:0};
function recycleViewItems(){return recycleVisibleItems(recycleState.items,recycleState.query,recycleState.sort,recycleState.descending,_lang||'en');}
function recycleViewState(){return {opened:!!document.getElementById('recycle-dialog'),busy:recycleState.busy,loading:recycleState.loading,selection:[...recycleState.selected],query:recycleState.query,sort:recycleState.sort,descending:recycleState.descending,total:recycleState.total,truncated:recycleState.truncated,error:recycleState.error};}
function recycleSetSelection(ids,mode='replace') {
  const known=new Set(recycleState.items.map(item=>item.id));if(ids.some(id=>!known.has(id)))throw Error('Recycle Bin item is not in the current snapshot');
  const selected=mode==='replace'?new Set():new Set(recycleState.selected);
  ids.forEach(id=>mode==='remove'?selected.delete(id):selected.add(id));recycleState.selected=selected;recycleState.anchor=ids.at(-1)||null;recycleState.focus=ids.at(-1)||null;recyclePaint();return recycleViewState();
}
function recycleSetQuery(query){recycleState.query=String(query);recycleState.limit=200;recycleState.selected.clear();recycleState.anchor=null;const input=document.getElementById('recycle-search');if(input)input.value=recycleState.query;recyclePaint();return recycleViewState();}
function recycleSetSort(field,descending){if(!['name','originalFolder','deletedAt','size','itemType'].includes(field))throw Error('Unknown Recycle Bin sort');recycleState.sort=field;recycleState.descending=!!descending;recyclePaint();return recycleViewState();}
async function recycleRefresh(){
  const token=++recycleState.loadToken;recycleState.loading=true;recycleState.error='';recyclePaint();
  try{
    const snapshot=await call('recycle_bin_list',{});if(token!==recycleState.loadToken)return;
    recycleState.items=snapshot.items;recycleState.total=snapshot.total;recycleState.truncated=!!snapshot.truncated;
    const ids=new Set(snapshot.items.map(item=>item.id));recycleState.selected=new Set([...recycleState.selected].filter(id=>ids.has(id)));
  }catch(error){if(token===recycleState.loadToken)recycleState.error=String(error);}
  finally{if(token===recycleState.loadToken){recycleState.loading=false;recyclePaint();}}
  return recycleViewState();
}
function closeRecycleBin(){removeContextMenu();const root=document.getElementById('recycle-dialog');root?.remove();if(recycleState.returnFocus?.isConnected)recycleState.returnFocus.focus();return {closed:true};}
async function openRecycleBin(){
  if(IS_MAC){showNotice('This view currently uses the Windows Recycle Bin.');return;}
  const existing=document.getElementById('recycle-dialog');if(existing){existing.querySelector('#recycle-search')?.focus();return recycleViewState();}
  recycleState.returnFocus=document.activeElement;
  const root=document.createElement('div');root.id='recycle-dialog';root.className='overlay recycle-overlay';root.style.display='flex';
  root.innerHTML=`<div class="dialog-backdrop"></div><section class="dialog-box recycle-panel" role="dialog" aria-modal="true" aria-labelledby="recycle-title">
    <header class="recycle-header"><div class="recycle-title-icon">${recycleIcon('trash')}</div><div><h1 id="recycle-title">${esc(recycleText('title'))}</h1><p>${esc(recycleText('subtitle'))}</p></div><button class="tb recycle-close" id="recycle-close" title="${esc(recycleText('closeHelp'))}" aria-label="${esc(recycleText('close'))}">${recycleIcon('close')}</button></header>
    <div class="recycle-toolbar"><button class="dialog-btn primary" id="recycle-restore">${recycleIcon('restore')}<span>${esc(recycleText('restore'))}</span></button><button class="dialog-btn" id="recycle-keep">${esc(recycleText('keepBoth'))}</button><button class="dialog-btn" id="recycle-restore-all">${esc(recycleText('restoreAll'))}</button><span class="recycle-flex"></span><button class="dialog-btn" id="recycle-refresh" title="${esc(recycleText('refresh'))}">${recycleIcon('refresh')}<span>${esc(recycleText('refresh'))}</span></button><button class="dialog-btn" id="recycle-system" title="${esc(recycleText('system'))}" aria-label="${esc(recycleText('system'))}">${recycleIcon('external')}</button></div>
    <div class="recycle-filters"><input id="recycle-search" type="search" placeholder="${esc(recycleText('search'))}" aria-label="${esc(recycleText('search'))}"><label class="recycle-sort"><select id="recycle-sort" aria-label="${esc(recycleText('date'))}">${[['deletedAt','date'],['name','name'],['originalFolder','folder'],['size','size'],['itemType','type']].map(([value,label])=>`<option value="${value}">${esc(recycleText(label))}</option>`).join('')}</select><button class="tb" id="recycle-direction"></button></label></div>
    <div class="recycle-banner" id="recycle-warning" hidden></div><div class="recycle-banner recycle-error" id="recycle-error" hidden role="alert"></div>
    <div class="recycle-list" id="recycle-list" role="grid" tabindex="0" aria-label="${esc(recycleText('title'))}"></div>
    <div class="recycle-report" id="recycle-report" aria-live="polite" hidden></div>
    <footer class="recycle-footer"><label class="recycle-check-all"><input id="recycle-all" type="checkbox"><span>${esc(recycleText('all'))}</span></label><span id="recycle-count" aria-live="polite"></span><span class="recycle-flex"></span><button class="dialog-btn recycle-danger" id="recycle-remove">${esc(recycleText('remove'))}</button><button class="dialog-btn recycle-danger" id="recycle-empty">${recycleIcon('trash')}<span>${esc(recycleText('empty'))}</span></button></footer>
    <div class="recycle-footnote">${esc(recycleText('readOnly'))}</div></section>`;
  document.body.append(root);
  const bind=(id,type,handler)=>RHFilesUI.listen(root.querySelector('#'+id),type,handler,undefined,'src.js.recycle.'+id+'.'+type);
  bind('recycle-close','click',closeRecycleBin);
  RHFilesUI.listen(root.querySelector('.dialog-backdrop'),'click',closeRecycleBin,undefined,'src.js.recycle.backdrop');
  bind('recycle-refresh','click',recycleRefresh);bind('recycle-system','click',()=>call('recycle_bin_open_system',{}).catch(error=>showNotice(String(error))));
  bind('recycle-search','input',event=>recycleSetQuery(event.target.value));bind('recycle-sort','change',event=>recycleSetSort(event.target.value,recycleState.descending));bind('recycle-direction','click',()=>recycleSetSort(recycleState.sort,!recycleState.descending));
  bind('recycle-all','change',event=>recycleSetSelection(event.target.checked?recycleViewItems().map(item=>item.id):[]));
  bind('recycle-restore','click',()=>recycleRestore(false).catch(()=>{}));bind('recycle-keep','click',()=>recycleRestore(true).catch(()=>{}));bind('recycle-restore-all','click',()=>recycleRestore(false,true).catch(()=>{}));bind('recycle-remove','click',()=>recycleDelete(false).catch(()=>{}));bind('recycle-empty','click',()=>recycleDelete(true).catch(()=>{}));
  RHFilesUI.listen(root,'contextmenu',event=>{if(event.target.closest('input,textarea'))return;event.preventDefault();event.stopPropagation();},undefined,'src.js.recycle.contextGuard');
  RHFilesUI.listen(root,'keydown',event=>{
    const input=event.target.matches('input[type=search],textarea,select');
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeRecycleBin();return;}
    if(event.key==='Tab'){
      const nodes=[...root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(node=>node.getClientRects().length);
      const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}return;
    }
    if(input)return;
    const control=event.ctrlKey||event.metaKey;
    if(control&&event.key.toLowerCase()==='a'){event.preventDefault();event.stopPropagation();recycleSetSelection(recycleViewItems().map(item=>item.id));return;}
    if(event.key==='F5'){event.preventDefault();event.stopPropagation();void recycleRefresh();return;}
    if(event.key==='Delete'){event.preventDefault();event.stopPropagation();void recycleDelete(false).catch(()=>{});return;}
    if(control&&event.key==='Enter'){event.preventDefault();event.stopPropagation();void recycleRestore(false).catch(()=>{});return;}
    if(event.key==='ArrowUp'||event.key==='ArrowDown'){
      event.preventDefault();event.stopPropagation();const items=recycleViewItems();if(!items.length)return;
      const position=items.findIndex(item=>item.id===(recycleState.focus||[...recycleState.selected].at(-1))),old=Math.max(0,position);const next=position<0&&!event.shiftKey?0:Math.max(0,Math.min(items.length-1,old+(event.key==='ArrowDown'?1:-1)));
      const value=recycleClickSelection(items,recycleState.selected,items[next].id,recycleState.anchor||items[old].id,event.shiftKey,control);Object.assign(recycleState,value,{focus:items[next].id,limit:Math.max(recycleState.limit,next+1)});recyclePaint();root.querySelector(`[data-recycle-id="${items[next].id}"]`)?.scrollIntoView({block:'nearest'});
    }
  },true,'src.js.recycle.keyboard');
  recyclePaint();root.querySelector('#recycle-search').focus();return recycleRefresh();
}
function recyclePaint(){
  const root=document.getElementById('recycle-dialog');if(!root)return;
  const items=recycleViewItems(),selected=recycleState.selected,busy=recycleState.busy||recycleState.loading||!!recycleState.error;
  root.querySelector('#recycle-sort').value=recycleState.sort;
  const direction=root.querySelector('#recycle-direction');direction.textContent=recycleState.descending?'↓':'↑';direction.title=recycleText(recycleState.descending?'descending':'ascending');direction.setAttribute('aria-label',direction.title);
  for(const id of ['recycle-restore','recycle-keep','recycle-remove'])root.querySelector('#'+id).disabled=busy||selected.size===0;
  for(const id of ['recycle-restore-all','recycle-empty'])root.querySelector('#'+id).disabled=busy||!recycleState.items.length||recycleState.truncated;
  root.querySelector('#recycle-refresh').disabled=recycleState.loading;
  const all=root.querySelector('#recycle-all');all.disabled=busy||!items.length;all.checked=items.length>0&&items.every(item=>selected.has(item.id));all.indeterminate=items.some(item=>selected.has(item.id))&&!all.checked;
  root.querySelector('#recycle-count').textContent=selected.size?recycleText('selected',{count:selected.size}):recycleText('filtered',{shown:items.length,total:recycleState.total});
  const warning=root.querySelector('#recycle-warning');warning.hidden=!recycleState.truncated;warning.textContent=recycleText('partial');
  const error=root.querySelector('#recycle-error');error.hidden=!recycleState.error;error.textContent=recycleText('failed',{error:recycleState.error});
  const list=root.querySelector('#recycle-list'),scroll=list.scrollTop,focused=list.contains(document.activeElement);list.setAttribute('aria-busy',String(recycleState.loading));
  list.replaceChildren();
  if(recycleState.loading||(!items.length&&!recycleState.error)){
    const empty=document.createElement('div');empty.className='recycle-empty-state';empty.innerHTML=`<div>${recycleIcon(recycleState.loading?'refresh':'trash')}</div><h2></h2><p></p>`;
    empty.querySelector('h2').textContent=recycleText(recycleState.loading?'loading':recycleState.items.length?'noMatch':'emptyTitle');empty.querySelector('p').textContent=recycleState.loading?'':recycleText(recycleState.items.length?'noMatchHelp':'emptyHelp');list.append(empty);
  }else if(!recycleState.error){
    const head=document.createElement('div');head.className='recycle-columns';head.setAttribute('role','row');head.append(document.createElement('span'));
    for(const [field,key]of [['name','name'],['originalFolder','folder'],['deletedAt','date'],['size','size']]){const button=document.createElement('button');button.textContent=recycleText(key)+(recycleState.sort===field?(recycleState.descending?' ↓':' ↑'):'');button.setAttribute('role','columnheader');button.setAttribute('aria-sort',recycleState.sort===field?(recycleState.descending?'descending':'ascending'):'none');RHFilesUI.listen(button,'click',()=>recycleSetSort(field,recycleState.sort===field?!recycleState.descending:field==='deletedAt'||field==='size'),undefined,'src.js.recycle.sortColumn');head.append(button);}list.append(head);
    for(const item of items.slice(0,recycleState.limit)){
      const row=document.createElement('div');row.className='recycle-row'+(selected.has(item.id)?' selected':'');row.dataset.recycleId=item.id;row.setAttribute('role','row');row.setAttribute('aria-selected',String(selected.has(item.id)));
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.has(item.id);checkbox.tabIndex=-1;checkbox.setAttribute('aria-label',recycleText('select',{name:item.name}));checkbox.disabled=recycleState.busy;
      const name=document.createElement('span');name.className='recycle-item-name';name.innerHTML=recycleIcon(item.isDirectory?'folder':'file');const text=document.createElement('span');text.textContent=item.name;name.append(text);name.title=item.name;
      const folder=document.createElement('span');folder.textContent=item.originalFolder;folder.title=item.originalPath;folder.className='recycle-item-folder';
      const date=document.createElement('span');date.className='recycle-date';date.textContent=item.deletedAt?new Date(item.deletedAt).toLocaleString(_lang==='zh'?'zh-CN':_lang,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
      const size=document.createElement('span');size.className='recycle-size';size.textContent=item.isDirectory||item.size==null?'—':fmtSize(item.size);
      row.append(checkbox,name,folder,date,size);
      const select=event=>{if(recycleState.busy)return;const value=recycleClickSelection(items,selected,item.id,recycleState.anchor,event.shiftKey,event.ctrlKey||event.metaKey||event.target===checkbox);Object.assign(recycleState,value,{focus:item.id});recyclePaint();list.focus({preventScroll:true});};
      RHFilesUI.listen(row,'click',select,undefined,'src.js.recycle.row.select');
      RHFilesUI.listen(row,'contextmenu',event=>{event.preventDefault();event.stopPropagation();if(recycleState.busy)return;if(!selected.has(item.id))recycleSetSelection([item.id]);showMenuAt(event.clientX,event.clientY,[{label:recycleText('restore'),icon:'undo',action:()=>recycleRestore(false)},{label:recycleText('keepBoth'),icon:'copy',action:()=>recycleRestore(true)},{label:recycleText('copy'),icon:'copyPath',action:recycleCopyPaths},{label:recycleText('remove'),icon:'delete',action:()=>recycleDelete(false)}]);},undefined,'src.js.recycle.row.context');
      list.append(row);
    }
    if(items.length>recycleState.limit){const more=document.createElement('button');more.className='dialog-btn recycle-more';more.textContent=recycleText('more',{count:items.length-recycleState.limit});RHFilesUI.listen(more,'click',()=>{recycleState.limit+=200;recyclePaint();},undefined,'src.js.recycle.more');list.append(more);}
  }
  list.scrollTop=scroll;if(focused)list.focus({preventScroll:true});
  const report=root.querySelector('#recycle-report');report.replaceChildren();report.hidden=!recycleState.report;
  if(recycleState.report){
    const result=recycleState.report;const summary=document.createElement('div');summary.textContent=result.error?recycleText('loadError',{error:result.error}):recycleText('report',{done:result.completed.length,skipped:result.skipped.length,failed:result.failed.length});report.append(summary);
    const failures=[...(result.skipped||[]),...(result.failed||[])];
    if(failures.length){const details=document.createElement('details'),label=document.createElement('summary');label.textContent=recycleText('details');details.append(label);for(const item of failures){const p=document.createElement('p');p.textContent=(item.name?item.name+' — ':'')+(item.code==='conflict'?recycleText('conflict')+' '+item.message:item.code==='missing'?recycleText('missing'):item.message);details.append(p);}report.append(details);}
  }
}
async function recycleCopyPaths(){const text=recycleState.items.filter(item=>recycleState.selected.has(item.id)).map(item=>item.originalPath).join('\r\n');if(!text)return;await navigator.clipboard.writeText(text);showNotice(recycleText('copied'));}
async function recycleRunOperation(ids,restore,keepBoth,plan){
  if(recycleState.busy)throw Error(recycleText('busy'));if(!ids.length)return;
  recycleState.busy=true;recycleState.report=null;recyclePaint();const taskId=showProgress(recycleText(restore?'restoring':'deleting',{count:ids.length}),{indeterminate:true,cancellable:true,totalItems:ids.length,aggregateProgress:true});
  try{
    const result=await call(restore?'recycle_bin_restore':'recycle_bin_delete',restore?{ids,policy:keepBoth?'keepBoth':'skip',operationId:taskId}:{planId:plan.planId,confirmed:true,operationId:taskId});
    recycleState.report=result;
    if(result.cancelled)cancelOperationTask(taskId,recycleText('cancelled'));
    else if(result.failed.length||result.skipped.length)completeOperationTask(taskId,{status:'failed',error:recycleText('report',{done:result.completed.length,skipped:result.skipped.length,failed:result.failed.length})});
    else completeOperationTask(taskId);
    if(restore&&result.completed.length)await refresh().catch(error=>console.warn('Restored files; refreshing the folder failed',error));
    return result;
  }catch(error){recycleState.report={error:String(error)};failOperationTask(taskId,error);throw error;}
  finally{recycleState.busy=false;await recycleRefresh();}
}
async function recycleRestore(keepBoth=false,all=false){
  if(recycleState.busy||recycleState.loading)throw Error(recycleText('busy'));
  const ids=all?recycleState.items.map(item=>item.id):[...recycleState.selected];if(!ids.length)return;
  if(all){let confirmed=false;recycleState.busy=true;recyclePaint();try{confirmed=await showConfirmDialog({kind:'restore',title:recycleText('restoreAllTitle'),message:recycleText('confirmRestoreAll',{count:ids.length}),confirmLabel:recycleText('restoreAll'),cancelLabel:recycleText('cancel')});}finally{recycleState.busy=false;recyclePaint();}if(!confirmed)return;}
  try{return await recycleRunOperation(ids,true,keepBoth);}catch(error){showNotice(String(error));throw error;}
}
async function recycleDelete(all=false){
  if(recycleState.busy||recycleState.loading)throw Error(recycleText('busy'));
  if(all&&recycleState.truncated)throw Error(recycleText('partial'));
  const ids=all?recycleState.items.map(item=>item.id):[...recycleState.selected];if(!ids.length)return;
  let plan;
  // Reserve the UI immediately: a second click must not prepare another plan
  // or replace the pending confirmation (including from another UI action).
  recycleState.busy=true;recyclePaint();
  try{
    plan=await call('recycle_bin_prepare_delete',{ids});
    const detail=recycleText('warning')+'\n\n'+plan.names.join('\n');
    if(!await showConfirmDialog({title:recycleText(all?'emptyTitleConfirm':'deleteTitle'),message:recycleText('deleteMessage',{count:plan.count}),detail,confirmLabel:recycleText('continue'),cancelLabel:recycleText('cancel')}))return;
    if(!await showConfirmDialog({title:recycleText('finalTitle'),message:recycleText('deleteMessage',{count:plan.count}),detail:recycleText('finalWarning'),confirmLabel:recycleText('remove'),cancelLabel:recycleText('cancel')}))return;
    recycleState.busy=false;return await recycleRunOperation(ids,false,false,plan);
  }catch(error){recycleState.report={error:String(error)};showNotice(String(error));throw error;}
  finally{if(plan)await call('recycle_bin_discard_plan',{planId:plan.planId}).catch(()=>{});recycleState.busy=false;recyclePaint();}
}
