//! Owner-scoped, bounded-memory ZIP saving, independent of the library WebView.
//! Never store Bearer tokens, follow a server-supplied URL, or replay a download.
use super::{current, exports, AppHandle, Emitter, Session, Value, json};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs::File, io::Write, path::{Path, PathBuf}, sync::{Arc, Mutex, OnceLock}, time::Instant};

const ACTIVE: [&str; 4] = ["queued", "downloading", "cancelling", "publishing"];
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Task {
    id: String, export_id: String, state: String, path: String,
    bytes: u64, total: u64, speed: f64, error: String, started: i64, finished: Option<i64>,
    #[serde(default)] revision: u64,
}
#[derive(Clone, Serialize, Deserialize)]
struct Record { owner: String, task: Task }
#[derive(Default)]
struct Store { records: Vec<Record>, loaded: bool, warning: String }
static STORE: OnceLock<Mutex<Store>> = OnceLock::new();
fn store() -> &'static Mutex<Store> { STORE.get_or_init(|| Mutex::new(Store::default())) }
fn journal() -> Result<PathBuf, String> { Ok(crate::profile::data_dir()?.join("rhvideo-downloads.json")) }
fn now() -> i64 { chrono::Utc::now().timestamp_millis() }
fn owner(session: &Session) -> String {
    format!("{:x}", Sha256::digest(format!("{}\n{}", session.base, session.username).as_bytes()))
}
fn live(session: &Session) -> Result<(), String> {
    if !current().is_ok_and(|s| s.generation == session.generation) { return Err("媒体账户已改变，下载停止；不会自动恢复".into()); }
    Ok(())
}
impl Store {
    fn load(&mut self) {
        if self.loaded { return; } self.loaded = true;
        let result = (|| -> Result<Vec<Record>, String> {
            let path = journal()?;
            if !path.exists() { return Ok(Vec::new()); }
            if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > 8*1024*1024 { return Err("下载记录超过安全上限".into()); }
            let rows: Vec<Record> = serde_json::from_slice(&std::fs::read(path).map_err(|e|e.to_string())?).map_err(|_|"下载记录格式无效")?;
            if rows.len() > 64 || rows.iter().any(|r| !exports::uuid(&r.task.id) || !exports::uuid(&r.task.export_id) || r.owner.len()!=64) { return Err("下载记录内容无效".into()); }
            Ok(rows)
        })();
        match result {
            Ok(rows) => self.records = rows,
            Err(e) => self.warning = format!("旧下载记录无法读取：{e}；没有恢复或重复执行旧任务"),
        }
        for record in &mut self.records {
            if ACTIVE.contains(&record.task.state.as_str()) {
                record.task.state = "failed".into(); record.task.finished = Some(now()); record.task.speed=0.;
                record.task.error="上次运行中断，未自动重试；保存目录中可能留有 .rhvideo-download- 临时文件，请核对后手动清理".into();
            }
        }
    }
    fn persist(&mut self) {
        let result=(|| -> Result<(),String>{
            let path=journal()?;let parent=path.parent().ok_or("下载记录目录无效")?;std::fs::create_dir_all(parent).map_err(|e|e.to_string())?;
            let mut file=tempfile::NamedTempFile::new_in(parent).map_err(|e|e.to_string())?;
            serde_json::to_writer(&mut file,&self.records).map_err(|e|e.to_string())?;file.flush().map_err(|e|e.to_string())?;
            file.persist(path).map_err(|e|e.to_string())?;Ok(())
        })();
        if let Err(e)=result { self.warning=format!("下载状态未能保存：{e}"); }
    }
}
pub fn list(session: &Session) -> Result<Value,String> {
    let mut data=store().lock().map_err(|_|"下载任务不可用")?;data.load();let key=owner(session);
    Ok(json!({"items":data.records.iter().rev().filter(|r|r.owner==key).map(|r|r.task.clone()).collect::<Vec<_>>(),"warning":data.warning}))
}
fn publish(app: &AppHandle, generation: u64, id: &str, update: impl FnOnce(&mut Task)) -> Result<Task,String> {
    let mut data=store().lock().map_err(|_|"下载任务不可用")?;
    let record=data.records.iter_mut().find(|r|r.task.id==id).ok_or("下载任务不存在")?;
    update(&mut record.task);record.task.revision=record.task.revision.saturating_add(1);let task=record.task.clone();data.persist();
    let _=app.emit_to("window-rhvideo","rhvideo-download-progress",json!({"generation":generation,"task":task}));Ok(task)
}
fn checkpoint(session: &Session,id: &str) -> Result<(),String> {
    live(session)?;
    let data=store().lock().map_err(|_|"下载任务不可用")?;
    if data.records.iter().find(|r|r.task.id==id).is_some_and(|r|r.task.state=="cancelling") { return Err("已取消下载".into()); }
    Ok(())
}
pub fn cancel(app:&AppHandle,session:&Session,args:&Value)->Result<Value,String>{
    let id=args["taskId"].as_str().filter(|v|exports::uuid(v)).ok_or("下载任务标识无效")?;
    let mut data=store().lock().map_err(|_|"下载任务不可用")?;data.load();let key=owner(session);
    let record=data.records.iter_mut().find(|r|r.task.id==id&&r.owner==key).ok_or("下载任务不存在")?;
    if !["queued","downloading","cancelling"].contains(&record.task.state.as_str()){return Err("下载已结束或正在提交文件，旧取消操作未执行".into());}
    record.task.state="cancelling".into();record.task.revision=record.task.revision.saturating_add(1);let task=record.task.clone();data.persist();drop(data);
    let _=app.emit_to("window-rhvideo","rhvideo-download-progress",json!({"generation":session.generation,"task":task}));Ok(json!(task))
}

pub fn filename(job:&Value)->String{
    let date=job["created_at"].as_str().and_then(|s|chrono::DateTime::parse_from_rfc3339(s).ok()).map(|d|d.format("%Y%m%d-%H%M").to_string()).unwrap_or_else(||"收藏".into());
    format!("RHVideo-喜爱-{date}.zip")
}
#[cfg(windows)]
fn choose(name:&str)->Result<Option<String>,String>{
    use windows::{core::PCWSTR,Win32::{System::Com::*,UI::Shell::*}};
    unsafe{
        CoInitializeEx(None,COINIT_APARTMENTTHREADED).ok().map_err(|e|e.to_string())?;
        struct Com;impl Drop for Com{fn drop(&mut self){unsafe{CoUninitialize()}}}let _com=Com;
        let dialog:IFileSaveDialog=CoCreateInstance(&FileSaveDialog,None,CLSCTX_INPROC_SERVER).map_err(|e|e.to_string())?;
        let name:Vec<u16>=name.encode_utf16().chain(Some(0)).collect();dialog.SetFileName(PCWSTR(name.as_ptr())).map_err(|e|e.to_string())?;
        let title:Vec<u16>="保存喜爱 ZIP（不覆盖已有文件）\0".encode_utf16().collect();dialog.SetTitle(PCWSTR(title.as_ptr())).map_err(|e|e.to_string())?;
        let options=FILEOPENDIALOGOPTIONS(dialog.GetOptions().map_err(|e|e.to_string())?.0&!FOS_OVERWRITEPROMPT.0);
        dialog.SetOptions(options|FOS_FORCEFILESYSTEM|FOS_PATHMUSTEXIST|FOS_NOCHANGEDIR).map_err(|e|e.to_string())?;
        let extension:Vec<u16>="zip\0".encode_utf16().collect();dialog.SetDefaultExtension(PCWSTR(extension.as_ptr())).map_err(|e|e.to_string())?;
        if let Err(e)=dialog.Show(None){if e.code().0 as u32==0x800704c7{return Ok(None);}return Err(e.to_string());}
        let p=dialog.GetResult().map_err(|e|e.to_string())?.GetDisplayName(SIGDN_FILESYSPATH).map_err(|e|e.to_string())?;
        let path=p.to_string().map_err(|e|e.to_string());CoTaskMemFree(Some(p.0.cast()));path.map(Some)
    }
}
pub async fn start(app:AppHandle,session:Arc<Session>,args:&Value)->Result<Value,String>{
    if args.as_object().is_none_or(|o|o.keys().any(|k|!["id","path"].contains(&k.as_str()))){return Err("下载参数无效".into());}
    let id=args["id"].as_str().filter(|v|exports::uuid(v)).ok_or("导出任务标识无效")?.to_owned();
    let job=session.request(reqwest::Method::GET,&format!("api/v1/favorite-exports/{id}"),&[],None).await?;
    exports::job(&job)?;exports::identity(&job,"id",&id)?;
    if job["can_download"]!=true{return Err("ZIP 尚未完成或已过期，不能下载".into());}
    let path=if args.get("path").is_some(){Some(args["path"].as_str().filter(|s|s.len()<=32768&&!s.contains('\0')).ok_or("保存路径无效")?.to_owned())}else{
        #[cfg(windows)] {let name=filename(&job);tauri::async_runtime::spawn_blocking(move||choose(&name)).await.map_err(|_|"保存选择器已结束")??}
        #[cfg(not(windows))] {return Err("当前平台尚未接入 ZIP 保存选择器".into());}
    };
    let Some(path)=path else{return Ok(json!({"picked":false}));};live(&session)?;
    let target=Path::new(&path);
    if !target.is_absolute() || !target.parent().is_some_and(Path::is_dir){return Err("请选择已存在目录下的完整保存路径".into());}
    if target.try_exists().map_err(|e|format!("无法检查保存位置：{e}"))? {return Err("目标已经存在，未覆盖；请选择新的文件名".into());}
    let total=job["archive_bytes"].as_u64().filter(|n|*n>=4).ok_or("导出文件大小无效")?;
    let mut random=[0u8;16];getrandom::fill(&mut random).map_err(|_|"无法创建下载标识")?;let h=random.iter().map(|v|format!("{v:02x}")).collect::<String>();
    let task=Task{id:format!("{}-{}-{}-{}-{}",&h[..8],&h[8..12],&h[12..16],&h[16..20],&h[20..]),export_id:id.clone(),state:"queued".into(),path:path.clone(),bytes:0,total,speed:0.,error:String::new(),started:now(),finished:None,revision:0};
    {let mut data=store().lock().map_err(|_|"下载任务不可用")?;data.load();if data.records.iter().filter(|r|ACTIVE.contains(&r.task.state.as_str())).count()>=2{return Err("已有两个本机 ZIP 下载，请等待完成".into());}
        while data.records.len()>=64{let at=data.records.iter().position(|r|!ACTIVE.contains(&r.task.state.as_str())).ok_or("下载记录已满")?;data.records.remove(at);}
        data.records.push(Record{owner:owner(&session),task:task.clone()});data.persist();}
    let task_id=task.id.clone();let reply=json!({"task":task});let spawn_app=app.clone();let generation=session.generation;
    if let Err(e)=std::thread::Builder::new().name("rhvideo-zip-download".into()).spawn(move||{
        let result=tauri::async_runtime::block_on(save(&spawn_app,&session,&task_id,&id,&path,total));
        if let Err(error)=result{let _=publish(&spawn_app,generation,&task_id,|t|{t.state=if t.state=="cancelling"{"cancelled"}else{"failed"}.into();t.error=error;t.finished=Some(now());t.speed=0.;});}
    }){publish(&app,generation,&task.id,|t|{t.state="failed".into();t.error=format!("无法启动下载：{e}");t.finished=Some(now());})?;return Err(format!("无法启动下载：{e}"));}
    Ok(reply)
}

async fn save(app:&AppHandle,session:&Session,task_id:&str,id:&str,path:&str,total:u64)->Result<(),String>{
    checkpoint(session,task_id)?;publish(app,session.generation,task_id,|t|t.state="downloading".into())?;
    let response=session.client.get(session.endpoint(&format!("api/v1/favorite-exports/{id}/download"))?).bearer_auth(session.access_token().await?).send().await.map_err(super::network_error)?;
    if response.status()==reqwest::StatusCode::UNAUTHORIZED{if let Ok(mut slot)=super::SESSION.lock(){if slot.as_ref().is_some_and(|s|s.generation==session.generation){slot.take();}}}
    let parent=Path::new(path).parent().ok_or("保存目录无效")?;
    let mut output=tempfile::Builder::new().prefix(".rhvideo-download-").suffix(".part").tempfile_in(parent).map_err(|e|format!("无法创建下载临时文件：{e}"))?;
    let started=Instant::now();let mut last=Instant::now();
    let copied=copy_zip(response,total,output.as_file_mut(),|bytes|{
        checkpoint(session,task_id)?;
        if last.elapsed().as_millis()>=500||bytes==total{publish(app,session.generation,task_id,|t|{t.bytes=bytes;t.speed=bytes as f64/started.elapsed().as_secs_f64().max(0.001);})?;last=Instant::now();}Ok(())
    }).await?;
    output.as_file().sync_all().map_err(|e|format!("下载写入未完成：{e}"))?;
    // Cancellation wins until this short final commit; never delete a saved file.
    live(session)?;{let mut data=store().lock().map_err(|_|"下载任务不可用")?;let record=data.records.iter_mut().find(|r|r.task.id==task_id).ok_or("下载任务不存在")?;if record.task.state=="cancelling"{return Err("已取消下载".into());}record.task.state="publishing".into();}
    output.persist_noclobber(path).map_err(|e|format!("ZIP 未提交，目标可能已存在（未覆盖）：{e}"))?;
    publish(app,session.generation,task_id,|t|{t.bytes=copied;t.state="saved".into();t.finished=Some(now());t.speed=0.;})?;Ok(())
}

async fn copy_zip(mut response:reqwest::Response,expected:u64,output:&mut File,mut progress:impl FnMut(u64)->Result<(),String>)->Result<u64,String>{
    if response.status()!=reqwest::StatusCode::OK{
        let status=response.status();let mut body=Vec::new();while let Some(chunk)=response.chunk().await.map_err(super::network_error)?{if body.len()+chunk.len()>16384{break;}body.extend_from_slice(&chunk);}return Err(super::upstream_error(status,&body));
    }
    let mime=response.headers().get("content-type").and_then(|v|v.to_str().ok()).unwrap_or("").split(';').next().unwrap_or("").trim();
    if !["application/zip","application/x-zip-compressed","application/octet-stream"].contains(&mime){return Err("服务器未返回 ZIP 文件，未保存 HTML 或错误页面".into());}
    if response.content_length().is_some_and(|n|n!=expected){return Err("ZIP 大小与导出记录不一致，未保存".into());}
    let mut bytes=0u64;let mut prefix=Vec::with_capacity(4);progress(0)?;
    while let Some(chunk)=response.chunk().await.map_err(super::network_error)?{
        progress(bytes)?;bytes=bytes.checked_add(chunk.len()as u64).filter(|n|*n<=expected).ok_or("ZIP 超过声明大小，下载停止")?;
        let mut rest=&chunk[..];
        if prefix.len()<4{let take=(4-prefix.len()).min(rest.len());prefix.extend_from_slice(&rest[..take]);rest=&rest[take..];if prefix.len()==4{if !matches!(prefix.as_slice(),b"PK\x03\x04"|b"PK\x05\x06"|b"PK\x07\x08"){return Err("下载内容不是 ZIP，未保存".into());}output.write_all(&prefix).map_err(|e|format!("写入 ZIP 失败：{e}"))?;}}
        if prefix.len()==4{output.write_all(rest).map_err(|e|format!("写入 ZIP 失败：{e}"))?;}
        progress(bytes)?;
    }
    if bytes!=expected||prefix.len()!=4{return Err("ZIP 下载不完整，未提交文件；不会自动重试".into());}
    output.flush().map_err(|e|format!("写入 ZIP 失败：{e}"))?;Ok(bytes)
}

#[cfg(test)] mod tests{
    use super::*;use axum::{Router,routing::get,body::Body,response::Response};
    async fn response(body:&'static [u8],mime:&'static str)->(reqwest::Response,tokio::task::JoinHandle<()>){
        let router=Router::new().route("/zip",get(move||async move{Response::builder().header("content-type",mime).body(Body::from(body)).unwrap()}));
        let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let addr=listener.local_addr().unwrap();let worker=tokio::spawn(async move{axum::serve(listener,router).await.unwrap()});
        (reqwest::get(format!("http://{addr}/zip")).await.unwrap(),worker)
    }
    #[tokio::test]async fn streams_zip_without_buffering_or_accepting_error_pages_and_never_clobbers(){
        let dir=tempfile::tempdir().unwrap();let existing=dir.path().join("existing.zip");std::fs::write(&existing,b"user data").unwrap();
        let (r,worker)=response(b"PK\x03\x04zip-data","application/zip").await;let mut output=tempfile::NamedTempFile::new_in(dir.path()).unwrap();let mut updates=Vec::new();assert_eq!(copy_zip(r,12,output.as_file_mut(),|n|{updates.push(n);Ok(())}).await.unwrap(),12);assert!(updates.contains(&12));assert!(output.persist_noclobber(&existing).is_err());assert_eq!(std::fs::read(existing).unwrap(),b"user data");worker.abort();
        for (body,mime,expected)in [(&b"<html>login</html>"[..],"text/html",18),(&b"not-a-zip"[..],"application/zip",9),(&b"PK\x03\x04short"[..],"application/zip",99)]{
            let(r,worker)=response(body,mime).await;let mut output=tempfile::NamedTempFile::new_in(dir.path()).unwrap();assert!(copy_zip(r,expected,output.as_file_mut(),|_|Ok(())).await.is_err());worker.abort();
        }
    }
    #[tokio::test]async fn a_cancel_or_account_change_stops_before_a_file_can_be_committed(){
        let(r,worker)=response(b"PK\x03\x04zip-data","application/octet-stream").await;let mut output=tempfile::NamedTempFile::new().unwrap();assert!(copy_zip(r,12,output.as_file_mut(),|n|if n>0{Err("account changed".into())}else{Ok(())}).await.is_err());worker.abort();
    }
}
