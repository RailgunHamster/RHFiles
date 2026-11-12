//! The file viewer shares libVLC with RHVideo and owns its own playback session.
use super::*;
use crate::device_fs::MediaReadTiming;
use std::{
    sync::{atomic::Ordering, Arc, OnceLock},
    time::{Duration, Instant},
};

static FILE_ENGINE: Mutex<Option<Engine>> = Mutex::new(None);
#[path = "file_video_warmup.rs"]
mod warmup;
static ATTEMPT: Mutex<Option<Arc<Attempt>>> = Mutex::new(None);
static PLAY: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
#[derive(Clone, Copy, PartialEq, Eq)]
struct Layout {
    input: u64,
    rect: [i32; 4],
    top: i32,
    bottom: i32,
    visible: bool,
}
static LAYOUT: Mutex<Option<Layout>> = Mutex::new(None);
const LABEL: &str = "window-file-viewer";

pub(crate) struct Prepared(tauri::async_runtime::JoinHandle<Result<Engine, String>>);

#[derive(Default)]
struct Startup {
    window_ms: Option<u64>,
    surface_ms: Option<u64>,
    surface_queue_ms: Option<u64>,
    surface_init_ms: Option<u64>,
    surface_create_window_ms: Option<u64>,
    surface_mode: Option<&'static str>,
    surface_inline_error: Option<String>,
    player_init_ms: Option<u64>,
    vlc_init: Option<VlcInitTimings>,
    source_ms: Option<u64>,
    input_to_frame_ms: Option<u64>,
    output: Option<Instant>,
    layout_queue_ms: Option<u64>,
    layout_ms: Option<u64>,
    layout_configured_at_ms: Option<u64>,
    frontend_viewport_at_ms: Option<u64>,
    reveal_origin: Option<&'static str>,
    total_ms: Option<u64>,
    first_frame_timeout_ms: Option<u64>,
    reused: bool,
    failure: Option<(String, u64)>,
}

pub(crate) struct Attempt {
    generation: u64,
    selection: u64,
    volume: u8,
    rate: Option<f32>,
    started: Instant,
    transport: &'static str,
    remote: Arc<MediaReadTiming>,
    input: OnceLock<u64>,
    startup: Mutex<Startup>,
    initial_surface: Mutex<Option<PendingSurface>>,
    initial_rect: OnceLock<[i32; 4]>,
}

struct PendingSurface(Option<Surface>);
impl Drop for PendingSurface {
    fn drop(&mut self) {
        if let Some(surface) = self.0.take() {
            surface.close();
        }
    }
}

fn millis(since: Instant) -> u64 {
    since.elapsed().as_millis() as u64
}

impl Attempt {
    pub(crate) fn new(generation: u64, selection: u64, path: &str, started: Instant, volume: u8, rate: Option<f32>) -> Arc<Self> {
        let transport = if path.starts_with("rhfiles-device:") {
            "device"
        } else if matches!(std::path::Path::new(path).components().next(),
            Some(std::path::Component::Prefix(prefix)) if matches!(prefix.kind(),std::path::Prefix::UNC(..)|std::path::Prefix::VerbatimUNC(..)))
        {
            "smb"
        } else {
            "local"
        };
        Arc::new(Self {
            generation,
            selection,
            volume,
            rate,
            started,
            transport,
            remote: Arc::default(),
            input: OnceLock::new(),
            startup: Mutex::default(),
            initial_surface: Mutex::default(),
            initial_rect: OnceLock::new(),
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

    pub(crate) fn prepare_initial_surface(&self, window: &tauri::WebviewWindow) {
        let result = window.hwnd().map_err(|e| e.to_string())
            .and_then(|parent| make_surface(window, HWND(parent.0), self, None));
        match result {
            Ok(surface) => {
                if let Ok(mut slot) = self.initial_surface.lock() { *slot = Some(surface); }
            }
            Err(error) => self.update(|timing| timing.surface_inline_error = Some(error)),
        }
    }

    pub(crate) async fn recover_initial_surface(self: &Arc<Self>, app: &AppHandle) -> Result<(), String> {
        let failed_inline = self.startup.lock().map_err(|_| "播放器诊断不可用")?
            .surface_inline_error.is_some();
        if failed_inline {
            let surface = create_video_surface(app, self.clone()).await?;
            *self.initial_surface.lock().map_err(|_| "播放器画布状态不可用")? = Some(surface);
        }
        Ok(())
    }

    fn observe_frame(&self, engine: &Engine) -> bool {
        let first_frame = engine
            .first_frame_ms
            .load(std::sync::atomic::Ordering::Relaxed);
        if first_frame == 0 {
            return false;
        }
        self.update(|timing| {
            timing.input_to_frame_ms.get_or_insert(first_frame);
            let output = *timing.output.get_or_insert_with(Instant::now);
            if self.initial_rect.get().is_some() && timing.total_ms.is_none() {
                // The empty canvas was already visible at creation. VLC's
                // renderer presents into it without posting a reveal task.
                timing.total_ms = Some(output.duration_since(self.started).as_millis() as u64);
                timing.layout_queue_ms = Some(0);
                timing.layout_ms = Some(0);
                timing.reveal_origin = Some("initialCanvas");
            }
        });
        true
    }

    fn observe_visible(&self, entered: Instant, enqueued: Instant, origin: &'static str) -> Value {
        self.update(|timing| {
            timing
                .layout_queue_ms
                .get_or_insert(entered.duration_since(enqueued).as_millis() as u64);
            timing.layout_ms.get_or_insert_with(|| millis(entered));
            timing.total_ms.get_or_insert_with(|| millis(self.started));
            timing.reveal_origin.get_or_insert(origin);
        });
        let timing = self.startup.lock().unwrap();
        json!({"phase":"ready","elapsedMs":timing.total_ms,"totalMs":timing.total_ms,
            "layoutQueueMs":timing.layout_queue_ms,"layoutMs":timing.layout_ms,
            "layoutConfiguredAtMs":timing.layout_configured_at_ms,"revealOrigin":timing.reveal_origin,
            "frontendViewportAtMs":timing.frontend_viewport_at_ms,
            "revealMs":timing.total_ms.zip(timing.output).map(|(total, output)| total.saturating_sub(output.saturating_duration_since(self.started).as_millis() as u64))})
    }

    fn fail(&self, error: String) {
        self.update(|timing| {
            if timing.total_ms.is_none() && timing.failure.is_none() {
                timing.failure = Some((error, millis(self.started)));
            }
        });
    }

    fn diagnostics(&self, engine: Option<&Engine>) -> Value {
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
        } else if timing.output.is_some() {
            "output"
        } else if timing.first_frame_timeout_ms.is_some() {
            "stalled"
        } else {
            "firstFrame"
        };
        json!({
            "phase": phase, "transport": self.transport, "reused": timing.reused,
            "elapsedMs": timing.total_ms.or_else(|| timing.failure.as_ref().map(|(_, ms)| *ms)).unwrap_or_else(|| millis(self.started)),
            "windowMs": timing.window_ms, "surfaceMs": timing.surface_ms,
            "surfaceQueueMs": timing.surface_queue_ms, "surfaceInitMs": timing.surface_init_ms,
            "surfaceCreateWindowMs":timing.surface_create_window_ms,
            "surfaceMode": timing.surface_mode,
            "surfaceInlineError": timing.surface_inline_error,
            "playerInitMs": timing.player_init_ms, "vlcInit": timing.vlc_init, "sourceMs": timing.source_ms,
            "pluginWarmup": warmup::snapshot(),
            "firstRemoteByteMs": self.remote.first_byte_ms(),
            "inputToFrameMs": timing.input_to_frame_ms, "totalMs": timing.total_ms,
            "firstFrameTimeoutMs": timing.first_frame_timeout_ms,
            "layoutQueueMs": timing.layout_queue_ms, "layoutMs": timing.layout_ms,
            "layoutConfiguredAtMs":timing.layout_configured_at_ms,"revealOrigin":timing.reveal_origin,
            "frontendViewportAtMs":timing.frontend_viewport_at_ms,
            "revealMs": timing.total_ms.zip(timing.output).map(|(total, output)| total.saturating_sub(output.saturating_duration_since(self.started).as_millis() as u64)),
            "stages":engine.and_then(|e|e.file_timing.as_ref()).map(|probe|probe.snapshot(timing.output,self.remote.first_byte_at())),
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
    let queued = Instant::now();
    Prepared(tauri::async_runtime::spawn_blocking(move || {
        let started = Instant::now();
        let mut init = VlcInitTimings {
            worker_queue_ms: Some(started.duration_since(queued).as_millis() as u64),
            ..Default::default()
        };
        let result = Engine::prepare(0, &mut init).map(|mut engine| {
            #[cfg(debug_assertions)]
            drop(engine.startup_trace.take());
            engine.file_timing =
                file_video_timing::Binding::install(&engine.api._library, engine.instance);
            if let Some(runtime) = engine.api.bundled_runtime.as_deref().filter(|_| !warmup::started()) {
                tauri::async_runtime::spawn_blocking(move || warmup::read_plugins(runtime));
            }
            engine
        });
        attempt.update(|timing| {
            timing.player_init_ms = Some(millis(started));
            timing.vlc_init = Some(init);
        });
        result
    }))
}

pub(crate) async fn prewarm_library() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        let api = Api::shared(&mut VlcInitTimings::default(), true)?;
        if let Some(runtime) = &api.bundled_runtime {
            warmup::read_plugins(runtime);
        }
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
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
    if let Ok(mut slot) = FILE_ENGINE.try_lock() {
        if let Some(engine) = slot.take() {
            tauri::async_runtime::spawn_blocking(move || release_surface(engine));
        }
    } else {
        // Destroyed is delivered on the GUI thread. An in-flight VLC query
        // can be waiting for this same thread to service a window message.
        let next_input = INPUT_SEQUENCE.load(Ordering::SeqCst);
        tauri::async_runtime::spawn_blocking(move || {
            let retired = FILE_ENGINE.lock().ok().and_then(|mut slot| {
                if slot
                    .as_ref()
                    .is_some_and(|engine| engine.input_id < next_input)
                {
                    slot.take()
                } else {
                    None
                }
            });
            if let Some(engine) = retired {
                release_surface(engine);
            }
        });
    }
}

pub(crate) fn paint(hwnd: HWND) -> bool {
    if let Ok(slot) = FILE_ENGINE.try_lock() {
        if let Some(engine) = slot
            .as_ref()
            .filter(|e| e.child == hwnd.0 as usize && e.surface.current())
        {
            return !engine.compatibility || engine.frame.try_render();
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

fn default_viewport(view: &tauri::WebviewWindow, rect: RECT) -> Option<[i32; 4]> {
    // Use the same normal-window chrome sizes as the stylesheet. WebView's
    // measured bounds take over as soon as it reports its actual viewport.
    let scale = view.scale_factor().ok()?;
    let chrome = |name| {
        let css = include_str!("../../src/css/file-viewer.css");
        let value: f64 = css
            .split_once(name)?
            .1
            .split_once("px")?
            .0
            .trim()
            .parse()
            .ok()?;
        Some((value * scale).round() as i32)
    };
    let top = chrome("--viewer-header-height:")?;
    let bottom = chrome("--viewer-actions-height:")?;
    (rect.right > 0 && rect.bottom > top + bottom).then_some([
        0,
        top,
        rect.right,
        rect.bottom - top - bottom,
    ])
}

fn show_empty_canvas(surface: Surface, width: i32, height: i32) -> bool {
    use windows::Win32::Graphics::Gdi::{GdiFlush, GetDC, PatBlt, ReleaseDC, BLACKNESS};
    let hwnd = HWND(surface.child as Ptr);
    unsafe {
        let dc = GetDC(Some(hwnd));
        if dc.0.is_null() {
            return false;
        }
        let painted = PatBlt(dc, 0, 0, width, height, BLACKNESS).as_bool();
        let _ = GdiFlush();
        ReleaseDC(Some(hwnd), dc);
        painted
            && SetLayeredWindowAttributes(
                hwnd,
                windows::Win32::Foundation::COLORREF(0),
                255,
                LWA_ALPHA,
            )
            .is_ok()
    }
}

fn make_surface(
    view: &tauri::WebviewWindow,
    parent: HWND,
    attempt: &Attempt,
    enqueued: Option<Instant>,
) -> Result<PendingSurface, String> {
    let entered = Instant::now();
    if !attempt.current() {
        return Err("查看内容已切换".into());
    }
    let mut rect = RECT::default();
    unsafe { GetClientRect(parent, &mut rect) }.map_err(|e| e.to_string())?;
    let creating = Instant::now();
    let surface = create_surface(
        parent,
        rect.right.max(1),
        rect.bottom.max(1),
        WS_EX_LAYERED | WS_EX_TRANSPARENT,
    )?;
    let create_ms = millis(creating);
    hide(surface);
    if let Some(r) = enqueued
        .is_none()
        .then(|| default_viewport(view, rect))
        .flatten()
    {
        let positioned = unsafe {
            SetWindowPos(
                HWND(surface.child as Ptr),
                Some(HWND_TOP),
                r[0],
                r[1],
                r[2],
                r[3],
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            )
        }
        .is_ok();
        if positioned && show_empty_canvas(surface, r[2], r[3]) {
            let _ = attempt.initial_rect.set(r);
            attempt.update(|timing| timing.layout_configured_at_ms = Some(millis(attempt.started)));
        }
    }
    attempt.update(|timing| {
        timing.surface_mode = Some(if enqueued.is_some() {
            "queued"
        } else {
            "inline"
        });
        timing.surface_queue_ms = Some(enqueued.map_or(0, |queued| {
            entered.duration_since(queued).as_millis() as u64
        }));
        timing.surface_init_ms = Some(millis(entered));
        timing.surface_create_window_ms = Some(create_ms);
        timing.surface_ms = Some(millis(enqueued.unwrap_or(entered)));
    });
    Ok(PendingSurface(Some(surface)))
}

async fn create_video_surface(
    app: &AppHandle,
    attempt: Arc<Attempt>,
) -> Result<PendingSurface, String> {
    let view = app.get_webview_window(LABEL).ok_or("查看器已关闭")?;
    let enqueued = Instant::now();
    // The inline attempt can run before Wry registers the new HWND. Resolve
    // it on a later UI turn and stop waiting if this selection has changed.
    for delay in [0, 50, 150, 300] {
        if delay > 0 { tokio::time::sleep(Duration::from_millis(delay)).await; }
        if !attempt.current() { return Err("查看内容已切换".into()); }
        let (tx, rx) = tokio::sync::oneshot::channel();
        let view = view.clone();
        let attempt = attempt.clone();
        app.run_on_main_thread(move || {
            let result = view.hwnd().map(|parent| make_surface(&view, HWND(parent.0), &attempt, Some(enqueued)));
            let _ = tx.send(result);
        }).map_err(|e| e.to_string())?;
        let result = tokio::time::timeout(Duration::from_secs(2), rx)
            .await.map_err(|_| "播放器窗口等待画布创建超时".to_owned())?
            .map_err(|_| "播放器画布创建结束".to_owned())?;
        match result {
            Ok(surface) => return surface,
            Err(tauri::Error::RawHandleError(_)) => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("播放器窗口尚未就绪，无法创建视频画布".into())
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
                attempt.update(|timing| {
                    timing.reused = true;
                    timing.surface_mode = Some("reused");
                });
                return Ok(engine);
            }
            tauri::async_runtime::spawn_blocking(move || release_surface(engine));
        }
        let prepared = prepared.unwrap_or_else(|| prepare(attempt.clone()));
        let surface = async {
            let initial = attempt
                .initial_surface
                .lock()
                .map_err(|_| "播放器画布状态不可用")?
                .take();
            match initial {
                Some(surface) => Ok(surface),
                None => create_video_surface(app, attempt.clone()).await,
            }
        };
        let (engine, surface) = tokio::join!(prepared.0, surface);
        let mut pending = surface?;
        let surface = pending.0.ok_or("播放器画布已关闭")?;
        let mut engine = match engine {
            Ok(Ok(engine)) => engine,
            result => {
                return Err(result
                    .ok()
                    .and_then(Result::err)
                    .unwrap_or_else(|| "播放器初始化结束".into()));
            }
        };
        if !attempt.current() || !surface.current() {
            tauri::async_runtime::spawn_blocking(move || drop(engine));
            return Err("查看内容已切换".into());
        }
        pending.0.take();
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
    let media_options: &[&CStr] = match std::path::Path::new(&path).extension()
        .and_then(std::ffi::OsStr::to_str).map(str::to_ascii_lowercase).as_deref() {
        // MP4-family files usually contain streams handled by avcodec.
        // Both module lists keep VLC's normal fallback for mislabeled files
        // and codecs that need another decoder.
        Some("mp4" | "m4v" | "mov" | "3gp") => &[c":demux=mp4,any", c":codec=avcodec,any"],
        _ => &[],
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
            engine.requested_volume = i32::from(attempt.volume);
            engine.open_with_media_options(&source, title, 0., media_options)?;
            if let Some(rate) = attempt.rate {
                unsafe { (engine.api.set_rate)(engine.player as Ptr, rate); }
            }
            Ok(())
        })();
        let mut slot = FILE_ENGINE.lock().map_err(|_| "播放器状态不可用")?;
        if result.is_ok() && attempt.current() && engine.surface.current() {
            if let Some(rect) = attempt.initial_rect.get() {
                if let Ok(mut layout) = LAYOUT.lock() {
                    *layout = Some(Layout {
                        input: engine.input_id,
                        rect: *rect,
                        top: 0,
                        bottom: 0,
                        visible: true,
                    });
                }
            }
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

fn reveal_configured_surface(
    app: &AppHandle,
    attempt: Arc<Attempt>,
    surface: Surface,
    input: u64,
    compatibility: bool,
) {
    let enqueued = Instant::now();
    let events = app.clone();
    let fallback = attempt.clone();
    if app
        .run_on_main_thread(move || {
            let entered = Instant::now();
            if !attempt.current() || !surface.current() {
                return;
            }
            let hwnd = HWND(surface.child as Ptr);
            if let Ok(mut prior) = LAYOUT.lock() {
                if let Some(layout) = prior
                    .as_mut()
                    .filter(|layout| layout.input == input && !layout.visible)
                {
                    let shown = unsafe {
                        SetLayeredWindowAttributes(
                            hwnd,
                            windows::Win32::Foundation::COLORREF(0),
                            255,
                            LWA_ALPHA,
                        )
                    }
                    .is_ok();
                    if shown {
                        layout.visible = true;
                        drop(prior);
                        if compatibility {
                            finish_paint(hwnd, paint(hwnd));
                        }
                        attempt.observe_visible(entered, enqueued, "native");
                    }
                }
            }
            // A viewer whose viewport is still loading reveals through its first
            // bounds update. Both routes check the same input and surface leases.
            attempt.notify(&events);
        })
        .is_err()
    {
        fallback.notify(app);
    }
}

async fn watch_first_frame(app: &AppHandle, attempt: &Arc<Attempt>) {
    let deadline = Instant::now() + Duration::from_secs(20);
    while attempt.current() && Instant::now() < deadline {
        let finished = FILE_ENGINE.try_lock().ok().and_then(|slot| {
            let engine = slot
                .as_ref()
                .filter(|e| Some(&e.input_id) == attempt.input.get())?;
            if engine.first_frame_ms.load(Ordering::Relaxed) == 0 {
                let rendered = if engine.compatibility {
                    engine.frame.count.load(Ordering::Relaxed) > 0
                } else {
                    let mut stats = MediaStats::default();
                    unsafe {
                        (engine.api.media_stats)(engine.media as Ptr, &mut stats);
                    }
                    stats.displayed > 0
                };
                if rendered {
                    let _ = engine.first_frame_ms.compare_exchange(
                        0,
                        millis(engine.open_started).max(1),
                        Ordering::Relaxed,
                        Ordering::Relaxed,
                    );
                }
            }
            if attempt.observe_frame(engine) {
                Some(Some((
                    engine.surface,
                    engine.input_id,
                    engine.compatibility,
                )))
            } else if matches!(unsafe { (engine.api.state)(engine.player as Ptr) }, 6 | 7) {
                Some(None)
            } else {
                None
            }
        });
        if let Some(result) = finished {
            if result.is_none() {
                attempt.fail("VLC 未能输出视频画面".into());
            }
            if let Some((surface, input, compatibility)) =
                result.filter(|_| attempt.initial_rect.get().is_none())
            {
                reveal_configured_surface(app, attempt.clone(), surface, input, compatibility);
            } else {
                attempt.notify(app);
            }
            return;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    if attempt.current() {
        // Keep listening through ordinary state polling. A late frame may
        // still be displayed, and its startup timings remain available.
        attempt.update(|timing| timing.first_frame_timeout_ms = Some(millis(attempt.started)));
        attempt.notify(app);
    }
}
pub(crate) async fn request(app: AppHandle, action: &str, mut args: Value) -> Result<Value, String> {
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
        // Resolve VLC ownership before entering the GUI queue. A decoder
        // query may wait for a window message and must never hold up that UI.
        let target = {
            let slot = FILE_ENGINE.lock().map_err(|_| "播放器状态不可用")?;
            slot.as_ref()
                .filter(|engine| {
                    Some(&engine.input_id) == attempt.input.get()
                        && args["expectedInput"].as_u64() == Some(engine.input_id)
                })
                .map(|engine| {
                    let visible = attempt.observe_frame(engine);
                    (
                        engine.surface,
                        engine.input_id,
                        visible,
                        engine.compatibility,
                    )
                })
        };
        let Some((surface, input, frame_ready, compatibility)) = target else {
            return Ok(json!({"stale":true}));
        };
        let view = app
            .get_webview_window("window-file-viewer")
            .ok_or("查看器已关闭")?;
        let (tx, rx) = tokio::sync::oneshot::channel();
        let enqueued = Instant::now();
        app.run_on_main_thread(move || {
            let entered = Instant::now();
            let result = (|| {
                if !attempt.current() || !surface.current() { return Ok(json!({"stale":true})); }
                let scale = view.scale_factor().map_err(|e| e.to_string())?;
                let size = view.inner_size().map_err(|e| e.to_string())?;
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
                let mut prior = LAYOUT.lock().map_err(|_| "控制栏区域不可用")?;
                attempt.update(|timing| { timing.frontend_viewport_at_ms.get_or_insert_with(||millis(attempt.started)); });
                let visible = frame_ready || prior.is_some_and(|p| p.input == input && p.visible);
                let layout = Layout { input, rect:r, top, bottom, visible };
                if *prior == Some(layout) { return Ok(json!({"updated":false,"visible":frame_ready,"startup":frame_ready.then(||attempt.observe_visible(entered,enqueued,"viewport"))})); }
                let hwnd = HWND(surface.child as Ptr);
                if !prior.is_some_and(|p|p.input==input && p.rect[2..]==r[2..] && p.top==top && p.bottom==bottom) {
                    unsafe {
                        use windows::Win32::Graphics::Gdi::{
                            CreateRectRgn, DeleteObject, SetWindowRgn,
                        };
                        if top == 0 && bottom == 0 {
                            if SetWindowRgn(hwnd, None, true) == 0 {
                                return Err("无法更新全屏视频区域".into());
                            }
                        } else {
                            let region = CreateRectRgn(0, top, r[2], r[3] - bottom);
                            if region.0.is_null() {
                                return Err("无法创建全屏视频区域".into());
                            }
                            if SetWindowRgn(hwnd, Some(region), true) == 0 {
                                let _ = DeleteObject(region.into());
                                return Err("无法更新全屏控制栏".into());
                            }
                        }
                    }
                }
                unsafe {
                    if !prior.is_some_and(|p| p.input==input && p.visible==visible) { SetLayeredWindowAttributes(
                        hwnd,
                        windows::Win32::Foundation::COLORREF(0),
                        if visible {255} else {0},
                        LWA_ALPHA,
                    )
                    .map_err(|e| e.to_string())?; }
                    if !prior.is_some_and(|p|p.input==input && p.rect==r) { SetWindowPos(
                        hwnd,
                        Some(HWND_TOP),
                        r[0],r[1],r[2],r[3],
                        SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    )
                    .map_err(|e| e.to_string())?; }
                }
                *prior = Some(layout);
                drop(prior);
                attempt.update(|timing| { timing.layout_configured_at_ms.get_or_insert_with(||millis(attempt.started)); });
                if compatibility { finish_paint(hwnd,paint(hwnd)); }
                Ok::<_, String>(json!({"updated":true,"visible":frame_ready,"startup":frame_ready.then(||attempt.observe_visible(entered,enqueued,"viewport"))}))
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
            Ok(json!({"opened":false,"startup":attempt.diagnostics(None)}))
        } else {
            Err("播放输入已改变或尚未就绪".into())
        };
    };
    if action == "video.control" {
        if args["expectedInput"].as_u64() != Some(engine.input_id) {
            return Err("播放输入已改变，旧操作未执行".into());
        }
        if args["command"] == "toggle" {
            let playback = unsafe { (engine.api.state)(engine.player as Ptr) };
            if (3..=6).contains(&playback) {
                let resume = matches!(playback, 5 | 6) || engine.pause_requested.load(Ordering::Relaxed);
                args["command"] = json!(if resume { "resume" } else { "pause" });
            }
        }
        if args["command"] == "resume" {
            if !engine.resume_input()? {
                let rate = unsafe { (engine.api.rate)(engine.player as Ptr) };
                // Restart through the file viewer's normal path so the new VLC
                // input is paired with a new attempt, layout and source lease.
                return Ok(json!({"restartRate": if (0.25..=4.0).contains(&rate) { rate } else { 1.0 }}));
            }
        } else if args["command"] != "toggle" {
            control_engine(engine, &args)?;
        }
    }
    let mut state = engine.state();
    if attempt.observe_frame(engine) {
        if let Some(probe) = &engine.file_timing {
            probe.stop();
        }
    }
    if state["state"] == 7 || state["presentationError"].is_string() {
        attempt.fail(
            state["presentationError"]
                .as_str()
                .unwrap_or("VLC could not play this input")
                .to_owned(),
        );
    }
    state["startup"] = attempt.diagnostics(Some(engine));
    Ok(state)
}
