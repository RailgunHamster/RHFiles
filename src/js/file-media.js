// Filesystem viewing preferences and one opening path for clicks, Enter and API.
const desktopMediaViewer=(()=>{
  const image=new Set('png jpg jpeg webp gif bmp ico tif tiff avif svg'.split(' ')),video=new Set('mp4 mkv mov avi webm m4v wmv flv mpeg mpg ts mts m2ts 3gp ogv'.split(' '));
  const kind=file=>{if(!file||file.is_dir)return null;const ext=String(file.extension||file.name?.split('.').pop()||file.path?.split('.').pop()||'').toLowerCase();return image.has(ext)?'image':video.has(ext)?'video':ext==='pdf'?'pdf':null;};
  const windowsViewerPath=/^(?:[A-Za-z]:[\\/]|\\\\|rhfiles-device:\/\/)/;
  let prewarmRequested=false;
  function prewarmVideoLibrary(entries){
    if(prewarmRequested||!/Win/i.test(navigator.platform)||get().videoOpenWith==='system')return;
    if(!entries.some(entry=>!entry.archive_entry&&kind(entry)==='video'&&windowsViewerPath.test(entry.path)))return;
    prewarmRequested=true;
    const warm=()=>{
      if(get().videoOpenWith==='system'){prewarmRequested=false;return;}
      // Playback reports any error from its own initialization and can retry.
      void call('file_viewer_request',{action:'video.prewarm',args:{}}).catch(()=>{});
    };
    if(window.requestIdleCallback)window.requestIdleCallback(warm,{timeout:1500});
    else setTimeout(warm,0);
  }
  const validVolume=value=>Number.isInteger(value)&&value>=0&&value<=100;
  const get=()=>({
    videoSeekSeconds:Number.isInteger(G.settings.videoSeekSeconds)&&G.settings.videoSeekSeconds>=1&&G.settings.videoSeekSeconds<=600?G.settings.videoSeekSeconds:5,
    videoDefaultVolume:validVolume(G.settings.videoDefaultVolume)?G.settings.videoDefaultVolume:100,
    pdfOpenWith:G.settings.pdfOpenWith==='system'?'system':'rhfiles',
    imageOpenWith:G.settings.imageOpenWith==='system'?'system':'rhfiles',
    videoOpenWith:G.settings.videoOpenWith==='system'?'system':'rhfiles',
    imageBrowseMode:G.settings.imageBrowseMode==='continuous'?'continuous':'paged',
  });
  function set(value){
    if(value.videoSeekSeconds!==undefined&&(!Number.isInteger(value.videoSeekSeconds)||value.videoSeekSeconds<1||value.videoSeekSeconds>600))throw Error('Invalid seek interval');
    if(value.videoDefaultVolume!==undefined&&!validVolume(value.videoDefaultVolume))throw Error('Invalid default video volume');
    const allowed={pdfOpenWith:['system','rhfiles'],imageOpenWith:['system','rhfiles'],videoOpenWith:['system','rhfiles'],imageBrowseMode:['paged','continuous']};
    for(const [key,values]of Object.entries(allowed))if(value[key]!==undefined&&!values.includes(value[key]))throw Error('Invalid media preference');
    for(const key of [...Object.keys(allowed),'videoSeekSeconds','videoDefaultVolume']){
      if(value[key]===undefined||G.settings[key]===value[key])continue;
      G.settings[key]=value[key];
      const input=document.getElementById('settings-'+key);
      if(input){
        input.value=value[key];
        for(const button of input.querySelectorAll('[data-media-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mediaMode===value[key]));
      }
    }
    saveSettings();
    return get();
  }
  async function open(path,file,isRight,force=false){
    const pane=isRight?G.rp:getTab(),entries=pane?.entries||[];
    file=file||entries.find(e=>e.path===path)||{path,name:path.split(/[\\/]/).pop()};
    if(kind(file)==='pdf'){if(!force&&get().pdfOpenWith==='system')return false;await call('pdf_viewer_request',{action:'open',args:{path,name:file.name,language:typeof _lang==='string'?_lang:G.settings.language}});return true;}
    if(!/Win/i.test(navigator.platform))return false;
    if(!windowsViewerPath.test(path))return false;
    const type=kind(file);if(!type||!force&&get()[type+'OpenWith']==='system')return false;
    let queue=entries.filter(e=>kind(e)===type&&!e.archive_entry).slice(0,5000);if(!queue.some(e=>e.path===path))queue=[file];
    const unique=[...new Map(queue.map(e=>[e.path,{path:e.path,name:e.name||e.path.split(/[\\/]/).pop()}])).values()];
    const preferences=get();
    await call('file_viewer_request',{action:'open',args:{entries:unique,index:unique.findIndex(e=>e.path===path),mode:preferences.imageBrowseMode,videoDefaultVolume:preferences.videoDefaultVolume,language:typeof _lang==='string'?_lang:G.settings.language}});return true;
  }
  function settingsHtml(){
    const p=get();
    const systemApp=['system',t('settings.mediaSystemApp')];
    const selects=[
      ['pdfOpenWith',t('settings.mediaOpenPdf'),[['rhfiles',t('settings.mediaPdfReader')],systemApp]],
      ['imageOpenWith',t('settings.mediaOpenImage'),[['rhfiles',t('settings.mediaImageViewer')],systemApp]],
      ['videoOpenWith',t('settings.mediaOpenVideo'),[['rhfiles',t('settings.mediaVideoPlayer')],systemApp]],
      ['imageBrowseMode',t('settings.mediaImageMode'),[['paged',t('settings.mediaImagePaged')],['continuous',t('settings.mediaImageContinuous')]]],
    ];
    const choices=selects.map(([key,title,options])=>'<div class="settings-row"><label for="settings-'+key+'">'+title+'</label>'+
      (key==='imageBrowseMode'?'<div id="settings-'+key+'" class="media-mode-switch" role="group" aria-label="'+title+'">'+options.map(([value,text])=>'<button type="button" data-media-mode="'+value+'" aria-pressed="'+(p[key]===value)+'">'+text+'</button>').join('')+'</div>'
      :'<select id="settings-'+key+'" data-media-preference="'+key+'">'+options.map(([value,text])=>'<option value="'+value+'"'+(p[key]===value?' selected':'')+'>'+text+'</option>').join('')+'</select>')+'</div>').join('');
    const numbers=[
      ['videoSeekSeconds',t('settings.mediaVideoSeekSeconds'),1,600],
      ['videoDefaultVolume',t('settings.mediaVideoDefaultVolume'),0,100],
    ].map(([key,title,min,max])=>`<div class="settings-row"><label for="settings-${key}">${title}</label><input id="settings-${key}" type="number" min="${min}" max="${max}" step="1" required data-media-preference="${key}" value="${p[key]}"></div>`).join('');
    return '<div class="settings-card"><div class="settings-card-title">'+t('settings.mediaTitle')+'</div>'+choices+numbers+'</div>';
  }
  function bind(){
    for(const button of document.querySelectorAll('[data-media-mode]'))RHFilesUI.listen(button,'click',()=>RHFilesAPI.invoke('media.preferences.set',{imageBrowseMode:button.dataset.mediaMode}),undefined,'desktop.media.mode.'+button.dataset.mediaMode);
    for(const input of document.querySelectorAll('[data-media-preference]')){
      const key=input.dataset.mediaPreference;
      RHFilesUI.listen(input,'change',()=>{
        if(!input.checkValidity()){
          input.value=get()[key];
          return;
        }
        return RHFilesAPI.invoke('media.preferences.set',{[key]:input.type==='number'?input.valueAsNumber:input.value});
      },undefined,'desktop.media.preference.'+key);
    }
  }
  function register(api){
    const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
    api.register('save.dialog.choose',p=>call('save_dialog_request',{action:'open',args:p}),{params:object({name:{type:'string',minLength:1,maxLength:4096},directory:{type:'string',minLength:1,maxLength:108000}},['name']),risk:'ui'});
    api.register('media.preferences.get',get,{params:object(),risk:'read'});
    api.register('media.preferences.set',set,{params:object({
      videoSeekSeconds:{type:'integer',minimum:1,maximum:600},videoDefaultVolume:{type:'integer',minimum:0,maximum:100},
      pdfOpenWith:{enum:['rhfiles','system']},imageOpenWith:{enum:['rhfiles','system']},
      videoOpenWith:{enum:['rhfiles','system']},imageBrowseMode:{enum:['paged','continuous']},
    }),risk:'settings'});
    api.register('pdf.reader.open',async p=>{if(!/\.pdf$/i.test(p.path))throw Error('Not a PDF');return {opened:await open(p.path,null,false,true)};},{params:object({path:{type:'string',minLength:1,maxLength:108000}},['path']),risk:'ui'});
    api.register('media.viewer.open',async p=>{const opened=await open(p.path,null,p.pane==='right',true);if(!opened)throw Error('Unsupported file or platform');return {opened};},{params:object({path:{type:'string',minLength:1},pane:{enum:['left','right']}},['path']),risk:'external'});
  }
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
  return {kind,get,set,open,prewarmVideoLibrary,settingsHtml,bind,register};
})();
