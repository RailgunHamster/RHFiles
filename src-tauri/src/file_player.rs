//! The file viewer shares libVLC with RHVideo and owns its own playback session.
use super::*;
use crate::device_fs::MediaReadTiming;
use std::{
    sync::{Arc, OnceLock},
    time::{Duration, Instant},
};

static FILE_ENGINE: Mutex<Option<Engine>> = Mutex::new(None);
static ATTEMPT: Mutex<Option<Arc<Attempt>>> = Mutex::new(None);
static PLAY: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static CLIP: Mutex<Option<(u64, i32, i32, i32, i32)>> = Mutex::new(None);
const LABEL: &str = "window-file-viewer";

pub(crate) struct Prepared(tauri::async_runtime::JoinHandle<Result<Engine, String>>);

#[derive(Default)]
struct Startup {
    window_ms: Option<u64>,
    surface_ms: Option<u64>,
    player_init_ms: Option<u64>,
    source_ms: Option<u64>,
    input_to_frame_ms: Option<u64>,
    total_ms: Option<u64>,
    reused: bool,
    failure: Option<(String, u64)>,
}

pub(crate) struct Attempt {
    generation: u64,
    selection: u64,
    started: Instant,
    transport: &'static str,
    remote: Arc<MediaReadTiming>,
    input: OnceLock<u64>,
    startup: Mutex<Startup>,
}

fn millis(since: Instant) -> u64 {
    since.elapsed().as_millis() as u64
}

impl Attempt {
    pub(crate) fn new(generation: u64, selection: u64, path: &str, started: Instant) -> Arc<Self> {
        let transport = if path.starts_with("rhfiles-device:") {
            "device"
        } else if path.starts_with(r"\") {
            "smb"
        } else {
            "local"
        };
        Arc::new(Self {
            generation,
            selection,
            started,
            transport,
            remote: Arc::default(),
            input: OnceLock::new(),
            startup: Mutex::default(),
        })
    }

    fn current(&self) -> bool {
        crate::file_viewer::is_current(self.generation, self.selection)
    }

    fn matches(&self, args: &Value) -> bool {
        args["generation"].as_u64() == Some(self.generation)
            && args["selection"].as_u64() == Some(self.selection)
    }

    fn update(&self, update: impl FnOnce(&mut Startup)) {
        if let Ok(mut startup) = self.startup.lock() {
            update(&mut startup);
        }
    }

    pub(crate) fn window_ready(&self, started: Instant) {
        self.update(|timing| timing.window_ms = Some(millis(started)));
    }

    fn observe_frame(&self, state: &Value) -> bool {
        let Some(first_frame) = state["firstFrameMs"].as_u64().filter(|ms| *ms > 0) else {
            return false;
        };
        self.update(|timing| {
            timing.input_to_frame_ms.get_or_insert(first_frame);
            timing.total_ms.get_or_insert_with(|| millis(self.started));
        });
        true
    }

    fn fail(&self, error: String) {
        self.update(|timing| {
            if timing.total_ms.is_none() && timing.failure.is_none() {
                timing.failure = Some((error, millis(self.started)));
            }
        });
    }

    fn diagnostics(&self) -> Value {
        let timing = self.startup.lock().unwrap();
        let phase = if timing.failure.is_some() {
            "failed"
        } else if timing.total_ms.is_some() {
            "ready"
        } else if timing.window_ms.is_none() {
            "window"
        } else if timing.source_ms.is_none() {
            "source"
        } else if self.input.get().is_none() {
            "player"
        } else {
            "firstFrame"
        };
        json!({
            "phase": phase, "transport": self.transport, "reused": timing.reused,
            "elapsedMs": timing.total_ms.or_else(|| timing.failure.as_ref().map(|(_, ms)| *ms)).unwrap_or_else(|| millis(self.started)),
            "windowMs": timing.window_ms, "surfaceMs": timing.surface_ms,
            "playerInitMs": timing.player_init_ms, "sourceMs": timing.source_ms,
            "firstRemoteByteMs": self.remote.first_byte_ms(),
            "inputToFrameMs": timing.input_to_frame_ms, "totalMs": timing.total_ms,
            "error": timing.failure.as_ref().map(|(error, _)| error),
        })
    }

    fn notify(&self, app: &AppHandle) {
        let _ = app.emit_to(
            LABEL,
            "file-viewer-video",
            json!({
                "generation": self.generation, "selection": self.selection
            }),
        );
    }
}

pub(crate) fn prepare(attempt: Arc<Attempt>) -> Prepared {
    Prepared(tauri::async_runtime::spawn_blocking(move || {
        let started = Instant::now();
        let result = Engine::prepare(0);
        attempt.update(|timing| timing.player_init_ms = Some(millis(started)));
        result
    }))
}

pub(super) fn owns_surface(child: usize) -> bool {
    FILE_ENGINE.try_lock().is_ok_and(|slot| {
        slot.as_ref()
            .is_some_and(|engine| engine.child == child && engine.surface.current())
    })
}

pub(crate) fn stop() {
    if let Ok(mut attempt) = ATTEMPT.lock() {
        *attempt = None;
    }
    if let Ok(mut slot) = FILE_ENGINE.lock() {
        if let Some(engine) = slot.take() {
            tauri::async_runtime::spawn_blocking(move || release_surface(engine));
        }
    }
}

pub(crate) fn paint(hwnd: HWND) -> bool {
    if let Ok(slot) = FILE_ENGINE.try_lock() {
        if let Some(engine) = slot
            .as_ref()
            .filter(|e| e.child == hwnd.0 as usize && e.surface.current())
        {
            return !engine.compatibility || engine.frame.render();
        }
    }
    false
}

pub(crate) fn start(
    app: AppHandle,
    path: String,
    title: String,
    attempt: Arc<Attempt>,
    prepared: Option<Prepared>,
) {
    if !attempt.current() {
        return;
    }
    if let Ok(mut current) = ATTEMPT.lock() {
        *current = Some(attempt.clone());
    }
    tauri::async_runtime::spawn(async move {
        match open(&app, path, title, &attempt, prepared).await {
            Ok(()) if attempt.current() => {
                attempt.notify(&app);
                watch_first_frame(&app, &attempt).await;
            }
            Err(error) if attempt.current() => {
                attempt.fail(error);
                attempt.notify(&app);
            }
            _ => {}
        }
    });
}

async fn create_video_surface(app: &AppHandle, attempt: Arc<Attempt>) -> Result<Surface, String> {
    let view = app.get_webview_window(LABEL).ok_or("查看器已关闭")?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let result: Result<Surface, String> = (|| {
            if !attempt.current() {
                return Err("查看内容已切换".into());
            }
            let parent = view.hwnd().map_err(|e| e.to_string())?;
            let size = view.inner_size().map_err(|e| e.to_string())?;
            let surface = create_surface(
                HWND(parent.0),
                size.width.max(1) as i32,
                size.height.max(1) as i32,
                WS_EX_LAYERED | WS_EX_TRANSPARENT,
            )?;
            hide(surface);
            Ok(surface)
        })();
        if let Err(Ok(surface)) = tx.send(result) {
            surface.close();
        }
    })
    .map_err(|e| e.to_string())?;
    let surface = rx.await.map_err(|_| "播放器画布创建结束")??;
    Ok(surface)
}

async fn hide_previous_frame(app: &AppHandle, surface: Surface) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        hide(surface);
        let _ = tx.send(());
    })
    .map_err(|e| e.to_string())?;
    rx.await.map_err(|_| "播放器画布已关闭".into())
}

fn hide(surface: Surface) {
    if surface.current() {
        unsafe {
            let _ = SetLayeredWindowAttributes(
                HWND(surface.child as Ptr),
                windows::Win32::Foundation::COLORREF(0),
                0,
                LWA_ALPHA,
            );
        }
    }
}

async fn open(
    app: &AppHandle,
    path: String,
    title: String,
    attempt: &Arc<Attempt>,
    prepared: Option<Prepared>,
) -> Result<(), String> {
    let _gate = PLAY.lock().await;
    if !attempt.current() {
        return Err("查看内容已切换".into());
    }
    let old = FILE_ENGINE.lock().map_err(|_| "播放器状态不可用")?.take();
    let engine = async {
        if let Some(engine) = old {
            if engine.surface.current() && hide_previous_frame(app, engine.surface).await.is_ok() {
                attempt.update(|timing| timing.reused = true);
                return Ok(engine);
            }
            tauri::async_runtime::spawn_blocking(move || release_surface(engine));
        }
        let prepared = prepared.unwrap_or_else(|| prepare(attempt.clone()));
        let surface_started = Instant::now();
        let surface = async {
            let surface = create_video_surface(app, attempt.clone()).await?;
            attempt.update(|timing| timing.surface_ms = Some(millis(surface_started)));
            Ok::<_, String>(surface)
        };
        let (engine, surface) = tokio::join!(prepared.0, surface);
        let surface = surface?;
        let mut engine = match engine {
            Ok(Ok(engine)) => engine,
            result => {
                surface.close();
                return Err(result
                    .ok()
                    .and_then(Result::err)
                    .unwrap_or_else(|| "播放器初始化结束".into()));
            }
        };
        if !attempt.current() || !surface.current() {
            surface.close();
            tauri::async_runtime::spawn_blocking(move || drop(engine));
            return Err("查看内容已切换".into());
        }
        engine.bind_surface(surface);
        engine.shared_gain = true;
        Ok(engine)
    };
    let source = async {
        let started = Instant::now();
        let source = if attempt.transport == "device" {
            crate::device_fs::media_resource(&path, attempt.remote.clone()).await?
        } else {
            url::Url::from_file_path(std::path::Path::new(&path))
                .map_err(|_| "视频路径无效")?
                .to_string()
        };
        attempt.update(|timing| timing.source_ms = Some(millis(started)));
        Ok::<_, String>(source)
    };
    let (engine, source) = tokio::join!(engine, source);
    let mut engine = engine?;
    let attempt = attempt.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            let source = source?;
            if !attempt.current() || !engine.surface.current() {
                return Err("查看内容已切换".into());
            }
            engine.open(&source, title, 0.)?;
            Ok(())
        })();
        let mut slot = FILE_ENGINE.lock().map_err(|_| "播放器状态不可用")?;
        if result.is_ok() && attempt.current() && engine.surface.current() {
            let _ = attempt.input.set(engine.input_id);
            *slot = Some(engine);
            return Ok(());
        }
        drop(slot);
        release_surface(engine);
        result.and(Err("查看内容已切换".into()))
    })
    .await
    .map_err(|_| "播放器准备结束".to_owned())?
}

async fn watch_first_frame(app: &AppHandle, attempt: &Attempt) {
    let deadline = Instant::now() + Duration::from_secs(20);
    while attempt.current() && Instant::now() < deadline {
        let finished = FILE_ENGINE
            .try_lock()
            .ok()
            .and_then(|slot| {
                let engine = slot
                    .as_ref()
                    .filter(|e| Some(&e.input_id) == attempt.input.get())?;
                let state = engine.state();
                Some(
                    attempt.observe_frame(&state)
                        || state["state"] == 7
                        || state["presentationError"].is_string(),
                )
            })
            .unwrap_or(false);
        if finished {
            attempt.notify(app);
            break;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
}
pub(crate) async fn request(app: AppHandle, action: &str, args: Value) -> Result<Value, String> {
    let attempt = ATTEMPT
        .lock()
        .map_err(|_| "播放器状态不可用")?
        .clone()
        .filter(|a| a.matches(&args));
    let Some(attempt) = attempt else {
        return if action == "video.state" {
            Ok(json!({"opened":false}))
        } else {
            Err("查看内容已改变，旧操作未执行".into())
        };
    };
    if action == "video.bounds" {
        let view = app
            .get_webview_window("window-file-viewer")
            .ok_or("查看器已关闭")?;
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            let result = (|| {
                let scale = view.scale_factor().map_err(|e| e.to_string())?;
                let size = view.inner_size().map_err(|e| e.to_string())?;
                let slot = FILE_ENGINE.lock().map_err(|_| "播放器状态不可用")?;
                let Some(engine) = slot.as_ref().filter(|e| {
                    attempt.current()
                        && Some(&e.input_id) == attempt.input.get()
                        && args["expectedInput"].as_u64() == Some(e.input_id)
                }) else {
                    return Ok(json!({"stale":true}));
                };
                let mut r = [0i32; 4];
                for (i, key) in ["x", "y", "width", "height"].iter().enumerate() {
                    let n = args[*key]
                        .as_f64()
                        .filter(|v| v.is_finite() && (0.0..=100000.).contains(v))
                        .ok_or("媒体区域无效")?;
                    r[i] = (n * scale).round() as i32;
                }
                r[0] = r[0].min(size.width.saturating_sub(1) as i32);
                r[1] = r[1].min(size.height.saturating_sub(1) as i32);
                r[2] = r[2].max(1).min(size.width as i32 - r[0]);
                r[3] = r[3].max(1).min(size.height as i32 - r[1]);
                let clip = |key: &str| -> Result<i32, String> {
                    let value = args.get(key).and_then(Value::as_f64).unwrap_or(0.);
                    if !value.is_finite() || !(0.0..=100000.).contains(&value) {
                        return Err("控制栏区域无效".into());
                    }
                    Ok((value * scale).round() as i32)
                };
                let top = clip("clipTop")?.min(r[3] - 1);
                let bottom = clip("clipBottom")?.min(r[3] - top - 1);
                let key = (engine.input_id, r[2], r[3], top, bottom);
                let mut prior = CLIP.lock().map_err(|_| "控制栏区域不可用")?;
                if prior.as_ref() != Some(&key) {
                    unsafe {
                        use windows::Win32::Graphics::Gdi::{
                            CreateRectRgn, DeleteObject, SetWindowRgn,
                        };
                        if top == 0 && bottom == 0 {
                            if SetWindowRgn(HWND(engine.child as Ptr), None, true) == 0 {
                                return Err("无法更新全屏视频区域".into());
                            }
                        } else {
                            let region = CreateRectRgn(0, top, r[2], r[3] - bottom);
                            if region.0.is_null() {
                                return Err("无法创建全屏视频区域".into());
                            }
                            if SetWindowRgn(HWND(engine.child as Ptr), Some(region), true) == 0 {
                                let _ = DeleteObject(region.into());
                                return Err("无法更新全屏控制栏".into());
                            }
                        }
                    }
                    *prior = Some(key);
                }
                let hwnd = HWND(engine.child as Ptr);
                unsafe {
                    MoveWindow(hwnd, r[0], r[1], r[2], r[3], true).map_err(|e| e.to_string())?;
                    SetLayeredWindowAttributes(
                        hwnd,
                        windows::Win32::Foundation::COLORREF(0),
                        if engine
                            .first_frame_ms
                            .load(std::sync::atomic::Ordering::Relaxed)
                            > 0
                        {
                            255
                        } else {
                            0
                        },
                        LWA_ALPHA,
                    )
                    .map_err(|e| e.to_string())?;
                    SetWindowPos(
                        hwnd,
                        Some(HWND_TOP),
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    )
                    .map_err(|e| e.to_string())?;
                }
                repaint_after_layout(engine);
                Ok::<_, String>(json!({"updated":true}))
            })();
            let _ = tx.send(result);
        })
        .map_err(|e| e.to_string())?;
        return rx.await.map_err(|_| "播放器布局结束".to_owned())?;
    }
    let mut slot = FILE_ENGINE.lock().map_err(|_| "播放器状态不可用")?;
    let Some(engine) = slot
        .as_mut()
        .filter(|e| attempt.current() && Some(&e.input_id) == attempt.input.get())
    else {
        return if action == "video.state" {
            Ok(json!({"opened":false,"startup":attempt.diagnostics()}))
        } else {
            Err("播放输入已改变或尚未就绪".into())
        };
    };
    if action == "video.control" {
        if args["expectedInput"].as_u64() != Some(engine.input_id) {
            return Err("播放输入已改变，旧操作未执行".into());
        }
        control_engine(engine, &args)?;
    }
    let mut state = engine.state();
    attempt.observe_frame(&state);
    if state["state"] == 7 || state["presentationError"].is_string() {
        attempt.fail(
            state["presentationError"]
                .as_str()
                .unwrap_or("VLC could not play this input")
                .to_owned(),
        );
    }
    state["startup"] = attempt.diagnostics();
    Ok(state)
}
