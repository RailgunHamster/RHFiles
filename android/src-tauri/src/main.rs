// Prevents an additional console window on Windows in release. On Android this
// binary is not used: the JNI entry point lives in the library target.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    rhfiles_android_lib::run()
}
