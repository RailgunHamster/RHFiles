//! RHFiles-owned save picker. Selection is separate from revision-checked writes.
use serde::{Deserialize,Serialize};
use serde_json::{Value,json};
use std::{path::{Path,PathBuf},sync::Mutex,time::Duration};
use tauri::{AppHandle,Manager,Emitter};
use rhfiles_service::connection::{DevicePath,FileRequest};
const LABEL:&str="window-save-dialog";
static ACTIVE:Mutex<Option<Request>>=Mutex::new(None);
struct Request{id:String,owner:String,name:String,initial:String,title:String,reply:Option<tokio::sync::oneshot::Sender<Option<Target>>>}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub(crate) struct Target{pub path:String,pub overwrite:bool,pub expected_target_revision:Option<String>}
fn random()->Result<String,String>{let mut bytes=[0;16];getrandom::fill(&mut bytes).map_err(|_|"无法创建保存窗口标识")?;Ok(bytes.iter().map(|b|format!("{b:02x}")).collect())}
fn require(id:&str)->Result<(),String>{if ACTIVE.lock().map_err(|_|"保存窗口不可用")?.as_ref().is_none_or(|r|r.id!=id){return Err("[stale_dialog] 保存请求已结束，请勿重复执行".into())}Ok(())}
fn finish(id:&str,value:Option<Target>){if let Ok(mut slot)=ACTIVE.lock(){if slot.as_ref().is_some_and(|r|r.id==id){if let Some(mut request)=slot.take(){if let Some(reply)=request.reply.take(){let _=reply.send(value);}}}}}
pub(crate) fn owner_closing(owner:&str){let id=ACTIVE.lock().ok().and_then(|slot|slot.as_ref().filter(|r|r.owner==owner).map(|r|r.id.clone()));if let Some(id)=id{finish(&id,None)}}
#[derive(Default,Serialize,Deserialize)]struct Preferences{recent:Vec<String>}
fn preferences()->Preferences{let result=(||->Result<Preferences,String>{let p=crate::profile::data_dir()?.join("save-locations.json");if std::fs::metadata(&p).map_err(|e|e.to_string())?.len()>128*1024{return Err("保存位置记录过大".into())}serde_json::from_slice(&std::fs::read(p).map_err(|e|e.to_string())?).map_err(|e|e.to_string())})();result.unwrap_or_default()}
fn remember(path:&str)->Result<(),String>{use std::io::Write;let mut p=preferences();p.recent.retain(|v|v!=path);p.recent.insert(0,path.into());p.recent.truncate(30);let root=crate::profile::data_dir()?;let mut file=tempfile::NamedTempFile::new_in(&root).map_err(|e|e.to_string())?;file.write_all(&serde_json::to_vec(&p).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;file.persist(root.join("save-locations.json")).map_err(|e|e.to_string())?;Ok(())}
pub(crate) async fn inspect(app:&AppHandle,path:&str)->Result<Option<Value>,String>{
    let result=crate::device_transfer::device_transfer("inspect".into(),json!({"path":path}),app.clone(),app.state()).await;
    match result{Ok(v)=>Ok(Some(v)),Err(e)if e.starts_with("[not_found]")=>Ok(None),Err(e)=>Err(e)}
}
async fn writable(app:&AppHandle,directory:&str)->Result<(),String>{
    if directory.starts_with("rhfiles-device:"){
        let path=DevicePath::parse(directory)?;if path.path=="/"{return Err("请先进入设备的共享文件夹 / Choose a shared folder".into())}
        let caps=crate::device_fs::device_fs("capabilities".into(),json!({"path":directory})).await?;
        let stat=crate::device_fs::device_fs("stat".into(),json!({"path":directory})).await?;
        if caps["permissions"]["write"]!=true||stat["readonly"]==true{return Err("[permission_denied] 此位置只读，请选择可写位置 / This location is read-only".into())}
        if stat["is_dir"]!=true{return Err("保存位置不是文件夹 / Destination is not a folder".into())}
    }else if inspect(app,directory).await?.is_none_or(|v|v["isDirectory"]!=true){return Err("保存文件夹不存在 / Destination folder does not exist".into())}Ok(())
}
impl Target{
    pub(crate) async fn explicit(app:&AppHandle,path:&str,overwrite:bool,revision:Option<&str>)->Result<Self,String>{
        if !path.starts_with("rhfiles-device:"){crate::file_ops::validate_target_name(Path::new(path).file_name().and_then(|v|v.to_str()).ok_or("保存文件名无效")?)?;}
        let path=crate::device_transfer::normalize_save_path(path)?;let parent=crate::device_transfer::save_parent(&path).ok_or("不能保存到根目录 / Cannot save to a root")?;writable(app,&parent).await?;
        let old=inspect(app,&path).await?;if old.as_ref().is_some_and(|v|v["isDirectory"]==true){return Err("[conflict] 目标是文件夹，未替换 / The target is a folder".into())}
        let actual=old.as_ref().and_then(|v|v["revision"].as_str()).map(str::to_owned);
        if revision.is_some_and(|v|actual.as_deref()!=Some(v)){return Err("[conflict] 目标文件已改变，未覆盖 / The target changed".into())}
        if old.is_some()&&!overwrite{return Err("[conflict] 目标文件已存在，未覆盖 / The target already exists".into())}
        Ok(Self{path,overwrite:old.is_some()&&overwrite,expected_target_revision:actual})
    }
    pub(crate) fn stage_directory(&self,app:&AppHandle)->Result<PathBuf,String>{
        if !self.path.starts_with("rhfiles-device:"){return Path::new(&self.path).parent().map(Path::to_path_buf).ok_or("保存目录无效".into())}
        let root=app.path().app_cache_dir().map_err(|e|e.to_string())?.join("save-staging");std::fs::create_dir_all(&root).map_err(|e|e.to_string())?;Ok(root)
    }
    pub(crate) async fn publish(&self,app:&AppHandle,file:tempfile::NamedTempFile,operation_id:&str)->Result<(),String>{
        let state=app.state::<crate::types::CancelFlag>();let _guard=state.begin("save-publish")?;
        let name=if self.path.starts_with("rhfiles-device:"){DevicePath::parse(&self.path)?.path.rsplit('/').next().unwrap_or_default().to_owned()}else{Path::new(&self.path).file_name().unwrap_or_default().to_string_lossy().into_owned()};
        let source=file.path().to_path_buf();
        let event=|status:&str,error:&str|{let _=app.emit_to("main","file-save-task",json!({"operationId":operation_id,"status":status,"name":name,"source":source,"destination":self.path,"error":error,"cancellable":self.path.starts_with("rhfiles-device:")}));};
        event("running","");
        let result=async{
        file.as_file().sync_all().map_err(|e|e.to_string())?;
        // Close the writer before the checked reader opens it on Windows.
        let staged=file.into_temp_path();
        if self.path.starts_with("rhfiles-device:"){
            crate::device_transfer::device_transfer("save_copy".into(),json!({"src":staged.to_string_lossy(),"dest":self.path,"overwrite":self.overwrite,"expectedTargetRevision":self.expected_target_revision,"operationId":operation_id,"recordHistory":false}),app.clone(),app.state()).await?;
        }else{crate::file_ops::commit_remote_download(app,&staged.to_string_lossy(),staged.as_ref(),Path::new(&self.path),self.expected_target_revision.as_deref(),operation_id)?;}
        Ok::<(),String>(())}.await;
        event(if result.is_ok(){"complete"}else{"failed"},result.as_ref().err().map(String::as_str).unwrap_or_default());result
    }
}
pub(crate) async fn choose(app:&AppHandle,owner:&str,name:&str,initial:Option<&str>,title:&str)->Result<Option<Target>,String>{
    crate::file_ops::validate_target_name(name)?;
    if app.get_webview_window(LABEL).is_some(){return Err("[busy] 请先完成已打开的保存窗口 / Another save window is open".into())}
    let _guard=app.state::<crate::types::CancelFlag>();let _busy=_guard.begin("save-dialog")?;
    let id=random()?;let initial=initial.map(str::to_owned).or_else(||preferences().recent.first().cloned()).unwrap_or_else(||crate::file_ops::get_known_folders(app.clone()).downloads);
    let (tx,mut rx)=tokio::sync::oneshot::channel();
    {let mut slot=ACTIVE.lock().map_err(|_|"保存窗口不可用")?;if slot.is_some(){return Err("[busy] 请先完成已打开的保存窗口 / Another save window is open".into())}*slot=Some(Request{id:id.clone(),owner:owner.into(),name:name.into(),initial,title:title.into(),reply:Some(tx)});}
    let built=create_window(app.clone(),owner).await;
    let window=match built{Ok(v)=>v,Err(e)=>{finish(&id,None);return Err(e)}};
    let token=id.clone();window.on_window_event(move|e|if matches!(e,tauri::WindowEvent::Destroyed){finish(&token,None)});
    let result=loop{tokio::select!{value=&mut rx=>break value.map_err(|_|"保存请求已结束".to_owned()),_=tokio::time::sleep(Duration::from_millis(500))=>{if app.get_webview_window(owner).is_none()||app.get_webview_window(LABEL).is_none(){finish(&id,None);}}}};
    finish(&id,None);let _=window.destroy();if let Some(owner)=app.get_webview_window(owner){if owner.is_visible().unwrap_or(false){let _=owner.set_focus();}}result
}
async fn create_window(app:AppHandle,owner:&str)->Result<tauri::WebviewWindow,String>{
    let parent=app.get_webview_window(owner).ok_or("发起保存的窗口已关闭")?;
    #[cfg(windows)]{
        let main=app.get_webview_window("main").ok_or("主窗口不可用")?;let (tx,rx)=tokio::sync::oneshot::channel();
        main.with_webview(move|platform|{let result=(||{crate::window::with_browser_args(tauri::WebviewWindowBuilder::new(&app,LABEL,tauri::WebviewUrl::App("save-dialog.html".into())).title("RHFiles").inner_size(940.,660.).min_inner_size(620.,440.).center().parent(&parent).map_err(|e|e.to_string())?.with_environment(platform.environment())).build().map_err(|e|e.to_string())})();let _=tx.send(result);}).map_err(|e|e.to_string())?;rx.await.map_err(|_|"无法创建保存窗口")?
    }
    #[cfg(not(windows))]{crate::window::with_browser_args(tauri::WebviewWindowBuilder::new(&app,LABEL,tauri::WebviewUrl::App("save-dialog.html".into())).title("RHFiles").inner_size(940.,660.).min_inner_size(620.,440.).parent(&parent).map_err(|e|e.to_string())?).build().map_err(|e|e.to_string())}
}
#[tauri::command]
pub async fn save_dialog_request(app:AppHandle,window:tauri::WebviewWindow,action:String,args:Value)->Result<Value,String>{
    let mut args=args;
    if let Some(run)=args.as_object_mut().and_then(|v|v.remove("_automationRun")){
        if !["confirm","cancel"].contains(&action.as_str()){return Err("此操作不接受关闭回执".into())}
        let id=run["id"].as_str().unwrap_or_default().to_owned();let kind=if action=="confirm"{"save-dialog.confirm"}else{"save-dialog.cancel"};if let Some(previous)=crate::automation_receipts::begin(run,kind)?{return previous}
        let completion=crate::automation_receipts::Completion::new(id);let result=dispatch(app,window,action,args).await;completion.finish(&result);return result;
    }
    dispatch(app,window,action,args).await
}
async fn dispatch(app:AppHandle,window:tauri::WebviewWindow,action:String,args:Value)->Result<Value,String>{
    if action=="open"{let name=args["name"].as_str().ok_or("缺少文件名")?;let result=choose(&app,window.label(),name,args["directory"].as_str(),"save").await?;return Ok(json!({"picked":result.is_some(),"target":result}))}
    if window.label()!=LABEL{return Err("[invalid_window] 保存窗口接口只能从保存窗口使用".into())}
    if action=="state"{let slot=ACTIVE.lock().map_err(|_|"保存窗口不可用")?;let r=slot.as_ref().ok_or("保存请求已结束")?;return Ok(json!({"id":r.id,"owner":r.owner,"name":r.name,"directory":r.initial,"title":r.title}))}
    let id=args["id"].as_str().ok_or("缺少保存请求标识")?;require(id)?;
    match action.as_str(){
        "cancel"=>{finish(id,None);Ok(json!({"cancelled":true}))},
        "places"=>{let groups=crate::device_groups::device_groups("state".into(),json!({}),app.clone()).await?;require(id)?;Ok(json!({"known":crate::file_ops::get_known_folders(app.clone()),"drives":crate::file_ops::get_drives()?,"favorites":crate::db::db_load_pinned()?,"recent":preferences().recent,"groups":groups}))},
        "list"=>{
            let path=crate::device_transfer::normalize_save_path(args["path"].as_str().ok_or("缺少目录")?)?;
            let (entries,readonly)=if path.starts_with("rhfiles-device:"){
                let list=crate::device_fs::device_fs("list".into(),json!({"path":path})).await?;
                let readonly=if DevicePath::parse(&path)?.path=="/"{true}else{let caps=crate::device_fs::device_fs("capabilities".into(),json!({"path":path})).await?;let stat=crate::device_fs::device_fs("stat".into(),json!({"path":path})).await?;caps["permissions"]["write"]!=true||stat["readonly"]==true};(list,readonly)
            }else{let p=path.clone();(json!(tauri::async_runtime::spawn_blocking(move||crate::file_ops::list_dir(p)).await.map_err(|_|"目录读取已结束")??),false)};
            require(id)?;Ok(json!({"path":path,"parent":crate::device_transfer::save_parent(&path),"entries":entries,"readonly":readonly}))
        },
        "mkdir"=>{
            let directory=args["directory"].as_str().ok_or("缺少目录")?;let path=crate::device_transfer::save_path(directory,args["name"].as_str().ok_or("缺少文件夹名")?)?;writable(&app,directory).await?;require(id)?;
            let _state=app.state::<crate::types::CancelFlag>();let _busy=_state.begin("save-folder")?;
            if path.starts_with("rhfiles-device:"){let p=DevicePath::parse(&path)?;crate::device_groups::connector()?.file_request(&p.group,&p.peer,FileRequest::Mkdir{path:p.path.clone()}).await?;}else{let p=path.clone();tauri::async_runtime::spawn_blocking(move||std::fs::create_dir(p).map_err(|e|e.to_string())).await.map_err(|_|"新建文件夹操作已结束")??;}
            Ok(json!({"created":true,"path":path}))
        },
        "confirm"=>{
            let directory=args["directory"].as_str().ok_or("缺少目录")?;let mut name=args["name"].as_str().ok_or("缺少文件名")?.to_owned();
            let extension={let slot=ACTIVE.lock().map_err(|_|"保存窗口不可用")?;Path::new(&slot.as_ref().ok_or("保存窗口已关闭")?.name).extension().and_then(|v|v.to_str()).map(str::to_owned)};
            if args["appendExtension"]!=false&&Path::new(&name).extension().is_none(){if let Some(ext)=extension{name.push('.');name.push_str(&ext);}}
            let path=crate::device_transfer::save_path(directory,&name)?;writable(&app,directory).await?;let old=inspect(&app,&path).await?;require(id)?;
            if let Some(old)=old.as_ref(){if old["isDirectory"]==true{return Err("[conflict] 同名目标是文件夹，不能替换 / A folder already uses this name".into())}if args["replaceRevision"].as_str()!=old["revision"].as_str(){return Ok(json!({"conflict":true,"path":path,"name":name,"revision":old["revision"],"size":old["size"]}))}}
            else if args["replaceRevision"].is_string(){return Err("[conflict] 目标已改变，请重新确认 / Target changed; confirm again".into())}
            let target=Target{path,overwrite:old.is_some(),expected_target_revision:old.as_ref().and_then(|v|v["revision"].as_str()).map(str::to_owned)};
            let warning=remember(directory).err();finish(id,Some(target.clone()));Ok(json!({"picked":true,"target":target,"warning":warning}))
        },
        _=>Err("未知保存窗口操作".into())
    }
}
pub(crate) async fn save_text(app:&AppHandle,name:&str,text:&str,args:&Value,expected_generation:u64)->Result<Value,String>{
    let generation=Some(expected_generation);
    if generation!=crate::rhvideo::current_generation(){return Err("媒体账户已改变，未保存旧账户内容".into())}
    let target=if let Some(path)=args.get("path"){Target::explicit(app,path.as_str().ok_or("保存路径无效")?,args["overwrite"]==true,args["expectedTargetRevision"].as_str()).await?}else{let Some(target)=choose(app,"window-rhvideo",name,None,"export").await? else{return Ok(json!({"saved":false}))};target};
    if generation!=crate::rhvideo::current_generation(){return Err("媒体账户已改变，未保存旧账户内容".into())}
    let state=app.state::<crate::types::CancelFlag>();let _guard=state.begin("save-export")?;
    use std::io::Write;let mut output=tempfile::Builder::new().prefix(".rhfiles-save-").tempfile_in(target.stage_directory(app)?).map_err(|e|e.to_string())?;output.write_all(text.as_bytes()).map_err(|e|e.to_string())?;target.publish(app,output,&format!("save-{}",random()?)).await?;Ok(json!({"saved":true,"path":target.path}))
}
