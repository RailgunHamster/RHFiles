//! Filesystem media viewer. No RHVideo database/session is involved.
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use std::sync::{Mutex,atomic::{AtomicU64,Ordering}};
use tauri::{AppHandle,Emitter,Manager,WindowEvent};
use rhfiles_service::connection::DevicePath;
use crate::types::CancelFlag;
const LABEL:&str="window-file-viewer";
static SESSION:Mutex<Option<Session>>=Mutex::new(None);
static SEQUENCE:AtomicU64=AtomicU64::new(0);
static WINDOW:AtomicU64=AtomicU64::new(0);
static OPEN:tokio::sync::Mutex<()>=tokio::sync::Mutex::const_new(());
#[derive(Clone,Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
struct Entry {path:String,name:String}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
struct Session {generation:u64,selection:u64,index:usize,kind:String,mode:String,language:String,entries:Vec<Entry>}
fn next()->Result<u64,String>{let n=SEQUENCE.fetch_add(1,Ordering::SeqCst)+1;if n>9_007_199_254_740_991{return Err("查看器身份已耗尽，请重启应用".into())}Ok(n)}
fn kind(path:&str)->Option<&'static str>{
    let ext=path.rsplit('.').next()?.to_ascii_lowercase();
    if ["png","jpg","jpeg","webp","gif","bmp","ico","tif","tiff","avif","svg"].contains(&ext.as_str()){Some("image")}
    else if ["mp4","mkv","mov","avi","webm","m4v","wmv","flv","mpeg","mpg","ts","mts","m2ts","3gp","ogv"].contains(&ext.as_str()){Some("video")}else{None}
}
fn validate_entry(entry:&Entry)->Result<(),String>{
    if entry.path.is_empty()||entry.path.len()>108000||entry.name.len()>4096||entry.path.contains('\0'){return Err("媒体文件路径无效".into())}
    if entry.path.starts_with("rhfiles-device:"){DevicePath::parse(&entry.path)?;}else if !std::path::Path::new(&entry.path).is_absolute(){return Err("媒体文件必须使用完整文件路径".into())}
    if kind(&entry.path).is_none(){return Err("此文件不支持内置图片／视频查看".into())}Ok(())
}
fn current(args:&Value)->Result<Session,String>{let state=SESSION.lock().map_err(|_|"查看器状态不可用")?;let s=state.as_ref().ok_or("查看器已关闭")?;if args["generation"].as_u64()!=Some(s.generation)||args.get("selection").is_some_and(|v|v.as_u64()!=Some(s.selection)){return Err("查看内容已改变，旧操作未执行".into())}Ok(s.clone())}
pub(crate) fn is_current(generation:u64,selection:u64)->bool{SESSION.lock().ok().is_some_and(|s|s.as_ref().is_some_and(|s|s.generation==generation&&s.selection==selection))}
fn stop_video(){#[cfg(windows)]crate::rhvideo_player::file_player::stop();}
#[cfg(windows)]
fn save_picker(name:&str,english:bool,owner:Option<usize>)->Result<Option<String>,String>{
    use windows::{core::PCWSTR,Win32::{Foundation::HWND,System::Com::*,UI::Shell::*}};
    unsafe{
        CoInitializeEx(None,COINIT_APARTMENTTHREADED).ok().map_err(|e|e.to_string())?;
        struct Com;impl Drop for Com{fn drop(&mut self){unsafe{CoUninitialize()}}}let _com=Com;
        let dialog:IFileSaveDialog=CoCreateInstance(&FileSaveDialog,None,CLSCTX_INPROC_SERVER).map_err(|e|e.to_string())?;
        let filename:Vec<u16>=name.encode_utf16().chain(Some(0)).collect();dialog.SetFileName(PCWSTR(filename.as_ptr())).map_err(|e|e.to_string())?;
        let title:Vec<u16>=if english{"Save image as"}else{"图片另存为"}.encode_utf16().chain(Some(0)).collect();dialog.SetTitle(PCWSTR(title.as_ptr())).map_err(|e|e.to_string())?;
        dialog.SetOptions(dialog.GetOptions().map_err(|e|e.to_string())?|FOS_FORCEFILESYSTEM|FOS_PATHMUSTEXIST|FOS_NOCHANGEDIR|FOS_OVERWRITEPROMPT).map_err(|e|e.to_string())?;
        if let Err(error)=dialog.Show(owner.map(|value|HWND(value as *mut _))){if error.code().0 as u32==0x800704c7{return Ok(None)}return Err(error.to_string())}
        let raw=dialog.GetResult().map_err(|e|e.to_string())?.GetDisplayName(SIGDN_FILESYSPATH).map_err(|e|e.to_string())?;
        let result=raw.to_string().map_err(|e|e.to_string());CoTaskMemFree(Some(raw.0.cast()));result.map(Some)
    }
}
async fn save_image(app:AppHandle,args:Value,cancel:tauri::State<'_,CancelFlag>)->Result<Value,String>{
    let state=current(&args)?;if state.kind!="image"{return Err("当前不是图片".into())}
    let index=args.get("index").map(|v|v.as_u64().filter(|n|(*n as usize)<state.entries.len()).map(|n|n as usize).ok_or("图片索引无效")).transpose()?.unwrap_or(state.index);
    let entry=state.entries[index].clone();let _dialog_guard=cancel.begin("image-save")?;
    let source=crate::device_transfer::device_transfer("inspect".into(),json!({"path":entry.path}),app.clone(),cancel.clone()).await?;
    if source["isDirectory"]==true{return Err("另存为只接受图片文件".into())}
    let picked=args.get("destination").is_none();
    let destination=if let Some(value)=args.get("destination"){Some(value.as_str().filter(|p|!p.is_empty()&&p.len()<=32768&&!p.contains('\0')).ok_or("保存路径无效")?.to_owned())}else{
        #[cfg(windows)]{let owner=app.get_webview_window(LABEL).and_then(|w|w.hwnd().ok()).map(|h|h.0 as usize);let name=entry.name.clone();let english=state.language=="en";tauri::async_runtime::spawn_blocking(move||save_picker(&name,english,owner)).await.map_err(|_|"保存选择器已结束")??}
        #[cfg(not(windows))]{return Err("此平台尚未提供图片保存选择器".into())}
    };
    let Some(destination)=destination else{return Ok(json!({"saved":false,"cancelled":true}))};
    if !is_current(state.generation,state.selection){return Err("查看内容已改变，未保存旧图片".into())}
    if !std::path::Path::new(&destination).is_absolute()||destination.contains("://"){return Err("保存位置必须是本地文件系统的完整路径".into())}
    let target=match crate::device_transfer::device_transfer("inspect".into(),json!({"path":destination}),app.clone(),cancel.clone()).await{Ok(value)=>Some(value),Err(error)if error.starts_with("[not_found]")=>None,Err(error)=>return Err(error)};
    if target.as_ref().is_some_and(|v|v["isDirectory"]==true){return Err("保存位置是文件夹，未替换".into())}
    let overwrite=picked&&target.is_some()||args["overwrite"]==true;
    if target.is_some()&&!overwrite{return Err("[conflict] 目标文件已存在；未覆盖，请选择新名称或明确确认替换".into())}
    if let Some(expected)=args.get("expectedTargetRevision").and_then(Value::as_str){if target.as_ref().and_then(|v|v["revision"].as_str())!=Some(expected){return Err("[conflict] 目标文件已改变，未覆盖".into())}}
    let operation_id=if let Some(value)=args.get("operationId"){value.as_str().filter(|v|v.starts_with("image-save-")&&v.len()<=100&&v.bytes().all(|b|b.is_ascii_alphanumeric()||b"-_".contains(&b))).ok_or("保存任务标识无效")?.to_owned()}else{format!("image-save-{}",next()?)};
    let event=|status:&str,error:&str|{let _=app.emit_to("main","file-viewer-save-task",json!({"operationId":operation_id,"status":status,"name":entry.name,"source":entry.path,"destination":destination,"error":error}));};
    event("running","");
    let result=crate::device_transfer::device_transfer("save_copy".into(),json!({"src":entry.path,"dest":destination,"overwrite":overwrite,"expectedSourceRevision":source["revision"],"expectedTargetRevision":target.as_ref().map(|v|v["revision"].clone()),"operationId":operation_id,"recordHistory":false}),app.clone(),cancel.clone()).await;
    match result{Ok(_)=>{event("complete","");Ok(json!({"saved":true,"path":destination,"operationId":operation_id}))},Err(error)=>{event(if error.starts_with("[cancelled]"){"cancelled"}else{"failed"},&error);Err(error)}}
}
#[tauri::command]
pub async fn file_viewer_request(app:AppHandle,action:String,mut args:Value,cancel:tauri::State<'_,CancelFlag>)->Result<Value,String>{
    if let Some(run)=args.as_object_mut().and_then(|v|v.remove("_automationRun")){
        if action!="close"{return Err("此操作不接受关闭回执".into())}
        let id=run["id"].as_str().unwrap_or_default().to_owned();
        if let Some(previous)=crate::automation_receipts::begin(run,"file-viewer.close")?{return previous;}
        let completion=crate::automation_receipts::Completion::new(id);let result=dispatch(app,action,args,cancel).await;completion.finish(&result);return result;
    }
    dispatch(app,action,args,cancel).await
}
async fn dispatch(app:AppHandle,action:String,args:Value,cancel:tauri::State<'_,CancelFlag>)->Result<Value,String>{
    match action.as_str(){
        "open"=>{
            let entries:Vec<Entry>=serde_json::from_value(args["entries"].clone()).map_err(|_|"媒体列表无效")?;
            if entries.is_empty()||entries.len()>5000{return Err("媒体列表需包含 1–5000 个文件".into())}
            for entry in &entries{validate_entry(entry)?;}
            let index=args["index"].as_u64().filter(|v|(*v as usize)<entries.len()).ok_or("媒体索引无效")? as usize;
            let media_kind=kind(&entries[index].path).unwrap();if entries.iter().any(|e|kind(&e.path)!=Some(media_kind)){return Err("媒体列表不能混合图片与视频".into())}
            let mode=args["mode"].as_str().unwrap_or("paged");if !["paged","continuous"].contains(&mode){return Err("图片浏览模式无效".into())}
            let _open=OPEN.lock().await;stop_video();
            let language=args["language"].as_str().filter(|v|["zh","en"].contains(v)).unwrap_or("").to_owned();
            let generation=next()?;let state=Session{generation,selection:next()?,index,kind:media_kind.into(),mode:mode.into(),language,entries};
            *SESSION.lock().map_err(|_|"查看器状态不可用")?=Some(state.clone());
            let window=if let Some(window)=app.get_webview_window(LABEL){window}else{
                let title=if state.language=="en"{"RHFiles · Media viewer"}else{"RHFiles · 媒体查看器"};
                let window=crate::rhvideo::client_window(app.clone(),LABEL,"file-viewer.html",title,(1120.,780.),(500.,360.)).await?;
                let epoch=WINDOW.fetch_add(1,Ordering::SeqCst)+1;
                window.on_window_event(move|event|if matches!(event,WindowEvent::Destroyed)&&WINDOW.compare_exchange(epoch,epoch+1,Ordering::SeqCst,Ordering::SeqCst).is_ok(){if let Ok(mut s)=SESSION.lock(){*s=None;}stop_video();});window
            };
            window.set_title(&format!("{} · RHFiles",state.entries[state.index].name)).map_err(|e|e.to_string())?;window.maximize().map_err(|e|e.to_string())?;window.emit("file-viewer-changed",json!({"generation":generation})).map_err(|e|e.to_string())?;window.show().map_err(|e|e.to_string())?;window.set_focus().map_err(|e|e.to_string())?;Ok(json!(state))
        }
        "state"=>Ok(SESSION.lock().map_err(|_|"查看器状态不可用")?.as_ref().map(|s|json!(s)).unwrap_or(json!({"opened":false}))),
        "window.state"=>{current(&args)?;let w=app.get_webview_window(LABEL).ok_or("查看器已关闭")?;Ok(json!({"maximized":w.is_maximized().map_err(|e|e.to_string())?,"fullscreen":w.is_fullscreen().map_err(|e|e.to_string())?}))}
        "select"=>{let mut s=current(&args)?;let prior=s.selection;let index=args["index"].as_u64().filter(|v|(*v as usize)<s.entries.len()).ok_or("媒体索引无效")? as usize;s.index=index;s.selection=next()?;{let mut slot=SESSION.lock().map_err(|_|"查看器状态不可用")?;if slot.as_ref().map(|v|v.selection)!=Some(prior){return Err("查看内容已改变".into())}*slot=Some(s.clone());}stop_video();if let Some(window)=app.get_webview_window(LABEL){window.set_title(&format!("{} · RHFiles",s.entries[s.index].name)).map_err(|e|e.to_string())?;}Ok(json!(s))}
        "mode"=>{let mut s=current(&args)?;let mode=args["mode"].as_str().filter(|v|["paged","continuous"].contains(v)).ok_or("图片浏览模式无效")?;s.mode=mode.into();{let mut slot=SESSION.lock().map_err(|_|"查看器状态不可用")?;if !slot.as_ref().is_some_and(|v|v.generation==s.generation&&v.selection==s.selection){return Err("查看内容已改变".into())}*slot=Some(s.clone());}app.emit("file-viewer-preference",json!({"imageBrowseMode":mode})).map_err(|e|e.to_string())?;Ok(json!(s))}
        "close"=>{current(&args)?;if let Some(w)=app.get_webview_window(LABEL){w.close().map_err(|e|e.to_string())?;}Ok(json!({"closed":true}))}
        "image.saveAs"=>save_image(app,args,cancel).await,
        "video.open"=>{
            let state=current(&args)?;if state.kind!="video"{return Err("当前不是视频".into())}let path=&state.entries[state.index].path;
            let source=if path.starts_with("rhfiles-device:"){crate::device_fs::device_fs("resource".into(),json!({"path":path})).await?["url"].as_str().ok_or("远程媒体地址缺失")?.to_string()}else{url::Url::from_file_path(std::path::Path::new(path)).map_err(|_|"视频路径无效")?.to_string()};
            if !is_current(state.generation,state.selection){return Err("查看内容已改变".into())}
            #[cfg(windows)]return crate::rhvideo_player::file_player::open(app,source,state.entries[state.index].name.clone(),state.generation,state.selection).await;
            #[cfg(not(windows))]{let _=source;Err("此平台暂未提供内置视频内核".into())}
        }
        "video.state"|"video.control"|"video.bounds"=>{current(&args)?;#[cfg(windows)]return crate::rhvideo_player::file_player::request(app,&action,args).await;#[cfg(not(windows))]Err("此平台暂未提供内置视频内核".into())}
        _=>Err("未知媒体查看器操作".into())
    }
}
#[cfg(test)]mod tests{use super::*;#[test]fn only_media_and_absolute_or_trusted_device_paths_are_accepted(){assert_eq!(kind("D:\\a.MKV"),Some("video"));assert_eq!(kind("D:\\a.json"),None);for p in ["relative.jpg","https://example.com/a.mp4","javascript:a.png"]{assert!(validate_entry(&Entry{path:p.into(),name:"a".into()}).is_err());}}}
