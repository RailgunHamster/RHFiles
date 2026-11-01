// Archive/conversion providers keep their normal implementation. Only their
// inputs/outputs are adapted to native, revocable, owned working directories.
const deviceArchiveJobs=new Map();
const deviceJob=(action,args)=>call('device_transfer',{action,args});
async function withDeviceArchive(path,operation){
  let cached=deviceArchiveJobs.get(path);
  if(cached){
    try{await deviceJob('validate_stage',{id:(await cached.ready).id});}
    catch(error){deviceArchiveJobs.delete(path);if(!cached.users)await deviceJob('release_stage',{id:(await cached.ready).id}).catch(()=>{});throw error;}
  }else{
    for(const [key,value]of deviceArchiveJobs)if(deviceArchiveJobs.size>=4&&!value.users){deviceArchiveJobs.delete(key);await deviceJob('release_stage',{id:(await value.ready).id}).catch(()=>{});}
    cached={users:0,ready:(async()=>{
      let paths=[path];
      if(isDevicePath(path)){
        const family=archiveNameInfo(pathLeaf(path))?.family;
        if(family)paths=(await deviceBrowser.fs('list',RHFilesDevicePaths.parent(path))).filter(e=>!e.is_dir&&archiveNameInfo(e.name)?.family.toLowerCase()===family.toLowerCase()).map(e=>e.path);
        if(!paths.includes(path))paths.push(path);
      }
      const taskId=showProgress(String(_lang).startsWith('zh')?'正在准备远端压缩包':'Preparing remote archive',{indeterminate:true,cancellable:true,currentPath:path,currentName:pathLeaf(path)});
      try{
        const stage=await deviceJob('stage',{paths,operationId:taskId});
        if(isOperationCancellationRequested(taskId)){await deviceJob('release_stage',{id:stage.id});throw Error('Cancelled');}
        completeOperationTask(taskId);return {...stage,source:path,localPath:stage.inputs.find(v=>v.source===path)?.localPath};
      }catch(error){if(/cancel/i.test(String(error)))cancelOperationTask(taskId);else failOperationTask(taskId,error);throw error;}
    })()};deviceArchiveJobs.set(path,cached);
  }
  cached.users++;
  try{return await operation(await cached.ready);}catch(error){if(!cached.ready)deviceArchiveJobs.delete(path);throw error;}
  finally{cached.users--;cached.ready.catch(()=>deviceArchiveJobs.delete(path));}
}
async function routeDeviceExtendedCommand(cmd,args){
  if(['open_in_windows_explorer','open_terminal','open_powershell','open_cmd','execute_tool','open_in_ide','share_files','set_file_readonly','unblock_file','get_permissions','set_permission','remove_permission','inherit_permissions','list_ads','read_ads','delete_ads','get_compat_mode','set_compat_mode','create_shortcut','git_branches','git_checkout','git_create_branch','git_clone','git_init'].includes(cmd)){
    if(IS_MAC)throw Error('[os_context_required] This operation requires an OS filesystem connection');
    const mapped=new Map();
    const convert=async value=>{
      if(typeof value==='string'&&isDevicePath(value)){if(!mapped.has(value))mapped.set(value,(await deviceJob('windows_path',{path:value})).path);return mapped.get(value);}
      if(Array.isArray(value)){const result=[];for(const item of value)result.push(await convert(item));return result;}
      if(value&&typeof value==='object'){const result={};for(const [key,item]of Object.entries(value))result[key]=await convert(item);return result;}return value;
    };
    return {value:await call(cmd,await convert(args))};
  }
  if(cmd==='paste_windows_file_clipboard'){
    // RDP virtual descriptors have no local source paths. Always COPY into
    // an owned workspace first: a failed upload must never lose a cut source.
    const stage=await deviceJob('stage',{paths:[],empty:true});
    try{
      const received=await call(cmd,{...args,destination:stage.output,forceCopy:true});
      if(received?.aborted||isOperationCancellationRequested(args.operationId))return {value:{aborted:true,moved:false}};
      const paths=(await call('list_dir',{path:stage.output,filter:''})).map(e=>e.path);
      const entries=await deviceBrowser.fs('list',args.destination);let outcome;
      await performDroppedFileOperation(paths,args.destination,entries,'copy',value=>outcome=value,{taskId:args.operationId,silent:true});
      if(outcome?.errors?.length)throw Error(outcome.errors.join('\n'));
      return {value:{aborted:!!outcome?.cancelled,moved:false}};
    }finally{await deviceJob('release_stage',{id:stage.id}).catch(()=>{});}
  }
  if(['list_archive','archive_encryption_probe','verify_archive_password','inspect_archive_extraction','extract_archive','extract_7z'].includes(cmd)){
    const path=args.path||args.archive;
    return withDeviceArchive(path,async stage=>{
      const local={...args,...(args.archive?{archive:stage.localPath}:{path:stage.localPath})};
      if(cmd==='inspect_archive_extraction'){
        if(isDevicePath(args.dest))return {value:await deviceJob('inspect_stage',{id:stage.id,source:path,dest:args.dest,entryPath:args.entryPath,password:args.password})};
        return {value:await call(cmd,local)};
      }
      if(cmd==='extract_archive'||cmd==='extract_7z'){
        if(!isDevicePath(args.dest))return {value:await call(cmd,local)};
        const relative='extract-'+crypto.randomUUID();
        await call(cmd,{...local,dest:stage.output+'/'+relative,overwrite:'rename'});
        if(isOperationCancellationRequested(args.operationId))throw Error('Cancelled');
        return {value:await deviceJob('publish_stage',{id:stage.id,relative,dest:args.dest,tree:true,overwrite:args.overwrite||'rename',planId:args.extractionPlanId,operationId:args.operationId})};
      }
      return {value:await call(cmd,local)};
    });
  }
  if(['create_archive','create_7z','compress_with','convert_media','convert_markdown_pdf'].includes(cmd)){
    const media=cmd==='convert_media',pdf=cmd==='convert_markdown_pdf';
    const input=media?args.options.inputPath:pdf?args.inputPath:null;
    const dest=media?args.options.outputPath:pdf?args.outputPath:args.dest||args.archive;
    const stage=await deviceJob('stage',{paths:input?[input]:args.sources,operationId:args.operationId});
    try{
      const output=isDevicePath(dest)?stage.output+'/'+pathLeaf(dest):dest;
      const relative=pathLeaf(dest);
      let planId;
      if(media&&args.options.overwrite&&isDevicePath(dest))planId=(await deviceJob('plan_output',{id:stage.id,dest})).planId;
      const local=media?{...args,options:{...args.options,inputPath:stage.inputs[0].localPath,outputPath:output}}:pdf?{...args,inputPath:stage.inputs[0].localPath,outputPath:output}:{...args,sources:stage.inputs.map(v=>v.localPath),...(args.archive?{archive:output}:{dest:output})};
      const result=await call(cmd,local);
      if(isOperationCancellationRequested(args.operationId))throw Error('Cancelled');
      if(isDevicePath(dest))await deviceJob('publish_stage',{id:stage.id,relative,dest,overwrite:planId?'replace':'fail',planId,operationId:args.operationId});
      return {value:result};
    }finally{await deviceJob('release_stage',{id:stage.id}).catch(error=>console.warn('Remote workspace cleanup',error));}
  }
  return null;
}
