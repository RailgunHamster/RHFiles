use crate::db::get_db;

const DEFAULT_WINDOW_WIDTH: u32 = 1200;
const DEFAULT_WINDOW_HEIGHT: u32 = 800;
const MIN_SAVED_WINDOW_WIDTH: i32 = 700;
const MIN_SAVED_WINDOW_HEIGHT: i32 = 450;
const MIN_VISIBLE_TITLE_WIDTH: i64 = 160;
const MIN_VISIBLE_TITLE_HEIGHT: i64 = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct WindowRect {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

impl WindowRect {
    fn right(self) -> i64 {
        self.x as i64 + self.width as i64
    }

    fn bottom(self) -> i64 {
        self.y as i64 + self.height as i64
    }
}

fn intersection_size(window: WindowRect, area: WindowRect) -> (i64, i64) {
    let width = (window.right().min(area.right()) - (window.x as i64).max(area.x as i64)).max(0);
    let height = (window.bottom().min(area.bottom()) - (window.y as i64).max(area.y as i64)).max(0);
    (width, height)
}

fn title_bar_is_accessible(window: WindowRect, area: WindowRect) -> bool {
    let visible_width = intersection_size(window, area).0;
    let title_height = window.height.min(64) as i64;
    let title_bottom = window.y as i64 + title_height;
    let visible_title_height =
        (title_bottom.min(area.bottom()) - (window.y as i64).max(area.y as i64)).max(0);
    let required_width = MIN_VISIBLE_TITLE_WIDTH.min(window.width as i64);
    let required_height = MIN_VISIBLE_TITLE_HEIGHT.min(title_height);
    visible_width >= required_width && visible_title_height >= required_height
}

fn clamp_to_area(window: WindowRect, area: WindowRect) -> WindowRect {
    let width = window.width.max(1).min(area.width.max(1));
    let height = window.height.max(1).min(area.height.max(1));
    let min_x = area.x as i64;
    let min_y = area.y as i64;
    let max_x = min_x + area.width.max(1) as i64 - width as i64;
    let max_y = min_y + area.height.max(1) as i64 - height as i64;
    WindowRect {
        x: (window.x as i64).clamp(min_x, max_x) as i32,
        y: (window.y as i64).clamp(min_y, max_y) as i32,
        width,
        height,
    }
}

/// Keep a stored physical-pixel rectangle when its title bar is reachable on
/// any connected display. Otherwise move it back into the best matching work
/// area (or the primary display, which is first in `areas`).
fn recover_window_rect(window: WindowRect, areas: &[WindowRect]) -> WindowRect {
    if areas.is_empty()
        || areas.iter().copied().any(|area| {
            title_bar_is_accessible(window, area)
                && window.width <= area.width
                && window.height <= area.height
        })
    {
        return window;
    }

    let best_match = areas
        .iter()
        .copied()
        .max_by_key(|area| {
            let (width, height) = intersection_size(window, *area);
            width * height
        })
        .unwrap_or(areas[0]);
    let (best_width, best_height) = intersection_size(window, best_match);
    let target = if best_width > 0 && best_height > 0 {
        best_match
    } else {
        areas[0]
    };
    let (overlap_width, overlap_height) = intersection_size(window, target);
    let has_overlap = overlap_width > 0 && overlap_height > 0;
    let mut recovered = clamp_to_area(window, target);
    if !has_overlap {
        recovered.x = (target.x as i64 + (target.width as i64 - recovered.width as i64) / 2) as i32;
        recovered.y =
            (target.y as i64 + (target.height as i64 - recovered.height as i64) / 2) as i32;
    }
    recovered
}

fn monitor_work_areas(window: &tauri::WebviewWindow) -> Vec<WindowRect> {
    let mut areas = Vec::new();
    if let Ok(Some(primary)) = window.primary_monitor() {
        let work = primary.work_area();
        areas.push(WindowRect {
            x: work.position.x,
            y: work.position.y,
            width: work.size.width,
            height: work.size.height,
        });
    }
    if let Ok(monitors) = window.available_monitors() {
        for monitor in monitors {
            let work = monitor.work_area();
            let area = WindowRect {
                x: work.position.x,
                y: work.position.y,
                width: work.size.width,
                height: work.size.height,
            };
            if !areas.contains(&area) {
                areas.push(area);
            }
        }
    }
    areas
}

fn apply_window_rect(window: &tauri::WebviewWindow, rect: WindowRect) -> Result<(), String> {
    window
        .set_size(tauri::PhysicalSize::new(rect.width, rect.height))
        .map_err(|error| format!("Unable to restore the window size: {error}"))?;
    window
        .set_position(tauri::PhysicalPosition::new(rect.x, rect.y))
        .map_err(|error| format!("Unable to restore the window position: {error}"))
}

pub(crate) fn apply_saved_window_geometry(
    window: &tauri::WebviewWindow,
    pos_x: i32,
    pos_y: i32,
    width: i32,
    height: i32,
    maximized: bool,
) -> Result<(), String> {
    let saved = WindowRect {
        x: pos_x,
        y: pos_y,
        width: if width >= MIN_SAVED_WINDOW_WIDTH {
            width as u32
        } else {
            DEFAULT_WINDOW_WIDTH
        },
        height: if height >= MIN_SAVED_WINDOW_HEIGHT {
            height as u32
        } else {
            DEFAULT_WINDOW_HEIGHT
        },
    };
    let recovered = recover_window_rect(saved, &monitor_work_areas(window));
    if window.is_maximized().unwrap_or(false) {
        window
            .unmaximize()
            .map_err(|error| format!("Unable to prepare the window for restoration: {error}"))?;
    }
    apply_window_rect(window, recovered)?;
    if maximized {
        window
            .maximize()
            .map_err(|error| format!("Unable to restore the maximized window: {error}"))?;
    }
    Ok(())
}

pub(crate) fn ensure_window_visible(window: &tauri::WebviewWindow) -> Result<(), String> {
    let position = window
        .inner_position()
        .map_err(|error| format!("Unable to read the window position: {error}"))?;
    let size = window
        .inner_size()
        .map_err(|error| format!("Unable to read the window size: {error}"))?;
    let current = WindowRect {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    };
    let work_areas = monitor_work_areas(window);
    let was_maximized = window.is_maximized().unwrap_or(false);
    if was_maximized
        && work_areas
            .iter()
            .copied()
            .any(|area| title_bar_is_accessible(current, area))
    {
        return Ok(());
    }
    let recovered = recover_window_rect(current, &work_areas);
    if recovered == current {
        return Ok(());
    }

    if was_maximized {
        window
            .unmaximize()
            .map_err(|error| format!("Unable to recover the maximized window: {error}"))?;
    }
    apply_window_rect(window, recovered)?;
    if was_maximized {
        window
            .maximize()
            .map_err(|error| format!("Unable to re-maximize the recovered window: {error}"))?;
    }
    Ok(())
}

pub(crate) fn restore_saved_window_geometry(window: &tauri::WebviewWindow) -> Result<(), String> {
    let window_id = window.label().to_string();
    let conn = get_db()?;
    let result: Result<(i32, i32, i32, i32, bool), _> = conn.query_row(
        "SELECT pos_x, pos_y, width, height, maximized FROM window_states WHERE window_id = ?1",
        rusqlite::params![window_id],
        |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get::<_, i32>(4)? != 0,
            ))
        },
    );
    match result {
        Ok((pos_x, pos_y, width, height, maximized)) => {
            apply_saved_window_geometry(window, pos_x, pos_y, width, height, maximized)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => ensure_window_visible(window),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub async fn toggle_pip(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("main") {
        let is_top = win.is_always_on_top().map_err(|e| e.to_string())?;
        if is_top {
            win.set_always_on_top(false).map_err(|e| e.to_string())?;
            win.set_decorations(true).map_err(|e| e.to_string())?;
            win.set_size(tauri::LogicalSize::new(1200.0, 800.0))
                .map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            win.set_always_on_top(true).map_err(|e| e.to_string())?;
            win.set_decorations(false).map_err(|e| e.to_string())?;
            win.set_size(tauri::LogicalSize::new(500.0, 400.0))
                .map_err(|e| e.to_string())?;
            Ok(true)
        }
    } else {
        Err("No main window".to_string())
    }
}

#[tauri::command]
pub async fn open_new_window(
    app: tauri::AppHandle,
    initial_path: Option<String>,
) -> Result<String, String> {
    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let label = format!("window-{}", id);
    {
        let conn = get_db()?;
        let state_json = initial_path
            .as_ref()
            .map(|p| serde_json::json!({"initial_path": p}).to_string())
            .unwrap_or_default();
        conn.execute(
            "INSERT OR REPLACE INTO window_states (window_id, state_json, pos_x, pos_y, width, height, maximized, sort_order) VALUES (?1, ?2, 0, 0, 1200, 800, 0, 0)",
            rusqlite::params![label, state_json],
        ).map_err(|e| e.to_string())?;
    }
    let _window =
        tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App("index.html".into()))
            // Tauri's native file-drop handler owns WebView2's drop target on
            // Windows. RHFiles uses HTML5 drag events for files and tabs, so
            // leaving it enabled makes every real file drag show the forbidden
            // cursor even though synthetic frontend tests pass.
            .disable_drag_drop_handler()
            .title("RHFiles")
            .inner_size(1200.0, 800.0)
            .build()
            .map_err(|e| e.to_string())?;
    Ok(label)
}

#[tauri::command]
pub fn get_window_label(window: tauri::WebviewWindow) -> String {
    window.label().to_string()
}

#[tauri::command]
pub fn save_window_state(
    window_id: String,
    state_json: String,
    pos_x: i32,
    pos_y: i32,
    width: i32,
    height: i32,
    maximized: bool,
    sort_order: i32,
) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "INSERT OR REPLACE INTO window_states (window_id, state_json, pos_x, pos_y, width, height, maximized, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![window_id, state_json, pos_x, pos_y, width, height, maximized as i32, sort_order],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_window_state(window_id: String) -> Result<Option<serde_json::Value>, String> {
    let conn = get_db()?;
    let mut stmt = conn.prepare("SELECT state_json, pos_x, pos_y, width, height, maximized, sort_order FROM window_states WHERE window_id = ?1")
        .map_err(|e| e.to_string())?;
    let result = stmt.query_row(rusqlite::params![window_id], |row| {
        let state_json: String = row.get(0)?;
        let pos_x: i32 = row.get(1)?;
        let pos_y: i32 = row.get(2)?;
        let width: i32 = row.get(3)?;
        let height: i32 = row.get(4)?;
        let maximized: i32 = row.get(5)?;
        let sort_order: i32 = row.get(6)?;
        Ok(serde_json::json!({
            "state_json": state_json,
            "pos_x": pos_x,
            "pos_y": pos_y,
            "width": width,
            "height": height,
            "maximized": maximized != 0,
            "sort_order": sort_order,
        }))
    });
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn get_all_window_states() -> Result<Vec<serde_json::Value>, String> {
    let conn = get_db()?;
    let mut stmt = conn.prepare("SELECT window_id, state_json, pos_x, pos_y, width, height, maximized, sort_order FROM window_states ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let window_id: String = row.get(0)?;
            let state_json: String = row.get(1)?;
            let pos_x: i32 = row.get(2)?;
            let pos_y: i32 = row.get(3)?;
            let width: i32 = row.get(4)?;
            let height: i32 = row.get(5)?;
            let maximized: i32 = row.get(6)?;
            let sort_order: i32 = row.get(7)?;
            Ok(serde_json::json!({
                "window_id": window_id,
                "state_json": state_json,
                "pos_x": pos_x,
                "pos_y": pos_y,
                "width": width,
                "height": height,
                "maximized": maximized != 0,
                "sort_order": sort_order,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn delete_window_state(window_id: String) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "DELETE FROM window_states WHERE window_id = ?1",
        rusqlite::params![window_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn save_current_window_geometry(
    window: tauri::WebviewWindow,
    state_json: String,
) -> Result<(), String> {
    let pos = window.inner_position().map_err(|e| e.to_string())?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let is_maximized = window.is_maximized().unwrap_or(false);
    let window_id = window.label().to_string();
    let conn = get_db()?;
    conn.execute(
        "INSERT OR REPLACE INTO window_states (window_id, state_json, pos_x, pos_y, width, height, maximized, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, (SELECT COALESCE(sort_order, 0) FROM window_states WHERE window_id = ?1))",
        rusqlite::params![window_id, state_json, pos.x, pos.y, size.width as i32, size.height as i32, is_maximized as i32],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn restore_window_geometry(window: tauri::WebviewWindow) -> Result<(), String> {
    restore_saved_window_geometry(&window)
}

#[cfg(test)]
mod geometry_tests {
    use super::{DEFAULT_WINDOW_HEIGHT, DEFAULT_WINDOW_WIDTH, WindowRect, recover_window_rect};

    const PRIMARY: WindowRect = WindowRect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040,
    };

    #[test]
    fn keeps_a_reachable_window_on_a_negative_coordinate_monitor() {
        let left = WindowRect {
            x: -1920,
            y: 0,
            width: 1920,
            height: 1040,
        };
        let saved = WindowRect {
            x: -1700,
            y: 80,
            width: 1200,
            height: 800,
        };
        assert_eq!(recover_window_rect(saved, &[PRIMARY, left]), saved);
    }

    #[test]
    fn recenters_a_window_from_a_disconnected_monitor() {
        let saved = WindowRect {
            x: 4200,
            y: 300,
            width: DEFAULT_WINDOW_WIDTH,
            height: DEFAULT_WINDOW_HEIGHT,
        };
        assert_eq!(
            recover_window_rect(saved, &[PRIMARY]),
            WindowRect {
                x: 360,
                y: 120,
                width: DEFAULT_WINDOW_WIDTH,
                height: DEFAULT_WINDOW_HEIGHT,
            }
        );
    }

    #[test]
    fn uses_the_primary_work_area_when_no_display_overlaps() {
        let secondary = WindowRect {
            x: 1920,
            y: 0,
            width: 2560,
            height: 1400,
        };
        let saved = WindowRect {
            x: 6000,
            y: 200,
            width: DEFAULT_WINDOW_WIDTH,
            height: DEFAULT_WINDOW_HEIGHT,
        };
        assert_eq!(
            recover_window_rect(saved, &[PRIMARY, secondary]),
            WindowRect {
                x: 360,
                y: 120,
                width: DEFAULT_WINDOW_WIDTH,
                height: DEFAULT_WINDOW_HEIGHT,
            }
        );
    }

    #[test]
    fn pulls_an_inaccessible_title_bar_back_into_the_work_area() {
        let saved = WindowRect {
            x: 300,
            y: -760,
            width: 1200,
            height: 800,
        };
        assert_eq!(
            recover_window_rect(saved, &[PRIMARY]),
            WindowRect {
                x: 300,
                y: 0,
                width: 1200,
                height: 800,
            }
        );
    }

    #[test]
    fn shrinks_an_absurd_window_before_recovery() {
        let saved = WindowRect {
            x: 5000,
            y: 5000,
            width: 9000,
            height: 7000,
        };
        assert_eq!(
            recover_window_rect(saved, &[PRIMARY]),
            WindowRect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1040,
            }
        );
    }

    #[test]
    fn shrinks_a_reachable_window_after_the_display_gets_smaller() {
        let saved = WindowRect {
            x: 0,
            y: 0,
            width: 2560,
            height: 1400,
        };
        assert_eq!(
            recover_window_rect(saved, &[PRIMARY]),
            WindowRect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1040,
            }
        );
    }
}

#[tauri::command]
pub async fn set_window_effect(effect: String, window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Graphics::Dwm::{DWMWINDOWATTRIBUTE, DwmSetWindowAttribute};

        let tauri_hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let hwnd = windows::Win32::Foundation::HWND(tauri_hwnd.0);
        let backdrop: u32 = match effect.as_str() {
            "mica" => 2,
            "acrylic" => 3,
            "mica-alt" => 4,
            _ => 0,
        };
        unsafe {
            let dark_mode: u32 = 1;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWINDOWATTRIBUTE(20),
                &dark_mode as *const u32 as *const core::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            );
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWINDOWATTRIBUTE(38),
                &backdrop as *const u32 as *const core::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            );
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (effect, window);
        Err("Not supported on this platform".to_string())
    }
}
