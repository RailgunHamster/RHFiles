/* Recycle-bin selection is independent of the browser pane's selection.
 * Mutations use journal IDs, never paths supplied by the WebView. */
const androidTrash = (() => {
  const active=j=>['queued','scanning','running','paused','canceling'].includes(j.state);
  let current=null;
  function back(){if(!current?.valid()||!current.selected.size)return false;current.selected.clear();current.paint();return true;}
  async function enter(node,app,valid) {
    const view={node,app,valid,items:[],jobs:[],selected:new Set(),limit:100,busy:false,loading:false,error:'',timer:null};
    if(current?.timer)clearTimeout(current.timer);current=view;
    const control=(label,icon,fn,cls='')=>app.button(label,icon,fn,'trash-action '+cls);
    const running=()=>view.jobs.filter(j=>['restore','trash-delete'].includes(j.op)&&active(j));
    function paint(){
      if(!valid())return;
      const scroll=node.parentElement.scrollTop,selected=view.items.filter(i=>view.selected.has(i.id)),locked=view.busy||running().length>0;
      const header=ui.el('header','trash-heading'),symbol=ui.el('span','tool-illustration');symbol.innerHTML=ui.icon('trash');
      const copy=ui.el('div');copy.append(ui.el('h2','','回收站'),ui.el('p','muted',view.items.length+' 项 · 恢复不会覆盖同名文件'));header.append(symbol,copy);
      const toolbar=ui.el('div','trash-toolbar'),all=control(selected.length===view.items.length&&selected.length?'取消全选':'全选','check',()=>{
        if(view.selected.size===view.items.length)view.selected.clear();else view.items.forEach(i=>view.selected.add(i.id));paint();
      });
      all.disabled=locked||!view.items.length;all.setAttribute('aria-pressed',String(!!selected.length&&selected.length===view.items.length));
      const count=ui.el('span','trash-count',selected.length?'已选 '+selected.length+' 项':'选择需要恢复的文件');
      const refresh=control('刷新','refresh',refreshView);refresh.disabled=view.busy||view.loading;
      const empty=control('清空全部','trash',()=>submit('trash-delete',view.items.map(i=>i.id),true),'danger');empty.disabled=locked||!view.items.length;
      toolbar.append(all,count,refresh,empty);node.replaceChildren(header,toolbar);
      if(view.error){const error=ui.el('p','trash-error',view.error);error.setAttribute('role','alert');node.append(error);}
      for(const job of running()){
        const card=ui.el('section','trash-progress');card.setAttribute('role','status');
        card.append(ui.el('strong','',job.op==='restore'?'正在恢复到原位置':'正在清理回收站'));
        const progress=document.createElement('progress');progress.max=Math.max(1,job.files||0);progress.value=job.done||0;
        card.append(progress,ui.el('small','muted',(job.done||0)+' / '+(job.files||view.items.length)+' 项 · 可在文件任务中暂停或取消'));
        card.append(control('查看文件任务','tasks',()=>app.go({screen:'tool',tool:'tasks'})));node.append(card);
      }
      const list=ui.el('div','trash-list');list.setAttribute('aria-label','回收站文件');
      if(!view.items.length){const state=ui.el('div','trash-empty'),icon=ui.el('span','tool-illustration');icon.innerHTML=ui.icon('trash');state.append(icon,ui.el('strong','','回收站为空'),ui.el('p','muted','移入回收站的本地文件会显示在这里'));list.append(state);}
      for(const item of view.items.slice(0,view.limit)){
        const row=ui.el('article','trash-row');row.dataset.id=item.id;row.dataset.kind=item.isDir?'folder':item.kind||'other';row.classList.toggle('selected',view.selected.has(item.id));
        const select=ui.el('button','trash-file');select.type='button';select.setAttribute('aria-label','选择 '+item.name);select.setAttribute('aria-pressed',String(view.selected.has(item.id)));select.disabled=locked;
        const check=ui.el('span','trash-check');check.innerHTML=view.selected.has(item.id)?ui.icon('check'):'';
        const icon=ui.el('span','thumb');icon.innerHTML=ui.icon(item.isDir?'folder':item.kind||'other');
        const meta=ui.el('span','meta');meta.append(ui.el('span','name',item.name),ui.el('span','sub',fmt.displayPath(item.original)),ui.el('span','sub','删除于 '+fmt.date(item.at)));
        select.append(check,icon,meta);RHFilesUI.assign(select,"click",()=>{view.selected.has(item.id)?view.selected.delete(item.id):view.selected.add(item.id);paint();},"android.web.js.trash.paint.e6b547aff4ef");
        const more=control(item.name+' 的更多操作','more',()=>ui.openSheet(item.name,[
          app.action('恢复原位置','refresh',()=>submit('restore',[item.id])),
          app.action('永久删除','trash',()=>submit('trash-delete',[item.id]),true),
        ],fmt.displayPath(item.original)));more.classList.add('trash-more');more.disabled=locked;more.setAttribute('aria-label',item.name+' 的更多操作');more.querySelector('span')?.remove();
        row.append(select,more);list.append(row);
      }
      if(view.items.length>view.limit)list.append(control('显示更多（'+Math.min(view.limit,view.items.length)+' / '+view.items.length+'）','down',()=>{view.limit+=100;paint();}));
      node.append(list);
      const actions=ui.el('nav','trash-selection');actions.setAttribute('aria-label','已选文件操作');actions.hidden=!selected.length;
      const restore=control('恢复所选（'+selected.length+'）','refresh',()=>submit('restore',selected.map(i=>i.id)),'primary');
      const remove=control('永久删除','trash',()=>submit('trash-delete',selected.map(i=>i.id)),'danger');
      const cancel=control('取消选择','close',()=>{view.selected.clear();paint();});for(const b of [restore,remove,cancel])b.disabled=locked;
      actions.append(restore,remove,cancel);node.append(actions);node.parentElement.scrollTop=scroll;
    }
    view.paint=paint;
    function schedule(){clearTimeout(view.timer);if(valid()&&running().length)view.timer=setTimeout(()=>refreshView().catch(app.error),1200);}
    async function refreshView(){
      if(!valid()||view.loading)return;
      view.loading=true;
      try{
        const [items,jobs]=await Promise.all([api.native('trash.list'),api.native('jobs')]);if(!valid())return;
        const previous=running(),available=new Set(items.map(i=>i.id));view.items=items.sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id));view.jobs=jobs;
        for(const id of view.selected)if(!available.has(id))view.selected.delete(id);
        const finished=jobs.filter(j=>previous.some(p=>p.id===j.id)&&!active(j));
        view.error=finished.filter(j=>j.state!=='completed').map(j=>[j.message,...(j.failures||[]).slice(0,3).map(f=>fmt.displayPathText(f.message))].filter(Boolean).join('；')).join('\n');
        if(finished.length&&!view.error)ui.toast('回收站操作已完成');
      }catch(error){if(valid())view.error='无法读取回收站：'+(error.message||String(error));}
      finally{view.loading=false;paint();schedule();}
    }
    async function submit(op,ids,all=false){
      if(!valid()||view.busy||running().length||!ids.length)return;
      const snapshot=[...new Set(ids)];view.busy=true;paint();
      try{
        if(op==='trash-delete'){
          if(!await ui.confirm(all?'清空全部回收站？':'永久删除所选内容？','将永久删除 '+snapshot.length+' 项文件或文件夹，无法恢复。','继续'))return;
          if(!valid()||!await ui.confirm('最后确认','只删除本次确认的回收站内容；此操作不可撤销。','永久删除'))return;
        }
        if(!valid())return;
        const id=await api.native('job.start',{op,args:{ids:snapshot}});
        // Show the queued state before the service's first progress sample.
        view.jobs.push({id,op,state:'queued',done:0,files:snapshot.length});
        ui.toast('已加入文件任务');await refreshView();
      }catch(error){if(valid())view.error=error.message||String(error);}
      finally{view.busy=false;paint();schedule();}
    }
    await refreshView();
  }
  return {enter,back};
})();
