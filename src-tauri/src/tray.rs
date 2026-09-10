use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Wry};

const TRAY_ID: &str = "rhfiles-main-tray";
const TRAY_OPEN_ID: &str = "tray-open-rhfiles";
const TRAY_EXIT_ID: &str = "tray-exit-rhfiles";

#[derive(Clone)]
struct TrayMenuItems {
    open: MenuItem<Wry>,
    exit: MenuItem<Wry>,
}

#[derive(Default)]
pub(crate) struct TrayMenuState {
    items: Mutex<Option<TrayMenuItems>>,
}

fn labels(language: &str) -> (&'static str, &'static str) {
    if language.trim().to_ascii_lowercase().starts_with("zh") {
        ("打开 RHFiles", "退出 RHFiles")
    } else {
        ("Open RHFiles", "Exit RHFiles")
    }
}

/// Restores the main window, or recreates it if an older close event already
/// destroyed it while the tray process remained alive.
pub(crate) fn show_main_window(app: &AppHandle<Wry>) -> Result<(), String> {
    let window = match app.get_webview_window("main") {
        Some(window) => window,
        None => WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
            .disable_drag_drop_handler()
            .title("RHFiles")
            .inner_size(1200.0, 800.0)
            .min_inner_size(700.0, 450.0)
            .build()
            .map_err(|error| format!("Unable to recreate the main window: {error}"))?,
    };

    window
        .show()
        .map_err(|error| format!("Unable to show the main window: {error}"))?;
    window
        .unminimize()
        .map_err(|error| format!("Unable to restore the main window: {error}"))?;
    crate::window::ensure_window_visible(&window)?;
    window
        .set_focus()
        .map_err(|error| format!("Unable to focus the main window: {error}"))
}

pub(crate) fn install(app: &mut App<Wry>) -> tauri::Result<()> {
    let Some(icon) = app.default_window_icon() else {
        return Ok(());
    };

    // Keep the first-render labels bilingual. The renderer synchronizes them
    // with the selected UI language as soon as localization is initialized.
    let open = MenuItem::with_id(
        app,
        TRAY_OPEN_ID,
        "打开 RHFiles / Open RHFiles",
        true,
        None::<&str>,
    )?;
    let exit = MenuItem::with_id(
        app,
        TRAY_EXIT_ID,
        "退出 RHFiles / Exit RHFiles",
        true,
        None::<&str>,
    )?;
    let menu = Menu::with_items(app, &[&open, &exit])?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon.clone())
        .tooltip("RHFiles")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_OPEN_ID => {
                let _ = show_main_window(app);
            }
            TRAY_EXIT_ID => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    if let Ok(mut items) = app.state::<TrayMenuState>().items.lock() {
        *items = Some(TrayMenuItems { open, exit });
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn set_tray_language(
    language: String,
    state: tauri::State<'_, TrayMenuState>,
) -> Result<(), String> {
    let (open_label, exit_label) = labels(&language);
    let items = state
        .items
        .lock()
        .map_err(|_| "Tray menu state is unavailable".to_string())?;
    let Some(items) = items.as_ref() else {
        return Ok(());
    };
    items.open.set_text(open_label).map_err(|e| e.to_string())?;
    items.exit.set_text(exit_label).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::labels;

    #[test]
    fn tray_labels_follow_the_selected_language() {
        assert_eq!(labels("zh-CN"), ("打开 RHFiles", "退出 RHFiles"));
        assert_eq!(labels("zh"), ("打开 RHFiles", "退出 RHFiles"));
        assert_eq!(labels("en-US"), ("Open RHFiles", "Exit RHFiles"));
    }
}
