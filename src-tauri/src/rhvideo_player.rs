//! libVLC 3.x renders to a real Win32 child window. No HTML video or vlc.exe.
//! DLLs are loaded only from the installed/bundled VLC directory with a safe
//! dependency search path; never from a media folder or the working directory.
use libloading::Library;
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
        Graphics::Gdi::{BeginPaint, EndPaint, PatBlt, BLACKNESS, PAINTSTRUCT},
        System::LibraryLoader::GetModuleHandleW,
        UI::{WindowsAndMessaging::*, Input::KeyboardAndMouse::{SetFocus,GetKeyState,VK_CONTROL,VK_SHIFT,VK_MENU}},
    },
};

const LABEL: &str = "window-rhvideo-player";
const CONTROLS_HEIGHT:f64=196.;
// 0.25x stretches the 1 s network delay beyond VLC 3's 3 s audio clock bound.
// Hidden/silent restoration must prepare at a normal, supported clock rate.
const PAUSE_PREPARE_RATE:f32=1.;
fn trace_startup(started:std::time::Instant,stage:&str){
    if cfg!(debug_assertions)&&std::env::var_os("RHFILES_VLC_DEBUG").is_some(){
        eprintln!("RHFILES_VLC_STAGE {stage} {}",started.elapsed().as_millis());
    }
}
// Controlled startup comparisons only. Release playback must not inherit an
// arbitrary environment option, and a media server cannot change this value.
fn network_cache_ms()->u32{
    #[cfg(debug_assertions)]
    if let Some(value)=std::env::var_os("RHFILES_VLC_NETWORK_CACHE_MS"){
        if let Some(value)=value.to_str().and_then(|v|v.parse::<u32>().ok()).filter(|v|(100..=10_000).contains(v)){return value;}
    }
    1000
}
fn trace_open(started:std::time::Instant,stage:&str){
    if cfg!(debug_assertions)&&std::env::var_os("RHFILES_VLC_DEBUG").is_some(){
        eprintln!("RHFILES_PLAY_STAGE {stage} {}",started.elapsed().as_millis());
    }
}
static WINDOW_EPOCH:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(0);
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
        if started.elapsed().as_millis()>=20{eprintln!("RHFILES_WINDOW_STAGE {role} {message:#x} {}",started.elapsed().as_millis());}
        result
    }
}
pub(crate) fn install_window_trace(window:&tauri::WebviewWindow){
    #[cfg(debug_assertions)]
    if std::env::var_os("RHFILES_VLC_DEBUG").is_some(){
        let role=match window.label(){"window-rhvideo"=>1,"window-rhvideo-player"=>2,"window-rhvideo-grid"=>3,_=>0};
        if let Ok(hwnd)=window.hwnd(){unsafe{let _=windows::Win32::UI::Shell::SetWindowSubclass(HWND(hwnd.0),Some(trace_window_proc),0x52485052,role);}}
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
fn surface_binding(child:usize)->Option<(&'static str,u64,Option<usize>)>{
    let single=PLAYER.try_lock().ok().and_then(|p|p.as_ref().filter(|p|p.child==child).map(|p|p.input_id));
    single.map(|input|("window-rhvideo-player",input,None)).or_else(||GRID.try_lock().ok().and_then(|g|g.players.iter().enumerate().find(|(_,p)|p.child==child).map(|(index,p)|("window-rhvideo-grid",p.input_id,Some(index)))))
}
fn emit_surface_input(child:usize,intent:&str)->bool{
    let Some(app)=INPUT_APP.get() else{return false;};
    let Some((label,input,target))=surface_binding(child) else{return false;};
    if matches!(intent,"next"|"previous"){
        let Ok(mut at)=INPUT_AT.try_lock() else{return true;};
        let now=std::time::Instant::now();if at.get(&child).is_some_and(|last|now.duration_since(*last)<std::time::Duration::from_millis(180)){return true;}
        at.insert(child,now);
    }
    let _=app.emit_to(label,"rhvideo-native-input",json!({"inputId":input,"intent":intent,"target":target}));true
}
pub fn check_input(args:&Value)->Result<(),String>{
    let Some(expected)=args.get("expectedInput") else{return Ok(());};
    let expected=expected.as_u64().ok_or("播放输入标识无效")?;
    if !PLAYER.lock().map_err(|_|"播放器不可用")?.as_ref().is_some_and(|p|p.input_id==expected){return Err("播放输入已改变，旧操作未执行".into());}Ok(())
}
pub fn check_grid_input(args:&Value)->Result<(),String>{
    let Some(expected)=args.get("expectedInput") else{return Ok(());};
    let expected=expected.as_u64().ok_or("同屏输入标识无效")?;
    let target=args["inputTarget"].as_u64().ok_or("同屏输入目标无效")? as usize;
    if GRID.lock().map_err(|_|"网格不可用")?.players.get(target).map(|p|p.input_id)!=Some(expected){return Err("同屏输入已改变，旧操作未执行".into());}Ok(())
}
static PAGE_VOLUME: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(20);
fn effective_volume(local: i32) -> i32 {
    (local.clamp(0,100) as u32 * PAGE_VOLUME.load(std::sync::atomic::Ordering::Acquire) / 100) as i32
}
pub fn page_volume(value: u32) -> Result<Value, String> {
    if value > 100 { return Err("页面音量范围是 0–100".into()); }
    PAGE_VOLUME.store(value,std::sync::atomic::Ordering::Release);
    for slot in [&PLAYER,&WARM,&PRESENTATION] {
        if let Some(player)=slot.lock().map_err(|_|"播放器状态不可用")?.as_ref() {
            unsafe { (player.api.set_volume)(player.player as Ptr,player.output_gain()); }
        }
    }
    for player in &GRID.lock().map_err(|_|"网格状态不可用")?.players {
        unsafe { (player.api.set_volume)(player.player as Ptr,player.output_gain()); }
    }
    Ok(json!({"volume":value}))
}
static WARM: Mutex<Option<Engine>> = Mutex::new(None);
static WARM_STATUS: Mutex<Option<Value>> = Mutex::new(None);
static WARM_EPOCH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
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
struct SurfaceGuard(Vec<usize>);
impl Drop for SurfaceGuard {
    fn drop(&mut self) {
        for child in self.0.drain(..) {
            unsafe {
                let _ = PostMessageW(
                    Some(HWND(child as Ptr)),
                    WM_CLOSE,
                    Default::default(),
                    Default::default(),
                );
            }
        }
    }
}
static SURFACE_CLASS: std::sync::OnceLock<Result<(), String>> = std::sync::OnceLock::new();
unsafe extern "system" fn surface_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    unsafe {
        if message==WM_NCDESTROY{if let Ok(mut at)=INPUT_AT.lock(){at.remove(&(hwnd.0 as usize));}}
        if message==WM_LBUTTONDOWN&&surface_binding(hwnd.0 as usize).is_some(){let _=SetFocus(Some(hwnd));}
        let modified=matches!(message,WM_KEYDOWN|WM_MOUSEWHEEL|WM_MOUSEHWHEEL)&&[VK_CONTROL,VK_SHIFT,VK_MENU].iter().any(|key|GetKeyState(key.0 as i32)<0);
        if let Some(intent)=surface_intent(message,wparam.0,lparam.0,modified){if emit_surface_input(hwnd.0 as usize,intent){return LRESULT(0);}}
        if message==WM_CONTEXTMENU{return LRESULT(0);}
        if message == WM_ERASEBKGND {
            return LRESULT(1);
        }
        if message == WM_PAINT {
            let mut paint = PAINTSTRUCT::default();
            let _ = BeginPaint(hwnd, &mut paint);
            let mut rect = windows::Win32::Foundation::RECT::default();
            let _ = GetClientRect(hwnd, &mut rect);
            let _ = PatBlt(paint.hdc, 0, 0, rect.right, rect.bottom, BLACKNESS);
            let _ = EndPaint(hwnd, &paint);
            if let Ok(player) = PLAYER.try_lock() {
                if let Some(player) = player.as_ref() {
                    if player.child == hwnd.0 as usize {
                        player.frame.render();
                    }
                }
            }
            if let Ok(grid) = GRID.try_lock() {
                for player in &grid.players {
                    if player.child == hwnd.0 as usize {
                        player.frame.render();
                    }
                }
            }
            if let Ok(Some(player)) = PRESENTATION.try_lock().as_deref() {
                if player.child == hwnd.0 as usize {
                    player.frame.render();
                }
            }
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
impl Api {
    unsafe fn load() -> Result<Self, String> {
        let path = directory()
            .ok_or("未找到 VLC 原生播放内核。此体验版请先安装 64 位 VLC；不会改用浏览器播放。")?;
        // LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS.
        let lib: Library = unsafe {
            libloading::os::windows::Library::load_with_flags(
                path.join("libvlc.dll"),
                0x100 | 0x1000,
            )
        }
        .map_err(|_| "无法加载 VLC 原生内核；请确认安装的是 64 位 VLC 3.x")?
        .into();
        unsafe {
            let version = lib
                .get::<unsafe extern "C" fn() -> *const c_char>(b"libvlc_get_version\0")
                .map_err(|_| "VLC 版本接口不可用")?;
            let version = version();
            if version.is_null() || !CStr::from_ptr(version).to_bytes().starts_with(b"3.") {
                return Err("此体验版需要 VLC 3.x 原生内核".into());
            }
            macro_rules! function {
                ($name:literal) => {
                    *lib.get(concat!($name, "\0").as_bytes())
                        .map_err(|_| concat!("VLC 缺少接口：", $name))?
                };
            }
            Ok(Self {
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
    api: Api,
    instance: usize,
    player: usize,
    child: usize,
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
}
impl Engine {
    fn output_gain(&self)->i32{effective_volume(if self.muted||self.hold_audio.load(std::sync::atomic::Ordering::Relaxed){0}else{self.requested_volume})}
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
    fn new(child: usize) -> Result<Self, String> {
        Self::new_with_rotation(child,0)
    }
    fn new_with_rotation(child:usize,rotation:i32)->Result<Self,String>{
        let started=std::time::Instant::now();
        let api = unsafe { Api::load()? };
        trace_startup(started,"library-loaded");
        let compatibility=unsafe{GetSystemMetrics(SM_REMOTESESSION)!=0}||std::env::var_os("RHFILES_VLC_COMPATIBILITY").is_some();
        let mut options = vec![
            CString::new(
                if cfg!(debug_assertions) && std::env::var_os("RHFILES_VLC_DEBUG").is_some() {
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
        let player = unsafe { (api.player_new)(instance) };
        trace_startup(started,"player-created");
        if player.is_null() {
            unsafe { (api.release)(instance) };
            return Err("无法创建原生播放器".into());
        }
        let mut frame = Box::new(crate::rhvideo_frame::Frame::new(child));
        frame.rotation.store(rotation,std::sync::atomic::Ordering::Relaxed);
        // Keep the bounded GDI presenter for RDP/headless sessions. Ordinary
        // desktops use VLC's own native video output and hardware selection;
        // no RGBA copy, browser transport or artificial 1080p ceiling there.
        unsafe {
            (api.set_hwnd)(player, child as Ptr);
            (api.key_input)(player, 0);
            (api.mouse_input)(player, 0);
            if compatibility {
                (api.video_callbacks)(
                    player,
                    Some(crate::rhvideo_frame::lock),
                    Some(crate::rhvideo_frame::unlock),
                    Some(crate::rhvideo_frame::display),
                    (&mut *frame as *mut crate::rhvideo_frame::Frame).cast(),
                );
                (api.video_formats)(player, Some(crate::rhvideo_frame::setup), None);
            }
        }
        Ok(Self {
            api,
            instance: instance as usize,
            player: player as usize,
            child,
            input_id:0,
            seek:Mutex::new(SeekState::default()),
            requested_volume: 100,
            muted:false,last_volume:100,repeat_input:false,
            paused_preview:Mutex::new(None),pause_requested:std::sync::atomic::AtomicBool::new(false),hold_audio:std::sync::atomic::AtomicBool::new(false),
            title: String::new(),
            frame,
            clock: Mutex::new(crate::rhvideo_clock::Clock::new()),
            compatibility,
            media: 0,
            rotation,
            rotation_policy:Default::default(),rotation_viewport:(0,0),rotation_resolved:false,aspect_input:std::sync::atomic::AtomicU64::new(0),
            url: String::new(),
            open_started: std::time::Instant::now(),
            first_frame_ms: std::sync::atomic::AtomicU64::new(0),
        })
    }
    fn viewport(&self)->(u32,u32){
        let mut rect=RECT::default();unsafe{if GetClientRect(HWND(self.child as Ptr),&mut rect).is_ok(){return ((rect.right-rect.left).max(1) as u32,(rect.bottom-rect.top).max(1) as u32);}}
        self.rotation_viewport
    }
    fn replace_rotation_renderer(&mut self,angle:i32)->Result<(),String>{
        let mut next=Self::new_with_rotation(self.child,angle)?;
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
pub fn stop() {
    crate::rhvideo::flush_playback();
    stop_grid();
    stop_presentation();
    stop_single();
}
pub fn stop_single() {
    clear_preload();
    let engine = PLAYER.lock().ok().and_then(|mut player| player.take());
    if let Some(engine) = engine {
        release_surface(engine);
    }
}
pub fn retire_window(lease:u64)->bool{
    if WINDOW_EPOCH.load(std::sync::atomic::Ordering::SeqCst)!=lease{return false;}
    stop_single();true
}
fn release_surface(engine: Engine) {
    let child = engine.child;
    drop(engine);
    unsafe {
        let _ = PostMessageW(
            Some(HWND(child as Ptr)),
            WM_CLOSE,
            Default::default(),
            Default::default(),
        );
    }
}
pub fn clear_preload() {
    WARM_EPOCH.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    if let Some(engine) = WARM.lock().ok().and_then(|mut p| p.take()) {
        release_surface(engine);
    }
    if let Ok(mut status) = WARM_STATUS.lock() {
        *status = Some(json!({"state":"idle"}));
    }
}
pub fn preload_state() -> Value {
    WARM_STATUS
        .lock()
        .ok()
        .and_then(|s| s.clone())
        .unwrap_or(json!({"state":"idle"}))
}
pub async fn preload(app: AppHandle, url: String, title: String,rotation:crate::rhvideo_rotation::Policy) -> Result<Value, String> {
    clear_preload();
    let ticket = WARM_EPOCH.load(std::sync::atomic::Ordering::SeqCst);
    // Like RHVideo's onplaying handler, do not compete for upstream bandwidth,
    // decoder initialization or GPU resources before the active first frame.
    *WARM_STATUS.lock().map_err(|_| "预加载状态不可用")? =
        Some(json!({"state":"waiting-current-frame","title":title}));
    let first_frame_deadline=std::time::Instant::now()+std::time::Duration::from_secs(15);
    loop {
        if ticket!=WARM_EPOCH.load(std::sync::atomic::Ordering::SeqCst) {
            return Ok(json!({"state":"cancelled"}));
        }
        let ready=PLAYER.try_lock().ok().and_then(|p|p.as_ref().map(Engine::state))
            .is_some_and(|s|s["renderedFrames"].as_u64().unwrap_or(0)>0&&s["state"]==3);
        if ready {break;}
        if std::time::Instant::now()>=first_frame_deadline {
            let value=json!({"state":"skipped","reason":"当前视频尚未显示首帧，不占用其网络和解码资源"});
            if ticket==WARM_EPOCH.load(std::sync::atomic::Ordering::SeqCst) {
                *WARM_STATUS.lock().map_err(|_| "预加载状态不可用")?=Some(value.clone());
            }
            return Ok(value);
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    let Ok(_build) = WARM_BUILD.try_lock() else {
        let value = json!({"state":"skipped","reason":"上一项预加载正在释放，不启动并行预加载"});
        *WARM_STATUS.lock().map_err(|_| "预加载状态不可用")? = Some(value.clone());
        return Ok(value);
    };
    *WARM_STATUS.lock().map_err(|_| "预加载状态不可用")? =
        Some(json!({"state":"loading","title":title}));
    let view = app.get_webview_window(LABEL).ok_or("播放器没有打开")?;
    let rotation_viewport=window_viewport(&view)?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let result = (|| {
            surface_class()?;
            let parent = view.hwnd().map_err(|e| e.to_string())?;
            let child = unsafe {
                CreateWindowExW(
                    WS_EX_LAYERED,
                    w!("RHFilesNativeVideoSurface"),
                    w!(""),
                    WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS | WS_CLIPCHILDREN,
                    0,
                    0,
                    320,
                    180,
                    Some(HWND(parent.0)),
                    None,
                    None,
                    None,
                )
            }
            .map_err(|e| e.to_string())?;
            unsafe {
                let _ = SetLayeredWindowAttributes(
                    child,
                    windows::Win32::Foundation::COLORREF(0),
                    0,
                    LWA_ALPHA,
                );
            }
            Ok::<usize, String>(child.0 as usize)
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    let child = rx.await.map_err(|_| "播放器已关闭")??;
    let result = tauri::async_runtime::spawn_blocking(move || {
        let angle=crate::rhvideo_rotation::angle(rotation.source,rotation_viewport,rotation.enabled);
        let mut engine = match Engine::new_with_rotation(child,angle) {
            Ok(e) => e,
            Err(e) => {
                unsafe {
                    let _ = PostMessageW(
                        Some(HWND(child as Ptr)),
                        WM_CLOSE,
                        Default::default(),
                        Default::default(),
                    );
                }
                return Err(e);
            }
        };
        engine.configure_rotation(rotation,rotation_viewport)?;
        if let Err(error) = control_engine(&mut engine, &json!({"command":"volume","value":0})) {
            release_surface(engine);
            return Err(error);
        }
        if let Err(e) = engine.open(&url, title, 0.0) {
            release_surface(engine);
            return Err(e);
        }
        Ok(engine)
    })
    .await
    .map_err(|_| "预加载任务意外结束")?;
    let mut engine = match result {
        Ok(e) => e,
        Err(e) => {
            if ticket == WARM_EPOCH.load(std::sync::atomic::Ordering::SeqCst) {
                *WARM_STATUS.lock().map_err(|_| "预加载状态不可用")? =
                    Some(json!({"state":"failed","reason":e}));
            }
            return Err(e);
        }
    };
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        if ticket != WARM_EPOCH.load(std::sync::atomic::Ordering::SeqCst) {
            tauri::async_runtime::spawn_blocking(move || release_surface(engine));
            return Ok(json!({"state":"cancelled"}));
        }
        if let Err(error)=engine.resolve_rotation(){release_surface(engine);return Err(error);}
        let status = engine.state();
        // Transparent native windows can be GPU-occluded. Readiness is actual
        // decoder output; ordinary playback still requires displayed frames.
        if status["decodedFrames"].as_u64().unwrap_or(0) > 0 {
            if let Err(error) = control_engine(&mut engine, &json!({"command":"pause"})) {
                release_surface(engine);
                return Err(error);
            }
            let mut slot = WARM.lock().map_err(|_| "预加载不可用")?;
            if ticket != WARM_EPOCH.load(std::sync::atomic::Ordering::SeqCst) {
                drop(slot);
                release_surface(engine);
                return Ok(json!({"state":"cancelled"}));
            }
            *slot = Some(engine);
            let value = json!({"state":"ready","decodedFrames":status["decodedFrames"],"renderedFrames":status["renderedFrames"]});
            *WARM_STATUS.lock().map_err(|_| "预加载状态不可用")? = Some(value.clone());
            return Ok(value);
        }
        if std::time::Instant::now() >= deadline || status["state"] == 7 {
            tauri::async_runtime::spawn_blocking(move || release_surface(engine));
            let value = json!({"state":"failed","reason":"原生下一项首帧预加载失败或超时；不会自动重试","decoderState":status["state"],"decodedFrames":status["decodedFrames"],"renderedFrames":status["renderedFrames"]});
            *WARM_STATUS.lock().map_err(|_| "预加载状态不可用")? = Some(value.clone());
            return Ok(value);
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
}
pub fn stop_presentation() {
    PRESENTATION_EPOCH.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let player = PRESENTATION.lock().ok().and_then(|mut value| value.take());
    if let Some(player) = player {
        let child = player.child;
        drop(player);
        unsafe {
            let _ = PostMessageW(
                Some(HWND(child as Ptr)),
                WM_CLOSE,
                Default::default(),
                Default::default(),
            );
        }
    }
}
pub async fn presentation_open(
    app: AppHandle,
    url: String,
    title: String,
    seconds: f64,
) -> Result<Value, String> {
    stop();
    let ticket = PRESENTATION_EPOCH.load(std::sync::atomic::Ordering::SeqCst);
    let view = app
        .get_webview_window("window-rhvideo")
        .ok_or("媒体库窗口已关闭")?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let result = (|| {
            surface_class()?;
            let parent = view.hwnd().map_err(|e| e.to_string())?;
            let child = unsafe {
                CreateWindowExW(
                    WS_EX_LAYERED,
                    w!("RHFilesNativeVideoSurface"),
                    w!(""),
                    WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS | WS_CLIPCHILDREN,
                    0,
                    0,
                    16,
                    16,
                    Some(HWND(parent.0)),
                    None,
                    None,
                    None,
                )
            }
            .map_err(|e| e.to_string())?;
            unsafe {
                let _ = SetLayeredWindowAttributes(
                    child,
                    windows::Win32::Foundation::COLORREF(0),
                    0,
                    LWA_ALPHA,
                );
            }
            Ok::<usize, String>(child.0 as usize)
        })();
        let _ = tx.send(result);
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
        if result.is_err() {
            unsafe {
                let _ = PostMessageW(
                    Some(HWND(child as Ptr)),
                    WM_CLOSE,
                    Default::default(),
                    Default::default(),
                );
            }
        }
        result
    })
    .await
    .map_err(|_| "原生放映任务意外结束".to_string())?
}
pub fn presentation_command(action: &str, args: &Value) -> Result<Value, String> {
    let mut slot = PRESENTATION.lock().map_err(|_| "放映状态不可用")?;
    let Some(player) = slot.as_mut() else {
        return Ok(json!({"opened":false}));
    };
    if action == "presentation.control" {
        control_engine(player, args)?;
    }
    Ok(player.state())
}
pub async fn presentation_bounds(app: AppHandle, args: Value) -> Result<Value, String> {
    let child = PRESENTATION
        .lock()
        .map_err(|_| "放映状态不可用")?
        .as_ref()
        .map(|p| p.child)
        .ok_or("原生放映没有打开")?;
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
            Ok::<_, String>(json!({"visible":visible}))
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|_| "媒体库窗口已关闭")?
}
pub fn stop_grid() {
    let players = GRID
        .lock()
        .map(|mut g| {
            g.expanded = None;
            g.ids.clear();g.rects.clear();g.lease=0;
            std::mem::take(&mut g.players)
        })
        .unwrap_or_default();
    for engine in players {
        let child = engine.child;
        drop(engine);
        unsafe {
            let _ = PostMessageW(
                Some(HWND(child as Ptr)),
                WM_CLOSE,
                Default::default(),
                Default::default(),
            );
        }
    }
}
pub fn retire_grid_window(lease:u64)->bool{
    let players={let Ok(mut grid)=GRID.lock() else{return false;};if grid.lease!=lease{return false;}grid.lease=0;grid.expanded=None;grid.ids.clear();grid.rects.clear();std::mem::take(&mut grid.players)};
    for engine in players{release_surface(engine);}true
}
pub fn grid_snapshot()->std::collections::HashMap<String,Value>{
    let Ok(grid)=GRID.lock() else{return Default::default();};grid.ids.iter().zip(&grid.players).map(|(id,p)|{let s=p.state();(id.clone(),json!({"positionMs":if s["restoringPausedFrame"]==true{s["restoreTargetMs"].clone()}else{s["positionMs"].clone()},"volume":s["volume"],"muted":s["muted"],"lastVolume":s["lastVolume"],"rate":s["rate"],"paused":pause_intent(&s)}))}).collect()
}
fn layout_grid(window: &tauri::WebviewWindow) {
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
                }
            }
        }
    }
}
pub async fn grid_open(app: AppHandle, sources: Vec<(String,String,String,Option<[f64;4]>,Value)>) -> Result<Value, String> {
    let _=INPUT_APP.set(app.clone());
    if sources.is_empty() || sources.len() > 9 {
        return Err("同屏播放需要 1–9 个视频".into());
    }
    let label = "window-rhvideo-grid";
    let (window,lease) = if let Some(w) = app.get_webview_window(label) {
        (w,GRID_WINDOW_EPOCH.load(std::sync::atomic::Ordering::SeqCst))
    } else {
        let w = crate::rhvideo::client_window(
            app.clone(),
            label,
            "rhvideo-grid.html",
            "RHFiles · 多视频",
            (1200., 820.),
            (700., 500.),
        )
        .await?;
        let lease=GRID_WINDOW_EPOCH.fetch_add(1,std::sync::atomic::Ordering::SeqCst)+1;
        let view = w.clone();
        let owner=app.clone();
        w.on_window_event(move |e| match e {
            WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => layout_grid(&view),
            WindowEvent::Destroyed => {
                tauri::async_runtime::spawn(crate::rhvideo::grid_window_destroyed(owner.clone(),lease));
            }
            _ => {}
        });
        (w,lease)
    };
    tauri::async_runtime::spawn_blocking(stop_grid)
        .await
        .map_err(|_| "关闭旧网格失败")?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    let view = window.clone();
    let count = sources.len();
    app.run_on_main_thread(move || {
        let result = (|| {
            surface_class()?;
            let parent = view.hwnd().map_err(|e| e.to_string())?;
            let mut children = Vec::new();
            for _ in 0..count {
                let child = unsafe {
                    CreateWindowExW(
                        WINDOW_EX_STYLE::default(),
                        w!("RHFilesNativeVideoSurface"),
                        w!(""),
                        WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS | WS_CLIPCHILDREN,
                        0,
                        0,
                        10,
                        10,
                        Some(HWND(parent.0)),
                        None,
                        None,
                        None,
                    )
                }
                .map_err(|e| e.to_string())?;
                children.push(child.0 as usize);
            }
            Ok::<_, String>(children)
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    let children = rx.await.map_err(|_| "网格窗口已关闭")??;
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = SurfaceGuard(children.clone());
        let mut players = Vec::new();
        let mut ids=Vec::new();let mut rects=Vec::new();
        for ((id,url,title,rect,restore),child) in sources.into_iter().zip(children) {
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
        *GRID.lock().map_err(|_| "网格状态不可用")? = Grid {
            players,
            expanded: None,
            ids,rects,lease,
        };
        guard.0.clear();
        Ok::<_, String>(())
    })
    .await
    .map_err(|_| "网格初始化结束")??;
    let view = window.clone();
    app.run_on_main_thread(move || layout_grid(&view))
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
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
        json!({"cells":grid.players.iter().enumerate().map(|(i,p)|{let mut s=p.state();s["id"]=json!(grid.ids.get(i));s["rect"]=json!(grid.rects.get(i));s}).collect::<Vec<_>>(),"expanded":grid.expanded,"windowLease":grid.lease}),
    )
}
pub fn grid_relayout(app: &AppHandle) -> Result<(), String> {
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
    player.frame.render();
}
fn window_viewport(window:&tauri::WebviewWindow)->Result<(u32,u32),String>{
    let size=window.inner_size().map_err(|e|e.to_string())?;let scale=window.scale_factor().map_err(|e|e.to_string())?;
    Ok((size.width.max(1),size.height.saturating_sub((CONTROLS_HEIGHT*scale).round() as u32).max(1)))
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
) -> Result<Value, String> {
    let started=std::time::Instant::now();
    trace_open(started,"entry");
    let _=INPUT_APP.set(app.clone());
    if !available() {
        return Err(
            "未检测到原生播放内核。此体验版请先安装 64 位 VLC 3.x；不会打开网页播放。".into(),
        );
    }
    trace_open(started,"kernel-located");
    let window = if let Some(window) = app.get_webview_window(LABEL) {
        window
    } else {
        let window = crate::rhvideo::client_window(
            app.clone(),
            LABEL,
            "rhvideo-player.html",
            "RHFiles · 播放器",
            (1100., 720.),
            (640., 420.),
        )
        .await?;
        let view = window.clone();
        let owner=app.clone();
        let lease=WINDOW_EPOCH.fetch_add(1,std::sync::atomic::Ordering::SeqCst)+1;
        window.on_window_event(move |event| match event {
            WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => resize(&view),
            WindowEvent::Destroyed => {
                tauri::async_runtime::spawn(crate::rhvideo::player_window_destroyed(owner.clone(),lease));
            }
            _ => {}
        });
        window
    };
    trace_open(started,"window-ready");
    // Keep activation and its geometry read in one GUI transaction. Each
    // separate getter otherwise waits behind newly queued WebView startup and
    // focus work, before the native input has even been allowed to open.
    // Wry already focuses the newly built WebView and handles WM_SETFOCUS on
    // its parent. Repeating controller.MoveFocus while it is still starting can
    // synchronously stall this GUI thread for two seconds. Keep native window
    // activation; do not request the same COM focus transition a second time.
    let view=window.clone();let display_title=format!("{title} · RHFiles");
    let(tx,rx)=tokio::sync::oneshot::channel();
    app.run_on_main_thread(move||{
        trace_open(started,"activation-main-entered");
        let result=(||{
            view.set_title(&display_title).map_err(|e|e.to_string())?;
            view.show().map_err(|e|e.to_string())?;
            trace_open(started,"window-shown");
            view.set_focus().map_err(|e|e.to_string())?;
            trace_open(started,"native-focus-ready");
            trace_open(started,"window-focused");
            let viewport=window_viewport(&view)?;
            trace_open(started,"viewport-ready");
            Ok::<_,String>(viewport)
        })();let _=tx.send(result);
    }).map_err(|e|e.to_string())?;
    trace_open(started,"activation-dispatched");
    let rotation_viewport=rx.await.map_err(|_|"播放器窗口已关闭".to_owned())??;
    let warmed = WARM.lock().map_err(|_| "预加载不可用")?.take();
    trace_open(started,"warm-slot-ready");
    let mut guard = SurfaceGuard(vec![]);
    WARM_EPOCH.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    if let Some(mut warmed) = warmed {
        if warmed.url == url {
            guard.0.push(warmed.child);
            let settings = PLAYER
                .lock()
                .ok()
                .and_then(|p| p.as_ref().map(Engine::state))
                .unwrap_or(json!({"volume":100,"rate":1,"rotation":0}));
            let reconfigured = warmed.configure_rotation(rotation,rotation_viewport)?;
            if reconfigured {
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
            control_engine(&mut warmed, &json!({"command":"resume"}))?;
            let child = warmed.child;
            let mut state = warmed.state();
            state["preloaded"] = json!(!reconfigured);
            let previous = PLAYER.lock().map_err(|_| "播放器不可用")?.replace(warmed);
            guard.0.clear();
            if let Some(previous) = previous {
                tauri::async_runtime::spawn_blocking(move || release_surface(previous));
            }
            let view = window.clone();
            app.run_on_main_thread(move || {
                layout(&view, child);
                unsafe {
                    let _ = SetLayeredWindowAttributes(
                        HWND(child as Ptr),
                        windows::Win32::Foundation::COLORREF(0),
                        255,
                        LWA_ALPHA,
                    );
                }
            })
            .map_err(|e| e.to_string())?;
            *WARM_STATUS.lock().map_err(|_| "预加载状态不可用")? =
                Some(json!({"state":"consumed"}));
            trace_open(started,"preload-consumed");
            return Ok(state);
        } else {
            tauri::async_runtime::spawn_blocking(move || release_surface(warmed));
        }
    }
    let view = window.clone();
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        trace_open(started,"surface-main-entered");
        let result: Result<usize, String> = (|| {
            let existing = PLAYER
                .lock()
                .map_err(|_| "播放器状态不可用")?
                .as_ref()
                .map(|p| p.child);
            if let Some(child) = existing {
                Ok(child)
            } else {
                let size = view.inner_size().map_err(|e| e.to_string())?;
                let scale = view.scale_factor().map_err(|e| e.to_string())?;
                let parent = view.hwnd().map_err(|e| e.to_string())?;
                surface_class()?;
                let child = unsafe {
                    CreateWindowExW(
                        WINDOW_EX_STYLE::default(),
                        w!("RHFilesNativeVideoSurface"),
                        w!(""),
                        WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS | WS_CLIPCHILDREN,
                        0,
                        0,
                        size.width as i32,
                        (size.height as i32 - (CONTROLS_HEIGHT * scale).round() as i32).max(1),
                        Some(HWND(parent.0)),
                        None,
                        None,
                        None,
                    )
                }
                .map_err(|e| e.to_string())?;
                Ok(child.0 as usize)
            }
        })();
        if let Ok(child) = result {
            layout(&view, child);
        }
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    trace_open(started,"surface-dispatched");
    let child = rx.await.map_err(|_| "播放器窗口已关闭".to_owned())??;
    trace_open(started,"surface-ready");
    tauri::async_runtime::spawn_blocking(move || {
        trace_open(started,"engine-worker-entered");
        let mut slot = PLAYER.lock().map_err(|_| "播放器状态不可用")?;
        if slot.is_none() {
            let angle=crate::rhvideo_rotation::angle(rotation.source,rotation_viewport,rotation.enabled);
            match Engine::new_with_rotation(child,angle) {
                Ok(engine) => *slot = Some(engine),
                Err(error) => {
                    unsafe {
                        let _ = PostMessageW(
                            Some(HWND(child as Ptr)),
                            WM_CLOSE,
                            Default::default(),
                            Default::default(),
                        );
                    }
                    return Err(error);
                }
            }
        }
        trace_open(started,"engine-ready");
        let engine = slot.as_mut().unwrap();
        engine.configure_rotation(rotation,rotation_viewport)?;
        engine.open(&url, title, seconds)?;
        trace_open(started,"input-started");
        let value=engine.state();trace_open(started,"state-ready");Ok(value)
    })
    .await
    .map_err(|_| "原生播放任务意外结束".to_owned())?
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
    Ok(player.state())
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
    use super::*;
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
