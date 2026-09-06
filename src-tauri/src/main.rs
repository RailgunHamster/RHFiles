#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Velopack must handle install/update lifecycle arguments before Tauri starts.
    velopack::VelopackApp::build().run();
    rhfiles_tauri_lib::run()
}
