// Desktop device-group locations are a filesystem, not mapped drives or URLs
// containing IP addresses/passwords. UI and scripts use these same handlers.
function isDevicePath(path){return RHFilesDevicePaths.is(path);}
const deviceBrowser=(()=>{
  const P=RHFilesDevicePaths,media=new Map();let peers=[],revision=0,readTicket=0;
  const text=(zh,en)=>String(_lang||'').startsWith('zh')?zh:en;
  const fs=(action,path,extra={})=>call('device_fs',{action,args:{path,...extra}});
  const name=(group,peer)=>peers.find(p=>p.group===group&&p.peer===peer)?.name||('RHFiles · '+peer.slice(0,8));
  function display(path){const p=P.parse(path);return name(p.group,p.peer)+(p.path==='/'?'':p.path);}
  function paint(){
    const host=document.getElementById('device-group-locations');if(!host)return;
    host.replaceChildren();
    for(const peer of peers){
      const button=document.createElement('button');button.type='button';button.className='sidebar-item';button.dataset.path=peer.path;button.dataset.apiAction='devices.open';button.title=peer.groupName+' · '+peer.name;
      button.style.cssText='width:100%;border:0;background:transparent;font:inherit;text-align:left;color:inherit;cursor:pointer';
      button.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="14" height="11" rx="2"/><path d="M10 14v5M6 19h8"/><rect x="17" y="9" width="5" height="12" rx="1.5"/></svg>';
      const label=document.createElement('span');label.textContent=peer.name;button.append(label);
      RHFilesUI.listen(button,'click',event=>window.RHFilesAPI.invoke('devices.open',{group:peer.group,peer:peer.peer,newTab:event.ctrlKey||event.metaKey}).catch(e=>showNotice(String(e))),undefined,'devices.open.'+peer.group+'.'+peer.peer);
      RHFilesUI.listen(button,'auxclick',event=>{if(event.button===1){event.preventDefault();window.RHFilesAPI.invoke('devices.open',{group:peer.group,peer:peer.peer,newTab:true}).catch(e=>showNotice(String(e)));}},undefined,'devices.open.newTab.'+peer.group+'.'+peer.peer);
      host.append(button);
    }
    if(!peers.length){const help=document.createElement('p');help.className='settings-card-description';help.style.cssText='padding:0 12px;font-size:11px';help.textContent=text('加入设备组后，已开启共享的设备会显示在这里。','Join a group to see devices offering file sharing.');host.append(help);}
    const heading=document.getElementById('device-group-heading');if(heading)heading.textContent=text('RHFiles 设备','RHFiles devices');
    const setup=document.getElementById('device-group-settings');if(setup)setup.textContent=text('管理设备组','Manage device groups');
    const refresh=document.getElementById('device-group-refresh');if(refresh)refresh.title=text('刷新设备列表（不发起网络探测）','Refresh devices (no network probing)');
  }
  async function refresh(){
    const ticket=++readTicket,state=await call('device_groups',{command:'state',args:{}});if(ticket!==readTicket)return {stale:true};
    const next=[];
    for(const group of state.groups||[])for(const peer of group.members||[])if(!peer.self&&!peer.blocked&&peer.server)next.push({group:group.id,groupName:group.name,peer:peer.id,name:peer.name,path:P.make(group.id,peer.id)});
    peers=next;revision++;media.clear();paint();
    if(typeof G!=='undefined')for(const tab of [...(G.tabs||[]),...(G.rpTabs||[])])if(P.is(tab.path)){
      const location=P.parse(tab.path);if(!peers.some(p=>p.group===location.group&&p.peer===location.peer)){
        tab._loaded=false;tab.entries=[];tab.sel?.clear();
        const right=G.rp===tab,active=right?G.dualOn:G.activeTab===tab.id;
        if(active&&typeof renderNavigationError==='function'){renderNavigationError(tab.path,'[authorization_revoked] '+text('设备已移除或未开放文件服务','Device removed or file sharing unavailable'),right);if(typeof updatePreviewForSelection==='function')updatePreviewForSelection(right);}
      }
    }
    if(typeof renderTabs==='function')renderTabs();return {devices:peers.map(v=>({...v}))};
  }
  async function source(path){
    path=P.parse(path).uri;const cached=media.get(path);if(cached&&performance.now()-cached.at<300000)return cached.url;
    const token=revision,result=await fs('resource',path);if(token!==revision)throw Error(text('设备组已改变，请重新选择文件','Device group changed; select the file again'));
    const url=new URL(result.url);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!/^\/device\/[A-Za-z0-9_-]{43}$/.test(url.pathname))throw Error('Invalid native media capability');
    if(media.size>=64)media.delete(media.keys().next().value);media.set(path,{url:result.url,at:performance.now()});return result.url;
  }
  function register(api){
    const string={type:'string',minLength:1,maxLength:27000},id={type:'string',pattern:'^[a-fA-F0-9]{64}$'},object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
    api.register('devices.list',()=>({devices:peers.map(v=>({...v}))}),{params:object(),risk:'read',description:'Locally known group file services; does not probe the network'});
    api.register('devices.refresh',refresh,{params:object(),risk:'read',description:'Reload locally accepted device-group services, without discovery traffic'});
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
  }
  return {register,refresh,paint,display,name,source,cachedSource:path=>media.get(P.parse(path).uri)?.url||'',fs};
})();
deviceBrowser.register(window.RHFilesAPI);
async function routeDeviceCommand(cmd,args){
  if(cmd==='device_fs')return null;
  const collect=value=>typeof value==='string'?(isDevicePath(value)?[value]:[]):Array.isArray(value)?value.flatMap(collect):value&&typeof value==='object'?Object.values(value).flatMap(collect):[];
  const paths=collect(args);if(!paths.length)return null;
  paths.forEach(path=>RHFilesDevicePaths.parse(path));
  // Metadata/clipboard/window state do not dereference a filesystem path.
  if(cmd.startsWith('db_')||['copy_file_path','save_window_state','open_new_window'].includes(cmd))return null;
  const fs=deviceBrowser.fs;let value;
  switch(cmd){
    case 'list_dir':value=await fs('list',args.path);break;
    case 'get_file_info':value=await fs('stat',args.path);break;
    case 'parent_path':value=RHFilesDevicePaths.parent(args.path);break;
    case 'path_exists':try{await fs('stat',args.path);value=true;}catch(error){if(!String(error).includes('[not_found]'))throw error;value=false;}break;
    case 'read_file_preview':value=await fs('preview',args.path);break;
    case 'search_recursive':value=await fs('search',args.path,{query:args.query});break;
    case 'get_thumbnail':value=await fs('thumbnail',args.path);break;
    case 'get_file_icon':value=null;break;
    case 'get_dir_tree':value=(await fs('list',args.path)).filter(v=>v.is_dir).map(v=>({...v,has_children:true}));break;
    case 'git_status':case 'svn_status':value={};break;
    case 'set_windows_file_clipboard':{
      await writeTextClipboard((args.paths||[]).join('\r\n'));value=Number((await call('get_windows_file_clipboard_info',{}))?.sequence)||0;break;
    }
    default:throw Error(String(_lang).startsWith('zh')?'[unsupported] 此操作尚不能用于 RHFiles 远端路径；不会传入 Windows 本地接口':'[unsupported] This action is unavailable for RHFiles remote paths; no local filesystem API was called');
  }
  return {value};
}
