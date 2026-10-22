/* Stable semantic commands over the same functions used by the desktop UI.
 * The complete live UI surface remains available through ui.list/ui.invoke. */
(() => {
  const api=window.RHFilesAPI,ErrorType=RHFilesAutomationCore.ActionError;
  const string={type:'string',minLength:1,maxLength:8192},boolean={type:'boolean'},integer={type:'integer',minimum:0};
  const pane={type:'string',enum:['active','left','right']};
  const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
  const register=(name,params,handler,risk='ui',description=name)=>api.register(name,handler,{params,risk,description});
  const reject=(code,message)=>{throw new ErrorType(code,message);};
  function target(which='active'){
    if(G.startupReady!==true)reject('NOT_READY','Application is still starting');
    const right=which==='right'||which==='active'&&G.dualOn&&G.lastActivePane==='right';
    if(right&&!G.dualOn)reject('PANE_UNAVAILABLE','The right pane is closed');
    const state=right?G.rp:getTab();if(!state)reject('PANE_UNAVAILABLE','No active tab');return {right,state};
  }
  function focus(which){const value=target(which);G.lastActivePane=value.right?'right':'left';updatePaneFocusUI();return value;}
  function state(which){const value=target(which);return {pane:value.right?'right':'left',tabId:value.state.id,path:value.state.path,loaded:value.state._loaded===true,selection:getSelectedPaths(value.right).map(e=>e.path),entries:(value.state.entries||[]).length};}
  function selection(paths,which,mode='replace'){
    const value=focus(which),entries=value.state.entries||[],indexes=new Map(entries.map((e,i)=>[e.path,i]));
    if(paths.some(path=>!indexes.has(path)))reject('ENTRY_NOT_FOUND','Selection contains paths outside the current listing');
    const selected=mode==='replace'?new Set():new Set(value.state.sel||[]);
    for(const path of paths){const index=indexes.get(path);if(mode==='remove')selected.delete(index);else selected.add(index);}
    value.state.sel=selected;delete value.state._columnSelection;value.state.lastIdx=[...selected].at(-1)??-1;
    renderFiles(value.state,value.right?'right-file-list':'file-list',value.right?'right-status-count':'status-count',value.right?null:'status-selection',value.right);
    updatePreviewForSelection(value.right);if(typeof fileChoiceRefreshSelection==='function')fileChoiceRefreshSelection();return state(which);
  }
  const paths={type:'array',items:string,maxItems:10000};
  api.provideState('application',()=>({platform:IS_MAC?'macos':'windows',ready:G.startupReady===true,window:G.windowLabel,dualPane:!!G.dualOn,activePane:G.lastActivePane,tabs:G.tabs.map(t=>({id:t.id,path:t.path,pinned:!!t.pinned,loaded:t._loaded===true})),rightTabs:(G.rpTabs||[]).map(t=>({id:t.id,path:t.path,pinned:!!t.pinned,loaded:t._loaded===true}))}));
  register('navigation.open',object({path:string,pane},['path']),async p=>{const t=focus(p.pane);const ok=await(t.right?rpNavigateTo(p.path):navigateTo(p.path));if(ok===false)reject('NAVIGATION_FAILED','The requested location could not be opened');return state(p.pane);});
  register('navigation.state',object({pane}),p=>state(p.pane),'read');
  register('files.list',object({pane,offset:integer,limit:{type:'integer',minimum:1,maximum:2000}}),p=>{const {state}=target(p.pane),entries=state.entries||[],offset=p.offset??0;return {path:state.path,total:entries.length,offset,entries:entries.slice(offset,offset+(p.limit??500)).map(e=>({name:e.name,path:e.path,isDirectory:!!e.is_dir,size:e.size??0,modified:e.modified??null}))};},'read');
  register('selection.set',object({paths,pane,mode:{type:'string',enum:['replace','add','remove']}},['paths']),p=>selection(p.paths,p.pane,p.mode));
  register('selection.clear',object({pane}),p=>selection([],p.pane));
  register('selection.get',object({pane}),p=>state(p.pane).selection,'read');
  register('files.rename',object({path:string,name:string,pane},['path','name']),async p=>{const t=focus(p.pane),entry=t.state.entries.find(e=>e.path===p.path);if(!entry)reject('ENTRY_NOT_FOUND','Rename source is not in the current listing');const changed=await renameEntry(entry,p.name,t.right);await refresh();return {changed:!!changed,...state(p.pane)};},'write','Rename through the UI conflict/merge policy; never silently replace a folder');
  register('files.transfer',object({paths,destination:string,operation:{type:'string',enum:['copy','move']}},['paths','destination','operation']),async p=>{if(!p.paths.length)reject('INVALID_PARAMS','No sources selected');let report;await performDroppedFileOperation(p.paths,p.destination,[],p.operation,value=>{report=value;});if(report?.errors.length)throw new ErrorType('FILE_OPERATION_FAILED','Some files did not complete',report);return report;},'write','Use the same copy/move conflict and progress workflow as file drops');
  register('tabs.list',object(),()=>({left:G.tabs.map(t=>({id:t.id,path:t.path,pinned:!!t.pinned})),right:(G.rpTabs||[]).map(t=>({id:t.id,path:t.path,pinned:!!t.pinned}))}),'read');
  register('tabs.new',object({path:string,pane}),p=>{const t=focus(p.pane);addTab(p.path,t.right);return state(p.pane);});
  function tab(p){const t=focus(p.pane),tabs=t.right?G.rpTabs:G.tabs;if(!tabs.some(e=>e.id===p.tabId))reject('TAB_NOT_FOUND','Tab does not exist in that pane');return {...t,tabs};}
  const tabSchema=object({tabId:integer,pane},['tabId']);
  register('tabs.activate',tabSchema,p=>{const t=tab(p);t.right?switchRightTab(p.tabId):switchTab(p.tabId);return state(p.pane);});
  register('tabs.duplicate',tabSchema,async p=>{const t=tab(p);await duplicateTab(p.tabId,t.right);return state(p.pane);});
  register('tabs.close',tabSchema,p=>{const t=tab(p);closeTab(p.tabId,t.right);return {accepted:true};});
  register('tabs.pin',object({tabId:integer,pane,pinned:boolean},['tabId','pinned']),p=>{const t=tab(p),entry=t.tabs.find(e=>e.id===p.tabId);if(!!entry.pinned!==p.pinned)toggleTabPinned(p.tabId,t.right);return {tabId:p.tabId,pinned:!!entry.pinned};});
  register('tabs.reorder',object({tabId:integer,beforeTabId:integer,pane,after:boolean},['tabId','beforeTabId']),p=>{const t=tab(p);if(!t.tabs.some(e=>e.id===p.beforeTabId))reject('TAB_NOT_FOUND','Drop target tab does not exist');const changed=reorderTabsByDrop(t.tabs,p.tabId,p.beforeTabId,!!p.after);t.right?renderRightTabs():renderTabs();saveTabState();return {changed};});
  register('view.layout',object({layout:{type:'string',enum:['details','cards','thumbnails','columns']},pane},['layout']),p=>{focus(p.pane);setLayout(p.layout);return {layout:G.layout};});
  register('view.previewMode',object({mode:{type:'string',enum:['contain','cover','width','actual']}},['mode']),p=>{setImagePreviewMode(p.mode);return {mode:p.mode};});
  register('panes.orientation',object({orientation:{type:'string',enum:['vertical','horizontal']}},['orientation']),p=>{setDualPaneOrientation(p.orientation);return {orientation:p.orientation};});
  register('settings.open',object({section:{type:'string'}}),p=>{openSettings();if(p.section)switchSettingsSection(p.section);return {opened:true};});
  register('settings.close',object(),()=>{closeSettings();return {closed:true};});
  register('updates.check',object(),()=>checkForUpdates(true),'external');
  register('tasks.list',object(),()=>[..._operationTasks.values()].map(t=>({id:t.id,title:t.title??'',status:t.status,percentage:t.percentage??null,error:t.error??''})),'read');
  const recycleIds={type:'array',items:{type:'string',pattern:'^[0-9a-f]{16}$'},maxItems:50000};
  register('recycle.open',object(),()=>openRecycleBin());
  register('recycle.close',object(),()=>closeRecycleBin());
  register('recycle.state',object(),()=>recycleViewState(),'read');
  register('recycle.refresh',object(),()=>recycleRefresh());
  register('recycle.list',object({offset:integer,limit:{type:'integer',minimum:1,maximum:2000}}),p=>{const items=recycleViewItems(),offset=p.offset??0;return {...recycleViewState(),matched:items.length,offset,items:items.slice(offset,offset+(p.limit??500))};},'read');
  register('recycle.filter',object({query:{type:'string',maxLength:8192}},['query']),p=>recycleSetQuery(p.query));
  register('recycle.sort',object({field:{type:'string',enum:['name','originalFolder','deletedAt','size','itemType']},descending:boolean},['field','descending']),p=>recycleSetSort(p.field,p.descending));
  register('recycle.select',object({ids:recycleIds,mode:{type:'string',enum:['replace','add','remove']}},['ids']),p=>recycleSetSelection(p.ids,p.mode));
  register('recycle.restore',object({keepBoth:boolean,all:boolean}),p=>recycleRestore(!!p.keepBoth,!!p.all),'write');
  register('recycle.deleteSelected',object(),()=>recycleDelete(false),'destructive','Delete selected recycled items through both confirmations; never accepts arbitrary filesystem paths');
  register('recycle.empty',object(),()=>recycleDelete(true),'destructive','Review and permanently delete the confirmed snapshot, never newly arriving items');
  register('recycle.copyPaths',object(),()=>recycleCopyPaths(),'write');
  register('recycle.openSystem',object(),()=>call('recycle_bin_open_system',{}),'external');
  register('tasks.cancel',object({taskId:string},['taskId']),async p=>{if(!_operationTasks.has(p.taskId))reject('TASK_NOT_FOUND','No such task');await cancelOperation(p.taskId);return {requested:true};});
  register('tasks.dismiss',object({taskId:string},['taskId']),p=>{if(!_operationTasks.has(p.taskId))reject('TASK_NOT_FOUND','No such task');dismissOperationTask(p.taskId);return {accepted:true};});
  for(const [id,handler]of Object.entries(ACTION_HANDLERS)){
    register('command.'+id,object({pane}),async p=>{focus(p.pane);await handler();return {accepted:true};},/delete/.test(id)?'destructive':/copy|cut|paste|rename|undo|redo/.test(id)?'write':'ui','The existing keyboard/UI command: '+id);
  }
})();
