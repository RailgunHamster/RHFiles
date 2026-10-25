/* Android pane registration is given private app functions, not DOM selectors.
 * Host/pane/native activities are separate scopes; no API is injected into books. */
const androidAutomation=(()=>{
  const ErrorType=RHFilesAutomationCore.ActionError,apiSchema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
  const string={type:'string',minLength:1,maxLength:8192},bool={type:'boolean'},integer={type:'integer',minimum:0},paths={type:'array',items:string,maxItems:1000};
  function install(app){
    const actions=window.RHFilesAPI,state=app.state;
    const register=(name,params,handler,risk='ui',description=name)=>actions.register(name,handler,{params,risk,description});
    deviceGroupView.register(actions,(command,args)=>api.native('groups.'+command,args),true);
    const reject=(code,message)=>{throw new ErrorType(code,message);};
    const entry=path=>{const value=state.entries.find(e=>e.path===path);if(!value)reject('ENTRY_NOT_FOUND','Path is outside the current listing');return value;};
    const snapshot=()=>({platform:'android',pane:workbench.id||'main',ready:app.ready(),route:{...state.route},busy:state.busy,root:state.root,selected:[...state.selected],entries:state.entries.length,error:state.navigationError??null,stale:!!state.staleError,refreshError:state.staleError??null});
    const available=()=>{if(!app.ready())reject('NOT_READY','File pane is starting');if(state.busy)reject('BUSY','File pane is loading a location');};
    const fresh=()=>{available();if(state.staleError)reject('STALE_LISTING','Refresh the listing successfully before modifying files');};
    actions.provideState('application',snapshot);
    register('qr.inspect',apiSchema({uri:string},['uri']),p=>api.native('qr.inspect',p),'read','Decode QR content metadata without opening URLs or joining a group');
    register('qr.scan',apiSchema(),async()=>{await api.native('qr.scan');await app.refreshLocations();return {closed:true};},'external','Open the standalone offline QR reader; group actions require local confirmation, other QR contents are copy-only');
    register('groups.scan',apiSchema(),()=>api.native('groups.scan'),'external','Scan a device-group invitation or join request; old independent pairing codes are rejected');
    register('connections.discover.start',apiSchema(),()=>api.native('lan.start',{protocol:'rhfiles'}),'external','Discover RHFiles computers using mDNS for eight seconds; results do not establish trust');
    register('connections.discover.state',apiSchema({id:string},['id']),p=>api.native('lan.state',p),'read');
    register('connections.discover.stop',apiSchema({id:string},['id']),p=>api.native('lan.stop',p));
    register('navigation.state',apiSchema(),snapshot,'read');
    register('navigation.open',apiSchema({path:string,label:{type:'string'}},['path']),async p=>{available();await app.go({screen:'folder',path:p.path,...(p.label?{label:p.label}:{})});if(state.navigationError)reject('NAVIGATION_FAILED',state.navigationError);return snapshot();});
    register('navigation.home',apiSchema(),async()=>{await app.go({screen:'home'});return snapshot();});
    register('navigation.back',apiSchema(),()=>({handled:app.back()}));
    register('navigation.refresh',apiSchema(),async()=>{await app.refresh();return snapshot();});
    register('navigation.category',apiSchema({category:{type:'string',enum:['image','video','audio','document','archive','apk','recent']},folder:string},['category']),async p=>{await app.go({screen:'library',category:p.category,...(p.folder?{folder:p.folder}:{})});return snapshot();});
    register('navigation.tool',apiSchema({tool:{type:'string',enum:['remote','providers','apps','tasks','trash','history','nearby','server','usage','settings']}},['tool']),async p=>{await app.go({screen:'tool',tool:p.tool});return snapshot();});
    register('files.list',apiSchema({offset:integer,limit:{type:'integer',minimum:1,maximum:2000}}),p=>{available();const offset=p.offset??0;return {route:{...state.route},total:state.entries.length,offset,entries:state.entries.slice(offset,offset+(p.limit??500)).map(e=>({name:e.name,path:e.path,kind:e.kind??null,isDirectory:!!e.isDir,size:e.size??0,modifiedMs:e.modifiedMs??null}))};},'read');
    register('selection.set',apiSchema({paths,mode:{type:'string',enum:['replace','add','remove']}},['paths']),p=>{available();p.paths.forEach(entry);const next=p.mode==='replace'||!p.mode?new Set():new Set(state.selected);for(const path of p.paths){if(entry(path).libraryAlbum)reject('INVALID_SELECTION','Category group headers are not file selections');p.mode==='remove'?next.delete(path):next.add(path);}state.selected=next;app.paintSelection();return snapshot();});
    register('selection.clear',apiSchema(),()=>{state.selected.clear();app.paintSelection();return snapshot();});
    register('selection.get',apiSchema(),()=>[...state.selected],'read');
    register('files.open',apiSchema({path:string},['path']),async p=>{available();await app.activate(entry(p.path));return {accepted:true};},'external');
    register('files.copy',apiSchema({paths},[]),p=>{const chosen=p.paths??[...state.selected];chosen.forEach(entry);if(!chosen.length)reject('INVALID_SELECTION','No files selected');app.setClipboard('copy',chosen);return {count:chosen.length};});
    register('files.cut',apiSchema({paths},[]),p=>{const chosen=p.paths??[...state.selected];chosen.forEach(entry);if(!chosen.length)reject('INVALID_SELECTION','No files selected');app.setClipboard('cut',chosen);return {count:chosen.length};});
    register('files.paste',apiSchema(),()=>{fresh();return app.paste();},'write');
    register('files.delete',apiSchema({paths}),p=>{fresh();const chosen=p.paths??[...state.selected];chosen.forEach(entry);if(!chosen.length)reject('INVALID_SELECTION','No files selected');return app.remove(chosen);},'destructive','Open the normal deletion confirmation. No confirmation bypass.');
    register('files.rename',apiSchema({path:string},['path']),p=>{fresh();return app.rename(entry(p.path));},'write','Open the existing rename form; fill it through ui.set');
    register('search.run',apiSchema({query:string,global:bool},['query']),async p=>{const path=app.currentDirectory()||state.root;await app.go({screen:'search',path,global:!!p.global});document.getElementById('search-input').value=p.query;await app.search(p.query);return snapshot();});
    register('settings.open',apiSchema({section:{type:'string'}}),async p=>{await app.go({screen:'tool',tool:'settings',...(p.section?{section:p.section}:{})});return snapshot();});
    if(!api.automationAvailable())return;
    register('automation.status',apiSchema(),()=>api.native('automation.status'),'read');
    // Native activity controls use their registered callbacks too. The native
    // bridge validates enablement, scope, current activity and confirmation.
    register('native.ui.list',apiSchema(),()=>api.native('automation.ui.list'),'read');
    register('native.ui.invoke',apiSchema({controlId:string,confirmationToken:string,acknowledge:bool,long:bool},['controlId']),p=>api.native('automation.ui.invoke',p));
    register('native.ui.set',apiSchema({controlId:string,value:{type:'string'},checked:bool,number:{type:'number'}},['controlId']),p=>api.native('automation.ui.set',p));
    register('native.ui.scroll',apiSchema({controlId:string,top:integer,left:integer},['controlId']),p=>api.native('automation.ui.scroll',p));
    register('native.back',apiSchema(),()=>api.native('automation.back'));
    register('native.media.control',apiSchema({command:{type:'string'},value:{type:'number'},enabled:bool},['command']),p=>api.native('automation.media.control',p));
    register('native.media.state',apiSchema(),()=>api.native('automation.media.state'),'read');
  }
  function host({frames,active,layout,setLayout}){
    const actions=window.RHFilesAPI;
    actions.forPane=(pane='active')=>{if(pane==='host')return actions;const index=pane==='active'?active():pane==='left'||pane==='first'?0:pane==='right'||pane==='second'?1:-1;if(index<0)throw new ErrorType('INVALID_PARAMS','Unknown pane');const api=frames()[index]?.contentWindow?.RHFilesAPI;if(!api)throw new ErrorType('PANE_UNAVAILABLE','This pane is not open/ready');return api;};
    actions.provideState('panes',()=>({active:active(),...layout(),count:frames().length}));
    actions.register('panes.layout',p=>{setLayout(p.mode);return layout();},{params:apiSchema({mode:{type:'string',enum:['auto','single','columns','rows']}},['mode']),description:'Set the same per-display/orientation layout as the divider menu'});
  }
  return {install,host};
})();
