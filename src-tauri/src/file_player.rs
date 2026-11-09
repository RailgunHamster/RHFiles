//! The file viewer reuses the maintained libVLC engine, independently of RHVideo.
use super::*;
use std::sync::atomic::{AtomicU64,Ordering};
static FILE_ENGINE:Mutex<Option<Engine>>=Mutex::new(None);
static EPOCH:AtomicU64=AtomicU64::new(0);
pub(crate) fn stop(){
    EPOCH.fetch_add(1,Ordering::SeqCst);
    if let Ok(mut slot)=FILE_ENGINE.lock(){if let Some(engine)=slot.take(){tauri::async_runtime::spawn_blocking(move||release_surface(engine));}}
}
pub(crate) fn paint(hwnd:HWND)->bool{if let Ok(slot)=FILE_ENGINE.try_lock(){if let Some(engine)=slot.as_ref().filter(|e|e.child==hwnd.0 as usize&&e.surface.current()){return !engine.compatibility||engine.frame.render();}}false}
pub(crate) async fn open(app:AppHandle,url:String,title:String,generation:u64,selection:u64)->Result<Value,String>{
    let epoch=EPOCH.fetch_add(1,Ordering::SeqCst)+1;
    let old=FILE_ENGINE.lock().map_err(|_|"播放器状态不可用")?.take();
    if let Some(old)=old{tauri::async_runtime::spawn_blocking(move||release_surface(old)).await.map_err(|_|"旧播放器释放失败")?;}
    let view=app.get_webview_window("window-file-viewer").ok_or("查看器已关闭")?;
    let (tx,rx)=tokio::sync::oneshot::channel();
    app.run_on_main_thread(move||{let result=(||{let parent=view.hwnd().map_err(|e|e.to_string())?;let surface=create_surface(HWND(parent.0),16,16,WS_EX_LAYERED|WS_EX_TRANSPARENT)?;unsafe{let _=SetLayeredWindowAttributes(HWND(surface.child as Ptr),windows::Win32::Foundation::COLORREF(0),0,LWA_ALPHA);}Ok::<_,String>(surface)})();if let Err(Ok(surface))=tx.send(result){surface.close();}}).map_err(|e|e.to_string())?;
    let surface=rx.await.map_err(|_|"播放器画布创建结束")??;
    tauri::async_runtime::spawn_blocking(move||{
        let create=(||{let mut engine=Engine::new(surface)?;engine.shared_gain=true;control_engine(&mut engine,&json!({"command":"volume","value":100}))?;engine.open(&url,title,0.)?;Ok::<_,String>(engine)})();
        let engine=match create{Ok(engine)=>engine,Err(error)=>{surface.close();return Err(error)}};
        let mut slot=FILE_ENGINE.lock().map_err(|_|"播放器状态不可用")?;
        if EPOCH.load(Ordering::SeqCst)!=epoch||!crate::file_viewer::is_current(generation,selection){drop(slot);release_surface(engine);return Err("查看内容已切换，旧播放已释放".into())}
        let state=engine.state();*slot=Some(engine);Ok(state)
    }).await.map_err(|_|"播放器准备结束".to_owned())?
}
pub(crate) async fn request(app:AppHandle,action:&str,args:Value)->Result<Value,String>{
    if action=="video.bounds"{
        let view=app.get_webview_window("window-file-viewer").ok_or("查看器已关闭")?;let (tx,rx)=tokio::sync::oneshot::channel();
        app.run_on_main_thread(move||{let result=(||{
            let scale=view.scale_factor().map_err(|e|e.to_string())?;let size=view.inner_size().map_err(|e|e.to_string())?;
            let slot=FILE_ENGINE.lock().map_err(|_|"播放器状态不可用")?;let Some(engine)=slot.as_ref().filter(|e|args["expectedInput"].as_u64()==Some(e.input_id))else{return Ok(json!({"stale":true}))};
            let mut r=[0i32;4];for(i,key)in["x","y","width","height"].iter().enumerate(){let n=args[*key].as_f64().filter(|v|v.is_finite()&&(0.0..=100000.).contains(v)).ok_or("媒体区域无效")?;r[i]=(n*scale).round() as i32;}
            r[0]=r[0].min(size.width.saturating_sub(1) as i32);r[1]=r[1].min(size.height.saturating_sub(1) as i32);r[2]=r[2].max(1).min(size.width as i32-r[0]);r[3]=r[3].max(1).min(size.height as i32-r[1]);
            let hwnd=HWND(engine.child as Ptr);unsafe{MoveWindow(hwnd,r[0],r[1],r[2],r[3],true).map_err(|e|e.to_string())?;SetLayeredWindowAttributes(hwnd,windows::Win32::Foundation::COLORREF(0),if engine.state()["renderedFrames"].as_u64().unwrap_or(0)>0{255}else{0},LWA_ALPHA).map_err(|e|e.to_string())?;SetWindowPos(hwnd,Some(HWND_TOP),0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE|SWP_SHOWWINDOW).map_err(|e|e.to_string())?;}repaint_after_layout(engine);Ok::<_,String>(json!({"updated":true}))
        })();let _=tx.send(result);}).map_err(|e|e.to_string())?;return rx.await.map_err(|_|"播放器布局结束".to_owned())?;
    }
    let mut slot=FILE_ENGINE.lock().map_err(|_|"播放器状态不可用")?;
    let Some(engine)=slot.as_mut()else{return if action=="video.state"{Ok(json!({"opened":false}))}else{Err("播放器尚未就绪".into())}};
    if action=="video.control"{if args["expectedInput"].as_u64()!=Some(engine.input_id){return Err("播放输入已改变，旧操作未执行".into())}control_engine(engine,&args)?;}Ok(engine.state())
}
