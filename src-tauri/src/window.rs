use crate::db::get_db;

#[tauri::command]
pub async fn toggle_pip(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("main") {
        let is_top = win.is_always_on_top().map_err(|e| e.to_string())?;
        if is_top {
            win.set_always_on_top(false).map_err(|e| e.to_string())?;
            win.set_decorations(true).map_err(|e| e.to_string())?;
            win.set_size(tauri::LogicalSize::new(1200.0, 800.0)).map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            win.set_always_on_top(true).map_err(|e| e.to_string())?;
            win.set_decorations(false).map_err(|e| e.to_string())?;
            win.set_size(tauri::LogicalSize::new(500.0, 400.0)).map_err(|e| e.to_string())?;
            Ok(true)
        }
    } else {
        Err("No main window".to_string())
    }
}

#[tauri::command]
pub async fn open_new_window(app: tauri::AppHandle, initial_path: Option<String>) -> Result<String, String> {
    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let label = format!("window-{}", id);
    {
        let conn = get_db()?;
        let state_json = initial_path.as_ref().map(|p| serde_json::json!({"initial_path": p}).to_string()).unwrap_or_default();
        conn.execute(
            "INSERT OR REPLACE INTO window_states (window_id, state_json, pos_x, pos_y, width, height, maximized, sort_order) VALUES (?1, ?2, 0, 0, 1200, 800, 0, 0)",
            rusqlite::params![label, state_json],
        ).map_err(|e| e.to_string())?;
    }
    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App("index.html".into()),
    )
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
pub fn save_window_state(window_id: String, state_json: String, pos_x: i32, pos_y: i32, width: i32, height: i32, maximized: bool, sort_order: i32) -> Result<(), String> {
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
    let rows = stmt.query_map([], |row| {
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
    }).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn delete_window_state(window_id: String) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM window_states WHERE window_id = ?1", rusqlite::params![window_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn save_current_window_geometry(window: tauri::WebviewWindow, state_json: String) -> Result<(), String> {
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
    let window_id = window.label().to_string();
    let conn = get_db()?;
    let result: Result<(i32, i32, i32, i32, bool), _> = conn.query_row(
        "SELECT pos_x, pos_y, width, height, maximized FROM window_states WHERE window_id = ?1",
        rusqlite::params![window_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get::<_, i32>(4)? != 0)),
    );
    if let Ok((pos_x, pos_y, width, height, maximized)) = result {
        if width > 0 && height > 0 {
            let _ = window.set_size(tauri::LogicalSize::new(width as f64, height as f64));
        }
        if pos_x != 0 || pos_y != 0 {
            let _ = window.set_position(tauri::LogicalPosition::new(pos_x as f64, pos_y as f64));
        }
        if maximized {
            let _ = window.maximize();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn set_window_effect(effect: String, window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWINDOWATTRIBUTE};

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
    { let _ = (effect, window); Err("Not supported on this platform".to_string()) }
}
