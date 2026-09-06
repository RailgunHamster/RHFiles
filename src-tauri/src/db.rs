use crate::types::*;
use std::collections::HashMap;
use std::path::PathBuf;

pub fn get_db() -> Result<rusqlite::Connection, String> {
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let dir = PathBuf::from(app_data).join("RHFiles");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let db_path = dir.join("rhfiles.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    let ver: u32 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .unwrap_or(0);
    if ver < 3 {
        let migrations = match ver {
            0 => {
                "CREATE TABLE IF NOT EXISTS tags (path TEXT PRIMARY KEY, tags TEXT);
                  CREATE TABLE IF NOT EXISTS folder_layouts (path TEXT PRIMARY KEY, layout TEXT);
                  CREATE TABLE IF NOT EXISTS folder_prefs (path TEXT PRIMARY KEY, prefs TEXT);
                  CREATE TABLE IF NOT EXISTS pinned (path TEXT PRIMARY KEY, name TEXT, ord INTEGER);
                  CREATE TABLE IF NOT EXISTS window_states (
                      window_id TEXT PRIMARY KEY,
                      state_json TEXT,
                      pos_x INTEGER,
                      pos_y INTEGER,
                      width INTEGER,
                      height INTEGER,
                      maximized INTEGER DEFAULT 0,
                      sort_order INTEGER DEFAULT 0
                  );"
            }
            1 => "",
            2 => "",
            _ => "",
        };
        if !migrations.is_empty() {
            conn.execute_batch(migrations).map_err(|e| e.to_string())?;
        }
        if ver < 2 {
            conn.execute_batch(
                "CREATE TABLE IF NOT EXISTS network_favorites (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    protocol TEXT NOT NULL,
                    host TEXT NOT NULL,
                    port INTEGER DEFAULT 0,
                    path TEXT DEFAULT '/',
                    username TEXT DEFAULT '',
                    password TEXT DEFAULT '',
                    display_name TEXT DEFAULT '',
                    last_used TEXT DEFAULT ''
                );",
            )
            .map_err(|e| e.to_string())?;
        }
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS recent_items (
                path TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                is_dir INTEGER DEFAULT 0,
                ext TEXT DEFAULT '',
                access_count INTEGER DEFAULT 1,
                last_accessed TEXT NOT NULL
            );
            PRAGMA user_version = 3;",
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(conn)
}

#[tauri::command]
pub fn db_save_tags(path: String, tags: Vec<String>) -> Result<(), String> {
    let conn = get_db()?;
    let tags_json = serde_json::to_string(&tags).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO tags (path, tags) VALUES (?1, ?2)",
        rusqlite::params![path, tags_json],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_load_tags(path: String) -> Result<Vec<String>, String> {
    let conn = get_db()?;
    let mut stmt = conn
        .prepare("SELECT tags FROM tags WHERE path = ?1")
        .map_err(|e| e.to_string())?;
    let result = stmt
        .query_row(rusqlite::params![path], |row| row.get::<_, String>(0))
        .ok();
    match result {
        Some(json) => serde_json::from_str(&json).map_err(|e| e.to_string()),
        None => Ok(Vec::new()),
    }
}

#[tauri::command]
pub fn db_load_all_tags() -> Result<HashMap<String, Vec<String>>, String> {
    let conn = get_db()?;
    let mut stmt = conn
        .prepare("SELECT path, tags FROM tags")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    for row in rows {
        let (path, tags_json) = row.map_err(|e| e.to_string())?;
        let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
        map.insert(path, tags);
    }
    Ok(map)
}

#[tauri::command]
pub fn db_save_layout(path: String, layout: String) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "INSERT OR REPLACE INTO folder_layouts (path, layout) VALUES (?1, ?2)",
        rusqlite::params![path, layout],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_load_layout(path: String) -> Result<Option<String>, String> {
    let conn = get_db()?;
    let mut stmt = conn
        .prepare("SELECT layout FROM folder_layouts WHERE path = ?1")
        .map_err(|e| e.to_string())?;
    Ok(stmt
        .query_row(rusqlite::params![path], |row| row.get::<_, String>(0))
        .ok())
}

#[tauri::command(async)]
pub fn db_save_pinned(paths: Vec<(String, String)>) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM pinned", [])
        .map_err(|e| e.to_string())?;
    for (i, (path, name)) in paths.iter().enumerate() {
        conn.execute(
            "INSERT INTO pinned (path, name, ord) VALUES (?1, ?2, ?3)",
            rusqlite::params![path, name, i],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command(async)]
pub fn db_load_pinned() -> Result<Vec<(String, String)>, String> {
    let conn = get_db()?;
    let mut stmt = conn
        .prepare("SELECT path, name FROM pinned ORDER BY ord")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn db_save_network_favorite(
    protocol: String,
    host: String,
    port: i32,
    path: String,
    username: String,
    display_name: String,
) -> Result<i64, String> {
    let conn = get_db()?;
    conn.execute(
        "INSERT INTO network_favorites (protocol, host, port, path, username, display_name, last_used) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
        rusqlite::params![protocol, host, port, path, username, display_name],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn db_load_network_favorites() -> Result<Vec<NetworkFavorite>, String> {
    let conn = get_db()?;
    let mut stmt = conn.prepare("SELECT id, protocol, host, port, path, username, display_name FROM network_favorites ORDER BY last_used DESC").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(NetworkFavorite {
                id: row.get(0)?,
                protocol: row.get(1)?,
                host: row.get(2)?,
                port: row.get(3)?,
                path: row.get(4)?,
                username: row.get(5)?,
                display_name: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn db_delete_network_favorite(id: i64) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "DELETE FROM network_favorites WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_add_recent(path: String, name: String, is_dir: bool, ext: String) -> Result<(), String> {
    let conn = get_db()?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO recent_items (path, name, is_dir, ext, access_count, last_accessed) VALUES (?1, ?2, ?3, ?4, 1, ?5)
         ON CONFLICT(path) DO UPDATE SET access_count = access_count + 1, last_accessed = ?5, name = ?2, is_dir = ?3, ext = ?4",
        rusqlite::params![path, name, is_dir as i32, ext, now],
    ).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM recent_items WHERE path NOT IN (SELECT path FROM recent_items ORDER BY last_accessed DESC LIMIT 200)", []).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
pub fn db_load_recent(mode: String, limit: i32) -> Result<Vec<RecentItem>, String> {
    let conn = get_db()?;
    let order = if mode == "frequent" {
        "access_count DESC, last_accessed DESC"
    } else {
        "last_accessed DESC"
    };
    let sql = format!(
        "SELECT path, name, is_dir, ext, access_count, last_accessed FROM recent_items ORDER BY {} LIMIT ?1",
        order
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![limit], |row| {
            Ok(RecentItem {
                path: row.get(0)?,
                name: row.get(1)?,
                is_dir: row.get::<_, i32>(2)? != 0,
                ext: row.get(3)?,
                access_count: row.get(4)?,
                last_accessed: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command(async)]
pub fn db_remove_recent(path: String) -> Result<(), String> {
    let conn = get_db()?;
    conn.execute(
        "DELETE FROM recent_items WHERE path = ?1",
        rusqlite::params![path],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
pub fn db_clear_recent() -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM recent_items", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_export_all() -> Result<HashMap<String, String>, String> {
    let conn = get_db()?;
    let mut data = HashMap::new();
    let mut stmt = conn
        .prepare("SELECT path, tags FROM tags")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut tags_map = HashMap::new();
    for row in rows {
        let (path, tags_json) = row.map_err(|e| e.to_string())?;
        let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
        tags_map.insert(path, tags);
    }
    data.insert(
        "db_tags".into(),
        serde_json::to_string(&tags_map).map_err(|e| e.to_string())?,
    );

    let mut stmt = conn
        .prepare("SELECT path, layout FROM folder_layouts")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut layouts_map = HashMap::new();
    for row in rows {
        let (path, layout) = row.map_err(|e| e.to_string())?;
        layouts_map.insert(path, layout);
    }
    data.insert(
        "db_layouts".into(),
        serde_json::to_string(&layouts_map).map_err(|e| e.to_string())?,
    );

    let mut stmt = conn
        .prepare("SELECT path, name FROM pinned ORDER BY ord")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut pinned_list = Vec::new();
    for row in rows {
        pinned_list.push(row.map_err(|e| e.to_string())?);
    }
    data.insert(
        "db_pinned".into(),
        serde_json::to_string(&pinned_list).map_err(|e| e.to_string())?,
    );

    let mut stmt = conn.prepare("SELECT id, protocol, host, port, path, username, display_name FROM network_favorites ORDER BY last_used DESC").map_err(|e| e.to_string())?;
    let net_rows = stmt
        .query_map([], |row| {
            Ok(NetworkFavorite {
                id: row.get(0)?,
                protocol: row.get(1)?,
                host: row.get(2)?,
                port: row.get(3)?,
                path: row.get(4)?,
                username: row.get(5)?,
                display_name: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut net_list = Vec::new();
    for row in net_rows {
        net_list.push(row.map_err(|e| e.to_string())?);
    }
    data.insert(
        "db_network_favorites".into(),
        serde_json::to_string(&net_list).map_err(|e| e.to_string())?,
    );

    Ok(data)
}

#[tauri::command]
pub fn db_import_all(
    tags_json: String,
    layouts_json: String,
    pinned_json: String,
    network_favorites_json: String,
) -> Result<(), String> {
    let conn = get_db()?;

    if !tags_json.is_empty() {
        let tags_map: HashMap<String, Vec<String>> =
            serde_json::from_str(&tags_json).map_err(|e| e.to_string())?;
        for (path, tags) in &tags_map {
            let tj = serde_json::to_string(tags).map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT OR REPLACE INTO tags (path, tags) VALUES (?1, ?2)",
                rusqlite::params![path, tj],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    if !layouts_json.is_empty() {
        let layouts_map: HashMap<String, String> =
            serde_json::from_str(&layouts_json).map_err(|e| e.to_string())?;
        for (path, layout) in &layouts_map {
            conn.execute(
                "INSERT OR REPLACE INTO folder_layouts (path, layout) VALUES (?1, ?2)",
                rusqlite::params![path, layout],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    if !pinned_json.is_empty() {
        let pinned_list: Vec<(String, String)> =
            serde_json::from_str(&pinned_json).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM pinned", [])
            .map_err(|e| e.to_string())?;
        for (i, (path, name)) in pinned_list.iter().enumerate() {
            conn.execute(
                "INSERT INTO pinned (path, name, ord) VALUES (?1, ?2, ?3)",
                rusqlite::params![path, name, i],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    if !network_favorites_json.is_empty() {
        let net_list: Vec<NetworkFavorite> =
            serde_json::from_str(&network_favorites_json).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM network_favorites", [])
            .map_err(|e| e.to_string())?;
        for fav in &net_list {
            conn.execute(
                "INSERT INTO network_favorites (protocol, host, port, path, username, display_name, last_used) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
                rusqlite::params![fav.protocol, fav.host, fav.port, fav.path, fav.username, fav.display_name],
            ).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn db_clear_all() -> Result<(), String> {
    let conn = get_db()?;
    conn.execute("DELETE FROM tags", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM folder_layouts", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM folder_prefs", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM pinned", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM network_favorites", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM recent_items", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn cleanup_stale_windows(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let open_labels: Vec<String> = app.webview_windows().keys().cloned().collect();
    let conn = get_db()?;
    let mut stmt = conn
        .prepare("SELECT window_id FROM window_states")
        .map_err(|e| e.to_string())?;
    let rows: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    for window_id in rows {
        if !open_labels.contains(&window_id) {
            conn.execute(
                "DELETE FROM window_states WHERE window_id = ?1",
                rusqlite::params![window_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
