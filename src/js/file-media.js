// Filesystem viewing preferences and one opening path for clicks, Enter and API.
const desktopMediaViewer=(()=>{
  const image=new Set('png jpg jpeg webp gif bmp ico tif tiff avif svg'.split(' ')),video=new Set('mp4 mkv mov avi webm m4v wmv flv mpeg mpg ts mts m2ts 3gp ogv'.split(' '));
  const kind=file=>{if(!file||file.is_dir)return null;const ext=String(file.extension||file.name?.split('.').pop()||file.path?.split('.').pop()||'').toLowerCase();return image.has(ext)?'image':video.has(ext)?'video':null;};
  const get=()=>({imageOpenWith:G.settings.imageOpenWith==='system'?'system':'rhfiles',videoOpenWith:G.settings.videoOpenWith==='system'?'system':'rhfiles',imageBrowseMode:G.settings.imageBrowseMode==='continuous'?'continuous':'paged'});
  function set(value){const allowed={imageOpenWith:['system','rhfiles'],videoOpenWith:['system','rhfiles'],imageBrowseMode:['paged','continuous']};for(const [key,values]of Object.entries(allowed))if(value[key]!==undefined&&!values.includes(value[key]))throw Error('Invalid media preference');for(const key of Object.keys(allowed))if(value[key]!==undefined){G.settings[key]=value[key];const input=document.getElementById('settings-'+key);if(input){input.value=value[key];for(const button of input.querySelectorAll('[data-media-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mediaMode===value[key]));}}saveSettings();return get();}
  async function open(path,file,isRight,force=false){
    if(!/Win/i.test(navigator.platform))return false;
    if(!/^(?:[A-Za-z]:[\\/]|\\\\|rhfiles-device:\/\/)/.test(path))return false;
    const pane=isRight?G.rp:getTab(),entries=pane?.entries||[];
    file=file||entries.find(e=>e.path===path)||{path,name:path.split(/[\\/]/).pop()};const type=kind(file);if(!type||!force&&get()[type+'OpenWith']==='system')return false;
    let queue=entries.filter(e=>kind(e)===type&&!e.archive_entry).slice(0,5000);if(!queue.some(e=>e.path===path))queue=[file];
    const unique=[...new Map(queue.map(e=>[e.path,{path:e.path,name:e.name||e.path.split(/[\\/]/).pop()}])).values()];
    await call('file_viewer_request',{action:'open',args:{entries:unique,index:unique.findIndex(e=>e.path===path),mode:get().imageBrowseMode,language:typeof _lang==='string'?_lang:G.settings.language}});return true;
  }
  function settingsHtml(){const zh=G.settings.language==='zh',label=(cn,en)=>zh?cn:en,p=get();return '<div class="settings-card"><div class="settings-card-title">'+label('图片与视频查看器','Image and video viewers')+'</div>'+[['imageOpenWith',label('打开图片','Open images'),[['rhfiles',label('RHFiles 图片查看器','RHFiles image viewer')],['system',label('Windows 默认应用','Windows default app')]]],['videoOpenWith',label('打开视频','Open videos'),[['rhfiles',label('RHFiles 内置播放器','RHFiles built-in player')],['system',label('Windows 默认应用','Windows default app')]]],['imageBrowseMode',label('图片浏览模式','Image browsing'),[['paged',label('逐张翻页','Paged')],['continuous',label('连续滚动','Continuous scrolling')]]]].map(([key,title,choices])=>'<div class="settings-row"><label for="settings-'+key+'">'+title+'</label>'+(key==='imageBrowseMode'?'<div id="settings-'+key+'" class="media-mode-switch" role="group" aria-label="'+title+'">'+choices.map(([value,text])=>'<button type="button" data-media-mode="'+value+'" aria-pressed="'+(p[key]===value)+'">'+text+'</button>').join('')+'</div>':'<select id="settings-'+key+'" data-media-preference="'+key+'">'+choices.map(([value,text])=>'<option value="'+value+'"'+(p[key]===value?' selected':'')+'>'+text+'</option>').join('')+'</select>')+'</div>').join('')+'</div>';}
  function bind(){for(const button of document.querySelectorAll('[data-media-mode]'))RHFilesUI.listen(button,'click',()=>RHFilesAPI.invoke('media.preferences.set',{imageBrowseMode:button.dataset.mediaMode}),undefined,'desktop.media.mode.'+button.dataset.mediaMode);for(const input of document.querySelectorAll('[data-media-preference]'))RHFilesUI.listen(input,'change',()=>RHFilesAPI.invoke('media.preferences.set',{[input.dataset.mediaPreference]:input.value}),undefined,'desktop.media.preference.'+input.dataset.mediaPreference);}
  function register(api){const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});api.register('save.dialog.choose',p=>call('save_dialog_request',{action:'open',args:p}),{params:object({name:{type:'string',minLength:1,maxLength:4096},directory:{type:'string',minLength:1,maxLength:108000}},['name']),risk:'ui'});api.register('media.preferences.get',get,{params:object(),risk:'read'});api.register('media.preferences.set',set,{params:object({imageOpenWith:{enum:['rhfiles','system']},videoOpenWith:{enum:['rhfiles','system']},imageBrowseMode:{enum:['paged','continuous']}}),risk:'settings'});api.register('media.viewer.open',async p=>{const opened=await open(p.path,null,p.pane==='right',true);if(!opened)throw Error('Unsupported image/video file or platform');return {opened};},{params:object({path:{type:'string',minLength:1},pane:{enum:['left','right']}},['path']),risk:'external'});}
  if(window.__TAURI__?.event?.listen)window.__TAURI__.event.listen('file-viewer-preference',({payload})=>set(payload)).catch(console.error);
  if(window.__TAURI__?.event?.listen)window.__TAURI__.event.listen('file-viewer-save-task',({payload:p})=>{
    if(!p||typeof p.operationId!=='string'||!p.operationId.startsWith('image-save-'))return;
    if(p.status==='running')showProgress((G.settings.language==='zh'?'图片另存为：':'Save image: ')+p.name,{taskId:p.operationId,currentName:p.name,currentPath:p.source,indeterminate:true});
    else if(p.status==='cancelled')cancelOperationTask(p.operationId,p.error);
    else if(p.status==='failed')failOperationTask(p.operationId,p.error);
    else if(p.status==='complete')completeOperationTask(p.operationId);
  }).catch(console.error);
  if(window.__TAURI__?.event?.listen)window.__TAURI__.event.listen('file-save-task',({payload:p})=>{
    if(!p||typeof p.operationId!=='string'||!p.operationId.startsWith('save-'))return;
    if(p.status==='running')showProgress((G.settings.language==='zh'?'正在保存：':'Saving: ')+p.name,{taskId:p.operationId,currentName:p.name,currentPath:p.destination,indeterminate:true,cancellable:p.cancellable===true});
    else if(p.status==='failed')failOperationTask(p.operationId,p.error);
    else if(p.status==='complete')completeOperationTask(p.operationId);
  }).catch(console.error);
  return {kind,get,set,open,settingsHtml,bind,register};
})();
