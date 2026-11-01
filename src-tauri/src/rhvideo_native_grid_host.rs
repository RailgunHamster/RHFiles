//! Native GRID ownership is independent of the exclusive single PLAYER host.
use super::*;
use crate::rhvideo::player_host::{Target,Reservations};
static LIFE:crate::rhvideo_window_lifecycle::WindowLifecycle=crate::rhvideo_window_lifecycle::WindowLifecycle::new();
static RESERVATIONS:Mutex<Reservations>=Mutex::new(Reservations::new());
static SLOT:Mutex<Option<Host>>=Mutex::new(None);
#[derive(Clone)]
pub(super) struct Host {pub target:Target,pub lease:u64,pub parent:usize,pub generation:u64,pub popup_window:u64}
impl Host{
    pub fn library(&self)->bool{matches!(self.target,Target::Library{..})}
    pub fn label(&self)->&'static str{if self.library(){LIBRARY_LABEL}else{"window-rhvideo-grid"}}
    pub fn value(&self)->Value{match &self.target{Target::Library{window,panel,owner,..}=>json!({"kind":"library","window":window,"panel":panel,"owner":owner,"lease":self.lease}),_=>json!({"kind":"popup","lease":self.lease})}}
    pub fn ensure_open(&self)->Result<(),String>{
        LIFE.ensure_open(self.lease)?;
        if let Target::Library{window,panel,owner,..}=&self.target{LIBRARY_EPOCH.ensure_open(*window)?;if !RESERVATIONS.lock().map_err(|_|"同屏预约不可用")?.matches(*window,panel,*owner,self.generation){return Err("同屏面板已关闭或替换".into());}}
        Ok(())
    }
    fn same_scope(&self,target:&Target,parent:usize,generation:u64,popup:u64)->bool{
        self.parent==parent&&self.generation==generation&&match(&self.target,target){(Target::Library{window:a,panel:b,owner:c,..},Target::Library{window:x,panel:y,owner:z,..})=>a==x&&b==y&&c==z,(Target::Popup,Target::Popup)=>self.popup_window==popup,_=>false}
    }
}
pub(super) fn current()->Option<Host>{SLOT.lock().ok()?.clone()}
pub(super) fn value()->Value{current().map(|h|h.value()).unwrap_or(Value::Null)}
pub(super) fn check(args:&Value)->Result<(),String>{
    let Some(value)=args.get("_gridHostLease")else{return Ok(());};let lease=value.as_u64().filter(|v|*v>0&&*v<=crate::rhvideo::player_host::MAX_JS_ID).ok_or("同屏宿主身份无效")?;
    current().filter(|h|h.lease==lease).ok_or("同屏宿主已改变，旧操作未执行")?.ensure_open()
}
pub(super) fn prepare(args:&Value,generation:u64)->Result<Value,String>{let(window,panel)=crate::rhvideo::player_host::identity(args)?;LIBRARY_EPOCH.ensure_open(window)?;let v=RESERVATIONS.lock().map_err(|_|"同屏预约不可用")?.prepare(window,panel,generation)?;Ok(json!({"window":v.window,"panel":v.panel,"owner":v.owner}))}
pub(super) fn retire(args:&Value,generation:u64)->Result<(bool,Option<u64>),String>{
    let(window,panel)=crate::rhvideo::player_host::identity(args)?;let owner=args["owner"].as_u64().filter(|v|*v>0).ok_or("同屏预约身份无效")?;
    let mut reservations=RESERVATIONS.lock().map_err(|_|"同屏预约不可用")?;if !reservations.matches(window,&panel,owner,generation){return Ok((false,None));}reservations.retire(owner);
    let host=current().filter(|h|h.generation==generation&&matches!(&h.target,Target::Library{window:w,panel:p,owner:o,..}if *w==window&&*o==owner&&*p==panel));if let Some(h)=host{LIFE.close(h.lease);Ok((true,Some(h.lease)))}else{Ok((true,None))}
}
pub(super) fn stop(){let host=SLOT.lock().ok().and_then(|mut slot|slot.take());if let Some(host)=host{LIFE.close(host.lease);if let Target::Library{owner,..}=host.target{if let Ok(mut reservations)=RESERVATIONS.lock(){reservations.retire(owner);}}}}
pub(super) fn retire_popup(window:u64){if let Some(h)=current().filter(|h|!h.library()&&h.popup_window==window){LIFE.close(h.lease);}}
pub(super) fn library_destroyed(app:AppHandle,window:u64){let _reservation=RESERVATIONS.lock();if let Some(host)=current().filter(|h|matches!(h.target,Target::Library{window:w,..}if w==window)){LIFE.close(host.lease);let lease=host.lease;tauri::async_runtime::spawn(crate::rhvideo::grid_host_destroyed(app,lease));}}
pub(super) async fn select(app:&AppHandle,target:Target,generation:u64)->Result<(tauri::WebviewWindow,Host),String>{
    if target==Target::Current{let host=current().ok_or("同屏宿主不存在")?;host.ensure_open()?;let view=app.get_webview_window(host.label()).ok_or("同屏窗口已关闭")?;return Ok((view,host));}
    let (view,popup)=match &target{
        Target::Library{window,panel,owner,..}=>{LIBRARY_EPOCH.ensure_open(*window)?;if !RESERVATIONS.lock().map_err(|_|"同屏预约不可用")?.matches(*window,panel,*owner,generation){return Err("同屏面板已关闭或替换".into());}(app.get_webview_window(LIBRARY_LABEL).ok_or("媒体库已关闭")?,0)},
        Target::Popup=>{
            if let Some(view)=app.get_webview_window("window-rhvideo-grid"){(view,GRID_WINDOW_EPOCH.load(std::sync::atomic::Ordering::SeqCst))}
            else{let view=crate::rhvideo::client_window(app.clone(),"window-rhvideo-grid","rhvideo-grid.html","RHFiles · 多视频",(1200.,820.),(700.,500.)).await?;let popup=GRID_WINDOW_EPOCH.fetch_add(1,std::sync::atomic::Ordering::SeqCst)+1;let resized=view.clone();let app=app.clone();view.on_window_event(move|e|match e{WindowEvent::Resized(_)|WindowEvent::ScaleFactorChanged{..}=>layout_grid(&resized),WindowEvent::Destroyed=>{retire_popup(popup);tauri::async_runtime::spawn(crate::rhvideo::grid_window_destroyed(app.clone(),popup));},_=>{}});(view,popup)}
        },Target::Current=>unreachable!(),
    };
    let parent=view.hwnd().map_err(|e|e.to_string())?.0 as usize;
    if let Some(host)=current().filter(|h|h.same_scope(&target,parent,generation,popup)){host.ensure_open()?;return Ok((view,host));}
    // A cancelled new reservation must not mint a lifetime which poisons the
    // preceding host. Destruction and retirement use this same lock order.
    let reservation=if let Target::Library{window,panel,owner,..}=&target{let guard=RESERVATIONS.lock().map_err(|_|"同屏预约不可用")?;LIBRARY_EPOCH.ensure_open(*window)?;if !guard.matches(*window,panel,*owner,generation){return Err("同屏面板已关闭或替换".into());}Some(guard)}else{None};
    let mut slot=SLOT.lock().map_err(|_|"同屏宿主不可用")?;let host=Host{target,lease:LIFE.begin(),parent,generation,popup_window:popup};*slot=Some(host.clone());drop(slot);drop(reservation);Ok((view,host))
}
pub(super) async fn bounds(app:AppHandle,args:Value)->Result<Value,String>{
    let host=current().filter(Host::library).ok_or("库内同屏未打开")?;check(&args)?;host.ensure_open()?;let view=app.get_webview_window(LIBRARY_LABEL).ok_or("媒体库已关闭")?;
    let (tx,rx)=tokio::sync::oneshot::channel();app.run_on_main_thread(move||{let result=(||{
        // Keep the logical owner locked across the actual HWND operations.
        // Neither a retired scope nor queued old geometry may move a new cell.
        LIFE.ensure_open(host.lease)?;let Target::Library{window,panel,owner,..}=&host.target else{return Err("同屏宿主无效".into());};LIBRARY_EPOCH.ensure_open(*window)?;
        let reservations=RESERVATIONS.lock().map_err(|_|"同屏预约不可用")?;if !reservations.matches(*window,panel,*owner,host.generation){return Err("同屏面板已关闭，旧布局未执行".into());}
        if args["_gridHostLease"].as_u64()!=Some(host.lease){return Err("同屏布局宿主已改变".into());}
        let grid=GRID.lock().map_err(|_|"同屏不可用")?;let inputs=grid.players.iter().map(|p|p.input_id).collect::<Vec<_>>();let cells=crate::rhvideo::grid_layout::parse(&args,&inputs)?;
        let scale=view.scale_factor().map_err(|e|e.to_string())?;let size=view.inner_size().map_err(|e|e.to_string())?;
        for cell in cells{let engine=&grid.players[cell.index];if engine.input_id!=cell.input||!engine.surface.current(){return Err("同屏画布已改变，旧布局未执行".into());}
            let x=(cell.rect[0]*scale).round() as i32;let y=(cell.rect[1]*scale).round() as i32;let width=(cell.rect[2]*scale).round() as i32;let height=(cell.rect[3]*scale).round() as i32;
            // Evaluate renderer readiness HERE, not in a WebView snapshot.
            // Native paused-frame restoration may have completed since the
            // layout request was sent; old UI state must not re-hide it.
            let state=engine.state();let alpha=if state["restoringPausedFrame"]==true||(state["renderedFrames"].as_u64().unwrap_or(0)==0&&state["freshSurfaceInput"]!=true){0}else{255};
            unsafe{let hwnd=HWND(engine.child as Ptr);if cell.visible&&x<size.width as i32&&y<size.height as i32{MoveWindow(hwnd,x,y,width.min(size.width as i32-x).max(1),height.min(size.height as i32-y).max(1),true).map_err(|e|e.to_string())?;SetLayeredWindowAttributes(hwnd,windows::Win32::Foundation::COLORREF(0),alpha,LWA_ALPHA).map_err(|e|e.to_string())?;SetWindowPos(hwnd,Some(HWND_TOP),0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE|SWP_SHOWWINDOW).map_err(|e|e.to_string())?;}else{let _=ShowWindow(hwnd,SW_HIDE);}}
        }drop(grid);drop(reservations);Ok::<_,String>(json!({"laidOut":true,"host":host.value(),"expectedInputs":inputs}))
    })();let _=tx.send(result);}).map_err(|e|e.to_string())?;rx.await.map_err(|_|"媒体库已关闭")?
}
