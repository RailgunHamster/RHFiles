//! libVLC 3.x renders to a real Win32 child window. No HTML video or vlc.exe.
//! DLLs are loaded only from the installed/bundled VLC directory with a safe
//! dependency search path; never from a media folder or the working directory.
use libloading::Library;
use serde_json::{Value, json};
use std::{
    ffi::{CStr, CString, c_char, c_void},
    path::PathBuf,
    sync::Mutex,
};
use tauri::{AppHandle, Manager, WindowEvent};
use windows::{
    Win32::{
        Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
        Graphics::Gdi::{BLACKNESS, BeginPaint, EndPaint, PAINTSTRUCT, PatBlt},
        System::LibraryLoader::GetModuleHandleW,
        UI::WindowsAndMessaging::*,
    },
    core::w,
};

const LABEL: &str = "window-rhvideo-player";
static PLAYER: Mutex<Option<Engine>> = Mutex::new(None);
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
struct Api {
    new: unsafe extern "C" fn(i32, *const *const c_char) -> Ptr,
    release: unsafe extern "C" fn(Ptr),
    media_new: unsafe extern "C" fn(Ptr, *const c_char) -> Ptr,
    media_option: unsafe extern "C" fn(Ptr, *const c_char),
    media_option_flag: unsafe extern "C" fn(Ptr, *const c_char, u32),
    media_release: unsafe extern "C" fn(Ptr),
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
    title: String,
    frame: Box<crate::rhvideo_frame::Frame>,
    clock: Mutex<crate::rhvideo_clock::Clock>,
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
        unsafe {
            (api.set_hwnd)(player, child as Ptr);
            (api.key_input)(player, 0);
            (api.mouse_input)(player, 0);
            (api.video_callbacks)(
                player,
                Some(crate::rhvideo_frame::lock),
                Some(crate::rhvideo_frame::unlock),
                Some(crate::rhvideo_frame::display),
                (&mut *frame as *mut crate::rhvideo_frame::Frame).cast(),
            );
            (api.video_formats)(player, Some(crate::rhvideo_frame::setup), None);
        }
        Ok(Self {
            api,
            instance: instance as usize,
            player: player as usize,
            child,
            title: String::new(),
            frame,
            clock: Mutex::new(crate::rhvideo_clock::Clock::new()),
        })
    }
    fn open(&mut self, url: &str, title: String, seconds: f64) -> Result<(), String> {
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
            for option in [":avcodec-hw=none"] {
                let option = CString::new(option).unwrap();
                (self.api.media_option_flag)(media, option.as_ptr(), 0x2);
            }
            let start = CString::new(format!(":start-time={seconds:.3}")).unwrap();
            (self.api.media_option)(media, start.as_ptr());
            (self.api.set_media)(self.player as Ptr, media);
            (self.api.media_release)(media);
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
            let position = self
                .clock
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
                .unwrap_or(raw);
            json!({"opened":true,"title":self.title,"engine":"libVLC","videoWidth":width,"videoHeight":height,"renderedFrames":self.frame.count.load(std::sync::atomic::Ordering::Relaxed),"decoderPositionFraction":(self.api.position)(p),"positionFraction":if duration>0{position as f64/duration as f64}else{0.0},
            "state":state,"positionMs":position,"decoderPositionMs":raw,"durationMs":duration,
            "rate":(self.api.rate)(p),"volume":(self.api.volume)(p).max(0),"nativeSurface":self.child!=0})
        }
    }
}
impl Drop for Engine {
    fn drop(&mut self) {
        unsafe {
            (self.api.stop)(self.player as Ptr);
            (self.api.player_release)(self.player as Ptr);
            (self.api.release)(self.instance as Ptr);
        }
    }
}
pub fn stop() {
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
        let controls = (92.0 * scale).round() as u32;
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
                        (size.height as i32 - (92.0 * scale).round() as i32).max(1),
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
    let player = PLAYER.lock().map_err(|_| "播放器状态不可用")?;
    let Some(player) = player.as_ref() else {
        return if action == "player.state" {
            Ok(json!({"opened":false}))
        } else {
            Err("播放器尚未打开".into())
        };
    };
    if action == "player.control" {
        let _ = player.state();
        let command = args
            .get("command")
            .and_then(Value::as_str)
            .ok_or("缺少播放操作")?;
        unsafe {
            let p = player.player as Ptr;
            match command {
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
                    (player.api.set_volume)(p, value as i32);
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
    }
    Ok(player.state())
}
