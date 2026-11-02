// Native Shell objects for external applications; HTML remains the fallback for
// unprepared remote files, so tab spring-loading never requires a download.
const nativeFileDrag=(()=>{
  const prepared=new Map();let active=false;
  const text=(zh,en)=>String(_lang||'').startsWith('zh')?zh:en;
  const remote=path=>isDevicePath(path)||isFtpPath(path);
  function start(event,payload){
    if(IS_MAC||!invoke||!event?.isTrusted||active)return false;
    const paths=payload.paths.map(path=>remote(path)?prepared.get(path)?.target:path);
    if(paths.some(path=>!path))return false;
    if(payload.paths.some(path=>remote(path)&&Date.now()-prepared.get(path).at>300000)){
      for(const path of payload.paths)prepared.delete(path);
      showNotice(text('外拖副本已过期，请重新准备以避免发送旧内容。','Prepared copies expired; prepare again to avoid sending stale content.'));return false;
    }
    event.preventDefault();active=true;
    // One drag per preparation: the retained disk copy may outlive the drop,
    // but it must never silently stand in for a later remote-file revision.
    for(const path of payload.paths)prepared.delete(path);
    // Let the cancelled HTML drag unwind before entering the Shell's modal loop.
    setTimeout(()=>call('native_drag_start',{paths,payload}).then(result=>{if(result?.status==='released')showNotice(text('鼠标已松开，拖拽未开始；请再次拖动。','The mouse was released before dragging started; drag again.'));}).catch(error=>showNotice(String(error))).finally(()=>{active=false;clearRhfilesFileDragSession();}),0);
    return true;
  }
  async function prepare(paths){
    if(!paths.length)throw Error('No files selected');
    const {directory}=await call('native_drag_cache',{}),result=[];
    const names=new Set();
    for(const path of paths){
      if(!remote(path)){result.push(path);continue;}
      const name=pathLeaf(path);if(names.has(name.toLowerCase()))throw Error(text('所选文件重名，请分批准备外拖','Duplicate names; prepare in separate batches'));names.add(name.toLowerCase());
      const target=joinFolderPath(directory,name),id=createOperationTaskId();
      const task=showProgress(text('准备外拖：','Prepare external drag: ')+name,{taskId:id,indeterminate:true,cancellable:isDevicePath(path)});
      try{
        await call('copy_with_progress',{src:path,dest:directory,operationId:id,overwrite:false});
        prepared.set(path,{target,at:Date.now()});result.push(target);hideProgress(task);
      }catch(error){hideProgress(task,{error:String(error)});throw error;}
    }
    showNotice(text('已准备好，可再次拖动到其他应用。副本会保留，不会删除远端原件。','Ready: drag again into another app. Local copies are retained; remote originals are not deleted.'));
    return {paths:result,directory};
  }
  const api=window.RHFilesAPI,s={type:'string',minLength:1,maxLength:27000};
  api.register('files.prepareExternalDrag',p=>prepare(p.paths),{params:{type:'object',properties:{paths:{type:'array',items:s,minItems:1,maxItems:10000}},required:['paths'],additionalProperties:false},risk:'write',description:'Prepare retained local copies for applications requiring real file paths; never moves or deletes remote originals. Drag again after preparation.'});
  const listen=window.__TAURI__?.event?.listen||window.__TAURI_INTERNALS__?.event?.listen;
  if(listen&&!IS_MAC)listen('native-file-drag',event=>{
    G._nativeFileDrag=!!event.payload?.active;
    if(event.payload?.active){G._activeFileDragPayload=event.payload.payload;}
    else {clearRhfilesFileDragSession();}
  }).catch(()=>{});
  return {start,prepare};
})();
