/* Device-local browsing history. Credentials and device trust stay in native storage. */
const androidHistory=(()=>{
  const key='rhfiles.visitHistory.v1';let memory=[],storageError=false,owner;
  function list(){if(storageError)return memory;try{const raw=localStorage.getItem(key);if(raw&&raw.length>4*1024*1024)throw Error('History is too large');memory=androidHistoryModel.clean(raw?JSON.parse(raw):[]);}catch{storageError=true;}return memory;}
  function save(entries){memory=entries;try{localStorage.setItem(key,JSON.stringify(entries));storageError=false;}catch{storageError=true;}}
  function record(route,label,displayPath){save(androidHistoryModel.visit(list(),route,label,displayPath));}
  function refresh(){if(owner?.state.route.screen==='tool'&&owner.state.route.tool==='history')render(document.getElementById('tool-extra'),owner);}
  function remove(id){save(list().filter(entry=>entry.id!==id));refresh();}
  async function open(id,app=owner){
    const entry=list().find(entry=>entry.id===id);if(!entry)throw Error('这条浏览记录已被移除');
    await app.go({...entry.route});if(app.state.navigationError)throw Error(app.state.navigationError);
    return {...app.state.route};
  }
  async function clear(){if(!await ui.confirm('清空浏览历史？','只移除访问记录，不会删除文件或网络连接。','清空记录'))return {cleared:false};save([]);refresh();return {cleared:true};}
  function render(node,app){
    owner=app;const entries=list();node.replaceChildren();
    const heading=ui.el('div','history-heading'),count=ui.el('span','muted',entries.length+' 条记录');
    const clearButton=app.button('清空记录','trash',()=>clear());clearButton.disabled=!entries.length;heading.append(count,clearButton);node.append(heading);
    if(storageError)node.append(ui.el('p','danger','浏览记录暂时无法保存到本机，当前会话仍可查看。'));
    if(!entries.length){node.append(ui.el('p','muted','打开文件夹后，会在这里留下访问记录。'));return;}
    const rows=ui.el('div','visit-history-list');
    for(const entry of entries){
      const row=ui.el('div','visit-history-row'),button=app.button('',entry.path.startsWith('remote:')||entry.path.startsWith('rh:')||entry.path.startsWith('rhfiles-device:')?'network':'folder',()=>open(entry.id,app));
      button.className='visit-history-open';button.querySelector('span')?.remove();
      const copy=ui.el('span','visit-history-copy'),title=ui.el('strong','',entry.label||fmt.baseName(entry.path)||entry.path),detail=ui.el('small','',entry.displayPath);detail.title=entry.displayPath;
      const time=ui.el('time','',new Date(entry.visitedAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}));time.dateTime=new Date(entry.visitedAt).toISOString();copy.append(title,detail,time);button.append(copy);
      const dismiss=app.button('移除这条记录','close',()=>remove(entry.id),'icon-btn');dismiss.setAttribute('aria-label','移除记录：'+(entry.label||entry.displayPath));dismiss.querySelector('span')?.remove();row.append(button,dismiss);rows.append(row);
    }
    node.append(rows);
  }
  window.addEventListener('storage',event=>{if(event.key===key||event.key===null){storageError=false;refresh();}});
  return {list,record,remove,open,clear,render};
})();
