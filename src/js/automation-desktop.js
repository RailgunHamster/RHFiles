/* Stable semantic commands over the same functions used by the desktop UI.
 * The complete live UI surface remains available through ui.list/ui.invoke. */
(() => {
  const api=window.RHFilesAPI,ErrorType=RHFilesAutomationCore.ActionError;
  api.provideRunLookup(query=>call('automation_receipt',{query}));
  api.provideRunTransport(()=>call('automation_receipt_transport',{}));
  const string={type:'string',minLength:1,maxLength:8192},boolean={type:'boolean'},integer={type:'integer',minimum:0};
  const pane={type:'string',enum:['active','left','right']};
  const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
  const register=(name,params,handler,risk='ui',description=name)=>api.register(name,handler,{params,risk,description});
  deviceGroupView.register(api,(command,args)=>call('device_groups',{command,args}));
  if(typeof desktopMediaViewer!=='undefined')desktopMediaViewer.register(api);
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
  const grants=object({write:boolean,delete:boolean});
  register('server.state',object(),()=>call('lan_service_state',{}),'read');
  register('server.webdavCompatibility',object(),()=>call('lan_service_webdav_compatibility',{}),'read','Read-only Windows WebClient status and TLS/group-authentication requirements; never imports certificates or changes service/security settings');
  register('server.webdavConfigure',object({enabled:boolean,confirmed:boolean,port:{type:'integer',minimum:1,maximum:65535}},['enabled']),p=>call('lan_service_webdav',{action:p.enabled?'enable':'disable',args:p}),'external','Enable trusted Tailscale HTTPS WebDAV on a separate private-interface port; confirmation acknowledges public certificate transparency. Existing pinned device service is unchanged.');
  register('server.webdavCredentials',object({group:string,peer:string},['group','peer']),p=>call('lan_service_webdav',{action:'credentials',args:p}),'destructive','Generate/rotate a WebDAV-only credential bound to a currently accepted group member. Password is returned once, never synchronized.');
  register('server.webdavRevoke',object({group:string,peer:string},['group','peer']),p=>call('lan_service_webdav',{action:'revoke',args:p}),'destructive');
  register('server.start',object({config:object({port:{type:'integer',minimum:0,maximum:65535},shares:{type:'array',minItems:1,maxItems:32,items:object({name:string,path:string},['name','path'])}},['port','shares'])},['config']),p=>call('lan_service_start',p),'external');
  register('server.stop',object(),()=>call('lan_service_stop',{}),'external');
  register('server.startup',object({autoStart:boolean,login:boolean},['autoStart','login']),p=>call('lan_service_startup',p),'external');
  register('server.localDrives',object(),()=>call('lan_service_drives',{}),'read');
  api.provideState('application',()=>({platform:IS_MAC?'macos':'windows',ready:G.startupReady===true,window:G.windowLabel,dualPane:!!G.dualOn,activePane:G.lastActivePane,tabs:G.tabs.map(t=>({id:t.id,path:t.path,pinned:!!t.pinned,loaded:t._loaded===true})),rightTabs:(G.rpTabs||[]).map(t=>({id:t.id,path:t.path,pinned:!!t.pinned,loaded:t._loaded===true}))}));
  register('navigation.open',object({path:string,pane},['path']),async p=>{const t=focus(p.pane);const ok=typeof RHFilesDevicePaths!=='undefined'&&RHFilesDevicePaths.isAddress(p.path)?await navigateAddressInput(p.path,t.right):await(t.right?rpNavigateTo(p.path):navigateTo(p.path));if(ok===false)reject('NAVIGATION_FAILED','The requested location could not be opened');return state(p.pane);});
  register('navigation.state',object({pane}),p=>state(p.pane),'read');
  register('preview.json.state',object(),()=>jsonPreviewState(),'read');
  register('preview.json.mode.set',object({mode:{type:'string',enum:['source','tree']}},['mode']),p=>setJsonPreviewMode(p.mode));
  register('files.list',object({pane,offset:integer,limit:{type:'integer',minimum:1,maximum:2000}}),p=>{const {state}=target(p.pane),entries=state.entries||[],offset=p.offset??0;return {path:state.path,total:entries.length,offset,entries:entries.slice(offset,offset+(p.limit??500)).map(e=>({name:e.name,path:e.path,isDirectory:!!e.is_dir,size:e.size??0,modified:e.modified??null}))};},'read');
  register('selection.set',object({paths,pane,mode:{type:'string',enum:['replace','add','remove']}},['paths']),p=>selection(p.paths,p.pane,p.mode));
  register('selection.clear',object({pane}),p=>selection([],p.pane));
  register('selection.get',object({pane}),p=>state(p.pane).selection,'read');
  register('files.copyPaths',object({paths:{...paths,minItems:1}},['paths']),async p=>{if(!await copyPathsFromMenu(p.paths))reject('COPY_PATHS_FAILED','No paths were copied; check local device records and name ambiguity');return {copied:p.paths.length};},'write','Copy path text through the same UI workflow: unique rh:// device addresses, original local/UNC paths, one path per line. Does not copy or mutate files.');
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
  register('favorites.list',object(),()=>getPinnedFolders().map(item=>({...item})),'read');
  register('favorites.rename',object({path:string,name:{type:'string',minLength:1,maxLength:1024}},['path','name']),p=>renameFavoriteFolder(p.path,p.name),'write');
  const sidebarGroup={type:'string',enum:SIDEBAR_GROUPS.map(([id])=>id)};
  register('sidebar.order.get',object(),()=>sidebarOrderState(),'read');
  register('sidebar.order.set',object({order:{type:'array',items:sidebarGroup,maxItems:SIDEBAR_GROUPS.length}},['order']),p=>setSidebarOrder(p.order),'write','Save whole sidebar groups in the supplied order; omitted groups are appended in default order. Duplicate and unknown IDs are rejected.');
  register('sidebar.groups.move',object({id:sidebarGroup,target:sidebarGroup,after:boolean},['id','target']),p=>moveSidebarGroup(p.id,p.target,!!p.after),'write','Move a complete group before/after another group, preserving its children and navigation state.');
  register('sidebar.order.reset',object(),()=>resetSidebarOrder(),'write');
  register('sidebar.customize',object(),()=>showSidebarOrderSettings());
  register('configSync.status',object(),()=>desktopConfigSync.refresh(),'read');
  register('configSync.save',object({enabled:boolean,url:{type:'string',maxLength:8192},username:{type:'string',maxLength:8192},password:{type:'string',maxLength:8192},clearPassword:boolean,insecure:boolean},['enabled','url','username','insecure']),p=>desktopConfigSync.save(p),'write');
  register('configSync.run',object(),()=>desktopConfigSync.run(true),'external');
  register('configSync.resolve',object({choice:{type:'string',enum:['local','remote']}},['choice']),p=>desktopConfigSync.resolve(p.choice),'write');
  register('updates.check',object(),()=>checkForUpdates(true),'external');
  register('updates.readiness',object(),()=>call('get_update_readiness',{automatic:true}),'read','Report active file/server work and the quiet period before automatic installation.');
  register('updates.history.state',object(),()=>releaseHistoryState(),'read');
  register('updates.history.page.set',object({page:{type:'integer',minimum:1,maximum:100000}},['page']),p=>setReleaseHistoryPage(p.page));
  register('updates.autoInstall.set',object({enabled:boolean},['enabled']),p=>{setAutoInstallUpdates(p.enabled);return {enabled:G.settings.autoInstallUpdates===true};},'write');
  register('vcs.info',object({pane}),p=>{const {state}=target(p.pane);return call('vcs_workspace_info',{path:state.path});},'read');
  register('vcs.openInVerso',object({path:string,page:{type:'string',enum:['files','changes','history','reservations','updates']},pane}),async p=>{const {state}=target(p.pane);await call('open_in_verso',{path:p.path||state.path,page:p.page||'files'});return {opened:true};},'external');
  register('vcs.gitPull',object({pane}),async p=>{const {state}=target(p.pane);const output=await call('git_pull',{path:state.path});await refresh();return {output};},'external');
  register('vcs.gitPush',object({pane}),async p=>{const {state}=target(p.pane);const output=await call('git_push',{path:state.path});return {output};},'external');
  register('vcs.gitCommit',object({message:string,targets:paths,pane},['message']),async p=>{const {state}=target(p.pane);const output=await call('git_commit',{path:state.path,message:p.message,targets:p.targets||[]});await refresh();return {output};},'write');
  register('vcs.gitLog',object({limit:{type:'integer',minimum:1,maximum:200},pane}),p=>{const {state}=target(p.pane);return call('git_log',{path:state.path,limit:p.limit??25});},'read');
  register('tasks.list',object(),()=>[..._operationTasks.values()].map(t=>({id:t.id,title:t.title??'',status:t.status,percentage:t.percentage??null,error:t.error??''})),'read');
  const recycleIds={type:'array',items:{type:'string',pattern:'^[0-9a-f]{16}$'},maxItems:50000};
  register('recycle.open',object({pane,newTab:boolean}),p=>{const t=focus(p.pane);return openRecycleBin(t.right,!!p.newTab);});
  register('recycle.close',object(),()=>closeRecycleBin());
  register('recycle.state',object(),()=>recycleViewState(),'read');
  register('recycle.refresh',object(),()=>recycleRefresh());
  register('recycle.list',object({offset:integer,limit:{type:'integer',minimum:1,maximum:2000}}),p=>{const items=recycleViewItems(),offset=p.offset??0;return {...recycleViewState(),matched:items.length,offset,items:items.slice(offset,offset+(p.limit??500))};},'read');
  register('recycle.filter',object({query:{type:'string',maxLength:8192}},['query']),p=>recycleSetQuery(p.query));
  register('recycle.sort',object({field:{type:'string',enum:['name','originalFolder','deletedAt','size','itemType']},descending:boolean},['field','descending']),p=>recycleSetSort(p.field,p.descending));
  register('recycle.select',object({ids:recycleIds,mode:{type:'string',enum:['replace','add','remove']}},['ids']),p=>recycleSetSelection(p.ids,p.mode));
  register('recycle.restore',object({keepBoth:boolean,all:boolean}),p=>recycleRestore(!!p.keepBoth,!!p.all),'write');
  register('recycle.deleteSelected',object(),()=>recycleDelete(false),'destructive','Delete selected recycled items through both confirmations; never accepts arbitrary filesystem paths');
  register('recycle.empty',object(),()=>recycleEmpty(),'destructive','Read a fresh Windows Recycle Bin snapshot from any location, then review both confirmations; never delete newly arriving items');
  register('recycle.copyPaths',object(),()=>recycleCopyPaths(),'write');
  register('recycle.openSystem',object(),()=>call('recycle_bin_open_system',{}),'external');
  register('tasks.cancel',object({taskId:string},['taskId']),async p=>{if(!_operationTasks.has(p.taskId))reject('TASK_NOT_FOUND','No such task');await cancelOperation(p.taskId);return {requested:true};});
  register('tasks.dismiss',object({taskId:string},['taskId']),p=>{if(!_operationTasks.has(p.taskId))reject('TASK_NOT_FOUND','No such task');dismissOperationTask(p.taskId);return {accepted:true};});
  for(const [id,handler]of Object.entries(ACTION_HANDLERS)){
    register('command.'+id,object({pane}),async p=>{focus(p.pane);await handler();return {accepted:true};},/delete/.test(id)?'destructive':/copy|cut|paste|rename|undo|redo/.test(id)?'write':'ui','The existing keyboard/UI command: '+id);
  }
  function bindSidebarShortcuts(){
    const recycle=document.getElementById('sidebar-recycle');
    if(recycle){
      RHFilesUI.listen(recycle,'click',event=>openRecycleBin(undefined,event.ctrlKey||event.metaKey),undefined,'desktop.sidebar.recycle.click');
      RHFilesUI.listen(recycle,'mousedown',event=>{if(event.button===1)event.preventDefault();},undefined,'desktop.sidebar.recycle.middle-press');
      RHFilesUI.listen(recycle,'auxclick',event=>{if(event.button===1){event.preventDefault();return openRecycleBin(undefined,true);}},undefined,'desktop.sidebar.recycle.middle');
    }
    const groups=document.getElementById('device-group-settings');
    if(groups)RHFilesUI.listen(groups,'click',()=>api.invoke('devices.settings').catch(error=>showNotice(String(error))),undefined,'desktop.sidebar.device-groups');
  }
  bindSidebarShortcuts();
})();
