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
use tauri::{AppHandle, Manager, WindowEvent};
use windows::{
    core::w,
    Win32::{
        Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
        Graphics::Gdi::{BeginPaint, EndPaint, PatBlt, BLACKNESS, PAINTSTRUCT},
        System::LibraryLoader::GetModuleHandleW,
        UI::WindowsAndMessaging::*,
    },
};

const LABEL: &str = "window-rhvideo-player";
static PLAYER: Mutex<Option<Engine>> = Mutex::new(None);
static PAGE_VOLUME: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(20);
fn effective_volume(local: i32) -> i32 {
    (local.clamp(0,100) as u32 * PAGE_VOLUME.load(std::sync::atomic::Ordering::Acquire) / 100) as i32
}
pub fn page_volume(value: u32) -> Result<Value, String> {
    if value > 100 { return Err("页面音量范围是 0–100".into()); }
    PAGE_VOLUME.store(value,std::sync::atomic::Ordering::Release);
    for slot in [&PLAYER,&WARM,&PRESENTATION] {
        if let Some(player)=slot.lock().map_err(|_|"播放器状态不可用")?.as_ref() {
            unsafe { (player.api.set_volume)(player.player as Ptr,effective_volume(player.requested_volume)); }
        }
    }
    for player in &GRID.lock().map_err(|_|"网格状态不可用")?.players {
        unsafe { (player.api.set_volume)(player.player as Ptr,effective_volume(player.requested_volume)); }
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
});
struct Grid {
    players: Vec<Engine>,
    expanded: Option<usize>,
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
    set_hwnd: unsafe extern "C" fn(Ptr, Ptr),
    play: unsafe extern "C" fn(Ptr) -> i32,
    set_pause: unsafe extern "C" fn(Ptr, i32),
    stop: unsafe extern "C" fn(Ptr),
    time: unsafe extern "C" fn(Ptr) -> i64,
    position: unsafe extern "C" fn(Ptr) -> f32,
    video_size: unsafe extern "C" fn(Ptr, u32, *mut u32, *mut u32) -> i32,
    length: unsafe extern "C" fn(Ptr) -> i64,
    set_time: unsafe extern "C" fn(Ptr, i64),
    state: unsafe extern "C" fn(Ptr) -> i32,
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
                set_hwnd: function!("libvlc_media_player_set_hwnd"),
                play: function!("libvlc_media_player_play"),
                set_pause: function!("libvlc_media_player_set_pause"),
                stop: function!("libvlc_media_player_stop"),
                time: function!("libvlc_media_player_get_time"),
                position: function!("libvlc_media_player_get_position"),
                video_size: function!("libvlc_video_get_size"),
                length: function!("libvlc_media_player_get_length"),
                set_time: function!("libvlc_media_player_set_time"),
                state: function!("libvlc_media_player_get_state"),
                rate: function!("libvlc_media_player_get_rate"),
                set_rate: function!("libvlc_media_player_set_rate"),
                volume: function!("libvlc_audio_get_volume"),
                set_volume: function!("libvlc_audio_set_volume"),
                key_input: function!("libvlc_video_set_key_input"),
                mouse_input: function!("libvlc_video_set_mouse_input"),
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
    requested_volume: i32,
    title: String,
    frame: Box<crate::rhvideo_frame::Frame>,
    clock: Mutex<crate::rhvideo_clock::Clock>,
    compatibility: bool,
    media: usize,
    rotation: i32,
    url: String,
}
impl Engine {
    fn new(child: usize) -> Result<Self, String> {
        let api = unsafe { Api::load()? };
        let options = [
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
        ];
        let pointers = options.iter().map(|s| s.as_ptr()).collect::<Vec<_>>();
        let instance = unsafe { (api.new)(pointers.len() as i32, pointers.as_ptr()) };
        if instance.is_null() {
            return Err("VLC 原生内核初始化失败".into());
        }
        let player = unsafe { (api.player_new)(instance) };
        if player.is_null() {
            unsafe { (api.release)(instance) };
            return Err("无法创建原生播放器".into());
        }
        let mut frame = Box::new(crate::rhvideo_frame::Frame::new(child));
        // Keep the bounded GDI presenter for RDP/headless sessions. Ordinary
        // desktops use VLC's own native video output and hardware selection;
        // no RGBA copy, browser transport or artificial 1080p ceiling there.
        let compatibility = unsafe { GetSystemMetrics(SM_REMOTESESSION) != 0 }
            || std::env::var_os("RHFILES_VLC_COMPATIBILITY").is_some();
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
            requested_volume: 100,
            title: String::new(),
            frame,
            clock: Mutex::new(crate::rhvideo_clock::Clock::new()),
            compatibility,
            media: 0,
            rotation: 0,
            url: String::new(),
        })
    }
    fn open(&mut self, url: &str, title: String, seconds: f64) -> Result<(), String> {
        self.url = url.to_owned();
        self.clock.lock().map_err(|_| "播放时钟不可用")?.reset(
            (seconds * 1000.) as i64,
            self.frame
                .last_display
                .load(std::sync::atomic::Ordering::Relaxed),
        );
        self.frame
            .count
            .store(0, std::sync::atomic::Ordering::Relaxed);
        let url = CString::new(url).map_err(|_| "媒体地址无效")?;
        unsafe {
            (self.api.stop)(self.player as Ptr);
            let media = (self.api.media_new)(self.instance as Ptr, url.as_ptr());
            if media.is_null() {
                return Err("无法打开媒体流".into());
            }
            for option in [":network-caching=1000", ":http-proxy="] {
                let option = CString::new(option).unwrap();
                (self.api.media_option)(media, option.as_ptr());
            }
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
            if self.rotation != 0 {
                for option in [
                    ":video-filter=transform".to_owned(),
                    format!(":transform-type={}", self.rotation),
                ] {
                    let option = CString::new(option).unwrap();
                    (self.api.media_option_flag)(media, option.as_ptr(), 0x2);
                }
            }
            let start = CString::new(format!(":start-time={seconds:.3}")).unwrap();
            (self.api.media_option)(media, start.as_ptr());
            (self.api.set_media)(self.player as Ptr, media);
            if self.media != 0 {
                (self.api.media_release)(self.media as Ptr);
            }
            self.media = media as usize;
            (self.api.set_volume)(self.player as Ptr,effective_volume(self.requested_volume));
            if (self.api.play)(self.player as Ptr) != 0 {
                return Err("原生播放器无法开始播放".into());
            }
        }
        self.title = title;
        Ok(())
    }
    fn state(&self) -> Value {
        unsafe {
            let p = self.player as Ptr;
            let (mut width, mut height) = (0, 0);
            (self.api.video_size)(p, 0, &mut width, &mut height);
            let raw = (self.api.time)(p).max(0);
            let duration = (self.api.length)(p).max(0);
            let state = (self.api.state)(p);
            let mut stats = MediaStats::default();
            if self.media != 0 {
                (self.api.media_stats)(self.media as Ptr, &mut stats);
            }
            if !self.compatibility {
                self.frame.observe_native(stats.displayed.max(0) as u64);
            }
            let position = {
                self.clock
                    .lock()
                    .map(|mut c| {
                        c.observe(
                            raw,
                            duration,
                            state,
                            self.frame
                                .last_display
                                .load(std::sync::atomic::Ordering::Relaxed),
                        )
                    })
                    .unwrap_or(raw)
            };
            json!({"opened":true,"title":self.title,"engine":"libVLC","renderer":if self.compatibility{"gdi-compatibility"}else{"native-hardware-auto"},"rotation":self.rotation,"videoWidth":width,"videoHeight":height,"renderedFrames":if self.compatibility{self.frame.count.load(std::sync::atomic::Ordering::Relaxed)}else{stats.displayed.max(0) as u64},"decodedFrames":stats.decoded_video.max(0),"lostFrames":stats.lost.max(0),"inputBitrateMbps":stats.input_bitrate,"decoderPositionFraction":(self.api.position)(p),"positionFraction":if duration>0{position as f64/duration as f64}else{0.0},
            "state":state,"positionMs":position,"decoderPositionMs":raw,"durationMs":duration,
            "rate":(self.api.rate)(p),"volume":self.requested_volume,"decoderVolume":(self.api.volume)(p),"nativeSurface":self.child!=0})
        }
    }
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
    clear_preload();
    let engine = PLAYER.lock().ok().and_then(|mut player| player.take());
    if let Some(engine) = engine {
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
pub async fn preload(app: AppHandle, url: String, title: String) -> Result<Value, String> {
    clear_preload();
    let ticket = WARM_EPOCH.load(std::sync::atomic::Ordering::SeqCst);
    let Ok(_build) = WARM_BUILD.try_lock() else {
        let value = json!({"state":"skipped","reason":"上一项预加载正在释放，不启动并行预加载"});
        *WARM_STATUS.lock().map_err(|_| "预加载状态不可用")? = Some(value.clone());
        return Ok(value);
    };
    *WARM_STATUS.lock().map_err(|_| "预加载状态不可用")? =
        Some(json!({"state":"loading","title":title}));
    let view = app.get_webview_window(LABEL).ok_or("播放器没有打开")?;
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
                    WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
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
    let rotation = PLAYER
        .lock()
        .ok()
        .and_then(|p| p.as_ref().map(|p| p.rotation))
        .unwrap_or(0);
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut engine = match Engine::new(child) {
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
        engine.rotation = rotation;
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
                    WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
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
fn layout_grid(window: &tauri::WebviewWindow) {
    let Ok(grid) = GRID.try_lock() else { return };
    if grid.players.is_empty() {
        return;
    }
    if let (Ok(size), Ok(scale)) = (window.inner_size(), window.scale_factor()) {
        let controls = (132. * scale) as u32;
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
pub async fn grid_open(app: AppHandle, sources: Vec<(String, String)>) -> Result<Value, String> {
    if sources.is_empty() || sources.len() > 9 {
        return Err("同屏播放需要 1–9 个视频".into());
    }
    stop();
    let label = "window-rhvideo-grid";
    let window = if let Some(w) = app.get_webview_window(label) {
        w
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
        let view = w.clone();
        w.on_window_event(move |e| match e {
            WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => layout_grid(&view),
            WindowEvent::Destroyed => {
                tauri::async_runtime::spawn_blocking(stop_grid);
            }
            _ => {}
        });
        w
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
                        WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
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
        for (i, ((url, title), child)) in sources.into_iter().zip(children).enumerate() {
            let mut engine = Engine::new(child)?;
            engine.open(&url, title, 0.)?;
            if i != 0 {
                control_engine(&mut engine, &json!({"command":"volume","value":0}))?;
            }
            players.push(engine);
        }
        *GRID.lock().map_err(|_| "网格状态不可用")? = Grid {
            players,
            expanded: None,
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
        grid.expanded = if target < 0 {
            None
        } else {
            Some(target as usize)
        };
    }
    Ok(
        json!({"cells":grid.players.iter().map(Engine::state).collect::<Vec<_>>(),"expanded":grid.expanded}),
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
    let Ok(player) = PLAYER.try_lock() else {
        return;
    };
    let Some(player) = player.as_ref() else {
        return;
    };
    layout(window, player.child);
    player.frame.render();
}
fn layout(window: &tauri::WebviewWindow, child: usize) {
    if let (Ok(size), Ok(scale)) = (window.inner_size(), window.scale_factor()) {
        let controls = (132.0 * scale).round() as u32;
        let video_height = size.height.saturating_sub(controls).max(1);
        // WebView2 is a native compositor surface: a full-window webview can
        // cover the HWND even when its HTML "video area" is empty. Give the
        // webview ONLY the control strip, and the native HWND the video area.
        let webview: &tauri::Webview = window.as_ref();
        let _ = webview.set_auto_resize(false);
        let _ = webview.set_bounds(tauri::Rect {
            position: tauri::PhysicalPosition::new(0, video_height as i32).into(),
            size: tauri::PhysicalSize::new(size.width, controls).into(),
        });
        unsafe {
            let _ = MoveWindow(
                HWND(child as Ptr),
                0,
                0,
                size.width as i32,
                video_height as i32,
                true,
            );
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
}
pub async fn play(
    app: AppHandle,
    url: String,
    title: String,
    seconds: f64,
) -> Result<Value, String> {
    if !available() {
        return Err(
            "未检测到原生播放内核。此体验版请先安装 64 位 VLC 3.x；不会打开网页播放。".into(),
        );
    }
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
        window.on_window_event(move |event| match event {
            WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => resize(&view),
            WindowEvent::Destroyed => {
                tauri::async_runtime::spawn_blocking(stop);
            }
            _ => {}
        });
        window
    };
    window
        .set_title(&format!("{title} · RHFiles"))
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    let warmed = WARM.lock().map_err(|_| "预加载不可用")?.take();
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
            let rotation = settings["rotation"].as_i64().unwrap_or(0) as i32;
            let reconfigured = warmed.rotation != rotation;
            if reconfigured {
                warmed.rotation = rotation;
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
            return Ok(state);
        } else {
            tauri::async_runtime::spawn_blocking(move || release_surface(warmed));
        }
    }
    let view = window.clone();
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
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
                        WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
                        0,
                        0,
                        size.width as i32,
                        (size.height as i32 - (132.0 * scale).round() as i32).max(1),
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
    let child = rx.await.map_err(|_| "播放器窗口已关闭".to_owned())??;
    tauri::async_runtime::spawn_blocking(move || {
        let mut slot = PLAYER.lock().map_err(|_| "播放器状态不可用")?;
        if slot.is_none() {
            match Engine::new(child) {
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
        let engine = slot.as_mut().unwrap();
        engine.open(&url, title, seconds)?;
        Ok(engine.state())
    })
    .await
    .map_err(|_| "原生播放任务意外结束".to_owned())?
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
        control_engine(player, args)?;
    }
    Ok(player.state())
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
            "rotate" => {
                let value = args["value"]
                    .as_i64()
                    .filter(|v| [0, 90, 180, 270].contains(v))
                    .ok_or("旋转角度无效")?;
                player.rotation = value as i32;
                let url = player.url.clone();
                let title = player.title.clone();
                let seconds = (player.api.time)(p).max(0) as f64 / 1000.;
                player.open(&url, title, seconds)?;
            }
            "pause" => {
                player
                    .clock
                    .lock()
                    .map_err(|_| "播放时钟不可用")?
                    .discontinuity();
                (player.api.set_pause)(p, 1);
            }
            "resume" => {
                player
                    .clock
                    .lock()
                    .map_err(|_| "播放时钟不可用")?
                    .discontinuity();
                (player.api.set_pause)(p, 0);
            }
            "seek" => {
                let ms = args
                    .get("value")
                    .and_then(Value::as_i64)
                    .filter(|v| *v >= 0 && *v <= (player.api.length)(p))
                    .ok_or("跳转位置超出范围")?;
                (player.api.set_time)(p, ms);
                player.clock.lock().map_err(|_| "播放时钟不可用")?.reset(
                    ms,
                    player
                        .frame
                        .last_display
                        .load(std::sync::atomic::Ordering::Relaxed),
                );
            }
            "volume" => {
                let value = args
                    .get("value")
                    .and_then(Value::as_i64)
                    .filter(|v| (0..=100).contains(v))
                    .ok_or("音量范围是 0–100")?;
                player.requested_volume = value as i32;
                (player.api.set_volume)(p, effective_volume(player.requested_volume));
            }
            "rate" => {
                let value = args
                    .get("value")
                    .and_then(Value::as_f64)
                    .filter(|v| v.is_finite() && (0.25..=4.0).contains(v))
                    .ok_or("速度范围是 0.25–4")?;
                if (player.api.set_rate)(p, value as f32) != 0 {
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
