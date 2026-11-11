//! libVLC 3.x renders to a real Win32 child window. No HTML video or vlc.exe.
//! DLLs are loaded only from the installed/bundled VLC directory with a safe
//! dependency search path; never from a media folder or the working directory.
use libloading::Library;
use futures_util::FutureExt;
use serde_json::{json, Value};
use std::{
    ffi::{c_char, c_void, CStr, CString},
    path::PathBuf,
    sync::Mutex,
};
use tauri::{AppHandle, Manager, WindowEvent, Emitter};
use windows::{
    core::w,
    Win32::{
        Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM,RECT},
        Graphics::Gdi::{BeginPaint, EndPaint, PAINTSTRUCT},
        System::LibraryLoader::GetModuleHandleW,
        UI::{WindowsAndMessaging::*, Input::KeyboardAndMouse::{SetFocus,GetKeyState,VK_CONTROL,VK_SHIFT,VK_MENU}},
    },
};
#[path="rhvideo_preload_slot.rs"]
mod warm_state;
#[path="rhvideo_surface_lifecycle.rs"]
mod surface_lifecycle;
#[path="rhvideo_native_grid_host.rs"]
mod grid_host;
#[path="rhvideo_shared_media.rs"]
pub(crate) mod shared_media;
#[path="file_player.rs"]
pub(crate) mod file_player;

const LABEL: &str = "window-rhvideo-player";
const CONTROLS_HEIGHT:f64=196.;
// 0.25x stretches the 1 s network delay beyond VLC 3's 3 s audio clock bound.
// Hidden/silent restoration must prepare at a normal, supported clock rate.
const PAUSE_PREPARE_RATE:f32=1.;
fn trace_startup(started:std::time::Instant,stage:&str){
    #[cfg(any(debug_assertions,feature="rhvideo-host-trace"))]
    crate::rhvideo_trace::stage("engine",started,stage);
    if cfg!(debug_assertions)&&std::env::var_os("RHFILES_VLC_DEBUG").is_some(){
        eprintln!("RHFILES_VLC_STAGE {stage} {}",started.elapsed().as_millis());
    }
}
// Controlled startup comparisons only. Release playback must not inherit an
// arbitrary environment option, and a media server cannot change this value.
fn diagnostic_logging()->bool{
    #[cfg(debug_assertions)]
    {std::env::var_os("RHFILES_VLC_DEBUG").is_some()||crate::rhvideo_trace::enabled()}
    #[cfg(not(debug_assertions))]
    {false}
}
fn network_cache_ms()->u32{
    #[cfg(debug_assertions)]
    if let Some(value)=std::env::var_os("RHFILES_VLC_NETWORK_CACHE_MS"){
        if let Some(value)=value.to_str().and_then(|v|v.parse::<u32>().ok()).filter(|v|(100..=10_000).contains(v)){return value;}
    }
    1000
}
fn trace_open(started:std::time::Instant,stage:&str){
    #[cfg(any(debug_assertions,feature="rhvideo-host-trace"))]
    crate::rhvideo_trace::stage("play",started,stage);
    if cfg!(debug_assertions)&&std::env::var_os("RHFILES_VLC_DEBUG").is_some(){
        eprintln!("RHFILES_PLAY_STAGE {stage} {}",started.elapsed().as_millis());
    }
}
static WINDOW_EPOCH:crate::rhvideo_window_lifecycle::WindowLifecycle=crate::rhvideo_window_lifecycle::WindowLifecycle::new();
const LIBRARY_LABEL:&str="window-rhvideo";
static LIBRARY_EPOCH:crate::rhvideo_window_lifecycle::WindowLifecycle=crate::rhvideo_window_lifecycle::WindowLifecycle::new();
#[derive(Clone)]
struct SingleHost{target:crate::rhvideo::player_host::Target,lease:u64,parent:usize,viewport:(u32,u32),generation:u64,fullscreen_before:bool}
static HOST_RESERVATIONS:Mutex<crate::rhvideo::player_host::Reservations>=Mutex::new(crate::rhvideo::player_host::Reservations::new());
impl SingleHost{
    fn library(&self)->bool{matches!(self.target,crate::rhvideo::player_host::Target::Library{..})}
    fn label(&self)->&'static str{if self.library(){LIBRARY_LABEL}else{LABEL}}
    fn ensure_open(&self)->Result<(),String>{
        WINDOW_EPOCH.ensure_open(self.lease)?;
        if let crate::rhvideo::player_host::Target::Library{window,panel,owner,..}=&self.target{LIBRARY_EPOCH.ensure_open(*window)?;if !HOST_RESERVATIONS.lock().map_err(|_|"播放预约状态不可用")?.matches(*window,panel,*owner,self.generation){return Err("播放面板已关闭或替换，旧准备未执行".into());}}
        require_player_window(self.lease,self.parent)
    }
    fn value(&self)->Value{match &self.target{crate::rhvideo::player_host::Target::Library{window,panel,owner,..}=>json!({"kind":"library","lease":self.lease,"window":window,"panel":panel,"owner":owner}),_=>json!({"kind":"popup","lease":self.lease})}}
}
static SINGLE_HOST:Mutex<Option<SingleHost>>=Mutex::new(None);
fn single_host()->Option<SingleHost>{SINGLE_HOST.lock().ok()?.clone()}
pub fn host_value()->Value{single_host().map(|host|host.value()).unwrap_or(Value::Null)}
pub fn player_window_label()->&'static str{single_host().map(|host|host.label()).unwrap_or(LABEL)}
pub fn check_host(args:&Value)->Result<(),String>{
    let Some(expected)=args.get("_hostLease")else{return Ok(());};let expected=expected.as_u64().filter(|id|*id>0).ok_or("播放宿主身份无效")?;
    let host=single_host().filter(|host|host.lease==expected).ok_or("播放面板已改变，旧操作未执行")?;host.ensure_open()
}
pub fn library_host_context()->Result<Value,String>{
    let window=LIBRARY_EPOCH.current();LIBRARY_EPOCH.ensure_open(window)?;
    if window>crate::rhvideo::player_host::MAX_JS_ID{return Err("媒体库窗口身份已耗尽".into());}
    Ok(json!({"window":window}))
}
pub fn prepare_library_scope(args:&Value,generation:u64)->Result<Value,String>{
    let(window,panel)=crate::rhvideo::player_host::identity(args)?;LIBRARY_EPOCH.ensure_open(window)?;
    let value=HOST_RESERVATIONS.lock().map_err(|_|"播放预约状态不可用")?.prepare(window,panel,generation)?;Ok(json!({"window":value.window,"panel":value.panel,"owner":value.owner}))
}
pub fn library_scope()->Option<Value>{single_host().filter(SingleHost::library).map(|host|host.value())}
pub fn cancel_popup_preparation(generation:u64,cancel:impl FnOnce())->Result<(),String>{
    // Keep this tiny reservation lock across only the atomic cancellation,
    // never PLAY_LOCK, the GUI queue or a decoder call. A later library prepare
    // must observe cancellation before it captures its preparation epoch.
    let reservations=HOST_RESERVATIONS.lock().map_err(|_|"播放预约状态不可用")?;
    if !reservations.has_current(generation){cancel();}Ok(())
}
pub fn retire_library_scope(args:&Value,generation:u64)->Result<(bool,Option<u64>,u64),String>{
    let(window,panel)=crate::rhvideo::player_host::identity(args)?;let owner=args["owner"].as_u64().filter(|id|*id>0).ok_or("播放预约身份无效")?;
    {let mut reservations=HOST_RESERVATIONS.lock().map_err(|_|"播放预约状态不可用")?;if !reservations.matches(window,&panel,owner,generation){return Ok((false,None,owner));}reservations.retire(owner);}
    let host=single_host().filter(|host|host.generation==generation&&matches!(&host.target,crate::rhvideo::player_host::Target::Library{owner:current,..}if *current==owner));
    if let Some(host)=host{WINDOW_EPOCH.close(host.lease);Ok((true,Some(host.lease),owner))}else{Ok((true,None,owner))}
}
pub fn owns_retired_scope(owner:u64,lease:u64,generation:u64)->bool{single_host().is_some_and(|host|host.lease==lease&&WINDOW_EPOCH.is_current(lease)&&host.generation==generation&&matches!(host.target,crate::rhvideo::player_host::Target::Library{owner:current,..}if current==owner))}
pub fn install_library_host_lifetime(window:&tauri::WebviewWindow){
    if window.label()!=LIBRARY_LABEL{return;}
    let token=LIBRARY_EPOCH.begin();let app=window.app_handle().clone();
    window.on_window_event(move|event|{if matches!(event,WindowEvent::Destroyed)&&LIBRARY_EPOCH.close(token){
        let retired=shared_media::retire_all();
        tauri::async_runtime::spawn_blocking(move||{for engine in retired{release_surface(engine);}});
        grid_host::library_destroyed(app.clone(),token);
        if let Some(host)=single_host().filter(|host|matches!(&host.target,crate::rhvideo::player_host::Target::Library{window,..}if *window==token)){
            if WINDOW_EPOCH.close(host.lease){let owner=app.clone();tauri::async_runtime::spawn(crate::rhvideo::player_window_destroyed(owner,host.lease));}
        }
    }});
}
pub fn finish_host_view(app:&AppHandle,reason:&str)->Result<bool,String>{
    if let Some(host)=single_host().filter(SingleHost::library){
        let crate::rhvideo::player_host::Target::Library{window:physical,..}=host.target else{unreachable!()};
        if LIBRARY_EPOCH.ensure_open(physical).is_err(){return Ok(true);}
        if let Some(window)=app.get_webview_window(LIBRARY_LABEL){if LIBRARY_EPOCH.ensure_open(physical).is_err(){return Ok(true);}if window.is_fullscreen().map_err(|e|e.to_string())?!=host.fullscreen_before{window.set_fullscreen(host.fullscreen_before).map_err(|e|e.to_string())?;}}
        app.emit_to(LIBRARY_LABEL,"rhvideo-player-closed",json!({"host":host.value(),"reason":reason})).map_err(|e|e.to_string())?;return Ok(true);
    }
    if let Some(window)=app.get_webview_window(LABEL){window.close().map_err(|e|format!("播放器已停止，但窗口关闭失败：{e}"))?;}Ok(false)
}
static GRID_WINDOW_EPOCH:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
static PLAYER: Mutex<Option<Engine>> = Mutex::new(None);
static INPUT_APP: std::sync::OnceLock<AppHandle> = std::sync::OnceLock::new();
static INPUT_SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
static STATE_PROBE_SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
#[cfg(debug_assertions)]
unsafe extern "system" fn trace_window_proc(hwnd:HWND,message:u32,wparam:WPARAM,lparam:LPARAM,id:usize,role:usize)->LRESULT{
    unsafe{
        let started=std::time::Instant::now();
        if message==WM_NCDESTROY{let _=windows::Win32::UI::Shell::RemoveWindowSubclass(hwnd,Some(trace_window_proc),id);}
        let result=windows::Win32::UI::Shell::DefSubclassProc(hwnd,message,wparam,lparam);
        if started.elapsed().as_millis()>=20{
            if crate::rhvideo_trace::host_enabled(){crate::rhvideo_trace::stage(&format!("window-{role}"),started,&format!("message-{message:#x}"));}
            if std::env::var_os("RHFILES_VLC_DEBUG").is_some(){eprintln!("RHFILES_WINDOW_STAGE {role} {message:#x} {}",started.elapsed().as_millis());}
        }
        result
    }
}
pub(crate) fn install_window_trace(window:&tauri::WebviewWindow){
    #[cfg(debug_assertions)]
    if std::env::var_os("RHFILES_VLC_DEBUG").is_some()||crate::rhvideo_trace::host_enabled(){
        let role=match window.label(){"window-rhvideo"=>1,"window-rhvideo-player"=>2,"window-rhvideo-grid"=>3,_=>0};
        if let Ok(hwnd)=window.hwnd(){unsafe{let _=windows::Win32::UI::Shell::SetWindowSubclass(HWND(hwnd.0),Some(trace_window_proc),0x52485052,role);}}
        // Wry dispatches protocol responses on its own controller container,
        // not on Tauri's outer HWND. Observe that self-owned window as well.
        let _=window.with_webview(move|platform|unsafe{
            let mut parent=windows61::Win32::Foundation::HWND::default();
            if platform.controller().ParentWindow(&mut parent).is_ok()&&!parent.0.is_null(){
                let _=windows::Win32::UI::Shell::SetWindowSubclass(HWND(parent.0),Some(trace_window_proc),0x52485052,role+10);
            }
        });
    }
    #[cfg(not(debug_assertions))]let _=window;
}
static INPUT_AT: std::sync::LazyLock<Mutex<std::collections::HashMap<usize,std::time::Instant>>> = std::sync::LazyLock::new(||Mutex::new(std::collections::HashMap::new()));
// Only recognized media intents leave the native canvas. Never forward raw
// keystrokes, install global hooks, or read input from another application.
fn surface_intent(message:u32,wparam:usize,lparam:isize,modified:bool)->Option<&'static str>{
    if modified{return None;}
    if message==WM_MOUSEWHEEL{return match ((wparam>>16) as u16) as i16{0=>None,n if n>0=>Some("previous"),_=>Some("next")};}
    if message==WM_MOUSEHWHEEL{return match ((wparam>>16) as u16) as i16{0=>None,n if n>0=>Some("next"),_=>Some("previous")};}
    if message==WM_LBUTTONDBLCLK{return Some("expand");}
    if message!=WM_KEYDOWN{return None;}
    if lparam&(1<<30)!=0{return None;} // one intent per physical key press
    match wparam{0x1b=>Some("close"),0x20=>Some("toggle"),0x25=>Some("previous"),0x27=>Some("next"),0x24=>Some("first"),0x23=>Some("last"),0x2e=>Some("mark"),_=>None}
}
fn surface_binding(child:usize)->Option<(&'static str,u64,Option<usize>,Option<u64>)>{
    let host=single_host().filter(|host|host.ensure_open().is_ok());
    let single=PLAYER.try_lock().ok().and_then(|p|p.as_ref().filter(|p|p.child==child&&p.surface.current()).map(|p|p.input_id));
    single.and_then(|input|host.map(|host|(host.label(),input,None,Some(host.lease)))).or_else(||{
        let host=grid_host::current().filter(|h|h.ensure_open().is_ok())?;
        GRID.try_lock().ok().and_then(|g|g.players.iter().enumerate().find(|(_,p)|p.child==child&&p.surface.current()).map(|(index,p)|(host.label(),p.input_id,Some(index),Some(host.lease))))
    })
}
fn emit_surface_input(child:usize,intent:&str)->bool{
    let Some(app)=INPUT_APP.get() else{return false;};
    let Some((label,input,target,host_lease))=surface_binding(child) else{return false;};
    if matches!(intent,"next"|"previous"){
        let Ok(mut at)=INPUT_AT.try_lock() else{return true;};
        let now=std::time::Instant::now();if at.get(&child).is_some_and(|last|now.duration_since(*last)<std::time::Duration::from_millis(180)){return true;}
        at.insert(child,now);
    }
    let topic=if target.is_some(){"rhvideo-grid-input"}else{"rhvideo-native-input"};
    let _=app.emit_to(label,topic,json!({"inputId":input,"intent":intent,"target":target,"hostLease":host_lease}));true
}
pub fn check_input(args:&Value)->Result<(),String>{
    check_host(args)?;
    let Some(expected)=args.get("expectedInput") else{return Ok(());};
    let expected=expected.as_u64().ok_or("播放输入标识无效")?;
    if !PLAYER.lock().map_err(|_|"播放器不可用")?.as_ref().is_some_and(|p|p.input_id==expected){return Err("播放输入已改变，旧操作未执行".into());}Ok(())
}
pub fn check_grid_input(args:&Value)->Result<(),String>{
    grid_host::check(args)?;
    let grid=GRID.lock().map_err(|_|"网格不可用")?;
    crate::rhvideo::grid_input::check(args,&grid.players.iter().map(|p|p.input_id).collect::<Vec<_>>())
}
static PAGE_VOLUME: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(20);
fn effective_volume(local: i32) -> i32 {
    (local.clamp(0,100) as u32 * PAGE_VOLUME.load(std::sync::atomic::Ordering::Acquire) / 100) as i32
}
pub fn page_volume(value: u32) -> Result<Value, String> {
    if value > 100 { return Err("页面音量范围是 0–100".into()); }
    PAGE_VOLUME.store(value,std::sync::atomic::Ordering::Release);
    for slot in [&PLAYER,&PRESENTATION] {
        if let Some(player)=slot.lock().map_err(|_|"播放器状态不可用")?.as_ref() {
            unsafe { (player.api.set_volume)(player.player as Ptr,player.output_gain()); }
        }
    }
    if let Some(player)=WARM.lock().map_err(|_|"预加载状态不可用")?.resource(){
        unsafe{(player.api.set_volume)(player.player as Ptr,player.output_gain());}
    }
    for player in &GRID.lock().map_err(|_|"网格状态不可用")?.players {
        unsafe { (player.api.set_volume)(player.player as Ptr,player.output_gain()); }
    }
    Ok(json!({"volume":value}))
}
static WARM: Mutex<warm_state::Slot<Engine,Value>> = Mutex::new(warm_state::Slot::new());
static WARM_JOBS: Mutex<Vec<(warm_state::Ticket,tauri::async_runtime::JoinHandle<()>)>> = Mutex::new(Vec::new());
static WARM_ACTIVE:std::sync::atomic::AtomicUsize=std::sync::atomic::AtomicUsize::new(0);
struct ActivePreload;
impl ActivePreload{fn new()->Self{WARM_ACTIVE.fetch_add(1,std::sync::atomic::Ordering::SeqCst);Self}}
impl Drop for ActivePreload{fn drop(&mut self){WARM_ACTIVE.fetch_sub(1,std::sync::atomic::Ordering::SeqCst);}}
static WARM_BUILD: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static PRESENTATION: Mutex<Option<Engine>> = Mutex::new(None);
static PRESENTATION_EPOCH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static GRID: Mutex<Grid> = Mutex::new(Grid {
    players: Vec::new(),
    expanded: None,
    ids:Vec::new(),rects:Vec::new(),lease:0,
});
struct Grid {
    players: Vec<Engine>,
    expanded: Option<usize>,
    ids:Vec<String>,rects:Vec<Option<[f64;4]>>,lease:u64,
}
static CLOSE_SURFACE:std::sync::OnceLock<Result<u32,String>>=std::sync::OnceLock::new();
fn close_surface_message()->Result<u32,String>{
    CLOSE_SURFACE.get_or_init(||{let message=unsafe{RegisterWindowMessageW(w!("RHFiles.NativeVideoSurface.Close.v1"))};if message==0{Err("无法注册原生画布清理消息".into())}else{Ok(message)}}).clone()
}
static SURFACE_SEQUENCE:surface_lifecycle::Sequence=surface_lifecycle::Sequence::new();
#[derive(Clone,Copy)]
struct Surface { child:usize, generation:usize }
impl Surface {
    fn current(self)->bool{unsafe{let hwnd=HWND(self.child as Ptr);let mut process=0;GetWindowThreadProcessId(hwnd,Some(&mut process))!=0&&process==std::process::id()&&GetWindowLongPtrW(hwnd,GWLP_USERDATA) as usize==self.generation}}
    fn close(self){
        // Validation occurs when the owning GUI thread receives this message,
        // not in an IsWindow/GetProp -> PostMessage race on the decoder worker.
        if let Ok(message)=close_surface_message(){unsafe{let _=PostMessageW(Some(HWND(self.child as Ptr)),message,WPARAM(self.generation),LPARAM(std::process::id() as isize));}}
    }
}
fn create_surface(parent:HWND,width:i32,height:i32,extended:WINDOW_EX_STYLE)->Result<Surface,String>{
    surface_class()?;
    close_surface_message()?;
    let generation=SURFACE_SEQUENCE.next()?;
    let child=unsafe{CreateWindowExW(extended,w!("RHFilesNativeVideoSurface"),w!(""),WS_CHILD|WS_VISIBLE|WS_CLIPSIBLINGS|WS_CLIPCHILDREN,0,0,width,height,Some(parent),None,None,Some(generation as *const c_void))}.map_err(|e|e.to_string())?;
    Ok(Surface{child:child.0 as usize,generation})
}
struct SurfaceGuard(Vec<Surface>);
impl Drop for SurfaceGuard {
    fn drop(&mut self) {
        for surface in self.0.drain(..) {surface.close();}
    }
}
static SURFACE_CLASS: std::sync::OnceLock<Result<(), String>> = std::sync::OnceLock::new();
#[cfg(test)]
mod surface_cleanup_tests {
    use super::*;
    struct Owned(Surface);
    impl Drop for Owned { fn drop(&mut self){unsafe{let _=DestroyWindow(HWND(self.0.child as Ptr));}} }
    fn owned_message_surface()->Owned {
        Owned(create_surface(HWND_MESSAGE,16,16,WINDOW_EX_STYLE::default()).unwrap())
    }
    #[test]
    fn untagged_delayed_close_cannot_destroy_a_native_surface() {
        let window=owned_message_surface();
        // A bare HWND cannot prove that an asynchronous cleanup still owns it.
        let hwnd=HWND(window.0.child as Ptr);
        unsafe{SendMessageW(hwnd,WM_CLOSE,Some(WPARAM(0)),Some(LPARAM(0)));}
        assert!(unsafe{IsWindow(Some(hwnd))}.as_bool(),"An untagged cleanup must not destroy a possibly reused native HWND");
    }
    fn dispatch_close(hwnd:HWND){
        let mut message=MSG::default();let registered=close_surface_message().unwrap();
        assert!(unsafe{PeekMessageW(&mut message,Some(hwnd),registered,registered,PM_REMOVE)}.as_bool());
        unsafe{DispatchMessageW(&message);}
    }
    #[test]
    fn receiver_rejects_a_stale_generation_and_accepts_its_own_queued_cleanup(){
        let old=owned_message_surface();let retired=old.0;drop(old);
        let new=owned_message_surface();let hwnd=HWND(new.0.child as Ptr);
        // Exercise the ABA case deterministically even if Windows chooses a
        // different HWND value today: the old generation targets the new HWND.
        Surface{child:new.0.child,generation:retired.generation}.close();dispatch_close(hwnd);
        assert!(unsafe{IsWindow(Some(hwnd))}.as_bool());
        new.0.close();dispatch_close(hwnd);assert!(!unsafe{IsWindow(Some(hwnd))}.as_bool());
    }
    #[test]
    fn parent_destruction_does_not_need_an_untagged_child_close_message(){
        let parent=owned_message_surface();let child=create_surface(HWND(parent.0.child as Ptr),16,16,WINDOW_EX_STYLE::default()).unwrap();
        drop(parent);assert!(!unsafe{IsWindow(Some(HWND(child.child as Ptr)))}.as_bool());
    }
    #[test]
    fn a_failed_handoff_guard_posts_only_generation_checked_cleanup(){
        let window=owned_message_surface();let hwnd=HWND(window.0.child as Ptr);
        drop(SurfaceGuard(vec![window.0]));assert!(unsafe{IsWindow(Some(hwnd))}.as_bool());
        dispatch_close(hwnd);assert!(!unsafe{IsWindow(Some(hwnd))}.as_bool());
    }
    #[test]
    fn another_process_identity_cannot_retire_a_same_generation_surface(){
        let window=owned_message_surface();let hwnd=HWND(window.0.child as Ptr);let message=close_surface_message().unwrap();assert!(message>=0xc000,"Registered messages do not collide with private WM_APP protocols");
        unsafe{SendMessageW(hwnd,message,Some(WPARAM(window.0.generation)),Some(LPARAM((std::process::id()^0x80000000) as isize)));}
        assert!(unsafe{IsWindow(Some(hwnd))}.as_bool());window.0.close();dispatch_close(hwnd);assert!(!unsafe{IsWindow(Some(hwnd))}.as_bool());
    }
    #[test]
    fn deferred_paint_expires_and_stale_timer_messages_cannot_restart_it(){
        let window=owned_message_surface();let hwnd=HWND(window.0.child as Ptr);let key=(window.0.child,window.0.generation);
        finish_paint(hwnd,false);assert!(REPAINT_UNTIL.lock().unwrap().contains_key(&key));
        REPAINT_UNTIL.lock().unwrap().insert(key,std::time::Instant::now()-std::time::Duration::from_secs(1));
        unsafe{SendMessageW(hwnd,WM_TIMER,Some(WPARAM(REPAINT_TIMER)),Some(LPARAM(0)));}
        assert!(!REPAINT_UNTIL.lock().unwrap().contains_key(&key));
        unsafe{SendMessageW(hwnd,WM_TIMER,Some(WPARAM(REPAINT_TIMER)),Some(LPARAM(0)));}
        assert!(!REPAINT_UNTIL.lock().unwrap().contains_key(&key),"a queued old timer cannot create a new retry budget");
        finish_paint(hwnd,false);finish_paint(hwnd,true);assert!(!REPAINT_UNTIL.lock().unwrap().contains_key(&key));
    }
}
const REPAINT_TIMER:usize=0x52485046;
static REPAINT_UNTIL:std::sync::LazyLock<Mutex<std::collections::HashMap<(usize,usize),std::time::Instant>>>=std::sync::LazyLock::new(||Mutex::new(std::collections::HashMap::new()));
fn paint_surface(hwnd:HWND)->bool{
    for slot in [&PLAYER,&PRESENTATION]{
        if let Ok(player)=slot.try_lock(){if let Some(player)=player.as_ref().filter(|p|p.child==hwnd.0 as usize&&p.surface.current()){return !player.compatibility||player.frame.render();}}
    }
    if let Ok(grid)=GRID.try_lock(){if let Some(player)=grid.players.iter().find(|p|p.child==hwnd.0 as usize&&p.surface.current()){return !player.compatibility||player.frame.render();}}
    shared_media::paint(hwnd)||file_player::paint(hwnd)
}
fn finish_paint(hwnd:HWND,painted:bool){unsafe{
    let key=(hwnd.0 as usize,GetWindowLongPtrW(hwnd,GWLP_USERDATA) as usize);
    let _=KillTimer(Some(hwnd),REPAINT_TIMER);
    let mut retries=REPAINT_UNTIL.lock().unwrap_or_else(|e|e.into_inner());
    if painted||key.1==0{retries.remove(&key);return;}
    let until=*retries.entry(key).or_insert_with(||std::time::Instant::now()+std::time::Duration::from_secs(2));
    if std::time::Instant::now()<until{let _=SetTimer(Some(hwnd),REPAINT_TIMER,16,None);}else{retries.remove(&key);}
}}
fn repaint_after_layout(player:&Engine){
    if player.compatibility&&player.surface.current(){
        // Geometry owns the engine lock, so nested WM_PAINT cannot acquire it.
        // Redraw the retained frame now and after the layered backing commits.
        player.frame.render();
        finish_paint(HWND(player.child as Ptr),false);
    }
}
unsafe extern "system" fn surface_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    unsafe {
        if message==WM_NCCREATE {
            let create=&*(lparam.0 as *const CREATESTRUCTW);
            SetWindowLongPtrW(hwnd,GWLP_USERDATA,create.lpCreateParams as isize);
        }
        if CLOSE_SURFACE.get().is_some_and(|registered|registered.as_ref().is_ok_and(|value|*value==message)){
            if surface_lifecycle::admits(GetWindowLongPtrW(hwnd,GWLP_USERDATA) as usize,wparam.0,std::process::id() as usize,lparam.0 as usize){let _=DestroyWindow(hwnd);}
            return LRESULT(0);
        }
        // Child canvases have no user close button. Parent destruction still
        // destroys them normally; asynchronous cleanup must carry its lease.
        if message==WM_CLOSE{return LRESULT(0);}
        if message==WM_NCHITTEST&&(shared_media::owns_surface(hwnd.0 as usize)||file_player::owns_surface(hwnd.0 as usize)){return LRESULT(HTTRANSPARENT as isize);}
        if message==WM_NCDESTROY{let _=KillTimer(Some(hwnd),REPAINT_TIMER);if let Ok(mut paints)=REPAINT_UNTIL.lock(){paints.remove(&(hwnd.0 as usize,GetWindowLongPtrW(hwnd,GWLP_USERDATA) as usize));}SetWindowLongPtrW(hwnd,GWLP_USERDATA,0);if let Ok(mut at)=INPUT_AT.lock(){at.remove(&(hwnd.0 as usize));}}
        if message==WM_LBUTTONDOWN&&surface_binding(hwnd.0 as usize).is_some_and(|binding|binding.0!=LIBRARY_LABEL){let _=SetFocus(Some(hwnd));}
        let modified=matches!(message,WM_KEYDOWN|WM_MOUSEWHEEL|WM_MOUSEHWHEEL)&&[VK_CONTROL,VK_SHIFT,VK_MENU].iter().any(|key|GetKeyState(key.0 as i32)<0);
        if let Some(intent)=surface_intent(message,wparam.0,lparam.0,modified){if emit_surface_input(hwnd.0 as usize,intent){return LRESULT(0);}}
        if message==WM_CONTEXTMENU{return LRESULT(0);}
        if message==WM_TIMER&&wparam.0==REPAINT_TIMER{
            let key=(hwnd.0 as usize,GetWindowLongPtrW(hwnd,GWLP_USERDATA) as usize);
            let pending=REPAINT_UNTIL.lock().is_ok_and(|v|v.get(&key).is_some_and(|until|std::time::Instant::now()<*until));
            finish_paint(hwnd,!pending||paint_surface(hwnd));return LRESULT(0);
        }
        if message == WM_ERASEBKGND {
            return LRESULT(1);
        }
        if message == WM_PAINT {
            let mut paint = PAINTSTRUCT::default();
            let _ = BeginPaint(hwnd, &mut paint);
            // render() clears its own letterbox. Do not erase a paused frame
            // before try_lock: MoveWindow may synchronously deliver WM_PAINT
            // while layout still owns the engine lock, leaving a black canvas.
            let _ = EndPaint(hwnd, &paint);
            // A re-entrant paint may run while layout/control owns an engine
            // lock. Repaint on a later GUI turn, bounded to two seconds. A
            // paused decoder produces no new frame to repair a missed paint.
            finish_paint(hwnd,paint_surface(hwnd));
            return LRESULT(0);
        }
        DefWindowProcW(hwnd, message, wparam, lparam)
    }
}
fn surface_class() -> Result<(), String> {
    SURFACE_CLASS
        .get_or_init(|| unsafe {
            let module = GetModuleHandleW(None).map_err(|e| e.to_string())?;
            let class = WNDCLASSW {
                style: CS_DBLCLKS,
                hCursor:LoadCursorW(None,IDC_ARROW).unwrap_or_default(),
                lpfnWndProc: Some(surface_proc),
                hInstance: HINSTANCE(module.0),
                lpszClassName: w!("RHFilesNativeVideoSurface"),
                ..Default::default()
            };
            if RegisterClassW(&class) == 0 {
                Err("无法注册原生视频画布".into())
            } else {
                Ok(())
            }
        })
        .clone()
}
type Ptr = *mut c_void;
// VLC 3 ABI, not the incompatible VLC 4 structure:
// https://github.com/videolan/vlc/blob/3.0.x/include/vlc/libvlc_media.h
#[repr(C)]
#[derive(Default)]
struct MediaStats {
    read: i32,
    input_bitrate: f32,
    demux_read: i32,
    demux_bitrate: f32,
    corrupted: i32,
    discontinuity: i32,
    decoded_video: i32,
    decoded_audio: i32,
    displayed: i32,
    lost: i32,
    played_audio: i32,
    lost_audio: i32,
    sent_packets: i32,
    sent_bytes: i32,
    send_bitrate: f32,
}
struct PendingSeek{input:u64,ms:i64,deadline:std::time::Instant,clamp:bool}
#[derive(Clone,Copy)]
enum PauseFramePhase{Priming,Seeking{not_before:std::time::Instant},Presenting{frames:u64},Pausing}
struct PauseFrame{target:i64,rate:f32,deadline:std::time::Instant,phase:PauseFramePhase}
#[derive(Default)]
struct SeekState{pending:Option<PendingSeek>,error:Option<String>}
impl SeekState{
    fn prepare(&mut self,input:u64,ms:i64,now:std::time::Instant){self.error=None;self.pending=Some(PendingSeek{input,ms,deadline:now+std::time::Duration::from_secs(15),clamp:false});}
    fn prepare_clamped(&mut self,input:u64,ms:i64,now:std::time::Instant){self.prepare(input,ms,now);if let Some(p)=self.pending.as_mut(){p.clamp=true;}}
    fn ready(&mut self,input:u64,duration:i64,state:i32,seekable:bool,now:std::time::Instant)->Option<i64>{
        let pending=self.pending.as_ref()?;
        if pending.input!=input{self.pending=None;return None;}
        let error=if now>=pending.deadline{Some("等待媒体就绪超时，跳转未执行")}else if matches!(state,5..=7){Some("媒体已经停止，跳转未执行")}else if duration>0&&pending.ms>duration&&!pending.clamp{Some("跳转位置超出实际媒体时长")}else{None};
        if let Some(error)=error{self.error=Some(error.into());self.pending=None;return None;}
        if duration>0&&seekable&&matches!(state,3|4){return self.pending.take().map(|p|if p.clamp{p.ms.min((duration-50).max(0))}else{p.ms});}None
    }
}
struct Api {
    version:String,
    prebuilt_index:bool,
    new: unsafe extern "C" fn(i32, *const *const c_char) -> Ptr,
    release: unsafe extern "C" fn(Ptr),
    media_new: unsafe extern "C" fn(Ptr, *const c_char) -> Ptr,
    media_option: unsafe extern "C" fn(Ptr, *const c_char),
    media_option_flag: unsafe extern "C" fn(Ptr, *const c_char, u32),
    media_release: unsafe extern "C" fn(Ptr),
    media_stats: unsafe extern "C" fn(Ptr, *mut MediaStats) -> i32,
    player_new: unsafe extern "C" fn(Ptr) -> Ptr,
    player_release: unsafe extern "C" fn(Ptr),
    set_media: unsafe extern "C" fn(Ptr, Ptr),
    set_audio_output: unsafe extern "C" fn(Ptr, *const c_char) -> i32,
    set_hwnd: unsafe extern "C" fn(Ptr, Ptr),
    play: unsafe extern "C" fn(Ptr) -> i32,
    set_pause: unsafe extern "C" fn(Ptr, i32),
    stop: unsafe extern "C" fn(Ptr),
    time: unsafe extern "C" fn(Ptr) -> i64,
    position: unsafe extern "C" fn(Ptr) -> f32,
    video_size: unsafe extern "C" fn(Ptr, u32, *mut u32, *mut u32) -> i32,
    has_vout:unsafe extern "C" fn(Ptr)->u32,
    set_aspect:unsafe extern "C" fn(Ptr,*const c_char),
    length: unsafe extern "C" fn(Ptr) -> i64,
    set_time: unsafe extern "C" fn(Ptr, i64),
    state: unsafe extern "C" fn(Ptr) -> i32,
    seekable: unsafe extern "C" fn(Ptr) -> i32,
    rate: unsafe extern "C" fn(Ptr) -> f32,
    set_rate: unsafe extern "C" fn(Ptr, f32) -> i32,
    volume: unsafe extern "C" fn(Ptr) -> i32,
    set_volume: unsafe extern "C" fn(Ptr, i32) -> i32,
    key_input: unsafe extern "C" fn(Ptr, u32),
    mouse_input: unsafe extern "C" fn(Ptr, u32),
    video_callbacks: unsafe extern "C" fn(
        Ptr,
        Option<unsafe extern "C" fn(Ptr, *mut Ptr) -> Ptr>,
        Option<unsafe extern "C" fn(Ptr, Ptr, *const Ptr)>,
        Option<unsafe extern "C" fn(Ptr, Ptr)>,
        Ptr,
    ),
    video_formats: unsafe extern "C" fn(
        Ptr,
        Option<
            unsafe extern "C" fn(
                *mut Ptr,
                *mut c_char,
                *mut u32,
                *mut u32,
                *mut u32,
                *mut u32,
            ) -> u32,
        >,
        Option<unsafe extern "C" fn(Ptr)>,
    ),
    // The library must outlive all function pointers and native objects.
    _library: Library,
}
fn directory() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("vlc"));
        }
    }
    for name in ["ProgramFiles", "ProgramW6432"] {
        if let Some(root) = std::env::var_os(name) {
            candidates.push(PathBuf::from(root).join("VideoLAN/VLC"));
        }
    }
    candidates.into_iter().find(|p| {
        p.join("libvlc.dll").is_file()
            && p.join("libvlccore.dll").is_file()
            && p.join("plugins").is_dir()
    })
}
pub fn available() -> bool {
    directory().is_some()
}
#[cfg(any(debug_assertions,feature="rhvideo-host-trace"))]
pub(crate) fn diagnostic_trace(args:&Value)->Result<Value,String>{
    let slot=PLAYER.lock().map_err(|_|"播放器不可用")?;
    let player=slot.as_ref().ok_or("播放器未打开")?;
    if args.get("expectedInput").is_some_and(|id|id.as_u64()!=Some(player.input_id)){return Err("播放输入已改变，旧读取未执行".into());}
    let mut result=crate::rhvideo_trace::host_snapshot()?;
    result["inputId"]=json!(player.input_id);
    #[cfg(debug_assertions)]
    if let Some(trace)=&player.startup_trace{result["vlc"]=trace.snapshot()?;}
    Ok(result)
}
fn bundled_plugin_index(path:&std::path::Path,version:&str)->bool{
    let manifest=path.join("RHFiles-libVLC.json");
    if !std::fs::metadata(&manifest).is_ok_and(|m|m.is_file()&&m.len()<=1024*1024){return false;}
    let Ok(bytes)=std::fs::read(manifest) else{return false;};
    let Ok(value)=serde_json::from_slice::<Value>(&bytes) else{return false;};
    value["format"]=="RHFiles.libVLC.bundle"&&value["schemaVersion"]==1&&
        value["runtimeVersion"].as_str()==version.split_whitespace().next()&&
        value["pluginIndexMode"]=="prebuilt-no-scan"&&
        std::fs::metadata(path.join("plugins/plugins.dat")).is_ok_and(|m|m.is_file()&&m.len()>=1024)
}
impl Api {
    unsafe fn load() -> Result<Self, String> {
        let path = directory()
            .ok_or("原生播放内核文件不完整。请完整解压或修复 RHFiles 安装，保留 vlc 目录；不会改用网页播放。")?;
        // LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS.
        let lib: Library = unsafe {
            libloading::os::windows::Library::load_with_flags(
                path.join("libvlc.dll"),
                0x100 | 0x1000,
            )
        }
        .map_err(|_| "无法加载原生播放内核；请修复 RHFiles 的 vlc 目录，或使用兼容的 64 位 VLC 3.x")?
        .into();
        unsafe {
            let version = lib
                .get::<unsafe extern "C" fn() -> *const c_char>(b"libvlc_get_version\0")
                .map_err(|_| "VLC 版本接口不可用")?;
            let version = version();
            if version.is_null() || !CStr::from_ptr(version).to_bytes().starts_with(b"3.") {
                return Err("原生播放内核版本不兼容，需要 64 位 VLC 3.x".into());
            }
            let version=CStr::from_ptr(version).to_string_lossy().into_owned();
            let prebuilt_index=bundled_plugin_index(&path,&version);
            macro_rules! function {
                ($name:literal) => {
                    *lib.get(concat!($name, "\0").as_bytes())
                        .map_err(|_| concat!("VLC 缺少接口：", $name))?
                };
            }
            Ok(Self {
                version,prebuilt_index,
                new: function!("libvlc_new"),
                release: function!("libvlc_release"),
                media_new: function!("libvlc_media_new_location"),
                media_option: function!("libvlc_media_add_option"),
                media_option_flag: function!("libvlc_media_add_option_flag"),
                media_release: function!("libvlc_media_release"),
                media_stats: function!("libvlc_media_get_stats"),
                player_new: function!("libvlc_media_player_new"),
                player_release: function!("libvlc_media_player_release"),
                set_media: function!("libvlc_media_player_set_media"),
                set_audio_output: function!("libvlc_audio_output_set"),
                set_hwnd: function!("libvlc_media_player_set_hwnd"),
                play: function!("libvlc_media_player_play"),
                set_pause: function!("libvlc_media_player_set_pause"),
                stop: function!("libvlc_media_player_stop"),
                time: function!("libvlc_media_player_get_time"),
                position: function!("libvlc_media_player_get_position"),
                video_size: function!("libvlc_video_get_size"),
                has_vout:function!("libvlc_media_player_has_vout"),
                set_aspect:function!("libvlc_video_set_aspect_ratio"),
                length: function!("libvlc_media_player_get_length"),
                set_time: function!("libvlc_media_player_set_time"),
                state: function!("libvlc_media_player_get_state"),
                rate: function!("libvlc_media_player_get_rate"),
                set_rate: function!("libvlc_media_player_set_rate"),
                volume: function!("libvlc_audio_get_volume"),
                set_volume: function!("libvlc_audio_set_volume"),
                key_input: function!("libvlc_video_set_key_input"),
                mouse_input: function!("libvlc_video_set_mouse_input"),
                seekable: function!("libvlc_media_player_is_seekable"),
                video_callbacks: function!("libvlc_video_set_callbacks"),
                video_formats: function!("libvlc_video_set_format_callbacks"),
                _library: lib,
            })
        }
    }
}
struct Engine {
    shared_gain: bool,
    api: Api,
    instance: usize,
    player: usize,
    child: usize,
    surface:Surface,
    surface_history:crate::rhvideo::player_host::SurfaceHistory,
    input_id:u64,
    seek:Mutex<SeekState>,
    requested_volume: i32,
    muted:bool,last_volume:i32,
    repeat_input:bool,
    paused_preview:Mutex<Option<PauseFrame>>,
    pause_requested:std::sync::atomic::AtomicBool,
    hold_audio:std::sync::atomic::AtomicBool,
    title: String,
    frame: Box<crate::rhvideo_frame::Frame>,
    clock: Mutex<crate::rhvideo_clock::Clock>,
    compatibility: bool,
    media: usize,
    rotation: i32,
    rotation_policy:crate::rhvideo_rotation::Policy,
    rotation_viewport:(u32,u32),
    rotation_resolved:bool,
    aspect_input:std::sync::atomic::AtomicU64,
    url: String,
    open_started: std::time::Instant,
    first_frame_ms: std::sync::atomic::AtomicU64,
    #[cfg(debug_assertions)]
    startup_trace:Option<crate::rhvideo_trace::Binding>,
}
impl Engine {
    fn output_gain(&self)->i32{let local=if self.muted||self.hold_audio.load(std::sync::atomic::Ordering::Relaxed){0}else{self.requested_volume};if self.shared_gain{local.clamp(0,100)}else{effective_volume(local)}}
    fn begin_pause_restore(&self,target:i64)->Result<(),String>{
        self.hold_audio.store(true,std::sync::atomic::Ordering::Relaxed);
        *self.paused_preview.lock().map_err(|_|"暂停画面恢复不可用")?=Some(PauseFrame{target,rate:unsafe{(self.api.rate)(self.player as Ptr)},deadline:std::time::Instant::now()+std::time::Duration::from_secs(15),phase:PauseFramePhase::Priming});
        self.pause_requested.store(true,std::sync::atomic::Ordering::Relaxed);
        unsafe{let h=HWND(self.child as Ptr);let style=GetWindowLongPtrW(h,GWL_EXSTYLE);SetWindowLongPtrW(h,GWL_EXSTYLE,style|WS_EX_LAYERED.0 as isize);let _=SetLayeredWindowAttributes(h,windows::Win32::Foundation::COLORREF(0),0,LWA_ALPHA);}
        Ok(())
    }
    fn cancel_pause_restore(&self)->Result<(),String>{
        if let Some(plan)=self.paused_preview.lock().map_err(|_|"暂停画面恢复不可用")?.take(){unsafe{(self.api.set_rate)(self.player as Ptr,plan.rate);let _=SetLayeredWindowAttributes(HWND(self.child as Ptr),windows::Win32::Foundation::COLORREF(0),255,LWA_ALPHA);}}
        self.hold_audio.store(false,std::sync::atomic::Ordering::Relaxed);Ok(())
    }
    fn new(surface: Surface) -> Result<Self, String> {
        Self::new_with_rotation(surface,0)
    }
    fn new_with_rotation(surface:Surface,rotation:i32)->Result<Self,String>{
        let mut engine=Self::prepare(rotation)?;
        engine.bind_surface(surface);
        Ok(engine)
    }
    // No window or input is touched here. The file viewer can initialize VLC
    // while WebView2 creates the window on its owning thread.
    fn prepare(rotation:i32)->Result<Self,String>{
        let started=std::time::Instant::now();
        let api = unsafe { Api::load()? };
        trace_startup(started,"library-loaded");
        let compatibility=unsafe{GetSystemMetrics(SM_REMOTESESSION)!=0}||std::env::var_os("RHFILES_VLC_COMPATIBILITY").is_some();
        let mut options = vec![
            CString::new(
                if diagnostic_logging() {
                    "--verbose=2"
                } else {
                    "--quiet"
                },
            )
            .unwrap(),
            CString::new("--no-video-title-show").unwrap(),
            CString::new("--no-media-library").unwrap(),
            CString::new("--no-osd").unwrap(),
            CString::new("--ignore-config").unwrap(),
            // MMDevice volume is an OS audio-session setting shared by native
            // players. DirectSound has independent stream/buffer gain, so a
            // silent preload cannot mute the active video or another grid cell.
            CString::new("--aout=directsound,none").unwrap(),
            CString::new("--directx-volume=0").unwrap(),
            CString::new("--no-volume-save").unwrap(),
            CString::new(if compatibility{"--avcodec-hw=none"}else{"--avcodec-hw=any"}).unwrap(),
        ];
        // Velopack deliberately normalizes ZIP timestamps. Its verified,
        // matching-version bundled index must therefore be read without the
        // filesystem rescan which would reject every entry as stale. System
        // or modified runtimes without this marker retain VLC's normal scan.
        // https://github.com/videolan/vlc/blob/3.0.24/src/modules/bank.c
        if api.prebuilt_index{options.push(CString::new("--plugins-cache").unwrap());options.push(CString::new("--no-plugins-scan").unwrap());}
        // Compare decoder queue/pool startup at the same resolution and sound
        // settings. This is not a shipping software-decoder thread cap.
        #[cfg(debug_assertions)]
        if let Some(threads)=std::env::var("RHFILES_VLC_DECODE_THREADS").ok().and_then(|v|v.parse::<u32>().ok()).filter(|v|(1..=32).contains(v)){
            options.push(CString::new(format!("--avcodec-threads={threads}")).unwrap());
        }
        // libVLC 3 creates the player's video-filter from its INSTANCE, not
        // an individual media option (see lib/media_player.c). Passing this
        // only to media_add_option changes our flag but not rendered pixels.
        if rotation!=0&&!compatibility{options.push(CString::new("--video-filter=transform").unwrap());options.push(CString::new(format!("--transform-type={rotation}")).unwrap());}
        let pointers = options.iter().map(|s| s.as_ptr()).collect::<Vec<_>>();
        let instance = unsafe { (api.new)(pointers.len() as i32, pointers.as_ptr()) };
        trace_startup(started,"instance-created");
        if instance.is_null() {
            return Err("VLC 原生内核初始化失败".into());
        }
        #[cfg(debug_assertions)]
        let startup_trace=match unsafe{crate::rhvideo_trace::Binding::install(&api._library,instance as usize)}{
            Ok(trace)=>trace,Err(error)=>{unsafe{(api.release)(instance)};return Err(error);}
        };
        let player = unsafe { (api.player_new)(instance) };
        trace_startup(started,"player-created");
        if player.is_null() {
            #[cfg(debug_assertions)]
            drop(startup_trace);
            unsafe { (api.release)(instance) };
            return Err("无法创建原生播放器".into());
        }
        Ok(Self {
            shared_gain: false,
            api,
            instance: instance as usize,
            player: player as usize,
            child:0,
            surface:Surface{child:0,generation:0},
            surface_history:Default::default(),
            input_id:0,
            seek:Mutex::new(SeekState::default()),
            requested_volume: 100,
            muted:false,last_volume:100,repeat_input:false,
            paused_preview:Mutex::new(None),pause_requested:std::sync::atomic::AtomicBool::new(false),hold_audio:std::sync::atomic::AtomicBool::new(false),
            title: String::new(),
            frame:Box::new(crate::rhvideo_frame::Frame::new(0)),
            clock: Mutex::new(crate::rhvideo_clock::Clock::new()),
            compatibility,
            media: 0,
            rotation,
            rotation_policy:Default::default(),rotation_viewport:(0,0),rotation_resolved:false,aspect_input:std::sync::atomic::AtomicU64::new(0),
            url: String::new(),
            open_started: std::time::Instant::now(),
            first_frame_ms: std::sync::atomic::AtomicU64::new(0),
            #[cfg(debug_assertions)]
            startup_trace,
        })
    }
    fn bind_surface(&mut self,surface:Surface){
        debug_assert_eq!(self.child,0);
        self.child=surface.child;
        self.surface=surface;
        self.frame=Box::new(crate::rhvideo_frame::Frame::new(self.child));
        self.frame.rotation.store(self.rotation,std::sync::atomic::Ordering::Relaxed);
        // Ordinary desktops use native VLC video output. RDP and headless
        // sessions use the bounded GDI presenter.
        let player=self.player as Ptr;
        unsafe {
            (self.api.set_hwnd)(player,self.child as Ptr);
            (self.api.key_input)(player,0);
            (self.api.mouse_input)(player,0);
            if self.compatibility{
                (self.api.video_callbacks)(player,Some(crate::rhvideo_frame::lock),Some(crate::rhvideo_frame::unlock),Some(crate::rhvideo_frame::display),(&mut *self.frame as *mut crate::rhvideo_frame::Frame).cast());
                (self.api.video_formats)(player,Some(crate::rhvideo_frame::setup),None);
            }
        }
    }
    fn viewport(&self)->(u32,u32){
        let mut rect=RECT::default();unsafe{if GetClientRect(HWND(self.child as Ptr),&mut rect).is_ok(){return ((rect.right-rect.left).max(1) as u32,(rect.bottom-rect.top).max(1) as u32);}}
        self.rotation_viewport
    }
    fn replace_rotation_renderer(&mut self,angle:i32)->Result<(),String>{
        let mut next=Self::new_with_rotation(self.surface,angle)?;
        next.surface_history=self.surface_history;
        next.requested_volume=self.requested_volume;next.muted=self.muted;next.last_volume=self.last_volume;next.repeat_input=self.repeat_input;
        next.rotation_policy=self.rotation_policy;next.rotation_viewport=self.rotation_viewport;next.rotation_resolved=self.rotation_resolved;
        let rate=unsafe{(self.api.rate)(self.player as Ptr)};
        unsafe{(self.api.stop)(self.player as Ptr);(next.api.set_rate)(next.player as Ptr,rate);}
        std::mem::swap(self,&mut next);drop(next);Ok(())
    }
    fn configure_rotation(&mut self,policy:crate::rhvideo_rotation::Policy,viewport:(u32,u32))->Result<bool,String>{
        let angle=crate::rhvideo_rotation::angle(policy.source,viewport,policy.enabled);let changed=angle!=self.rotation;
        if changed{if self.compatibility{self.rotation=angle;self.frame.rotation.store(angle,std::sync::atomic::Ordering::Relaxed);}else{self.replace_rotation_renderer(angle)?;}}
        self.rotation_policy=policy;self.rotation_viewport=viewport;self.rotation_resolved=policy.source.0>0&&policy.source.1>0;self.rotation_aspect()?;Ok(changed)
    }
    fn rotation_aspect(&self)->Result<(),String>{
        if self.compatibility{return Ok(());}
        // VLC 3's interactive transform converts back to the input format.
        // Its output aspect must therefore be swapped explicitly as well;
        // otherwise rotated pixels are squeezed into the old portrait box.
        let(w,h)=self.rotation_policy.source;
        let aspect=if self.rotation%180!=0&&w>0&&h>0{Some(CString::new(format!("{h}:{w}")).map_err(|_|"旋转画面比例无效")?)}else{None};
        unsafe{(self.api.set_aspect)(self.player as Ptr,aspect.as_ref().map_or(std::ptr::null(),|value|value.as_ptr()));if (self.api.has_vout)(self.player as Ptr)>0{self.aspect_input.store(self.input_id,std::sync::atomic::Ordering::Release);}}Ok(())
    }
    fn resolve_rotation(&mut self)->Result<(),String>{
        if self.rotation_resolved{return Ok(());}
        let(mut width,mut height)=(0,0);unsafe{(self.api.video_size)(self.player as Ptr,0,&mut width,&mut height);}
        if width==0||height==0{return Ok(());}
        self.rotation_policy.source=(width,height);self.rotation_resolved=true;
        let angle=crate::rhvideo_rotation::angle(self.rotation_policy.source,self.rotation_viewport,self.rotation_policy.enabled);
        self.apply_rotation(angle)
    }
    fn apply_rotation(&mut self,angle:i32)->Result<(),String>{
        if angle==self.rotation{return Ok(());}
        if self.compatibility{self.rotation=angle;self.frame.rotation.store(angle,std::sync::atomic::Ordering::Relaxed);let _=self.frame.render();return Ok(());}
        let before=self.state();let paused=pause_intent(&before);
        let target=before["positionMs"].as_i64().unwrap_or(0).max(0);let rate=before["rate"].as_f64().unwrap_or(1.) as f32;
        self.cancel_pause_restore()?;self.hold_audio.store(paused,std::sync::atomic::Ordering::Relaxed);
        let url=self.url.clone();let title=self.title.clone();self.replace_rotation_renderer(angle)?;
        self.rotation_aspect()?;
        self.hold_audio.store(paused,std::sync::atomic::Ordering::Relaxed);
        self.open(&url,title,if paused{0.}else{target as f64/1000.})?;
        unsafe{(self.api.set_rate)(self.player as Ptr,rate);}
        if paused{self.begin_pause_restore(target)?;}
        Ok(())
    }
    fn open(&mut self, url: &str, title: String, seconds: f64) -> Result<(), String> {
        // Mark the attempt before any fallible preparation. An unsuccessful
        // attempt is never evidence that an existing surface has no pixels.
        self.surface_history.begin_input();
        self.input_id=INPUT_SEQUENCE.fetch_add(1,std::sync::atomic::Ordering::SeqCst);
        *self.seek.lock().map_err(|_|"跳转状态不可用")?=SeekState::default();
        self.open_started=std::time::Instant::now();
        self.first_frame_ms.store(0,std::sync::atomic::Ordering::Relaxed);
        let had_paused_restore=self.paused_preview.lock().map_err(|_|"暂停画面恢复不可用")?.is_some();
        if had_paused_restore{self.cancel_pause_restore()?;}
        self.url = url.to_owned();
        self.clock.lock().map_err(|_| "播放时钟不可用")?.reset(
            (seconds * 1000.) as i64,
            self.frame
                .last_display
                .load(std::sync::atomic::Ordering::Relaxed),
        );
        let url = CString::new(url).map_err(|_| "媒体地址无效")?;
        unsafe {
            let media = (self.api.media_new)(self.instance as Ptr, url.as_ptr());
            if media.is_null() {
                return Err("无法打开媒体流".into());
            }
            for option in [format!(":network-caching={}",network_cache_ms()), ":http-proxy=".to_owned()] {
                let option = CString::new(option).unwrap();
                (self.api.media_option)(media, option.as_ptr());
            }
            // VLC 3 repeats only positive counts, and only at EOF (not errors).
            // Keep the input/decoder alive rather than reopening it each loop.
            if self.repeat_input{let option=CString::new(":input-repeat=2147483647").unwrap();(self.api.media_option_flag)(media,option.as_ptr(),0x2);}
            // These are fixed application options, never server-controlled.
            // libVLC resets vout defaults when creating a player, so setting
            // only --vout on the instance is insufficient. A native GDI output
            // also works in RDP/server sessions without a functioning D3D surface.
            for option in if self.compatibility {
                vec![":avcodec-hw=none"]
            } else {
                vec![":avcodec-hw=any"]
            } {
                let option = CString::new(option).unwrap();
                (self.api.media_option_flag)(media, option.as_ptr(), 0x2);
            }
            let start = CString::new(format!(":start-time={seconds:.3}")).unwrap();
            (self.api.media_option)(media, start.as_ptr());
            // libVLC 3 set_media joins the old input and its callbacks, while
            // retaining reusable audio/video output resources. A preceding
            // stop() unnecessarily destroys those resources, even on the very
            // first open, and forces device/vout initialization on each source
            // switch that cannot consume an already-decoded preload.
            (self.api.set_media)(self.player as Ptr, media);
            #[cfg(debug_assertions)]
            if let Some(trace)=&self.startup_trace{trace.reset(self.input_id,self.open_started);}
            self.pause_requested.store(false,std::sync::atomic::Ordering::Relaxed);
            trace_startup(self.open_started,"previous-input-joined");
            // Reset AFTER that join: a late old callback must not impersonate
            // this input's first frame. No old decoder runs past set_media.
            self.frame.count.store(0,std::sync::atomic::Ordering::Relaxed);
            self.frame.format.store(0,std::sync::atomic::Ordering::Release);
            self.frame.presented.store(0,std::sync::atomic::Ordering::Release);
            self.clock.lock().map_err(|_|"播放时钟不可用")?.reset((seconds*1000.) as i64,self.frame.last_display.load(std::sync::atomic::Ordering::Relaxed));
            if self.media != 0 {
                (self.api.media_release)(self.media as Ptr);
            }
            self.media = media as usize;
            // Reuse the independent DirectSound output when present. If a
            // prior explicit stop terminated it, initialize before gain/play.
            // Never fall back to MMDevice's shared OS-session gain or silently
            // unmute a preload.
            if (self.api.volume)(self.player as Ptr)<0{
                let output=CString::new("directsound").unwrap();
                if (self.api.set_audio_output)(self.player as Ptr,output.as_ptr())!=0 {
                    return Err("无法初始化独立的音频输出".into());
                }
            }
            trace_startup(self.open_started,"audio-ready");
            (self.api.set_volume)(self.player as Ptr,self.output_gain());
            if (self.api.play)(self.player as Ptr) != 0 {
                return Err("原生播放器无法开始播放".into());
            }
            trace_startup(self.open_started,"play-requested");
        }
        self.title = title;
        Ok(())
    }
    fn state(&self) -> Value {
        let probe=if cfg!(debug_assertions)&&std::env::var_os("RHFILES_VLC_DEBUG").is_some(){Some((std::time::Instant::now(),STATE_PROBE_SEQUENCE.fetch_add(1,std::sync::atomic::Ordering::Relaxed)))}else{None};
        let trace=|stage:&str|{if let Some((started,sequence))=probe{eprintln!("RHFILES_STATE_STAGE {} {sequence} {stage} {}",self.input_id,started.elapsed().as_millis());}};
        trace("entered");
        unsafe {
            let p = self.player as Ptr;
            let (mut width, mut height) = (0, 0);
            (self.api.video_size)(p, 0, &mut width, &mut height);
            trace("video-size");
            // A newly created vout can reset aspect after play(). Apply once
            // to that actual output, not just to the not-yet-open player.
            if !self.compatibility&&self.aspect_input.load(std::sync::atomic::Ordering::Acquire)!=self.input_id&&(self.api.has_vout)(p)>0{let _=self.rotation_aspect();}
            trace("aspect");
            let raw = (self.api.time)(p).max(0);
            let duration = (self.api.length)(p).max(0);
            let state = (self.api.state)(p);
            trace("clock");
            // A bounded readiness transition, not a network retry: consume the
            // latest explicit seek exactly once, only on its decoder lease.
            let (pending_seek,seek_error)=if let Ok(mut seek)=self.seek.lock(){
                if let Some(ms)=seek.ready(self.input_id,duration,state,(self.api.seekable)(p)!=0,std::time::Instant::now()){
                    (self.api.set_time)(p,ms);
                    if let Ok(mut clock)=self.clock.lock(){clock.reset(ms,self.frame.last_display.load(std::sync::atomic::Ordering::Relaxed));}
                }
                (seek.pending.as_ref().map(|s|s.ms),seek.error.clone())
            }else{(None,Some("跳转状态不可用".into()))};
            trace("seek");
            // Audio modules may initialize asynchronously after play().
            // Reconcile the existing desired gain once they report
            // a usable output; never write the OS session/master volume.
            let desired=self.output_gain();
            let actual=(self.api.volume)(p);
            trace("volume-read");
            if matches!(state,3|4)&&actual>=0&&actual!=desired {
                (self.api.set_volume)(p,desired);
            }
            trace("volume-ready");
            let mut stats = MediaStats::default();
            if self.media != 0 {
                (self.api.media_stats)(self.media as Ptr, &mut stats);
            }
            trace("stats");
            if !self.compatibility {
                self.frame.observe_native(stats.displayed.max(0) as u64);
            }
            let rendered=if self.compatibility{self.frame.count.load(std::sync::atomic::Ordering::Relaxed)}else{stats.displayed.max(0) as u64};
            let mut restoring=false;let mut restore_target=None;let mut restore_rate=None;let mut restore_phase=None;
            if let Ok(mut slot)=self.paused_preview.lock(){if let Some(plan)=slot.as_mut(){
                let now=std::time::Instant::now();let mut complete=false;
                if now>=plan.deadline||matches!(state,5..=7){
                    (self.api.set_rate)(p,plan.rate);
                    (self.api.stop)(p);
                    if let Ok(mut seek)=self.seek.lock(){seek.error=Some("恢复暂停画面失败，未自动重试".into());}
                    complete=true;
                }else{match plan.phase{
                    PauseFramePhase::Priming if rendered>0&&duration>0=>{
                        plan.target=plan.target.min((duration-50).max(0));
                        // Seek with a running, silent decoder. Seeking while
                        // paused can strand the hardware decoder's first frame.
                        (self.api.set_pause)(p,0);(self.api.set_rate)(p,PAUSE_PREPARE_RATE);(self.api.set_time)(p,plan.target);
                        if let Ok(mut clock)=self.clock.lock(){clock.reset(plan.target,self.frame.last_display.load(std::sync::atomic::Ordering::Relaxed));}
                        // libVLC can postpone seeks while flushing ES buffers.
                        plan.phase=PauseFramePhase::Seeking{not_before:now+std::time::Duration::from_millis(250)};
                    }
                    PauseFramePhase::Seeking{not_before} if state==3&&now>=not_before=>{
                        // VLC 3 freezes its published display statistics while
                        // paused. Briefly render silently at normal speed to get
                        // a real fresh frame, then acknowledge the pause.
                        plan.phase=PauseFramePhase::Presenting{frames:rendered};
                    }
                    PauseFramePhase::Presenting{frames} if state==3&&rendered>frames=>{(self.api.set_pause)(p,1);plan.phase=PauseFramePhase::Pausing;}
                    PauseFramePhase::Pausing if state==4=>{
                        (self.api.set_rate)(p,plan.rate);
                        if let Ok(mut clock)=self.clock.lock(){clock.reset(plan.target,self.frame.last_display.load(std::sync::atomic::Ordering::Relaxed));}
                        complete=true;
                    }
                    _=>{}
                }}
                if complete{*slot=None;self.hold_audio.store(false,std::sync::atomic::Ordering::Relaxed);let _=SetLayeredWindowAttributes(HWND(self.child as Ptr),windows::Win32::Foundation::COLORREF(0),255,LWA_ALPHA);}else{restoring=true;restore_target=Some(plan.target);restore_rate=Some(plan.rate);restore_phase=Some(match plan.phase{PauseFramePhase::Priming=>"priming",PauseFramePhase::Seeking{..}=>"seeking",PauseFramePhase::Presenting{..}=>"presenting",PauseFramePhase::Pausing=>"pausing"});}
            }}
            trace("restore");
            if rendered>0 {let _=self.first_frame_ms.compare_exchange(0,self.open_started.elapsed().as_millis().max(1) as u64,std::sync::atomic::Ordering::Relaxed,std::sync::atomic::Ordering::Relaxed);}
            let position = if restoring {restore_target.unwrap_or(0)}else{
                self.clock
                    .lock()
                    .map(|mut c| {
                        if self.repeat_input{c.observe_wrapping(
                            raw,duration,state,self.frame.last_display.load(std::sync::atomic::Ordering::Relaxed),
                        )}else{c.observe(
                            raw,
                            duration,
                            state,
                            self.frame
                                .last_display
                                .load(std::sync::atomic::Ordering::Relaxed),
                        )}
                    })
                    .unwrap_or(raw)
            };
            let source=if self.rotation_policy.source.0>0{self.rotation_policy.source}else{(width,height)};let viewport=self.viewport();let format=self.frame.presented.load(std::sync::atomic::Ordering::Acquire);
            trace("viewport");
            let mut value=json!({"opened":true,"title":self.title,"engine":"libVLC","renderer":if self.compatibility{"gdi-compatibility"}else{"native-hardware-auto"},"rotation":self.rotation,"autoRotate":self.rotation_policy.enabled,"rotationAvailable":crate::rhvideo_rotation::available(source,viewport,self.rotation_policy.enabled),"sourceWidth":source.0,"sourceHeight":source.1,"viewportWidth":viewport.0,"viewportHeight":viewport.1,"presentedWidth":if self.compatibility{Some((format>>32) as u32)}else{None},"presentedHeight":if self.compatibility{Some(format as u32)}else{None},"videoWidth":width,"videoHeight":height,"renderedFrames":if self.compatibility{self.frame.count.load(std::sync::atomic::Ordering::Relaxed)}else{stats.displayed.max(0) as u64},"decodedFrames":stats.decoded_video.max(0),"lostFrames":stats.lost.max(0),"inputBitrateMbps":stats.input_bitrate,"decoderPositionFraction":(self.api.position)(p),"positionFraction":if duration>0{position as f64/duration as f64}else{0.0},
            "presentationError":if self.compatibility&&self.frame.render_error.load(std::sync::atomic::Ordering::Relaxed){Some("无法显示原生兼容画面，请检查显示会话后重新打开视频")}else{None},
            "state":(self.api.state)(p),"restoringPausedFrame":restoring,"restorePhase":restore_phase,"restoreTargetMs":restore_target,"inputId":self.input_id,"pendingSeekMs":pending_seek,"seekError":seek_error,"positionMs":position,"decoderPositionMs":raw,"durationMs":duration,"firstFrameMs":self.first_frame_ms.load(std::sync::atomic::Ordering::Relaxed),
            "rate":restore_rate.unwrap_or_else(||(self.api.rate)(p)),"decoderRate":(self.api.rate)(p),"volume":self.requested_volume,"muted":self.muted,"lastVolume":self.last_volume,"masterVolume":PAGE_VOLUME.load(std::sync::atomic::Ordering::Relaxed),"decoderVolume":(self.api.volume)(p),"nativeSurface":self.child!=0});
            value["freshSurfaceInput"]=json!(self.surface_history.fresh_input());
            value["engineVersion"]=json!(self.api.version);
            value["pluginIndexMode"]=json!(if self.api.prebuilt_index{"prebuilt-no-scan"}else{"cache-and-scan"});
            value["decodedAudioBlocks"]=json!(stats.decoded_audio.max(0));
            value["pauseRequested"]=json!(self.pause_requested.load(std::sync::atomic::Ordering::Relaxed));trace("complete");value
        }
    }
}
fn pause_intent(state:&Value)->bool{
    // libVLC pause/resume is asynchronous. Snapshot the accepted user command,
    // not a decoder state that may still describe the preceding command. The
    // fallback is for older diagnostic/legacy values without an intent field.
    state["pauseRequested"].as_bool().unwrap_or(state["state"]==4||state["restoringPausedFrame"]==true)
}
fn independent_active(state:&Value)->bool{
    state["restoringPausedFrame"]==true||state["pendingSeekMs"].is_i64()||
        (!matches!(state["state"].as_i64(),Some(4|6|7))&&!(state["state"]==5&&state["seekError"].is_string()))
}
pub fn maintain_independent_outputs()->bool{
    let mut active=false;
    let grid=GRID.try_lock();
    if matches!(&grid,Err(std::sync::TryLockError::WouldBlock)){active=true;}
    if let Ok(grid)=grid{
        for player in &grid.players {active|=independent_active(&player.state());}
    }
    let presentation=PRESENTATION.try_lock();
    if matches!(&presentation,Err(std::sync::TryLockError::WouldBlock)){active=true;}
    if let Ok(slot)=presentation{
        if let Some(player)=slot.as_ref(){active|=independent_active(&player.state());}
    }
    active
}
impl Drop for Engine {
    fn drop(&mut self) {
        #[cfg(debug_assertions)]
        drop(self.startup_trace.take());
        unsafe {
            (self.api.stop)(self.player as Ptr);
            (self.api.player_release)(self.player as Ptr);
            if self.media != 0 {
                (self.api.media_release)(self.media as Ptr);
            }
            (self.api.release)(self.instance as Ptr);
        }
    }
}
pub fn stop()->Result<(),String> {
    shared_media::stop();
    crate::rhvideo::flush_playback();
    stop_grid();
    stop_presentation();
    stop_single();
    if single_host().is_some(){if let Some(app)=INPUT_APP.get(){finish_host_view(app,"stopped")?;}}Ok(())
}
pub fn stop_single() {
    let host=single_host();if let Some(host)=&host{WINDOW_EPOCH.close(host.lease);}
    if let Some(SingleHost{target:crate::rhvideo::player_host::Target::Library{owner,..},..})=&host{if let Ok(mut reservations)=HOST_RESERVATIONS.lock(){reservations.retire(*owner);}}
    clear_preload();
    let engine = PLAYER.lock().ok().and_then(|mut player| player.take());
    if let Some(engine) = engine {
        release_surface(engine);
        if let Some(host)=host.filter(SingleHost::library){if let Some(app)=INPUT_APP.get(){let _=app.emit_to(LIBRARY_LABEL,"rhvideo-player-closed",json!({"host":host.value(),"reason":"stopped"}));}}
    }
}
pub async fn close_single()->Result<(),String>{
    tauri::async_runtime::spawn_blocking(stop_single).await.map_err(|_|"停止视频播放未能确认完成")?;
    finish_preload_shutdown().await
}
// Call under PLAY_LOCK after invalidating WARM. No preload worker needs that
// lock, and every registered worker awaits its own blocking decoder release.
pub async fn finish_preload_shutdown()->Result<(),String>{
    let jobs=std::mem::take(&mut *WARM_JOBS.lock().map_err(|_|"预加载任务状态不可用")?);
    let mut failure=None;
    for (_,job) in jobs{if job.await.is_err(){failure=Some("预加载释放未能确认完成".to_owned());}}
    failure.map_or(Ok(()),Err)
}
pub fn retire_window(lease:u64)->bool{
    if !WINDOW_EPOCH.is_current(lease){return false;}
    stop_single();true
}
fn require_player_window(lease:u64,parent:usize)->Result<(),String>{
    WINDOW_EPOCH.ensure_open(lease)?;
    if unsafe{IsWindow(Some(HWND(parent as Ptr)))}.as_bool(){return Ok(());}
    WINDOW_EPOCH.close(lease);Err(crate::rhvideo_window_lifecycle::CLOSED.into())
}
fn release_surface(engine: Engine) {
    let surface = engine.surface;
    drop(engine);
    surface.close();
}
pub fn clear_preload() {
    let retired=WARM.lock().ok().and_then(|mut slot|slot.retire(json!({"state":"idle"})).1.map(|(engine,_)|engine));
    if let Some(engine) = retired {
        release_surface(engine);
    }
}
pub fn preload_state() -> Value {
    if let Ok(mut jobs)=WARM_JOBS.lock(){reap_preload_jobs(&mut jobs);}
    let mut value=match WARM.lock(){
        Ok(slot)=>slot.status().cloned().unwrap_or(json!({"state":"idle"})),
        Err(_)=>json!({"state":"failed","reason":"预加载状态不可用"}),
    };
    value["activeTasks"]=json!(WARM_ACTIVE.load(std::sync::atomic::Ordering::SeqCst));value
}
fn publish_preload(ticket:warm_state::Ticket,value:Value)->bool{
    WARM.lock().is_ok_and(|mut slot|slot.publish(ticket,value))
}
fn preload_current(ticket:warm_state::Ticket,preparation:&crate::rhvideo::play_intent::Preparation)->bool{
    WARM.lock().is_ok_and(|slot|slot.current(ticket)&&preparation.ensure_current().is_ok())
}
fn require_preload(ticket:warm_state::Ticket,preparation:&crate::rhvideo::play_intent::Preparation)->Result<(),String>{
    if preload_current(ticket,preparation){Ok(())}else{Err("预加载操作已失效，未继续打开旧视频".into())}
}
async fn release_preload(engine:Engine)->Result<(),String>{
    tauri::async_runtime::spawn_blocking(move||release_surface(engine)).await.map_err(|_|"预加载释放未能确认完成".into())
}
fn reap_preload_jobs(jobs:&mut Vec<(warm_state::Ticket,tauri::async_runtime::JoinHandle<()>)>){
    jobs.retain_mut(|(ticket,job)|{
        if !job.inner().is_finished(){return true;}
        match (&mut *job).now_or_never(){
            Some(Ok(()))=>false,
            Some(Err(_))=>{publish_preload(*ticket,json!({"state":"failed","reason":"预加载任务意外结束；未自动重试"}));false},
            None=>true,
        }
    });
}
pub fn queue_preload(app:AppHandle,url:String,title:String,rotation:crate::rhvideo_rotation::Policy,preparation:crate::rhvideo::play_intent::Preparation)->Result<Value,String>{
    // The dispatcher holds PLAY_LOCK through registration, so close can drain
    // all earlier workers, including futures which have never been polled.
    let mut jobs=WARM_JOBS.lock().map_err(|_|"预加载任务状态不可用")?;
    reap_preload_jobs(&mut jobs);
    if jobs.len()>=64{return Ok(json!({"scheduled":false,"state":"skipped","reason":"旧预加载仍在结束，不启动无界任务"}));}
    let ticket={let mut slot=WARM.lock().map_err(|_|"预加载状态不可用")?;
        preparation.ensure_current()?;slot.reserve(json!({"state":"waiting-current-frame","title":title}))};
    let observed=preparation.clone();
    let activity=ActivePreload::new();
    let handle=tauri::async_runtime::spawn(async move{
        let _activity=activity;
        if let Err(error)=preload(app,url,title,rotation,ticket,preparation).await{
            if observed.ensure_current().is_ok(){publish_preload(ticket,json!({"state":"failed","reason":error}));}
        }
    });
    jobs.push((ticket,handle));Ok(json!({"scheduled":true}))
}
async fn preload(app: AppHandle, url: String, title: String,rotation:crate::rhvideo_rotation::Policy,ticket:warm_state::Ticket,preparation:crate::rhvideo::play_intent::Preparation) -> Result<Value, String> {
    let retired={let mut slot=WARM.lock().map_err(|_|"预加载状态不可用")?;
        preparation.ensure_current()?;let Some(retired)=slot.admit(ticket)else{return Ok(json!({"state":"cancelled"}));};retired};
    if let Some(engine)=retired{release_preload(engine).await?;}
    // Like RHVideo's onplaying handler, do not compete for upstream bandwidth,
    // decoder initialization or GPU resources before the active first frame.
    let first_frame_deadline=std::time::Instant::now()+std::time::Duration::from_secs(15);
    loop {
        if !preload_current(ticket,&preparation) {
            return Ok(json!({"state":"cancelled"}));
        }
        let ready=PLAYER.try_lock().ok().and_then(|p|p.as_ref().map(Engine::state))
            .is_some_and(|s|s["renderedFrames"].as_u64().unwrap_or(0)>0&&s["state"]==3);
        if ready {break;}
        if std::time::Instant::now()>=first_frame_deadline {
            let value=json!({"state":"skipped","reason":"当前视频尚未显示首帧，不占用其网络和解码资源"});
            publish_preload(ticket,value.clone());
            return Ok(value);
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    let Ok(_build) = WARM_BUILD.try_lock() else {
        let value = json!({"state":"skipped","reason":"上一项预加载正在释放，不启动并行预加载"});
        publish_preload(ticket,value.clone());
        return Ok(value);
    };
    require_preload(ticket,&preparation)?;
    publish_preload(ticket,json!({"state":"loading","title":title}));
    let host=single_host().ok_or("播放器宿主没有打开")?;host.ensure_open()?;
    let view = app.get_webview_window(host.label()).ok_or("播放器没有打开")?;
    let rotation_viewport=host.viewport;
    let surface_preparation=preparation.clone();
    let surface_host=host.clone();
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let result = (|| {
            require_preload(ticket,&surface_preparation)?;
            surface_host.ensure_open()?;
            surface_class()?;
            let parent = view.hwnd().map_err(|e| e.to_string())?;
            let surface=create_surface(HWND(parent.0),320,180,WS_EX_LAYERED)?;
            unsafe {
                let _ = SetLayeredWindowAttributes(
                    HWND(surface.child as Ptr),
                    windows::Win32::Foundation::COLORREF(0),
                    0,
                    LWA_ALPHA,
                );
            }
            Ok::<Surface, String>(surface)
        })();
        if let Err(Ok(surface))=tx.send(result){surface.close();}
    })
    .map_err(|e| e.to_string())?;
    let child = rx.await.map_err(|_| "播放器已关闭")??;
    let worker_preparation=preparation.clone();
    let worker_host=host.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut surface=SurfaceGuard(vec![child]);
        require_preload(ticket,&worker_preparation)?;
        worker_host.ensure_open()?;
        let angle=crate::rhvideo_rotation::angle(rotation.source,rotation_viewport,rotation.enabled);
        let mut engine = Engine::new_with_rotation(child,angle)?;
        worker_host.ensure_open()?;
        require_preload(ticket,&worker_preparation)?;
        engine.configure_rotation(rotation,rotation_viewport)?;
        control_engine(&mut engine, &json!({"command":"volume","value":0}))?;
        require_preload(ticket,&worker_preparation)?;
        engine.open(&url, title, 0.0)?;
        surface.0.clear();
        Ok(engine)
    })
    .await
    .map_err(|_| "预加载任务意外结束")?;
    let mut engine = match result {
        Ok(e) => e,
        Err(e) => return Err(e),
    };
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        if !preload_current(ticket,&preparation)||host.ensure_open().is_err() {
            release_preload(engine).await?;
            return Ok(json!({"state":"cancelled"}));
        }
        if let Err(error)=engine.resolve_rotation(){release_preload(engine).await?;return Err(error);}
        let status = engine.state();
        // Transparent native windows can be GPU-occluded. Readiness is actual
        // decoder output; ordinary playback still requires displayed frames.
        if status["decodedFrames"].as_u64().unwrap_or(0) > 0 {
            if let Err(error) = control_engine(&mut engine, &json!({"command":"pause"})) {
                release_preload(engine).await?;
                return Err(error);
            }
            let value = json!({"state":"ready","decodedFrames":status["decodedFrames"],"renderedFrames":status["renderedFrames"]});
            let stored={let mut slot=WARM.lock().map_err(|_|"预加载不可用")?;
                if preparation.ensure_current().is_ok(){slot.store(ticket,engine,value.clone())}else{Err(engine)}};
            if let Err(engine)=stored{release_preload(engine).await?;return Ok(json!({"state":"cancelled"}));}
            return Ok(value);
        }
        if std::time::Instant::now() >= deadline || status["state"] == 7 {
            release_preload(engine).await?;
            let value = json!({"state":"failed","reason":"原生下一项首帧预加载失败或超时；不会自动重试","decoderState":status["state"],"decodedFrames":status["decodedFrames"],"renderedFrames":status["renderedFrames"]});
            publish_preload(ticket,value.clone());
            return Ok(value);
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
}
fn presentation_matches(args:&Value,input:Option<u64>)->Result<bool,String>{
    let Some(expected)=args.get("expectedInput") else{return Ok(true);};
    let expected=expected.as_u64().filter(|id|*id>0&&*id<=9_007_199_254_740_991).or_else(||{
        expected.as_f64().filter(|id|id.is_finite()&&id.fract()==0.0&&(1.0..=9_007_199_254_740_991.0).contains(id)).map(|id|id as u64)
    }).ok_or("放映输入标识无效")?;
    Ok(input==Some(expected))
}
pub fn presentation_close(args:&Value)->Result<Value,String>{
    let player={
        let mut slot=PRESENTATION.lock().map_err(|_|"放映状态不可用")?;
        if !presentation_matches(args,slot.as_ref().map(|p|p.input_id))?{return Ok(json!({"opened":false,"stale":true}));}
        // A retired input must not cancel a newer open still being prepared.
        PRESENTATION_EPOCH.fetch_add(1,std::sync::atomic::Ordering::SeqCst);
        slot.take()
    };
    if let Some(player)=player{release_surface(player);}
    Ok(json!({"closed":true}))
}
pub fn stop_presentation() {
    let _=presentation_close(&json!({}));
}
pub async fn presentation_open(
    app: AppHandle,
    url: String,
    title: String,
    seconds: f64,
) -> Result<Value, String> {
    stop()?;
    let ticket = PRESENTATION_EPOCH.load(std::sync::atomic::Ordering::SeqCst);
    let view = app
        .get_webview_window("window-rhvideo")
        .ok_or("媒体库窗口已关闭")?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let result = (|| {
            surface_class()?;
            let parent = view.hwnd().map_err(|e| e.to_string())?;
            let surface=create_surface(HWND(parent.0),16,16,WS_EX_LAYERED)?;
            unsafe {
                let _ = SetLayeredWindowAttributes(
                    HWND(surface.child as Ptr),
                    windows::Win32::Foundation::COLORREF(0),
                    0,
                    LWA_ALPHA,
                );
            }
            Ok::<Surface, String>(surface)
        })();
        if let Err(Ok(surface))=tx.send(result){surface.close();}
    })
    .map_err(|e| e.to_string())?;
    let child = rx.await.map_err(|_| "媒体库窗口已关闭")??;
    tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            let mut engine = Engine::new(child)?;
            engine.open(&url, title, seconds)?;
            control_engine(&mut engine, &json!({"command":"volume","value":0}))?;
            let mut slot = PRESENTATION.lock().map_err(|_| "放映状态不可用")?;
            if PRESENTATION_EPOCH.load(std::sync::atomic::Ordering::SeqCst) != ticket {
                return Err("放映已切换".into());
            }
            let result = engine.state();
            *slot = Some(engine);
            Ok(result)
        })();
        if result.is_err() {child.close();}
        result
    })
    .await
    .map_err(|_| "原生放映任务意外结束".to_string())?
}
pub fn presentation_command(action: &str, args: &Value) -> Result<Value, String> {
    let mut slot = PRESENTATION.lock().map_err(|_| "放映状态不可用")?;
    if !presentation_matches(args,slot.as_ref().map(|p|p.input_id))?{return Ok(json!({"opened":false,"stale":true}));}
    let Some(player) = slot.as_mut() else {
        return Ok(json!({"opened":false}));
    };
    if action == "presentation.control" {
        control_engine(player, args)?;
    }
    Ok(player.state())
}
pub async fn presentation_bounds(app: AppHandle, args: Value) -> Result<Value, String> {
    let (child,input)={
        let slot=PRESENTATION.lock().map_err(|_|"放映状态不可用")?;
        if !presentation_matches(&args,slot.as_ref().map(|p|p.input_id))?{return Ok(json!({"opened":false,"stale":true}));}
        let player=slot.as_ref().ok_or("原生放映没有打开")?;
        (player.child,player.input_id)
    };
    let view = app
        .get_webview_window("window-rhvideo")
        .ok_or("媒体库窗口已关闭")?;
    let mut bounds = [0i32; 4];
    for (i, key) in ["x", "y", "width", "height"].iter().enumerate() {
        let n = args[*key]
            .as_f64()
            .filter(|n| n.is_finite() && (0.0..=100000.0).contains(n))
            .ok_or("放映区域无效")?;
        bounds[i] = n.round() as i32;
    }
    let alpha = args["opacity"].as_f64().unwrap_or(1.0).clamp(0.0, 1.0);
    let visible = args["visible"] != false;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let result = (|| {
            let scale = view.scale_factor().map_err(|e| e.to_string())?;
            let size = view.inner_size().map_err(|e| e.to_string())?;
            let [x, y, width, height] = bounds.map(|n| (n as f64 * scale).round() as i32);
            // The HWND may have been retired/reused while this job waited on
            // the main queue. Hold ownership across the actual window calls.
            let slot=PRESENTATION.lock().map_err(|_|"放映状态不可用")?;
            let Some(player)=slot.as_ref().filter(|p|p.input_id==input&&p.child==child)else{return Ok(json!({"opened":false,"stale":true}));};
            let hwnd = HWND(child as Ptr);
            unsafe {
                if visible {
                    let _ = MoveWindow(
                        hwnd,
                        x,
                        y,
                        width.min((size.width as i32 - x).max(1)).max(1),
                        height.min((size.height as i32 - y).max(1)).max(1),
                        true,
                    );
                    SetLayeredWindowAttributes(
                        hwnd,
                        windows::Win32::Foundation::COLORREF(0),
                        (alpha * 255.0) as u8,
                        LWA_ALPHA,
                    )
                    .map_err(|e| e.to_string())?;
                    let _ = SetWindowPos(
                        hwnd,
                        Some(HWND_TOP),
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    );
                } else {
                    let _ = ShowWindow(hwnd, SW_HIDE);
                }
            }
            if visible{repaint_after_layout(player);}
            drop(slot);
            Ok::<_, String>(json!({"visible":visible,"inputId":input}))
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|_| "媒体库窗口已关闭")?
}
fn release_grid_engines() {
    let players = GRID
        .lock()
        .map(|mut g| {
            g.expanded = None;
            g.ids.clear();g.rects.clear();g.lease=0;
            std::mem::take(&mut g.players)
        })
        .unwrap_or_default();
    for engine in players {release_surface(engine);}
}
pub fn stop_grid(){release_grid_engines();grid_host::stop();}
pub fn grid_host_value()->Value{grid_host::value()}
pub fn grid_owned_generation(lease:u64)->Option<u64>{grid_host::current().filter(|h|h.lease==lease).map(|h|h.generation)}
pub fn prepare_grid_scope(args:&Value,generation:u64)->Result<Value,String>{grid_host::prepare(args,generation)}
pub fn retire_grid_scope(args:&Value,generation:u64)->Result<(bool,Option<u64>),String>{grid_host::retire(args,generation)}
pub async fn grid_bounds(app:AppHandle,args:Value)->Result<Value,String>{grid_host::bounds(app,args).await}
pub fn retire_grid_window(lease:u64)->bool{
    if !grid_host::current().is_some_and(|h|!h.library()&&h.popup_window==lease){return false;}
    let players={let Ok(mut grid)=GRID.lock() else{return false;};if grid.lease!=lease{return false;}grid.lease=0;grid.expanded=None;grid.ids.clear();grid.rects.clear();std::mem::take(&mut grid.players)};
    for engine in players{release_surface(engine);}grid_host::stop();true
}
pub fn grid_snapshot()->std::collections::HashMap<String,Value>{
    let Ok(grid)=GRID.lock() else{return Default::default();};grid.ids.iter().zip(&grid.players).map(|(id,p)|{let s=p.state();(id.clone(),json!({"positionMs":if s["restoringPausedFrame"]==true{s["restoreTargetMs"].clone()}else{s["positionMs"].clone()},"volume":s["volume"],"muted":s["muted"],"lastVolume":s["lastVolume"],"rate":s["rate"],"paused":pause_intent(&s)}))}).collect()
}
fn layout_grid(window: &tauri::WebviewWindow) {
    if grid_host::current().is_some_and(|h|h.library()){return;}
    let Ok(grid) = GRID.try_lock() else { return };
    if grid.players.is_empty() {
        return;
    }
    if let (Ok(size), Ok(scale)) = (window.inner_size(), window.scale_factor()) {
        let controls = (CONTROLS_HEIGHT * scale) as u32;
        let height = size.height.saturating_sub(controls).max(1);
        let cols = (grid.players.len() as f64).sqrt().ceil() as i32;
        let rows = (grid.players.len() as i32 + cols - 1) / cols;
        let webview: &tauri::Webview = window.as_ref();
        let _ = webview.set_auto_resize(false);
        let _ = webview.set_bounds(tauri::Rect {
            position: tauri::PhysicalPosition::new(0, height as i32).into(),
            size: tauri::PhysicalSize::new(size.width, controls).into(),
        });
        for (i, player) in grid.players.iter().enumerate() {
            let expanded = grid.expanded == Some(i);
            let visible = grid.expanded.is_none() || expanded;
            let (x, y, w, h) = if expanded {
                (0, 0, size.width as i32, height as i32)
            } else if let Some(rect)=grid.rects.get(i).copied().flatten(){
                ((rect[0]*size.width as f64).round() as i32,(rect[1]*height as f64).round() as i32,(rect[2]*size.width as f64).round() as i32,(rect[3]*height as f64).round() as i32)
            } else {
                let w = size.width as i32 / cols;
                let h = height as i32 / rows;
                ((i as i32 % cols) * w, (i as i32 / cols) * h, w, h)
            };
            unsafe {
                let hwnd = HWND(player.child as Ptr);
                let _ = ShowWindow(hwnd, if visible { SW_SHOW } else { SW_HIDE });
                if visible {
                    let _ = MoveWindow(hwnd, x, y, w.max(1), h.max(1), true);
                    let _ = SetWindowPos(
                        hwnd,
                        Some(HWND_TOP),
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    );
                    repaint_after_layout(player);
                }
            }
        }
    }
}
pub async fn grid_open(app: AppHandle, sources: Vec<(String,String,String,Option<[f64;4]>,Value)>,target:crate::rhvideo::player_host::Target,generation:u64) -> Result<Value, String> {
    let _=INPUT_APP.set(app.clone());
    if sources.is_empty() || sources.len() > 9 {
        return Err("同屏播放需要 1–9 个视频".into());
    }
    let previous_host=grid_host::value();
    let (window,host)=grid_host::select(&app,target,generation).await?;
    tauri::async_runtime::spawn_blocking(release_grid_engines)
        .await
        .map_err(|_| "关闭旧网格失败")?;
    if host.library(){if let Some(old)=app.get_webview_window("window-rhvideo-grid"){old.close().map_err(|e|e.to_string())?;}}
    if previous_host["kind"]=="library"&&previous_host!=host.value(){let _=app.emit_to(LIBRARY_LABEL,"rhvideo-grid-closed",json!({"host":previous_host}));}
    let (tx, rx) = tokio::sync::oneshot::channel();
    let view = window.clone();
    let count = sources.len();
    let gui_host=host.clone();
    app.run_on_main_thread(move || {
        let result = (|| {
            gui_host.ensure_open()?;
            surface_class()?;
            let parent = view.hwnd().map_err(|e| e.to_string())?;
            if parent.0 as usize!=gui_host.parent{return Err("同屏窗口已改变".into());}
            let mut children = SurfaceGuard(Vec::new());
            for _ in 0..count {
                let child=create_surface(HWND(parent.0),10,10,if gui_host.library(){WS_EX_LAYERED}else{WINDOW_EX_STYLE::default()})?;
                if gui_host.library(){unsafe{let _=ShowWindow(HWND(child.child as Ptr),SW_HIDE);}}
                children.0.push(child);
            }
            Ok::<_, String>(std::mem::take(&mut children.0))
        })();
        if let Err(Ok(surfaces))=tx.send(result){drop(SurfaceGuard(surfaces));}
    })
    .map_err(|e| e.to_string())?;
    let children = rx.await.map_err(|_| "网格窗口已关闭")??;
    let decode_host=host.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = SurfaceGuard(children.clone());
        let mut players = Vec::new();
        let mut ids=Vec::new();let mut rects=Vec::new();
        for ((id,url,title,rect,restore),child) in sources.into_iter().zip(children) {
            decode_host.ensure_open()?;
            let mut engine = Engine::new(child)?;
            engine.requested_volume=restore["volume"].as_i64().unwrap_or(100).clamp(0,100) as i32;
            engine.muted=restore["muted"]==true;engine.last_volume=restore["lastVolume"].as_i64().unwrap_or(100).clamp(0,100) as i32;
            engine.repeat_input=true;
            engine.hold_audio.store(restore["paused"]==true,std::sync::atomic::Ordering::Relaxed);
            engine.open(&url, title, 0.)?;
            let position=restore["positionMs"].as_i64().unwrap_or(0).max(0);
            if restore["paused"]==true{
                engine.begin_pause_restore(position)?;
            }else if position>0{engine.seek.lock().map_err(|_|"同屏跳转不可用")?.prepare_clamped(engine.input_id,position,std::time::Instant::now());}
            control_engine(&mut engine,&json!({"command":"rate","value":restore["rate"].as_f64().filter(|r|r.is_finite()&&(0.25..=4.).contains(r)).unwrap_or(1.)}))?;
            ids.push(id);rects.push(rect);
            players.push(engine);
        }
        decode_host.ensure_open()?;
        *GRID.lock().map_err(|_| "网格状态不可用")? = Grid {
            players,
            expanded: None,
            ids,rects,lease:decode_host.popup_window,
        };
        guard.0.clear();
        Ok::<_, String>(())
    })
    .await
    .map_err(|_| "网格初始化结束")??;
    if let Err(error)=host.ensure_open(){if grid_host::current().is_some_and(|h|h.lease==host.lease){stop_grid();}return Err(error);}
    let view = window.clone();
    app.run_on_main_thread(move || layout_grid(&view))
        .map_err(|e| e.to_string())?;
    if !host.library(){window.show().map_err(|e| e.to_string())?;window.set_focus().map_err(|e| e.to_string())?;}
    // The new WebView and its parent focus hook already handle keyboard focus.
    // A duplicate COM MoveFocus can block initialization of the native outputs.
    grid_command("grid.state", &json!({}))
}
pub fn grid_command(action: &str, args: &Value) -> Result<Value, String> {
    let mut grid = GRID.lock().map_err(|_| "网格状态不可用")?;
    if action == "grid.control" {
        let target = args["target"].as_i64().ok_or("缺少目标视频")?;
        if target < -1 || target >= grid.players.len() as i64 {
            return Err("目标视频无效".into());
        }
        for (index, player) in grid.players.iter_mut().enumerate() {
            if target == -1 || target == index as i64 {
                control_engine(player, args)?;
            }
        }
    }
    if action == "grid.expand" {
        let target = args["target"]
            .as_i64()
            .filter(|n| *n >= -1 && *n < grid.players.len() as i64)
            .ok_or("目标视频无效")?;
        grid.expanded = if target < 0 || (args["toggle"]==true&&grid.expanded==Some(target as usize)) {
            None
        } else {
            Some(target as usize)
        };
        if let Some(index)=grid.expanded{if pause_intent(&grid.players[index].state()){control_engine(&mut grid.players[index],&json!({"command":"resume"}))?;}}
    }
    Ok(
        json!({"cells":grid.players.iter().enumerate().map(|(i,p)|{let mut s=p.state();s["id"]=json!(grid.ids.get(i));s["rect"]=json!(grid.rects.get(i));s}).collect::<Vec<_>>(),"expanded":grid.expanded,"windowLease":grid.lease,"host":grid_host::value()}),
    )
}
pub fn grid_relayout(app: &AppHandle) -> Result<(), String> {
    if grid_host::current().is_some_and(|h|h.library()){return Ok(());}
    let view = app
        .get_webview_window("window-rhvideo-grid")
        .ok_or("网格窗口不存在")?;
    app.run_on_main_thread(move || layout_grid(&view))
        .map_err(|e| e.to_string())
}
fn resize(window: &tauri::WebviewWindow) {
    let Ok(mut player) = PLAYER.try_lock() else {
        return;
    };
    let Some(player) = player.as_mut() else {
        return;
    };
    layout(window, player.child);
    if let Ok(viewport)=window_viewport(window){player.rotation_viewport=viewport;}
    repaint_after_layout(player);
}
fn window_viewport(window:&tauri::WebviewWindow)->Result<(u32,u32),String>{
    let size=window.inner_size().map_err(|e|e.to_string())?;let scale=window.scale_factor().map_err(|e|e.to_string())?;
    Ok((size.width.max(1),size.height.saturating_sub((CONTROLS_HEIGHT*scale).round() as u32).max(1)))
}
fn library_surface_geometry(window:&tauri::WebviewWindow,host:&SingleHost,surface:Surface,opacity:f64,visible:bool)->Result<(u32,u32),String>{
    use crate::rhvideo::player_host::Target;
    host.ensure_open()?;if !surface.current(){return Err("原生画布已改变，旧布局未执行".into());}
    let Target::Library{bounds,..}=&host.target else{return Err("此播放器没有库内区域".into());};
    let scale=window.scale_factor().map_err(|e|e.to_string())?;let size=window.inner_size().map_err(|e|e.to_string())?;
    let [x,y,width,height]=bounds.map(|value|(value*scale).round() as i32);
    if visible&&(x>=size.width as i32||y>=size.height as i32){return Err("播放器区域已超出窗口".into());}
    let width=width.min((size.width as i32-x).max(1)).max(1);let height=height.min((size.height as i32-y).max(1)).max(1);
    unsafe{let hwnd=HWND(surface.child as Ptr);let style=GetWindowLongPtrW(hwnd,GWL_EXSTYLE);SetWindowLongPtrW(hwnd,GWL_EXSTYLE,style|WS_EX_LAYERED.0 as isize);
        SetLayeredWindowAttributes(hwnd,windows::Win32::Foundation::COLORREF(0),(opacity.clamp(0.,1.)*255.).round() as u8,LWA_ALPHA).map_err(|e|e.to_string())?;
        if visible{MoveWindow(hwnd,x,y,width,height,true).map_err(|e|e.to_string())?;SetWindowPos(hwnd,Some(HWND_TOP),0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE|SWP_SHOWWINDOW).map_err(|e|e.to_string())?;}else{let _=ShowWindow(hwnd,SW_HIDE);}
    }Ok((width as u32,height as u32))
}
fn layout_single(window:&tauri::WebviewWindow,host:&SingleHost,surface:Surface)->Result<(),String>{
    if host.library(){library_surface_geometry(window,host,surface,0.,true)?;}else{if !surface.current(){return Err("原生画布已改变".into());}layout(window,surface.child);}Ok(())
}
pub async fn single_bounds(app:AppHandle,args:Value)->Result<Value,String>{
    check_host(&args)?;let expected=args["expectedInput"].as_u64().filter(|value|*value>0).ok_or("播放区域需要输入身份")?;
    let lease=args["_hostLease"].as_u64().ok_or("播放区域需要宿主身份")?;
    let mut host=single_host().filter(|host|host.library()&&host.lease==lease).ok_or("库内播放面板已改变")?;
    let bounds=crate::rhvideo::player_host::bounds(&args)?;
    if let crate::rhvideo::player_host::Target::Library{bounds:current,..}=&mut host.target{*current=bounds;}
    let opacity=match args.get("opacity"){None=>1.,Some(value)=>value.as_f64().filter(|value|value.is_finite()&&(0.0..=1.).contains(value)).ok_or("播放区域透明度无效")?};
    let visible=args["visible"].as_bool().ok_or("缺少播放区域可见状态")?;
    let view=app.get_webview_window(LIBRARY_LABEL).ok_or("媒体库窗口已关闭")?;let(tx,rx)=tokio::sync::oneshot::channel();
    app.run_on_main_thread(move||{let result=(||{
        host.ensure_open()?;let mut slot=PLAYER.lock().map_err(|_|"播放器不可用")?;let player=slot.as_mut().filter(|player|player.input_id==expected).ok_or("播放输入已改变，旧布局未执行")?;
        let viewport=library_surface_geometry(&view,&host,player.surface,opacity,visible)?;player.rotation_viewport=viewport;
        if visible{repaint_after_layout(player);}
        drop(slot);
        let mut current=SINGLE_HOST.lock().map_err(|_|"播放宿主状态不可用")?;if !current.as_ref().is_some_and(|value|value.lease==lease){return Err("播放面板已改变".to_owned());}host.viewport=viewport;*current=Some(host);
        Ok(json!({"visible":visible,"inputId":expected,"hostLease":lease,"width":viewport.0,"height":viewport.1}))
    })();let _=tx.send(result);}).map_err(|e|e.to_string())?;rx.await.map_err(|_|"播放区域任务已结束".to_owned())?
}
fn layout(window: &tauri::WebviewWindow, child: usize) {
    let started=std::time::Instant::now();let trace=|stage:&str|{if cfg!(debug_assertions)&&std::env::var_os("RHFILES_VLC_DEBUG").is_some(){eprintln!("RHFILES_LAYOUT_STAGE {stage} {}",started.elapsed().as_millis());}};
    trace("entered");
    if let (Ok(size), Ok(scale)) = (window.inner_size(), window.scale_factor()) {
        trace("geometry");
        let controls = (CONTROLS_HEIGHT * scale).round() as u32;
        let video_height = size.height.saturating_sub(controls).max(1);
        // WebView2 is a native compositor surface: a full-window webview can
        // cover the HWND even when its HTML "video area" is empty. Give the
        // webview ONLY the control strip, and the native HWND the video area.
        let webview: &tauri::Webview = window.as_ref();
        if cfg!(debug_assertions)&&std::env::var_os("RHFILES_VLC_DEBUG").is_some(){let _=window.with_webview(move|_|eprintln!("RHFILES_LAYOUT_STAGE before-queued-bounds {}",started.elapsed().as_millis()));}
        let _ = webview.set_auto_resize(false);
        trace("auto-resize");
        let _ = webview.set_bounds(tauri::Rect {
            position: tauri::PhysicalPosition::new(0, video_height as i32).into(),
            size: tauri::PhysicalSize::new(size.width, controls).into(),
        });
        trace("webview-bounds");
        if cfg!(debug_assertions)&&std::env::var_os("RHFILES_VLC_DEBUG").is_some(){let _=window.with_webview(move|_|eprintln!("RHFILES_LAYOUT_STAGE after-queued-bounds {}",started.elapsed().as_millis()));}
        unsafe {
            let _ = MoveWindow(
                HWND(child as Ptr),
                0,
                0,
                size.width as i32,
                video_height as i32,
                true,
            );
            trace("surface-bounds");
            let _ = SetWindowPos(
                HWND(child as Ptr),
                Some(HWND_TOP),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
        }
    }
    trace("complete");
}
pub async fn play(
    app: AppHandle,
    url: String,
    title: String,
    seconds: f64,
    rotation:crate::rhvideo_rotation::Policy,
    preparation:crate::rhvideo::play_intent::Preparation,
    mut target:crate::rhvideo::player_host::Target,
    generation:u64,
) -> Result<Value, String> {
    use crate::rhvideo::player_host::Target;
    preparation.ensure_current()?;
    let started=std::time::Instant::now();trace_open(started,"entry");
    let _=INPUT_APP.set(app.clone());
    if !available(){return Err("原生播放内核文件不完整。请完整解压或修复 RHFiles 安装，保留 vlc 目录；不会改用网页播放。".into());}
    trace_open(started,"kernel-located");
    let previous=single_host();
    if target==Target::Current{let host=previous.as_ref().ok_or("播放器尚未打开")?;host.ensure_open()?;target=host.target.clone();}
    if let Target::Library{window,panel,owner,..}=&target{LIBRARY_EPOCH.ensure_open(*window)?;if !HOST_RESERVATIONS.lock().map_err(|_|"播放预约状态不可用")?.matches(*window,panel,*owner,generation){return Err("播放面板已关闭或替换，旧准备未执行".into());}}
    let same_parent=previous.as_ref().is_some_and(|host|match (&host.target,&target){
        (Target::Popup,Target::Popup)=>WINDOW_EPOCH.ensure_open(host.lease).is_ok(),
        (Target::Library{window:a,..},Target::Library{window:b,..})=>a==b&&WINDOW_EPOCH.ensure_open(host.lease).is_ok(),
        _=>false
    });
    if previous.is_some()&&!same_parent{
        close_single().await?;
        if previous.as_ref().is_some_and(|host|host.library()!=matches!(target,Target::Library{..})){
            let _=finish_host_view(&app,"host-changed")?;
        }
    }
    let library=matches!(target,Target::Library{..});
    let window=if library{app.get_webview_window(LIBRARY_LABEL).ok_or("媒体库窗口已关闭")?}else if let Some(window)=app.get_webview_window(LABEL){window}else{
        crate::rhvideo::client_window(app.clone(),LABEL,"rhvideo-player.html","RHFiles · 播放器",(1100.,720.),(640.,420.)).await?
    };
    let reuse=previous.as_ref().filter(|host|WINDOW_EPOCH.ensure_open(host.lease).is_ok()&&match (&host.target,&target){(Target::Popup,Target::Popup)=>true,(Target::Library{window:a,panel:p,owner:o,..},Target::Library{window:b,panel:q,owner:r,..})=>a==b&&p==q&&o==r,_=>false});
    let fullscreen_before=reuse.map(|host|host.fullscreen_before);
    let lease=if let Some(host)=reuse{host.lease}else{clear_preload();WINDOW_EPOCH.begin()};
    if lease>crate::rhvideo::player_host::MAX_JS_ID{return Err("播放宿主身份已耗尽".into());}
    if !library&&reuse.is_none(){
        let view=window.clone();let owner=app.clone();
        window.on_window_event(move|event|match event{
            WindowEvent::Resized(_)|WindowEvent::ScaleFactorChanged{..}=>{if WINDOW_EPOCH.ensure_open(lease).is_ok(){resize(&view);}},
            WindowEvent::Destroyed=>{WINDOW_EPOCH.close(lease);tauri::async_runtime::spawn(crate::rhvideo::player_window_destroyed(owner.clone(),lease));},
            _=>{}
        });
    }
    trace_open(started,"window-ready");
    let view=window.clone();let display_title=format!("{title} · RHFiles");let activation=preparation.clone();let requested=target.clone();
    let(tx,rx)=tokio::sync::oneshot::channel();
    app.run_on_main_thread(move||{
        trace_open(started,"activation-main-entered");
        let result=(||{
            activation.ensure_current()?;WINDOW_EPOCH.ensure_open(lease)?;
            let viewport=if let Target::Library{window:token,bounds,..}=&requested{
                LIBRARY_EPOCH.ensure_open(*token)?;
                let scale=view.scale_factor().map_err(|e|e.to_string())?;
                (((bounds[2]*scale).round() as u32).max(1),((bounds[3]*scale).round() as u32).max(1))
            }else{
                // Only the explicit standalone compatibility host activates a
                // window. Library playback keeps its originating WebView focused.
                view.set_title(&display_title).map_err(|e|e.to_string())?;
                view.show().map_err(|e|e.to_string())?;trace_open(started,"window-shown");
                view.set_focus().map_err(|e|e.to_string())?;trace_open(started,"native-focus-ready");trace_open(started,"window-focused");
                window_viewport(&view)?
            };
            trace_open(started,"viewport-ready");
            let parent=view.hwnd().map_err(|e|e.to_string())?.0 as usize;
            let fullscreen_before=match fullscreen_before{Some(value)=>value,None=>view.is_fullscreen().map_err(|e|e.to_string())?};
            let host=SingleHost{target:requested,lease,parent,viewport,generation,fullscreen_before};host.ensure_open()?;
            *SINGLE_HOST.lock().map_err(|_|"播放宿主状态不可用")?=Some(host.clone());
            Ok::<_,String>(host)
        })();let _=tx.send(result);
    }).map_err(|e|e.to_string())?;
    trace_open(started,"activation-dispatched");
    let host=rx.await.map_err(|_|"播放器窗口已关闭".to_owned())??;
    let rotation_viewport=host.viewport;let parent=host.parent;
    preparation.ensure_current()?;host.ensure_open()?;
    let (warm_ticket,warmed) = WARM.lock().map_err(|_| "预加载不可用")?.retire(json!({"state":"idle"}));
    trace_open(started,"warm-slot-ready");
    let mut guard = SurfaceGuard(vec![]);
    if let Some((mut warmed,was_current)) = warmed {
        if was_current && warmed.url == url {
            guard.0.push(warmed.surface);
            let settings = PLAYER
                .lock()
                .ok()
                .and_then(|p| p.as_ref().map(Engine::state))
                .unwrap_or(json!({"volume":100,"rate":1,"rotation":0}));
            let reconfigured = warmed.configure_rotation(rotation,rotation_viewport)?;
            if reconfigured {
                if let Err(error)=require_player_window(lease,parent){guard.0.clear();drop(warmed);return Err(error);}
                preparation.ensure_current()?;
                warmed.open(&url, title.clone(), seconds)?;
            }
            control_engine(
                &mut warmed,
                &json!({"command":"volume","value":settings["volume"]}),
            )?;
            control_engine(
                &mut warmed,
                &json!({"command":"rate","value":settings["rate"]}),
            )?;
            if seconds > 0.0 {
                control_engine(
                    &mut warmed,
                    &json!({"command":"seek","value":(seconds*1000.0) as i64}),
                )?;
            }
            if let Err(error)=require_player_window(lease,parent){guard.0.clear();drop(warmed);return Err(error);}
            preparation.ensure_current()?;
            control_engine(&mut warmed, &json!({"command":"resume"}))?;
            let surface=warmed.surface;let child = surface.child;
            let mut state = warmed.state();
            state["preloaded"] = json!(!reconfigured);
            state["host"]=host.value();
            let previous = PLAYER.lock().map_err(|_| "播放器不可用")?.replace(warmed);
            guard.0.clear();
            if let Some(previous) = previous {
                tauri::async_runtime::spawn_blocking(move || release_surface(previous));
            }
            let view = window.clone();
            let layout_host=host.clone();let(tx,rx)=tokio::sync::oneshot::channel();
            app.run_on_main_thread(move || {
                let result=(||{layout_host.ensure_open()?;layout_single(&view,&layout_host,surface)?;
                if !layout_host.library(){unsafe {
                    let _ = SetLayeredWindowAttributes(
                        HWND(child as Ptr),
                        windows::Win32::Foundation::COLORREF(0),
                        255,
                        LWA_ALPHA,
                    );
                }}Ok::<_,String>(())})();let _=tx.send(result);
            })
            .map_err(|e| e.to_string())?;
            rx.await.map_err(|_|"预加载播放区域已关闭".to_owned())??;
            publish_preload(warm_ticket,json!({"state":"consumed"}));
            trace_open(started,"preload-consumed");
            require_player_window(lease,parent)?;
            return Ok(state);
        } else {
            tauri::async_runtime::spawn_blocking(move || release_surface(warmed));
        }
    }
    let view = window.clone();
    let surface_preparation=preparation.clone();
    let layout_host=host.clone();
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        trace_open(started,"surface-main-entered");
        let mut created=false;
        let result: Result<Surface, String> = (|| {
            surface_preparation.ensure_current()?;
            require_player_window(lease,parent)?;
            let existing = PLAYER
                .lock()
                .map_err(|_| "播放器状态不可用")?
                .as_ref()
                .map(|p| p.surface);
            if let Some(child) = existing {
                Ok(child)
            } else {
                let size = view.inner_size().map_err(|e| e.to_string())?;
                let scale = view.scale_factor().map_err(|e| e.to_string())?;
                let parent = view.hwnd().map_err(|e| e.to_string())?;
                surface_class()?;
                let surface=if layout_host.library(){create_surface(HWND(parent.0),layout_host.viewport.0 as i32,layout_host.viewport.1 as i32,WS_EX_LAYERED)?}else{create_surface(HWND(parent.0),size.width as i32,(size.height as i32-(CONTROLS_HEIGHT*scale).round() as i32).max(1),WINDOW_EX_STYLE::default())?};
                created=true;Ok(surface)
            }
        })();
        let result=result.and_then(|surface|{if let Err(error)=layout_single(&view,&layout_host,surface){if created{surface.close();}return Err(error);}Ok(surface)});
        if let Err(Ok(surface))=tx.send(result){if created{surface.close();}}
    })
    .map_err(|e| e.to_string())?;
    trace_open(started,"surface-dispatched");
    let child = rx.await.map_err(|_| "播放器窗口已关闭".to_owned())??;
    trace_open(started,"surface-ready");
    let worker_preparation=preparation.clone();
    let result=tauri::async_runtime::spawn_blocking(move || {
        trace_open(started,"engine-worker-entered");
        let mut surface=SurfaceGuard(vec![child]);
        let mut slot = PLAYER.lock().map_err(|_| "播放器状态不可用")?;
        // An existing decoder already owns this surface. A failed new request
        // must not retire a still-current player's canvas.
        if slot.as_ref().is_some_and(|engine|engine.surface.child==child.child&&engine.surface.generation==child.generation){surface.0.clear();}
        worker_preparation.ensure_current()?;
        require_player_window(lease,parent)?;
        if slot.is_none() {
            let angle=crate::rhvideo_rotation::angle(rotation.source,rotation_viewport,rotation.enabled);
            match Engine::new_with_rotation(child,angle) {
                Ok(engine) => {worker_preparation.ensure_current()?;require_player_window(lease,parent)?;*slot = Some(engine);surface.0.clear();},
                Err(error) => return Err(error),
            }
        }
        trace_open(started,"engine-ready");
        let engine = slot.as_mut().unwrap();
        engine.configure_rotation(rotation,rotation_viewport)?;
        require_player_window(lease,parent)?;
        worker_preparation.ensure_current()?;
        engine.open(&url, title, seconds)?;
        trace_open(started,"input-started");
        let value=engine.state();trace_open(started,"state-ready");Ok(value)
    })
    .await
    .map_err(|_| "原生播放任务意外结束".to_owned())?;
    preparation.ensure_current()?;
    require_player_window(lease,parent)?;
    result.map(|mut value|{value["host"]=host.value();value})
}
pub fn repeat_from(milliseconds:i64)->Result<Value,String>{
    let mut slot=PLAYER.lock().map_err(|_|"播放器状态不可用")?;
    let player=slot.as_mut().ok_or("播放器未打开")?;
    unsafe {
        let p=player.player as Ptr;
        if milliseconds<0||milliseconds>(player.api.length)(p){return Err("循环起点超出范围".into());}
        if (player.api.state)(p)==6 {
            // VLC can ignore a seek sent immediately after restarting an ended
            // input. Recreate only this already-ended media with an explicit
            // start-time; normal looping seeks before EOF without reopening.
            let url=player.url.clone();let title=player.title.clone();let rate=(player.api.rate)(p);
            player.open(&url,title,milliseconds as f64/1000.)?;
            if rate>0. {(player.api.set_rate)(p,rate);}
        }else{
            (player.api.set_time)(p,milliseconds);
            (player.api.set_pause)(p,0);
        }
    }
    player.clock.lock().map_err(|_|"播放时钟不可用")?.reset(milliseconds,player.frame.last_display.load(std::sync::atomic::Ordering::Relaxed));
    Ok(player.state())
}
pub fn command(action: &str, args: &Value) -> Result<Value, String> {
    check_host(args)?;
    let mut player = PLAYER.lock().map_err(|_| "播放器状态不可用")?;
    let Some(player) = player.as_mut() else {
        return if action == "player.state" {
            Ok(json!({"opened":false}))
        } else {
            Err("播放器尚未打开".into())
        };
    };
    if action == "player.control" {
        if args.get("expectedInput").is_some_and(|expected|expected.as_u64()!=Some(player.input_id)){return Err("播放输入已改变，旧操作未执行".into());}
        control_engine(player, args)?;
    }
    if action=="player.state"{player.resolve_rotation()?;}
    let mut value=player.state();value["host"]=host_value();Ok(value)
}
pub fn diagnostic_frame(args:&Value)->Result<Value,String>{
    // Test-only, opt-in readback from the actual native output. No filename,
    // URL or arbitrary destination can be supplied by a WebView/server.
    if !cfg!(debug_assertions)||std::env::var("RHFILES_NATIVE_PLAYER_QA").as_deref()!=Ok("1"){return Err("原生画面诊断仅在隔离调试测试中可用".into());}
    let slot=PLAYER.lock().map_err(|_|"播放器状态不可用")?;let player=slot.as_ref().ok_or("播放器没有打开")?;
    if args.get("expectedInput").is_some_and(|v|v.as_u64()!=Some(player.input_id)){return Err("播放输入已改变，旧诊断未执行".into());}
    let mut random=[0u8;16];getrandom::fill(&mut random).map_err(|_|"无法创建诊断文件名")?;
    let name=format!("rhvideo-native-{}.bmp",random.iter().map(|v|format!("{v:02x}")).collect::<String>());
    let path=std::env::current_dir().map_err(|_|"无法读取隔离测试目录")?.join(name);
    #[cfg(debug_assertions)]{let(width,height)=crate::rhvideo_frame::diagnostic_capture(player.child,&path,player.compatibility)?;return Ok(json!({"path":path,"width":width,"height":height,"inputId":player.input_id,"rotation":player.rotation,"renderer":if player.compatibility{"gdi-compatibility"}else{"native-hardware-auto"}}));}
    #[cfg(not(debug_assertions))]Err("诊断画面不包含在发行构建中".into())
}
fn control_engine(player: &mut Engine, args: &Value) -> Result<(), String> {
    let _ = player.state();
    let command = args
        .get("command")
        .and_then(Value::as_str)
        .ok_or("缺少播放操作")?;
    unsafe {
        let p = player.player as Ptr;
        match command {
            "autoRotate"=>{
                let enabled=args["enabled"].as_bool().ok_or("旋转开关无效")?;
                player.rotation_policy.enabled=enabled;player.rotation_viewport=player.viewport();
                player.resolve_rotation()?;
                let angle=crate::rhvideo_rotation::angle(player.rotation_policy.source,player.rotation_viewport,enabled);
                player.apply_rotation(angle)?;
            }
            "rotate" => {
                let value = args["value"]
                    .as_i64()
                    .filter(|v| [0, 90, 180, 270].contains(v))
                    .ok_or("旋转角度无效")?;
                player.apply_rotation(value as i32)?;
            }
            "pause" => {
                if player.paused_preview.lock().map_err(|_|"暂停画面恢复不可用")?.is_some(){player.pause_requested.store(true,std::sync::atomic::Ordering::Relaxed);return Ok(());}
                player
                    .clock
                    .lock()
                    .map_err(|_| "播放时钟不可用")?
                    .discontinuity();
                player.pause_requested.store(true,std::sync::atomic::Ordering::Relaxed);
                (player.api.set_pause)(p, 1);
            }
            "resume" => {
                let restore_target=player.paused_preview.lock().map_err(|_|"暂停画面恢复不可用")?.as_ref().map(|plan|plan.target);
                player.cancel_pause_restore()?;
                player.pause_requested.store(false,std::sync::atomic::Ordering::Relaxed);
                if let Some(target)=restore_target{player.seek.lock().map_err(|_|"跳转状态不可用")?.prepare_clamped(player.input_id,target,std::time::Instant::now());}
                player
                    .clock
                    .lock()
                    .map_err(|_| "播放时钟不可用")?
                    .discontinuity();
                if matches!((player.api.state)(p),5|6) {
                    let url=player.url.clone();let title=player.title.clone();let rate=(player.api.rate)(p);
                    player.open(&url,title,0.)?;
                    if rate>0. {(player.api.set_rate)(p,rate);}
                }else{
                    (player.api.set_pause)(p, 0);
                }
            }
            "seek" => {
                let ms = args
                    .get("value")
                    .and_then(Value::as_i64)
                    .filter(|v| *v >= 0 && *v <= 604800000 && ((player.api.length)(p)<=0||*v<=(player.api.length)(p)))
                    .ok_or("跳转位置超出范围")?;
                if let Some(plan)=player.paused_preview.lock().map_err(|_|"暂停画面恢复不可用")?.as_mut(){
                    plan.target=ms;plan.deadline=std::time::Instant::now()+std::time::Duration::from_secs(15);
                    if !matches!(plan.phase,PauseFramePhase::Priming){
                        (player.api.set_pause)(p,0);(player.api.set_rate)(p,PAUSE_PREPARE_RATE);(player.api.set_time)(p,ms);player.clock.lock().map_err(|_|"播放时钟不可用")?.reset(ms,player.frame.last_display.load(std::sync::atomic::Ordering::Relaxed));
                        plan.phase=PauseFramePhase::Seeking{not_before:std::time::Instant::now()+std::time::Duration::from_millis(250)};
                    }return Ok(());
                }
                if player.pause_requested.load(std::sync::atomic::Ordering::Relaxed){player.begin_pause_restore(ms)?;let _=player.state();return Ok(());}
                player.seek.lock().map_err(|_|"跳转状态不可用")?.prepare(player.input_id,ms,std::time::Instant::now());
                let _=player.state();
            }
            "volume" => {
                let value = args
                    .get("value")
                    .and_then(Value::as_i64)
                    .filter(|v| (0..=100).contains(v))
                    .ok_or("音量范围是 0–100")?;
                player.requested_volume = value as i32;
                if value>0{player.muted=false;player.last_volume=value as i32;}
                (player.api.set_volume)(p,player.output_gain());
            }
            "mute"=>{
                if player.muted||player.requested_volume<=0{player.requested_volume=if player.last_volume>0{player.last_volume}else{50};player.muted=false;}else{player.last_volume=player.requested_volume;player.muted=true;}
                (player.api.set_volume)(p,player.output_gain());
            }
            "rate" => {
                let value = args
                    .get("value")
                    .and_then(Value::as_f64)
                    .filter(|v| v.is_finite() && (0.25..=4.0).contains(v))
                    .ok_or("速度范围是 0.25–4")?;
                let decoder_rate={let mut plan=player.paused_preview.lock().map_err(|_|"暂停画面恢复不可用")?;if let Some(plan)=plan.as_mut(){plan.rate=value as f32;PAUSE_PREPARE_RATE}else{value as f32}};
                if (player.api.set_rate)(p, decoder_rate) != 0 {
                    return Err("当前媒体不支持此播放速度".into());
                }
                let mut clock = player.clock.lock().map_err(|_| "播放时钟不可用")?;
                clock.rate = value;
                clock.discontinuity();
            }
            _ => return Err("未知播放操作".into()),
        }
    }
    Ok(())
}

#[cfg(test)]
mod input_tests{
    #[test]
    fn queued_preload_is_counted_even_before_its_future_is_polled(){
        let before=super::WARM_ACTIVE.load(std::sync::atomic::Ordering::SeqCst);
        let activity=super::ActivePreload::new();
        let future=async move{let _activity=activity;std::future::pending::<()>().await;};
        assert_eq!(super::WARM_ACTIVE.load(std::sync::atomic::Ordering::SeqCst),before+1);
        drop(future);assert_eq!(super::WARM_ACTIVE.load(std::sync::atomic::Ordering::SeqCst),before);
    }
    use super::*;
    #[test]
    fn presentation_commands_accept_only_the_captured_current_input(){
        for input in [None,Some(1),Some(2)]{assert!(presentation_matches(&json!({}),input).unwrap());}
        assert!(presentation_matches(&json!({"expectedInput":7}),Some(7)).unwrap());
        assert!(presentation_matches(&json!({"expectedInput":7.0}),Some(7)).unwrap());
        assert!(!presentation_matches(&json!({"expectedInput":7}),Some(8)).unwrap());
        assert!(!presentation_matches(&json!({"expectedInput":7}),None).unwrap());
        for value in [Value::Null,json!(0),json!(-1),json!(1.5),json!("7"),json!(true),json!({}),json!([]),json!(9_007_199_254_740_992u64)]{
            assert!(presentation_matches(&json!({"expectedInput":value}),Some(7)).is_err());
        }
    }
    #[test]
    fn a_prebuilt_plugin_index_is_opt_in_and_matches_the_loaded_runtime(){
        let root=tempfile::tempdir().unwrap();let path=root.path();std::fs::create_dir(path.join("plugins")).unwrap();
        let marker=json!({"format":"RHFiles.libVLC.bundle","schemaVersion":1,"runtimeVersion":"3.0.24","pluginIndexMode":"prebuilt-no-scan"});
        std::fs::write(path.join("RHFiles-libVLC.json"),marker.to_string()).unwrap();
        assert!(!bundled_plugin_index(path,"3.0.24 Vetinari"));
        std::fs::write(path.join("plugins/plugins.dat"),vec![0u8;1024]).unwrap();
        assert!(bundled_plugin_index(path,"3.0.24 Vetinari"));
        assert!(!bundled_plugin_index(path,"3.0.25 Vetinari"));
        let mut wrong=marker.clone();wrong["pluginIndexMode"]=json!("scan");std::fs::write(path.join("RHFiles-libVLC.json"),wrong.to_string()).unwrap();
        assert!(!bundled_plugin_index(path,"3.0.24 Vetinari"));
        std::fs::write(path.join("RHFiles-libVLC.json"),"broken").unwrap();assert!(!bundled_plugin_index(path,"3.0.24 Vetinari"));
        std::fs::remove_file(path.join("RHFiles-libVLC.json")).unwrap();assert!(!bundled_plugin_index(path,"3.0.24 Vetinari"));
    }
    #[test]
    fn accepted_pause_or_resume_wins_over_the_lagging_decoder_state(){
        for state in [0,1,2,3,4]{
            assert!(pause_intent(&json!({"state":state,"pauseRequested":true})),"an accepted pause must survive immediate group paging, including decoder state {state}");
            assert!(!pause_intent(&json!({"state":state,"pauseRequested":false})),"an accepted resume must not save an old paused state {state}");
        }
        assert!(pause_intent(&json!({"state":3,"restoringPausedFrame":true})));
        assert!(!pause_intent(&json!({"state":3})));
        assert!(pause_intent(&json!({"state":4})));
    }
    #[test]
    fn native_canvas_decodes_only_media_keys_and_never_replays_key_repeat(){
        for(key,intent)in [(0x1b,"close"),(0x20,"toggle"),(0x25,"previous"),(0x27,"next"),(0x24,"first"),(0x23,"last"),(0x2e,"mark")]{
            assert_eq!(surface_intent(WM_KEYDOWN,key,0,false),Some(intent));
            assert_eq!(surface_intent(WM_KEYDOWN,key,1<<30,false),None);
            assert_eq!(surface_intent(WM_KEYDOWN,key,0,true),None);
        }
        assert_eq!(surface_intent(WM_KEYDOWN,0x41,0,false),None);
        assert_eq!(surface_intent(WM_CHAR,0x20,0,false),None);
        assert_eq!(surface_intent(WM_LBUTTONDBLCLK,0,0,false),Some("expand"));
    }
    #[test]
    fn native_wheel_signs_match_browser_vertical_and_horizontal_navigation(){
        let positive=120usize<<16;let negative=(((-120i16) as u16) as usize)<<16;
        assert_eq!(surface_intent(WM_MOUSEWHEEL,positive,0,false),Some("previous"));
        assert_eq!(surface_intent(WM_MOUSEWHEEL,negative,0,false),Some("next"));
        assert_eq!(surface_intent(WM_MOUSEHWHEEL,positive,0,false),Some("next"));
        assert_eq!(surface_intent(WM_MOUSEHWHEEL,negative,0,false),Some("previous"));
        assert_eq!(surface_intent(WM_MOUSEWHEEL,0,0,false),None);
    }
    #[test]
    fn delayed_seek_is_bounded_consumed_once_and_bound_to_its_decoder(){
        let now=std::time::Instant::now();let mut seek=SeekState::default();seek.prepare(1,7000,now);
        assert_eq!(seek.ready(1,0,1,false,now),None);assert!(seek.pending.is_some());
        assert_eq!(seek.ready(1,20000,2,false,now),None);assert!(seek.pending.is_some());
        assert_eq!(seek.ready(1,20000,3,true,now),Some(7000));
        assert_eq!(seek.ready(1,20000,3,true,now),None);assert!(seek.error.is_none());
        seek.prepare(1,8000,now);assert_eq!(seek.ready(2,20000,3,true,now),None);assert!(seek.pending.is_none());
        assert_eq!(seek.ready(1,20000,3,true,now),None,"returning to the old ID cannot revive a consumed/stale seek");
    }
    #[test]
    fn delayed_seek_reports_terminal_failure_without_rearming_itself(){
        let now=std::time::Instant::now();let mut seek=SeekState::default();seek.prepare(1,30000,now);
        assert_eq!(seek.ready(1,14000,3,true,now),None);assert!(seek.error.as_ref().unwrap().contains("实际媒体时长"));
        assert!(seek.pending.is_none());assert_eq!(seek.ready(1,60000,3,true,now),None);
        seek.prepare(2,3000,now);assert!(seek.error.is_none());
        assert_eq!(seek.ready(2,0,1,false,now+std::time::Duration::from_secs(15)),None);assert!(seek.error.as_ref().unwrap().contains("超时"));assert!(seek.pending.is_none());
    }
    #[test]
    fn restored_grid_position_clamps_to_new_duration_but_explicit_seek_does_not(){
        let now=std::time::Instant::now();let mut seek=SeekState::default();
        seek.prepare_clamped(7,15000,now);assert_eq!(seek.ready(7,0,1,false,now),None);
        assert_eq!(seek.ready(7,10000,4,true,now),Some(9950));assert!(seek.error.is_none());
        seek.prepare(7,15000,now);assert_eq!(seek.ready(7,10000,4,true,now),None);assert!(seek.error.is_some());
        seek.prepare_clamped(7,15000,now);assert_eq!(seek.ready(8,10000,4,true,now),None);assert!(seek.pending.is_none());
    }
}
    #[test]
    fn pending_paused_work_keeps_the_worker_awake_but_terminal_failure_does_not(){
        assert!(independent_active(&json!({"state":4,"restoringPausedFrame":true})));
        assert!(independent_active(&json!({"state":4,"pendingSeekMs":5000})));
        assert!(!independent_active(&json!({"state":4})));
        assert!(!independent_active(&json!({"state":5,"seekError":"恢复失败"})));
        assert!(independent_active(&json!({"state":5})),"a transient decoder startup state is not proof of idle");
    }
