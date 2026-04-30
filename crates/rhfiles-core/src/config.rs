use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub theme: String,
    pub default_path: PathBuf,
    pub show_hidden: bool,
    pub startup_tabs: Vec<PathBuf>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            default_path: PathBuf::from("C:\\"),
            show_hidden: false,
            startup_tabs: vec![PathBuf::from("C:\\")],
        }
    }
}

pub fn load_config(path: &std::path::Path) -> AppConfig {
    match std::fs::read_to_string(path) {
        Ok(s) => toml::from_str(&s).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

pub fn save_config(config: &AppConfig, path: &std::path::Path) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let s = toml::to_string_pretty(config).unwrap_or_default();
    let _ = std::fs::write(path, s);
}
