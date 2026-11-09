//! Native HTML-media adapter, not another playlist implementation. The shared
//! frontend owns sequencing, favorites and UI; slots only decode bounded inputs.
use super::*;
use std::collections::BTreeMap;

struct Slot {
    generation: u64,
    revision: u64,
    input: u64,
    engine: Option<Engine>,
}
static SLOTS: Mutex<BTreeMap<String, Slot>> = Mutex::new(BTreeMap::new());
fn key(args: &Value) -> Result<String, String> {
    let value = args["key"]
        .as_str()
        .filter(|v| {
            !v.is_empty()
                && v.len() <= 96
                && v.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
        })
        .ok_or("原生媒体标识无效")?;
    Ok(value.into())
}
fn revision(args: &Value) -> Result<u64, String> {
    args["revision"]
        .as_u64()
        .filter(|v| *v > 0 && *v <= 9_007_199_254_740_991)
        .ok_or("原生媒体版本无效".into())
}
fn owned(slot: &Slot, args: &Value, generation: u64) -> bool {
    slot.generation == generation
        && Some(slot.revision) == args["revision"].as_u64()
        && args
            .get("expectedInput")
            .is_none_or(|v| v.as_u64() == Some(slot.input))
}
fn snapshot(slot: &Slot) -> Option<Value> {
    slot.engine.as_ref().map(|engine| {
        let mut value = engine.state();
        value["decoderInputId"] = value["inputId"].clone();
        value["inputId"] = json!(slot.input);
        value
    })
}
pub(super) fn retire_all() -> Vec<Engine> {
    if let Ok(mut slots) = SLOTS.lock() {
        std::mem::take(&mut *slots)
            .into_values()
            .filter_map(|s| s.engine)
            .collect()
    } else {
        Vec::new()
    }
}
pub(super) fn stop() {
    for engine in retire_all() {
        release_surface(engine);
    }
}
pub(crate) fn stop_generation(generation: u64) {
    let engines = if let Ok(mut slots) = SLOTS.lock() {
        let keys = slots
            .iter()
            .filter(|(_, s)| s.generation == generation)
            .map(|(key, _)| key.clone())
            .collect::<Vec<_>>();
        keys.into_iter()
            .filter_map(|key| slots.remove(&key).and_then(|slot| slot.engine))
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };
    for engine in engines {
        release_surface(engine);
    }
}
pub(super) fn paint(hwnd: HWND)->bool {
    if let Ok(slots) = SLOTS.try_lock() {
        for slot in slots.values() {
            if let Some(engine) = &slot.engine {
                if engine.child == hwnd.0 as usize {
                    return !engine.compatibility||engine.frame.render();
                }
            }
        }
    }
    false
}
pub(super) fn owns_surface(child: usize) -> bool {
    SLOTS.try_lock().is_ok_and(|slots| {
        slots
            .values()
            .any(|s| s.engine.as_ref().is_some_and(|e| e.child == child))
    })
}

pub(crate) async fn request(
    app: AppHandle,
    action: &str,
    args: Value,
    url: Option<String>,
    generation: u64,
) -> Result<Value, String> {
    match action {
        "shared.media.open" => {
            if !crate::rhvideo::shared_session_is_current(generation) {
                return Err("媒体账户已改变".into());
            }
            let key = key(&args)?;
            let revision = revision(&args)?;
            let old = {
                let mut slots = SLOTS.lock().map_err(|_| "原生媒体状态不可用")?;
                if slots
                    .get(&key)
                    .is_some_and(|s| s.generation == generation && s.revision >= revision)
                {
                    return Err("原生媒体输入已过期".into());
                }
                if !slots.contains_key(&key) && slots.len() >= 12 {
                    return Err("最多同时解码 12 个视频，请关闭其他播放面板".into());
                }
                slots
                    .insert(
                        key.clone(),
                        Slot {
                            generation,
                            revision,
                            input: 0,
                            engine: None,
                        },
                    )
                    .and_then(|s| s.engine)
            };
            if let Some(old) = old {
                tauri::async_runtime::spawn_blocking(move || release_surface(old))
                    .await
                    .map_err(|_| "旧解码器释放失败")?;
            }
            let view = app
                .get_webview_window("window-rhvideo")
                .ok_or("媒体库窗口已关闭")?;
            let (tx, rx) = tokio::sync::oneshot::channel();
            app.run_on_main_thread(move || {
                let result = (|| {
                    surface_class()?;
                    let parent = view.hwnd().map_err(|e| e.to_string())?;
                    let surface =
                        create_surface(HWND(parent.0), 16, 16, WS_EX_LAYERED | WS_EX_TRANSPARENT)?;
                    unsafe {
                        let _ = SetLayeredWindowAttributes(
                            HWND(surface.child as Ptr),
                            windows::Win32::Foundation::COLORREF(0),
                            0,
                            LWA_ALPHA,
                        );
                    }
                    Ok::<_, String>(surface)
                })();
                if let Err(Ok(surface)) = tx.send(result) {
                    surface.close();
                }
            })
            .map_err(|e| e.to_string())?;
            let surface = rx.await.map_err(|_| "媒体画布创建结束")??;
            tauri::async_runtime::spawn_blocking(move || {
                let created = (|| {
                    let mut engine = Engine::new(surface)?;
                    engine.shared_gain = true;
                    let volume = args["volume"]
                        .as_f64()
                        .unwrap_or(0.)
                        .clamp(0., 100.)
                        .round() as i64;
                    control_engine(&mut engine, &json!({"command":"volume","value":volume}))?;
                    let seconds = args["seconds"]
                        .as_f64()
                        .filter(|v| v.is_finite() && (0.0..=604800.).contains(v))
                        .unwrap_or(0.);
                    engine.open(&url.ok_or("视频地址缺失")?, "RHVideo".into(), seconds)?;
                    if args["paused"] == true {
                        engine.begin_pause_restore((seconds * 1000.) as i64)?;
                    }
                    if let Some(rate) = args["rate"].as_f64() {
                        control_engine(&mut engine, &json!({"command":"rate","value":rate}))?;
                    }
                    Ok::<_, String>(engine)
                })();
                let mut engine = match created {
                    Ok(engine) => Some(engine),
                    Err(error) => {
                        surface.close();
                        return Err(error);
                    }
                };
                let installed = {
                    let mut slots = SLOTS.lock().map_err(|_| "原生媒体状态不可用")?;
                    if let Some(slot) = slots.get_mut(&key).filter(|s| {
                        s.generation == generation
                            && s.revision == revision
                            && crate::rhvideo::shared_session_is_current(generation)
                    }) {
                        slot.input = engine.as_ref().unwrap().input_id;
                        slot.engine = engine.take();
                        snapshot(slot)
                    } else {
                        None
                    }
                };
                if let Some(engine) = engine {
                    release_surface(engine);
                }
                installed.ok_or("媒体输入已切换，旧解码结果已释放".into())
            })
            .await
            .map_err(|_| "原生解码任务结束".to_owned())?
        }
        "shared.media.close" => {
            let key = key(&args)?;
            revision(&args)?;
            let engine = {
                let mut slots = SLOTS.lock().map_err(|_| "原生媒体状态不可用")?;
                if !slots.get(&key).is_some_and(|s| owned(s, &args, generation)) {
                    return Ok(json!({"stale":true}));
                }
                slots.remove(&key).and_then(|s| s.engine)
            };
            if let Some(engine) = engine {
                tauri::async_runtime::spawn_blocking(move || release_surface(engine))
                    .await
                    .map_err(|_| "解码器释放失败")?;
            }
            Ok(json!({"closed":true}))
        }
        "shared.media.control" => {
            let key = key(&args)?;
            revision(&args)?;
            let mut slots = SLOTS.lock().map_err(|_| "原生媒体状态不可用")?;
            let slot = slots
                .get_mut(&key)
                .filter(|s| owned(s, &args, generation))
                .ok_or("媒体输入已切换")?;
            if args["expectedInput"].as_u64() != Some(slot.input) {
                return Err("缺少当前媒体输入标识".into());
            }
            let engine = slot.engine.as_mut().ok_or("媒体输入尚未就绪")?;
            control_engine(engine, &args)?;
            snapshot(slot).ok_or("媒体输入已结束".into())
        }
        "shared.media.state" => {
            let slots = SLOTS.lock().map_err(|_| "原生媒体状态不可用")?;
            Ok(Value::Array(
                slots
                    .iter()
                    .filter(|(_, s)| s.generation == generation)
                    .filter_map(|(key, s)| {
                        snapshot(s)
                            .map(|state| json!({"key":key,"revision":s.revision,"state":state}))
                    })
                    .collect(),
            ))
        }
        "shared.media.bounds" => {
            let rows = args["items"]
                .as_array()
                .filter(|v| v.len() <= 12)
                .ok_or("媒体区域数量无效")?
                .clone();
            let view = app
                .get_webview_window("window-rhvideo")
                .ok_or("媒体库窗口已关闭")?;
            let (tx, rx) = tokio::sync::oneshot::channel();
            app.run_on_main_thread(move || {
                let result = (|| {
                    let scale = view.scale_factor().map_err(|e| e.to_string())?;
                    let mut slots = SLOTS.lock().map_err(|_| "原生媒体状态不可用")?;
                    for row in rows {
                        let key = key(&row)?;
                        let Some(slot) = slots.get_mut(&key).filter(|s| owned(s, &row, generation))
                        else {
                            continue;
                        };
                        let Some(engine) = slot.engine.as_mut() else {
                            continue;
                        };
                        let mut rect = [0i32; 4];
                        for (i, name) in ["x", "y", "width", "height"].iter().enumerate() {
                            let n = row[*name]
                                .as_f64()
                                .filter(|v| v.is_finite() && (0.0..=100000.).contains(v))
                                .ok_or("媒体区域无效")?;
                            rect[i] = (n * scale).round() as i32;
                        }
                        if let Some(angle) = row["rotation"]
                            .as_i64()
                            .filter(|v| [0, 90, 180, 270].contains(v))
                        {
                            engine.apply_rotation(angle as i32)?;
                        }
                        let state = engine.state();
                        let alpha = if state["renderedFrames"].as_u64().unwrap_or(0) > 0 {
                            (row["opacity"].as_f64().unwrap_or(1.).clamp(0., 1.) * 255.) as u8
                        } else {
                            0
                        };
                        let hwnd = HWND(engine.child as Ptr);
                        unsafe {
                            if row["visible"] == false {
                                let _ = ShowWindow(hwnd, SW_HIDE);
                            } else {
                                let _ = MoveWindow(
                                    hwnd,
                                    rect[0],
                                    rect[1],
                                    rect[2].max(1),
                                    rect[3].max(1),
                                    true,
                                );
                                SetLayeredWindowAttributes(
                                    hwnd,
                                    windows::Win32::Foundation::COLORREF(0),
                                    alpha,
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
                            }
                        }
                        if row["visible"]!=false{repaint_after_layout(engine);}
                    }
                    Ok::<_, String>(json!({"updated":true}))
                })();
                let _ = tx.send(result);
            })
            .map_err(|e| e.to_string())?;
            rx.await.map_err(|_| "媒体区域更新结束".to_owned())?
        }
        _ => Err("未知原生媒体操作".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stale_close_and_control_cannot_target_a_new_decoder() {
        let slot = Slot {
            generation: 3,
            revision: 2,
            input: 19,
            engine: None,
        };
        assert!(owned(&slot, &json!({"revision":2,"expectedInput":19}), 3));
        assert!(!owned(&slot, &json!({"revision":1,"expectedInput":19}), 3));
        assert!(!owned(&slot, &json!({"revision":2,"expectedInput":18}), 3));
        assert!(!owned(&slot, &json!({"revision":2,"expectedInput":19}), 2));
    }
}
