//! A read-only PDF session with generation checks and authorized range URLs.
use serde::Serialize;
use serde_json::{json,Value};
use std::sync::{Mutex,atomic::{AtomicU64,Ordering}};
use tauri::{AppHandle,Emitter,Manager,WindowEvent};
use crate::types::CancelFlag;
const LABEL:&str="window-pdf-reader";
static ACTIVE:Mutex<Option<Session>>=Mutex::new(None);
static SEQUENCE:AtomicU64=AtomicU64::new(0);
static WINDOW:AtomicU64=AtomicU64::new(0);
static OPEN:tokio::sync::Mutex<()>=tokio::sync::Mutex::const_new(());
#[derive(Clone,Serialize)]struct Session{generation:u64,path:String,name:String,language:String}
fn validate(path:&str)->Result<(),String>{
    if path.is_empty()||path.len()>108000||path.contains('\0')||!path.to_ascii_lowercase().ends_with(".pdf"){return Err("PDF 文件路径无效".into())}
    if path.starts_with("rhfiles-device:"){rhfiles_service::connection::DevicePath::parse(path)?;}else if !std::path::Path::new(path).is_absolute(){return Err("PDF 必须使用完整文件路径".into())}Ok(())
}
fn current(args:&Value)->Result<Session,String>{let slot=ACTIVE.lock().map_err(|_|"PDF 状态不可用")?;let s=slot.as_ref().ok_or("PDF 已关闭")?;if args["generation"].as_u64()!=Some(s.generation){return Err("PDF 已改变，旧操作未执行".into())}Ok(s.clone())}
fn is_current(generation:u64)->bool{ACTIVE.lock().ok().is_some_and(|v|v.as_ref().is_some_and(|s|s.generation==generation))}
#[tauri::command]
pub async fn pdf_viewer_request(app:AppHandle,window:tauri::WebviewWindow,action:String,mut args:Value,cancel:tauri::State<'_,CancelFlag>)->Result<Value,String>{
    if let Some(run)=args.as_object_mut().and_then(|v|v.remove("_automationRun")){
        if action!="close"||window.label()!=LABEL{return Err("此操作不接受关闭回执".into())}
        let id=run["id"].as_str().unwrap_or_default().to_owned();
        if let Some(previous)=crate::automation_receipts::begin(run,"pdf-reader.close")?{return previous;}
        let completion=crate::automation_receipts::Completion::new(id);
        let result=dispatch(app,window,action,args,cancel).await;completion.finish(&result);return result;
    }
    dispatch(app,window,action,args,cancel).await
}
async fn dispatch(app:AppHandle,window:tauri::WebviewWindow,action:String,args:Value,cancel:tauri::State<'_,CancelFlag>)->Result<Value,String>{
    if action=="open"{
        let _open=OPEN.lock().await;
        let path=args["path"].as_str().ok_or("缺少 PDF 路径")?.to_owned();validate(&path)?;
        let name=args["name"].as_str().unwrap_or_else(||path.rsplit(['/', '\\']).next().unwrap_or("PDF")).to_owned();
        if name.len()>4096{return Err("文件名过长".into())}
        let language=args["language"].as_str().filter(|v|["zh","en"].contains(v)).unwrap_or("zh").to_owned();
        let generation=SEQUENCE.fetch_add(1,Ordering::SeqCst)+1;
        if generation>9_007_199_254_740_991{return Err("PDF 会话标识已耗尽，请重启".into())}
        let state=Session{generation,path,name,language};
        *ACTIVE.lock().map_err(|_|"PDF 状态不可用")?=Some(state.clone());
        let w=if let Some(w)=app.get_webview_window(LABEL){w}else{
            let w=crate::rhvideo::client_window(app.clone(),LABEL,"pdf-viewer.html","RHFiles · PDF",(1120.,800.),(500.,360.)).await?;
            let epoch=WINDOW.fetch_add(1,Ordering::SeqCst)+1;
            w.on_window_event(move|e|if matches!(e,WindowEvent::Destroyed)&&WINDOW.compare_exchange(epoch,epoch+1,Ordering::SeqCst,Ordering::SeqCst).is_ok(){if let Ok(mut slot)=ACTIVE.lock(){*slot=None;}});w
        };
        w.set_title(&format!("{} · RHFiles",state.name)).map_err(|e|e.to_string())?;
        w.maximize().map_err(|e|e.to_string())?;w.emit("pdf-reader-changed",generation).map_err(|e|e.to_string())?;w.show().map_err(|e|e.to_string())?;w.set_focus().map_err(|e|e.to_string())?;return Ok(json!(state));
    }
    if window.label()!=LABEL{return Err("PDF 阅读操作只能来自阅读窗口".into())}
    if action=="state"{return Ok(ACTIVE.lock().map_err(|_|"PDF 状态不可用")?.as_ref().map(|s|json!(s)).unwrap_or(json!({"opened":false})))}
    let state=current(&args)?;
    match action.as_str(){
        "source"=>{
            let _guard=cancel.begin("pdf-open")?;
            let meta=crate::device_transfer::device_transfer("inspect".into(),json!({"path":state.path}),app.clone(),cancel.clone()).await?;
            if meta["isDirectory"]==true{return Err("PDF 不是普通文件".into())}
            let resource=if state.path.starts_with("rhfiles-device:"){crate::device_fs::device_fs("resource".into(),json!({"path":state.path})).await?["url"].clone()}else{Value::Null};
            if !is_current(state.generation){return Err("PDF 已改变".into())}
            Ok(json!({"path":state.path,"url":resource,"revision":meta["revision"],"size":meta["size"]}))
        },
        "saveAs"=>{
            let _guard=cancel.begin("pdf-save")?;
            let source=crate::device_transfer::device_transfer("inspect".into(),json!({"path":state.path}),app.clone(),cancel.clone()).await?;
            let target=if let Some(path)=args.get("destination"){
                crate::save_dialog::Target::explicit(&app,path.as_str().ok_or("保存路径无效")?,args["overwrite"]==true,args["expectedTargetRevision"].as_str()).await?
            }else{let initial=crate::device_transfer::save_parent(&state.path);let Some(t)=crate::save_dialog::choose(&app,LABEL,&state.name,initial.as_deref(),"save").await?else{return Ok(json!({"saved":false}))};t};
            if !is_current(state.generation){return Err("PDF 已改变，未保存旧文档".into())}
            let id=format!("save-pdf-{}",SEQUENCE.fetch_add(1,Ordering::SeqCst));
            crate::device_transfer::device_transfer("save_copy".into(),json!({"src":state.path,"dest":target.path,"overwrite":target.overwrite,"expectedSourceRevision":source["revision"],"expectedTargetRevision":target.expected_target_revision,"operationId":id,"recordHistory":false}),app.clone(),cancel.clone()).await?;
            Ok(json!({"saved":true,"path":target.path}))
        },
        "systemOpen"=>{if state.path.starts_with("rhfiles-device:"){crate::device_transfer::device_transfer("open".into(),json!({"path":state.path}),app,cancel).await}else{crate::system::open_file(state.path)?;Ok(json!({"opened":true}))}},
        "close"=>{if let Some(w)=app.get_webview_window(LABEL){w.close().map_err(|e|e.to_string())?;}Ok(json!({"closed":true}))},
        _=>Err("未知 PDF 操作".into())
    }
}
#[cfg(test)]mod tests{use super::*;#[test]fn accepts_only_absolute_pdf_and_trusted_device_paths(){for p in ["relative.pdf","https://example.org/a.pdf","javascript:a.pdf","D:\\a.txt"]{assert!(validate(p).is_err());}#[cfg(windows)]assert!(validate("D:\\中文.PDF").is_ok());assert!(validate(&format!("rhfiles-device://{}/{}/share/a.pdf","a".repeat(64),"b".repeat(64))).is_ok());}}
