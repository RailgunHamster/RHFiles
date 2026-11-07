// Desktop device-group locations are a filesystem, not mapped drives or URLs
// containing IP addresses/passwords. UI and scripts use these same handlers.
function isDevicePath(path){return RHFilesDevicePaths.is(path);}
function deviceDownloadOptions(){
  const settings=typeof G==='object'&&G.settings||{},streams=Number(settings.deviceDownloadParallelism),rate=Number(settings.deviceDownloadRateMiB);
  return {parallelism:Number.isInteger(streams)&&streams>=1&&streams<=4?streams:2,bytesPerSecond:Number.isFinite(rate)&&rate>=0&&rate<=1000?Math.round(rate*1048576):0};
}
function setDeviceDownloadSettings(value){
  const streams=Number(value.parallelism),rate=Number(value.rateMiB);
  if(!Number.isInteger(streams)||streams<1||streams>4||!Number.isFinite(rate)||rate<0||rate>1000)throw Error('Invalid download settings');
  G.settings.deviceDownloadParallelism=streams;G.settings.deviceDownloadRateMiB=rate;saveSettings();
  const streamInput=document.getElementById('settings-download-streams'),rateInput=document.getElementById('settings-download-rate');
  if(streamInput)streamInput.value=String(streams);if(rateInput)rateInput.value=String(rate);
  return {parallelism:streams,rateMiB:rate};
}
const deviceTransferHistories=new Map();
function rememberDeviceTransferHistory(src,dest,id){
  if(!id)return;deviceTransferHistories.set(JSON.stringify([src,dest]),id);
  while(deviceTransferHistories.size>100)deviceTransferHistories.delete(deviceTransferHistories.keys().next().value);
}
function takeDeviceTransferHistory(src,dest){const key=JSON.stringify([src,dest]),id=deviceTransferHistories.get(key);deviceTransferHistories.delete(key);return id;}
const deviceBrowser=(()=>{
  const P=RHFilesDevicePaths,media=new Map();let peers=[],revision=0,readTicket=0,discoverPromise=null;
  const text=(zh,en)=>String(_lang||'').startsWith('zh')?zh:en;
  const fs=(action,path,extra={})=>call('device_fs',{action,args:{path,...extra}});
  const name=(group,peer)=>peers.find(p=>p.group===group&&p.peer===peer)?.name||('RHFiles · '+peer.slice(0,8));
  function display(path){const p=P.parse(path);return name(p.group,p.peer)+(p.path==='/'?'':p.path);}
  const address=path=>P.addressFor(path,peers);
  function copyAddress(path){
    try{return P.addressFor(path,peers,{strict:true});}catch(error){
      if(error.code==='ambiguous_device')throw Error('[ambiguous_device] '+text('设备名和组名均重复，无法生成唯一短地址，未复制。请修改重名，或在“连接诊断”中复制稳定地址。','Both device and group names are duplicated; no unique short address was copied. Rename them or copy a stable address from Connection diagnostics.'));
      if(error.code==='device_not_found')throw Error('[device_not_found] '+text('此设备已移除或没有可用的文件服务记录，未复制。可在“连接诊断”中复制稳定地址。','This device was removed or has no accepted file-service record; nothing was copied. A stable address is available in Connection diagnostics.'));
      throw error;
    }
  }
  async function refreshForCopy(){
    const state=await refresh();
    if(state.stale)throw Error('[device_state_changed] '+text('设备记录正在变化，未复制。请重新执行复制路径。','Device records changed; nothing was copied. Copy the paths again.'));
    return state;
  }
  async function copyStableAddress(path){
    if(!P.is(path))throw Error(text('请先打开一个 RHFiles 设备文件夹，再复制当前路径的稳定地址。','Open an RHFiles device folder before copying its stable address.'));
    const address=P.parse(path).uri;
    if(!await writeTextClipboard(address))await call('copy_file_path',{path:address});
    if(typeof showNotice==='function')showNotice(text('已复制稳定地址','Stable address copied'));
    return {address};
  }
  const list=()=>peers.map(v=>({...v,address:address(v.path)}));
  async function resolve(value){
    await refresh(); // Reload local trust only; no probes, DNS or broadcasts.
    try{return P.resolveAddress(value,peers);}catch(error){
      if(error.code==='ambiguous_device')throw Error('[ambiguous_device] '+text('设备名重复，请使用 rh://组名@设备名/，或从左侧选择设备。','Duplicate device name. Use rh://group@device/ or select it in the sidebar.')+'\n'+error.candidates.map(p=>p.groupName+' · '+p.name+' ('+p.peer.slice(0,8)+')').join('\n'));
      if(error.code==='device_not_found')throw Error('[device_not_found] '+text('找不到此设备的文件服务。请检查设备名、设备组及对方是否已启动共享。','No accepted file service with this name. Check its name, group membership and file sharing.'));
      throw Error('[invalid_device_address] '+text('设备地址格式应为 rh://设备名/共享名/路径；重名时使用 rh://组名@设备名/。','Use rh://device/share/path, or rh://group@device/ for duplicate names.'));
    }
  }
  function suggest(query){
    const raw=String(query||'').trim().toLowerCase();
    return list().filter(p=>p.address.startsWith('rh://')&&p.address.toLowerCase().startsWith(raw)).slice(0,12).map(p=>({path:p.address,kind:'device'}));
  }
  async function setAlias(peerId,alias){
    const cleaned=typeof alias==='string'?alias.trim():'';
    await call('device_groups',{command:'setAlias',args:{peer:peerId,alias:cleaned}});
    await refresh();
    if(typeof desktopConfigSync!=='undefined'&&desktopConfigSync?.changed)desktopConfigSync.changed(300);
    return {peer:peerId,alias:cleaned};
  }
  function promptAlias(peer){
    if(typeof document?.createElement!=='function'||!document.body)return;
    document.getElementById('device-alias-dialog')?.remove();
    const rawName=peer.rawName||peer.name||'';
    const currentAlias=peer.alias||'';
    const overlay=document.createElement('div');overlay.id='device-alias-dialog';overlay.className='overlay app-confirm-overlay';overlay.tabIndex=-1;
    const backdrop=document.createElement('div');backdrop.className='dialog-backdrop';
    const box=document.createElement('div');box.className='dialog-box app-confirm-box';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
    const title=document.createElement('div');title.className='dialog-title';title.textContent=text('设置设备自定义名称','Set custom device name');
    const desc=document.createElement('p');desc.className='settings-card-description';desc.style.margin='6px 0 10px';
    desc.textContent=text('原机器名称：','Original machine name: ')+rawName+' · '+text('仅作显示描述，会随 WebDAV 配置同步到所有设备。留空恢复原机器名。','Display alias only; syncs across devices via WebDAV. Leave blank to restore original name.');
    const input=document.createElement('input');input.type='text';input.className='rename-input';input.maxLength=120;
    input.value=currentAlias;input.placeholder=rawName;input.style.cssText='width:100%;box-sizing:border-box;padding:7px 10px;margin-bottom:8px';
    const errEl=document.createElement('p');errEl.className='settings-card-description media-convert-error';errEl.style.margin='0 0 8px';errEl.hidden=true;
    const actions=document.createElement('div');actions.className='dialog-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.className='dialog-btn';cancel.textContent=typeof t==='function'?t('btn.cancel'):text('取消','Cancel');
    const clearBtn=document.createElement('button');clearBtn.type='button';clearBtn.className='dialog-btn';clearBtn.textContent=text('恢复原名','Restore original');clearBtn.hidden=!currentAlias;
    const save=document.createElement('button');save.type='button';save.className='dialog-btn primary';save.textContent=text('保存','Save');
    actions.append(cancel,clearBtn,save);
    box.append(title,desc,input,errEl,actions);overlay.append(backdrop,box);
    const close=()=>overlay.remove();
    const submit=async val=>{
      save.disabled=clearBtn.disabled=cancel.disabled=true;errEl.hidden=true;
      try{await setAlias(peer.peer||peer.id,val);close();}
      catch(e){errEl.textContent=String(e.message||e);errEl.hidden=false;save.disabled=clearBtn.disabled=cancel.disabled=false;}
    };
    RHFilesUI.listen(cancel,'click',close,undefined,'devices.alias.cancel');
    RHFilesUI.listen(backdrop,'click',close,undefined,'devices.alias.backdrop');
    RHFilesUI.listen(clearBtn,'click',()=>submit(''),undefined,'devices.alias.clear');
    RHFilesUI.listen(save,'click',()=>submit(input.value),undefined,'devices.alias.save');
    RHFilesUI.listen(input,'keydown',e=>{if(e.key==='Enter'){e.preventDefault();submit(input.value);}else if(e.key==='Escape'){e.preventDefault();close();}},undefined,'devices.alias.keydown');
    document.body.appendChild(overlay);
    requestAnimationFrame(()=>{input.focus();input.select();});
  }
  function showPeerContextMenu(e,peer){
    e.preventDefault();e.stopPropagation();
    if(typeof removeContextMenu!=='function'||typeof renderMenuItems!=='function'){promptAlias(peer);return;}
    removeContextMenu();
    const menu=document.createElement('div');menu.className='context-menu';menu.style.cssText='left:'+e.clientX+'px;top:'+e.clientY+'px;';
    const items=[
      {label:typeof t==='function'?t('sidebar.open'):text('打开','Open'),icon:'open',action:()=>window.RHFilesAPI.invoke('devices.open',{group:peer.group,peer:peer.peer}).catch(err=>showNotice(String(err)))},
      {label:typeof t==='function'?t('ctx.newTab'):text('在新标签页打开','Open in new tab'),icon:'tab',action:()=>window.RHFilesAPI.invoke('devices.open',{group:peer.group,peer:peer.peer,newTab:true}).catch(err=>showNotice(String(err)))},
      {label:'-',action:null},
      {label:text('设置自定义名称…','Set custom name…'),icon:'rename',action:()=>promptAlias(peer)},
    ];
    if(peer.alias){
      items.push({label:text('恢复原机器名（'+peer.rawName+'）','Restore original name ('+peer.rawName+')'),icon:'refresh',action:()=>setAlias(peer.peer,'').catch(err=>showNotice(String(err)))});
    }
    renderMenuItems(menu,items,e.clientX,e.clientY);
    document.body.appendChild(menu);
    if(typeof _ctxShow==='function')_ctxShow(menu);
    if(typeof clampMenuPosition==='function')requestAnimationFrame(()=>clampMenuPosition(menu,e.clientX,e.clientY));
  }
  function paint(){
    const host=document.getElementById('device-group-locations');if(!host)return;
    host.replaceChildren();
    for(const peer of peers){
      const button=document.createElement('button');button.type='button';button.className='sidebar-item';button.dataset.path=peer.path;button.dataset.apiAction='devices.open';
      const titleName=peer.alias?peer.name+' ('+peer.rawName+')':peer.name;
      button.title=peer.groupName+' · '+titleName+'\n'+address(peer.path);
      button.style.cssText='width:100%;border:0;background:transparent;font:inherit;text-align:left;color:inherit;cursor:pointer';
      button.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="14" height="11" rx="2"/><path d="M10 14v5M6 19h8"/><rect x="17" y="9" width="5" height="12" rx="1.5"/></svg>';
      const label=document.createElement('span');label.textContent=peer.name;button.append(label);
      RHFilesUI.listen(button,'click',event=>window.RHFilesAPI.invoke('devices.open',{group:peer.group,peer:peer.peer,newTab:event.ctrlKey||event.metaKey}).catch(e=>showNotice(String(e))),undefined,'devices.open.'+peer.group+'.'+peer.peer);
      RHFilesUI.listen(button,'auxclick',event=>{if(event.button===1){event.preventDefault();window.RHFilesAPI.invoke('devices.open',{group:peer.group,peer:peer.peer,newTab:true}).catch(e=>showNotice(String(e)));}},undefined,'devices.open.newTab.'+peer.group+'.'+peer.peer);
      RHFilesUI.listen(button,'contextmenu',event=>showPeerContextMenu(event,peer),undefined,'devices.contextmenu.'+peer.group+'.'+peer.peer);
      host.append(button);
    }
    if(!peers.length){const help=document.createElement('p');help.className='settings-card-description';help.style.cssText='padding:0 12px;font-size:11px';help.textContent=text('加入设备组后，已开启共享的设备会显示在这里。','Join a group to see devices offering file sharing.');host.append(help);}
    const heading=document.getElementById('device-group-heading');if(heading)heading.textContent=text('RHFiles 设备','RHFiles devices');
    const setup=document.querySelector('#device-group-settings > span');if(setup)setup.textContent=text('管理设备组','Manage device groups');
    const refresh=document.getElementById('device-group-refresh');if(refresh){refresh.title=text('连接已知组成员并刷新设备（最多 30 秒）','Connect to known group members and refresh devices (up to 30 seconds)');refresh.setAttribute('aria-label',text('刷新 RHFiles 设备','Refresh RHFiles devices'));}
    const copies=document.querySelector('#device-working-copies > span');if(copies)copies.textContent=text('缓存与工作副本','Cache & working copies');
    if(document.getElementById('home-page')?.style.display!=='none'&&typeof renderHomeDevices==='function')renderHomeDevices();
  }
  async function refresh(){
    const ticket=++readTicket,state=await call('device_groups',{command:'state',args:{}});if(ticket!==readTicket)return {stale:true};
    const aliases=state.deviceAliases&&typeof state.deviceAliases==='object'?state.deviceAliases:{};
    const next=[];
    for(const group of state.groups||[])for(const peer of group.members||[])if(!peer.self&&!peer.blocked&&peer.server){
      const alias=typeof aliases[peer.id]==='string'?aliases[peer.id].trim():'';
      const entry={group:group.id,groupName:group.name,peer:peer.id,name:alias||peer.name,path:P.make(group.id,peer.id)};
      if(alias){entry.alias=alias;entry.rawName=peer.name;}
      next.push(entry);
    }
    peers=next;revision++;media.clear();paint();
    if(typeof G!=='undefined')for(const tab of [...(G.tabs||[]),...(G.rpTabs||[])])if(P.is(tab.path)){
      const location=P.parse(tab.path);if(!peers.some(p=>p.group===location.group&&p.peer===location.peer)){
        tab._loaded=false;tab.entries=[];tab.sel?.clear();
        const right=G.rp===tab,active=right?G.dualOn:G.activeTab===tab.id;
        if(active&&typeof renderNavigationError==='function'){renderNavigationError(tab.path,'[authorization_revoked] '+text('设备已移除或未开放文件服务','Device removed or file sharing unavailable'),right);if(typeof updatePreviewForSelection==='function')updatePreviewForSelection(right);}
      }
    }
    if(typeof renderTabs==='function')renderTabs();if(typeof renderPinnedFolders==='function')renderPinnedFolders();return {devices:list()};
  }
  function discover(){
    if(discoverPromise)return discoverPromise;
    const button=document.getElementById('device-group-refresh'),status=document.getElementById('device-group-refresh-status');
    const say=message=>{if(status){status.hidden=false;status.textContent=message;}};
    if(button){button.disabled=true;button.setAttribute('aria-busy','true');}
    say(text('正在交换设备服务记录，最多 30 秒…','Exchanging device service records; up to 30 seconds…'));
    discoverPromise=(async()=>{
      try{const result=await call('device_groups',{command:'refresh',args:{}});await refresh();say(deviceGroupView.refreshSummary(result,String(_lang||'').startsWith('zh')));return result;}
      catch(error){await refresh().catch(()=>{});say(text('刷新失败：','Refresh failed: ')+String(error.message||error));throw error;}
      finally{if(button){button.disabled=false;button.setAttribute('aria-busy','false');}discoverPromise=null;}
    })();
    return discoverPromise;
  }
  async function source(path){
    path=P.parse(path).uri;const cached=media.get(path);if(cached&&performance.now()-cached.at<300000)return cached.url;
    const token=revision,result=await fs('resource',path);if(token!==revision)throw Error(text('设备组已改变，请重新选择文件','Device group changed; select the file again'));
    const url=new URL(result.url);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!/^\/device\/[A-Za-z0-9_-]{43}$/.test(url.pathname))throw Error('Invalid native media capability');
    if(media.size>=64)media.delete(media.keys().next().value);media.set(path,{url:result.url,at:performance.now()});return result.url;
  }
  function register(api){
    const string={type:'string',minLength:1,maxLength:27000},id={type:'string',pattern:'^[a-fA-F0-9]{64}$'},object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
    api.register('devices.list',()=>({devices:list()}),{params:object(),risk:'read',description:'Locally known group file services and readable rh:// addresses; does not probe the network'});
    api.register('devices.setAlias',p=>setAlias(p.peer.toLowerCase(),p.alias||''),{params:object({peer:id,alias:{type:'string',maxLength:120}},['peer']),risk:'settings',description:'Set or clear a synced custom display alias for a peer device'});
    api.register('devices.refresh',refresh,{params:object(),risk:'read',description:'Reload locally accepted device-group services, without discovery traffic'});
    api.register('devices.discover',discover,{params:object(),risk:'external',description:'Explicit signed service-record exchange with known trusted group members; at most 30 seconds / 32 members, no polling or permission changes'});
    api.register('devices.resolve',p=>resolve(p.address),{params:object({address:string},['address']),risk:'read',description:'Resolve rh://[group@]device/share/path from local trust, rejecting ambiguous names without network probes'});
    api.register('devices.address',async p=>{if(p.format==='stable')return {address:P.parse(p.path).uri};await refreshForCopy();return {address:copyAddress(p.path)};},{params:object({path:string,format:{type:'string',enum:['readable','stable']}},['path']),risk:'read',description:'Format a device identity path as a unique rh:// address (default) or an explicit stable diagnostic URI. Reads local trust only; never probes the network.'});
    api.register('devices.copyStableAddress',p=>copyStableAddress(p.path),{params:object({path:string},['path']),risk:'write',description:'Explicitly copy an identity URI for diagnostics, without resolving a name or granting access.'});
    api.register('devices.settings',()=>{openSettings();switchSettingsSection('lan');return {opened:true};},{params:object(),risk:'ui'});
    api.register('devices.open',async p=>{
      const path=P.make(p.group,p.peer,p.path||'/');
      closeSettings();
      if(p.newTab)await api.invoke('tabs.new',{path,pane:p.pane||'active'});
      await api.invoke('navigation.open',{path,pane:p.pane||'active'});return {path};
    },{params:object({group:id,peer:id,path:{type:'string',maxLength:8192},newTab:{type:'boolean'},pane:{type:'string',enum:['active','left','right']}},['group','peer']),risk:'ui',description:'Browse an accepted group member in a regular file tab; connection recovery is lazy'});
    for(const [action,native]of [['entries','list'],['stat','stat'],['capabilities','capabilities'],['preview','preview'],['thumbnail','thumbnail']])api.register('devices.'+action,p=>fs(native,P.parse(p.path).uri),{params:object({path:string},['path']),risk:'read'});
    api.register('devices.search',p=>fs('search',P.parse(p.path).uri,{query:p.query}),{params:object({path:string,query:{type:'string',minLength:1,maxLength:512}},['path','query']),risk:'read',description:'Explicit recursive search; 15 seconds, 500 folders and 500 results maximum; no background continuation'});
    api.register('devices.resource',async p=>({url:await source(p.path)}),{params:object({path:string},['path']),risk:'read',description:'Revocable loopback-only media capability; never a remote password or bearer token'});
    api.register('devices.workingCopies',()=>call('device_transfer',{action:'working_copies',args:{}}),{params:object(),risk:'read',description:'List retained local working copies without probing any remote server'});
    api.register('devices.workingCopies.show',showWorkingCopies,{params:object(),risk:'ui'});
    api.register('devices.dragCache',()=>call('native_drag_cache_list',{}),{params:object(),risk:'read',description:'List retained local external-drag caches; never deletes files when recipients may still use them.'});
    api.register('devices.dragCache.reveal',async()=>{const cache=await call('native_drag_cache_list',{});await call('open_in_windows_explorer',{path:cache.directory,isDirectory:true});return {opened:true};},{params:object(),risk:'ui',description:'Reveal the retained cache folder selected natively, never a caller-supplied path.'});
    for(const [name,action]of [['undoTransfer','undo_transfer'],['redoTransfer','redo_transfer']])api.register('devices.'+name,p=>call('device_transfer',{action,args:p}),{params:object({id:string,operationId:string},['id']),risk:'destructive',description:'Undo/redo an unoverwritten transfer using its native session history handle and original object revisions; never restarts an old write by pathname.'});
    api.register('devices.checkout',p=>call('device_transfer',{action:'checkout',args:p}),{params:object({path:string,operationId:string},['path']),risk:'write',description:'Create a persistent working copy without launching a local application; use workingCopies.save to commit against the original revision'});
    api.register('devices.windowsPath',p=>call('device_transfer',{action:'windows_path',args:p}),{params:object({path:string},['path']),risk:'write',description:'Establish an owner-authorized, group-bound trusted HTTPS Windows filesystem connection. Credentials remain native and are never synchronized or returned.'});
    api.register('devices.windowsDisconnect',p=>call('device_transfer',{action:'windows_disconnect',args:p}),{params:object({path:string,confirmed:{const:true}},['path','confirmed']),risk:'destructive',description:'Disconnect only this profile’s Windows WebDAV connection after verifying its username. Never forces closure of open files or disconnects another account.'});
    api.register('devices.openFile',p=>call('device_transfer',{action:'open',args:p}),{params:object({path:string,command:{type:'string',enum:['open_file','open_with_program','show_open_with_dialog','quicklook']},program:string},['path']),risk:'write',description:'Download a managed working copy and open it locally. Changed copies are retained until an explicit revision-checked save.'});
    for(const [id,action,properties]of [['save','working_save',{id:string,newName:string}],['reveal','working_reveal',{id:string}],['remove','working_remove',{id:string}]])api.register('devices.workingCopies.'+id,p=>call('device_transfer',{action,args:p}),{params:object(properties,['id']),risk:id==='reveal'?'ui':'destructive'});
    api.register('devices.downloadSettings.get',()=>{const value=deviceDownloadOptions();return {parallelism:value.parallelism,rateMiB:value.bytesPerSecond/1048576};},{params:object({}),risk:'read',description:'Read the current local download concurrency and per-file MiB/s limit.'});
    api.register('devices.downloadSettings',p=>setDeviceDownloadSettings(p),{params:object({parallelism:{type:'integer',minimum:1,maximum:4},rateMiB:{type:'number',minimum:0,maximum:1000}},['parallelism','rateMiB']),risk:'settings',description:'Configure bounded versioned-range download concurrency and per-file MiB/s limit; zero is unlimited.'});
    api.register('devices.transfer',p=>call('device_transfer',{action:p.operation,args:{downloadOptions:deviceDownloadOptions(),...p}}),{params:object({operation:{type:'string',enum:['copy','move']},src:string,dest:string,targetName:{type:'string',maxLength:240},overwrite:{type:'boolean'},expectedTargetRevision:{type:'string',maxLength:256},operationId:{type:'string',maxLength:128},downloadOptions:object({parallelism:{type:'integer',minimum:1,maximum:4},bytesPerSecond:{type:'integer',minimum:0,maximum:10000000000}},['parallelism','bytesPerSecond'])},['operation','src','dest']),risk:'destructive',description:'Stream files/folders between local and group locations with native progress, scoped cancellation, bounded version-bound downloads, no write retries and identity-checked move cleanup. Unoverwritten transfers return an identity-bound history handle when the server supplies commit proofs.'});
    for(const [id,action,properties,required,risk] of [
      ['rename','rename',{path:string,newName:string,expectedSourceRevision:string},['path','newName'],'write'],
      ['inspectRename','inspect_rename',{path:string,newName:string},['path','newName'],'read'],
      ['newFolder','new_folder',{parent:string},['parent'],'write'],
      ['create','create',{parent:string,name:string,template:{type:'string',maxLength:64}},['parent','name'],'write'],
      ['delete','delete',{paths:{type:'array',items:string,minItems:1,maxItems:10000},permanent:{type:'boolean'},operationId:string,revisions:{type:'object',additionalProperties:string}},['paths'],'destructive'],
      ['size','size',{path:string,operationId:string},['path'],'read'],
      ['hash','hash',{path:string,algo:{type:'string',enum:['md5','sha256']},operationId:string},['path','algo'],'read'],
      ['batchRename','batch_rename',{renames:{type:'array',minItems:1,maxItems:10000,items:{type:'array',items:string,minItems:2,maxItems:2}},revisions:{type:'object',additionalProperties:string},operationId:string},['renames'],'write'],
    ])api.register('devices.'+id,p=>call('device_transfer',{action,args:p}),{params:object(properties,required),risk,description:'Identity-bound remote filesystem operation; never forwards a device URI to the local shell.'});
  }
  async function showWorkingCopies(){
    document.getElementById('device-working-dialog')?.remove();
    const overlay=document.createElement('div');overlay.id='device-working-dialog';overlay.className='overlay';
    const box=document.createElement('div');box.className='dialog-box dialog-wide';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
    const heading=document.createElement('div');heading.className='dialog-title';heading.textContent=text('远端工作副本','Remote working copies');
    const detail=document.createElement('p');detail.className='settings-card-description';detail.textContent=text('本机程序的修改保留在这里。保存回服务器前会检查原文件版本，不会覆盖其他设备的新修改。','Local edits are retained here. Saving checks the original server revision and never overwrites another device’s changes.');
    const list=document.createElement('div');list.className='dialog-scroll';
    const actions=document.createElement('div');actions.className='dialog-actions';
    const close=document.createElement('button');close.className='dialog-btn';close.textContent=text('关闭','Close');RHFilesUI.listen(close,'click',()=>overlay.remove(),undefined,'devices.workingCopies.close');actions.append(close);
    box.append(heading,detail,list,actions);overlay.append(box);document.body.append(overlay);
    const paint=async()=>{
      const result=await window.RHFilesAPI.invoke('devices.workingCopies');list.replaceChildren();
      const cache=await window.RHFilesAPI.invoke('devices.dragCache');
      if(cache.items.length){const note=document.createElement('p');note.className='settings-card-description';note.textContent=text('外拖缓存：为其他应用准备的副本会保留，不随拖拽结束删除。确认接收应用已用完后，可从本地位置手动清理；这些副本不会自动写回服务器。','External-drag cache: copies remain after dropping, for asynchronous recipients. Clean up from the local folder only when the recipient has finished. These copies never upload edits automatically.');const show=document.createElement('button');show.className='dialog-btn';show.textContent=text('打开缓存位置','Open cache location');RHFilesUI.listen(show,'click',()=>window.RHFilesAPI.invoke('devices.dragCache.reveal'),undefined,'devices.dragCache.reveal');list.append(note,show);}
      if(!result.items.length){const empty=document.createElement('p');empty.textContent=text('暂无可编辑工作副本','No editable working copies');list.append(empty);return;}
      for(const row of result.items){
        const card=document.createElement('section');card.className='settings-card';card.dataset.workingCopyId=row.id;
        const title=document.createElement('strong');title.textContent=row.name+' · '+(row.status==='modified'?text('有本地修改','Local changes'):row.status==='missing'?text('本地文件已移走','Local file missing'):text('未修改','Unchanged'));
        const path=document.createElement('p');path.className='settings-card-description';path.textContent=display(row.source);path.style.overflowWrap='anywhere';
        const controls=document.createElement('div');controls.className='dialog-actions';const error=document.createElement('p');error.className='settings-card-description';error.setAttribute('role','status');
        const nameInput=document.createElement('input');nameInput.type='text';nameInput.className='rename-input';nameInput.hidden=true;nameInput.value=row.name;nameInput.setAttribute('aria-label',text('另存为文件名（不会覆盖同名文件）','Save as filename (existing files are never overwritten)'));
        for(const [id,label]of [['save',text('保存回服务器','Save to server')],['saveAs',text('另存为','Save as')],['reveal',text('本地位置','Local location')],['remove',text('清理副本','Remove copy')]]){
          const button=document.createElement('button');button.className='dialog-btn'+(id==='save'?' primary':'');button.textContent=label;button.dataset.apiAction='devices.workingCopies.'+(id==='saveAs'?'save':id);button.disabled=id==='remove'&&row.status==='modified'||id==='save'&&row.status!=='modified';
          RHFilesUI.listen(button,'click',async()=>{try{let newName;if(id==='saveAs'){if(nameInput.hidden){nameInput.hidden=false;nameInput.focus();nameInput.select();return;}newName=nameInput.value.trim();if(!newName)return;}button.disabled=true;await window.RHFilesAPI.invoke('devices.workingCopies.'+(id==='saveAs'?'save':id),{id:row.id,...(newName?{newName}:{})});if(id!=='reveal')await paint();else button.disabled=false;}catch(e){error.textContent=String(e);button.disabled=false;}},undefined,'devices.workingCopies.'+id+'.'+row.id);controls.append(button);
        }
        card.append(title,path,nameInput,controls,error);list.append(card);
      }
    };try{await paint();}catch(e){list.textContent=String(e);}return {opened:true};
  }
  return {register,refresh,refreshForCopy,paint,display,name,address,copyAddress,resolve,suggest,source,cachedSource:path=>media.get(P.parse(path).uri)?.url||'',fs,setAlias,promptAlias,showPeerContextMenu};
})();
deviceBrowser.register(window.RHFilesAPI);
async function routeDeviceCommand(cmd,args){
  if(cmd==='device_fs'||cmd==='device_transfer'||cmd.startsWith('native_drag_'))return null;
  // These values are text/state, not filesystem input. In particular, a
  // multi-path text clipboard is not one malformed device URI.
  if(cmd.startsWith('db_')||cmd.startsWith('config_sync_')||['copy_file_path','save_window_state','open_new_window'].includes(cmd))return null;
  const collect=value=>typeof value==='string'?(isDevicePath(value)?[value]:[]):Array.isArray(value)?value.flatMap(collect):value&&typeof value==='object'?Object.values(value).flatMap(collect):[];
  const paths=collect(args);if(!paths.length)return null;
  paths.forEach(path=>RHFilesDevicePaths.parse(path));
  // Metadata/clipboard/window state do not dereference a filesystem path.
  const fs=deviceBrowser.fs;let value;
  switch(cmd){
    case 'list_dir':value=await fs('list',args.path);break;
    case 'get_file_info':value=await fs('stat',args.path);break;
    case 'parent_path':value=RHFilesDevicePaths.parent(args.path);break;
    case 'path_exists':try{await fs('stat',args.path);value=true;}catch(error){if(!String(error).includes('[not_found]'))throw error;value=false;}break;
    case 'inspect_rename_target':value=await call('device_transfer',{action:'inspect_rename',args});break;
    case 'rename_file':value=await call('device_transfer',{action:'rename',args});break;
    case 'batch_rename':value=await call('device_transfer',{action:'batch_rename',args});break;
    case 'move_paths_exact':value=await call('device_transfer',{action:'batch_move_exact',args});break;
    case 'new_folder':value=await call('device_transfer',{action:'new_folder',args});break;
    case 'create_new_file':value=await call('device_transfer',{action:'create',args});break;
    case 'ensure_merge_folder':value=await call('device_transfer',{action:'ensure_folder',args:{parent:RHFilesDevicePaths.parent(args.path),name:RHFilesDevicePaths.parse(args.path).parts.at(-1)}});break;
    case 'delete_file':case 'delete_files':case 'delete_files_permanently':{
      const selected=cmd==='delete_file'?[args.path]:args.paths,remote=selected.filter(isDevicePath),local=selected.filter(p=>!isDevicePath(p));
      value=await call('device_transfer',{action:'delete',args:{...args,paths:remote,permanent:cmd==='delete_files_permanently'}});
      if(local.length&&!value.cancelled){const other=await call(cmd==='delete_file'?'delete_files':cmd,{...args,paths:local});value={...value,deleted:[...(value.deleted||[]),...(other.deleted||[])],errors:[...(value.errors||[]),...(other.errors||[])],cancelled:!!other.cancelled};}
      break;
    }
    case 'folder_size':value=await call('device_transfer',{action:'size',args});break;
    case 'compute_hash':value=await call('device_transfer',{action:'hash',args:{downloadOptions:deviceDownloadOptions(),...args}});break;
    case 'analyze_disk_usage':value=await call('device_transfer',{action:'usage',args});break;
    case 'show_properties':showCustomProperties(await fs('stat',args.path));value=null;break;
    case 'open_file':case 'open_with_program':case 'show_open_with_dialog':case 'quicklook':case 'set_wallpaper':case 'install_font':case 'install_certificate':case 'run_as_admin':{
      const id=showProgress(String(_lang).startsWith('zh')?'正在打开远端文件':'Opening remote file',{cancellable:true,currentPath:args.path});
      try{
        let live,bridgeError;
        if(!IS_MAC)try{live=await call('device_transfer',{action:'windows_path',args:{path:args.path}});}catch(error){bridgeError=error;if(!/\[compatibility_unavailable\]|\[compatibility_permission_required\]|\[windows_component_missing\]/.test(String(error)))throw error;}
        if(!live&&bridgeError&&(cmd==='open_with_program'&&['cmd','powershell','git_bash','wt','terminal','iterm','vlc_folder'].includes(args.program)||(await fs('stat',args.path)).is_dir))throw bridgeError;
        if(live)value=await call(cmd,{...args,path:live.path});else value=await call('device_transfer',{action:'open',args:{...args,command:cmd,operationId:id}});
        completeOperationTask(id);
      }catch(error){failOperationTask(id,error);throw error;}break;
    }
    case 'rtf_to_html':case 'docx_to_text':case 'read_shortcut':case 'rotate_image':value=await call('device_transfer',{action:'document',args:{...args,command:cmd}});break;
    case 'copy_path':case 'move_path_cmd':case 'copy_with_progress':case 'move_with_progress':
      value=await call('device_transfer',{action:cmd.startsWith('move')?'move':'copy',args:{downloadOptions:deviceDownloadOptions(),...args}});rememberDeviceTransferHistory(args.src,value?.target,value?.historyId);break;
    case 'copy_path_exact':case 'move_path_exact':
      value=await call('device_transfer',{action:cmd.startsWith('move')?'move_exact':'copy_exact',args:{downloadOptions:deviceDownloadOptions(),...args}});rememberDeviceTransferHistory(args.src,value?.target,value?.historyId);break;
    case 'plan_folder_merge':value=await call('device_transfer',{action:'plan_merge',args});break;
    case 'remove_empty_merge_folders':value=await call('device_transfer',{action:'remove_empty',args});break;
    case 'read_file_preview':value=await fs('preview',args.path);break;
    case 'search_recursive':value=await fs('search',args.path,{query:args.query});break;
    case 'get_thumbnail':value=await fs('thumbnail',args.path);break;
    case 'get_file_icon':value=null;break;
    case 'get_dir_tree':value=(await fs('list',args.path)).filter(v=>v.is_dir).map(v=>({...v,has_children:true}));break;
    case 'git_status':case 'svn_status':value={};break;
    case 'set_windows_file_clipboard':{
      if(typeof IS_MAC!=='undefined'&&!IS_MAC){
        try{const mapped=[];for(const path of args.paths||[])mapped.push(isDevicePath(path)?(await call('device_transfer',{action:'windows_path',args:{path}})).path:path);value=await call(cmd,{...args,paths:mapped});break;}
        catch(error){console.warn('Windows clipboard compatibility unavailable; using RHFiles file references',error);}
      }
      const text=(args.paths||[]).join('\r\n');if(!await writeTextClipboard(text))await call('copy_file_path',{path:text});value=Number((await call('get_windows_file_clipboard_info',{}))?.sequence)||0;break;
    }
    default:{const extended=typeof routeDeviceExtendedCommand==='function'?await routeDeviceExtendedCommand(cmd,args):null;if(extended)return extended;throw Error(String(_lang).startsWith('zh')?'[remote_context_required] 此操作需要本机系统环境，不能把远端地址当成本机路径执行。请使用文件操作，或配置该设备的 WebDAV 兼容接入。':'[remote_context_required] This action requires an OS filesystem context. Use file operations or configure this device’s WebDAV compatibility connection.');}
  }
  return {value};
}
