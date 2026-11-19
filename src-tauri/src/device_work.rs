//! Managed local working copies for programs which require a local filename.
//! Editing never silently becomes a disposable download: changed copies are
//! retained across restarts and can only be committed against the read revision.
use super::*;

static WATCHERS: std::sync::LazyLock<
    std::sync::Mutex<std::collections::HashMap<String, tokio::task::AbortHandle>>,
> = std::sync::LazyLock::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));

fn stop_watcher(id: &str) {
    if let Ok(mut map) = WATCHERS.lock() {
        if let Some(handle) = map.remove(id) {
            handle.abort();
        }
    }
}

async fn save_working_copy(
    dir: &Path,
    alternate: Option<&str>,
    progress: &mut Progress<'_>,
) -> Result<Value, String> {
    let mut record = read(dir)?;
    let original = Location::parse(field(&record, "source")?)?;
    let local = Location::Local(dir.join("content").join(field(&record, "name")?));
    let local_stamp = snapshot(&local).await?;
    let target = if let Some(name) = alternate {
        original.parent()?.child(name)?
    } else {
        original.clone()
    };
    hold(&original, progress)?;
    progress.editing = alternate.is_none();
    transfer(
        local.clone(),
        target.clone(),
        false,
        alternate.is_none(),
        if alternate.is_none() {
            Some(field(&record, "remoteRevision")?)
        } else {
            None
        },
        None,
        progress,
    )
    .await?;
    record["source"] = json!(target.text());
    record["remoteRevision"] = json!(snapshot(&target).await?.revision);
    record["localRevision"] = json!(local_stamp.revision);
    write(dir, &record)?;
    Ok(json!({"saved":true,"path":target.text()}))
}

fn start_watcher(id: String, dir: PathBuf, app: tauri::AppHandle) {
    stop_watcher(&id);
    let watcher_id = id.clone();
    let task = tokio::spawn(async move {
        let mut idle_since = Instant::now();
        let mut missing_polls = 0u8;
        let mut last_failed_rev: Option<String> = None;
        let max_idle = Duration::from_secs(4 * 60 * 60);
        loop {
            tokio::time::sleep(Duration::from_millis(900)).await;
            if idle_since.elapsed() > max_idle {
                break;
            }
            let Ok(record) = read(&dir) else {
                break;
            };
            let Ok(name) = field(&record, "name").map(str::to_owned) else {
                break;
            };
            let Ok(source_text) = field(&record, "source").map(str::to_owned) else {
                break;
            };
            let local = Location::Local(dir.join("content").join(&name));
            let local_stamp = match snapshot(&local).await {
                Ok(stamp) => {
                    missing_polls = 0;
                    stamp
                }
                Err(_) => {
                    missing_polls += 1;
                    if missing_polls >= 4 {
                        break;
                    }
                    continue;
                }
            };
            if record["localRevision"].as_str() == Some(local_stamp.revision.as_str()) {
                last_failed_rev = None;
                continue;
            }
            if last_failed_rev.as_deref() == Some(local_stamp.revision.as_str()) {
                continue;
            }
            idle_since = Instant::now();
            // Wait for editors (Notepad, VS Code, etc.) to finish flushing/replacing the file.
            let mut settled = local_stamp;
            let mut vanished = false;
            for _ in 0..5 {
                tokio::time::sleep(Duration::from_millis(450)).await;
                match snapshot(&local).await {
                    Ok(next) if next.revision == settled.revision => break,
                    Ok(next) => settled = next,
                    Err(_) => {
                        vanished = true;
                        break;
                    }
                }
            }
            if vanished {
                continue;
            }
            let cancel = CancelFlag(std::sync::Mutex::new(Default::default()));
            let mut progress = Progress {
                app: &app,
                cancel: &cancel,
                leases: Vec::new(),
                id: format!("autosave-{watcher_id}"),
                operation: "working_save".into(),
                src: local.text(),
                dest: source_text.clone(),
                total: settled.size,
                bytes: 0,
                items: 1,
                done: 0,
                started: Instant::now(),
                last: Instant::now(),
                history: false,
                exclusive_target: false,
                history_sources: None,
                download_options: DownloadOptions::default(),
                shared_bytes: None,
                silent: true,
                saving: true,
                editing: true,
            };
            match save_working_copy(&dir, None, &mut progress).await {
                Ok(_) => {
                    last_failed_rev = None;
                    let _ = app.emit(
                        "device-working-copy-sync",
                        json!({"id": watcher_id, "source": source_text, "name": name, "ok": true}),
                    );
                }
                Err(error) => {
                    last_failed_rev = Some(settled.revision);
                    let _ = app.emit(
                        "device-working-copy-sync",
                        json!({"id": watcher_id, "source": source_text, "name": name, "ok": false, "error": error}),
                    );
                }
            }
        }
        if let Ok(mut map) = WATCHERS.lock() {
            map.remove(&watcher_id);
        }
    });
    if let Ok(mut map) = WATCHERS.lock() {
        if map.len() >= 32 {
            if let Some(oldest) = map.keys().next().cloned() {
                if let Some(handle) = map.remove(&oldest) {
                    handle.abort();
                }
            }
        }
        map.insert(id, task.abort_handle());
    }
}

async fn find_reusable_open_copy(source: &Location) -> Option<(String, PathBuf, Location)> {
    let source_text = source.text();
    let remote_stamp = snapshot(source).await.ok()?;
    if remote_stamp.directory {
        return None;
    }
    let root_dir = root().ok()?;
    let entries = std::fs::read_dir(&root_dir).ok()?;
    for entry in entries.take(128).flatten() {
        let id = entry.file_name().to_string_lossy().into_owned();
        let Ok(dir) = job(&id) else { continue };
        let Ok(record) = read(&dir) else { continue };
        if record["source"].as_str() != Some(source_text.as_str()) {
            continue;
        }
        let Ok(name) = field(&record, "name").map(str::to_owned) else {
            continue;
        };
        let local = Location::Local(dir.join("content").join(&name));
        let Ok(local_stamp) = snapshot(&local).await else {
            continue;
        };
        let modified = record["localRevision"].as_str() != Some(local_stamp.revision.as_str());
        let remote_matches =
            record["remoteRevision"].as_str() == Some(remote_stamp.revision.as_str());
        if modified || remote_matches {
            return Some((id, dir, local));
        }
    }
    None
}

fn root() -> Result<PathBuf, String> {
    let path = crate::profile::data_dir()?.join("device-working-copies");
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path)
}
fn job(id: &str) -> Result<PathBuf, String> {
    if id.len() != 32 || !id.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("[invalid_request] 工作副本标识无效".into());
    }
    Ok(root()?.join(id))
}
fn read(dir: &Path) -> Result<Value, String> {
    use std::io::Read;
    let mut bytes = Vec::new();
    local_handle(&dir.join("working-copy.json"))?
        .take(65537)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 65536 {
        return Err("[invalid_request] 工作副本记录过大".into());
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    let source = DevicePath::parse(field(&value, "source")?)?;
    // Validate the basename before any join or recursive cleanup.
    DevicePath::new(&source.group, &source.peer, "/")?.child(field(&value, "name")?)?;
    Ok(value)
}
fn write(dir: &Path, value: &Value) -> Result<(), String> {
    use std::io::Write;
    let mut file = tempfile::NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
    file.write_all(&serde_json::to_vec(value).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(dir.join("working-copy.json"))
        .map_err(|e| e.to_string())?;
    Ok(())
}
async fn download(
    path: &Location,
    folder: &Path,
    progress: &mut Progress<'_>,
) -> Result<(Location, Snapshot), String> {
    hold(path, progress)?;
    let stamp = snapshot(path).await?;
    if stamp.directory {
        return Err("[invalid_path] 此操作需要一个文件，而非文件夹".into());
    }
    let target = Location::Local(folder.join(path.leaf()?));
    progress.src = path.text();
    progress.dest = target.text();
    progress.total = stamp.size;
    progress.items = 1;
    copy_file(path, &target, &stamp, None, progress).await?;
    Ok((target, stamp))
}
pub(super) async fn execute(
    action: &str,
    args: &Value,
    progress: &mut Progress<'_>,
) -> Result<Value, String> {
    match action {
        "open" | "checkout" => {
            let command = args["command"].as_str().unwrap_or("open_file").to_string();
            if action == "open"
                && ![
                    "open_file",
                    "open_with_program",
                    "show_open_with_dialog",
                    "quicklook",
                    "set_wallpaper",
                    "install_font",
                    "install_certificate",
                    "run_as_admin",
                    "reveal_working_copy",
                ]
                .contains(&command.as_str())
            {
                return Err("[unsupported] 未定义的本地打开方式".into());
            }
            let source = Location::parse(field(args, "path")?)?;
            let (id, dir, local) = if action == "open" {
                if let Some(existing) = find_reusable_open_copy(&source).await {
                    existing
                } else {
                    if std::fs::read_dir(root()?)
                        .map_err(|e| e.to_string())?
                        .take(129)
                        .count()
                        >= 128
                    {
                        return Err(
                            "[too_large] 已保留 128 个工作副本；请在“远端工作副本”中保存或清理后继续"
                                .into(),
                        );
                    }
                    let id = random()?;
                    let dir = job(&id)?;
                    std::fs::create_dir(&dir).map_err(|e| e.to_string())?;
                    let content = dir.join("content");
                    std::fs::create_dir(&content).map_err(|e| e.to_string())?;
                    let (local, stamp) = download(&source, &content, progress).await?;
                    let record = json!({"source":source.text(),"name":source.leaf()?,"remoteRevision":stamp.revision,"localRevision":snapshot(&local).await?.revision});
                    write(&dir, &record)?;
                    (id, dir, local)
                }
            } else {
                if std::fs::read_dir(root()?)
                    .map_err(|e| e.to_string())?
                    .take(129)
                    .count()
                    >= 128
                {
                    return Err(
                        "[too_large] 已保留 128 个工作副本；请在“远端工作副本”中保存或清理后继续"
                            .into(),
                    );
                }
                let id = random()?;
                let dir = job(&id)?;
                std::fs::create_dir(&dir).map_err(|e| e.to_string())?;
                let content = dir.join("content");
                std::fs::create_dir(&content).map_err(|e| e.to_string())?;
                let (local, stamp) = download(&source, &content, progress).await?;
                let record = json!({"source":source.text(),"name":source.leaf()?,"remoteRevision":stamp.revision,"localRevision":snapshot(&local).await?.revision});
                write(&dir, &record)?;
                (id, dir, local)
            };
            if action == "checkout" {
                return Ok(json!({"id":id,"localPath":local.text(),"source":source.text()}));
            }
            let local_text = local.text();
            let program = args["program"].as_str().unwrap_or("").to_string();
            let watch_edits = matches!(
                command.as_str(),
                "open_file" | "open_with_program" | "show_open_with_dialog" | "reveal_working_copy"
            );
            let open_local = local_text.clone();
            tokio::task::spawn_blocking(move || match command.as_str() {
                "open_file" => crate::system::open_file(open_local),
                "open_with_program" => crate::system::open_with_program(open_local, program),
                "show_open_with_dialog" => crate::system::show_open_with_dialog(open_local),
                "quicklook" => crate::system::quicklook(open_local),
                "set_wallpaper" => crate::system::set_wallpaper(open_local),
                "install_font" => crate::system::install_font(open_local),
                "install_certificate" => crate::system::install_certificate(open_local),
                "run_as_admin" => crate::system::run_as_admin(open_local),
                "reveal_working_copy" => {
                    crate::system::open_in_windows_explorer(open_local, Some(false))
                }
                _ => Err("[unsupported] 未定义的本地打开方式".into()),
            })
            .await
            .map_err(|e| e.to_string())??;
            if watch_edits {
                start_watcher(id.clone(), dir, progress.app.clone());
            }
            Ok(json!({"id":id,"localPath":local_text,"source":source.text(),"autoSync":watch_edits}))
        }
        "working_copies" => {
            let mut rows = Vec::new();
            for entry in std::fs::read_dir(root()?)
                .map_err(|e| e.to_string())?
                .take(128)
            {
                let entry = entry.map_err(|e| e.to_string())?;
                let id = entry.file_name().to_string_lossy().into_owned();
                let Ok(dir) = job(&id) else { continue };
                let Ok(record) = read(&dir) else { continue };
                let local = Location::Local(dir.join("content").join(field(&record, "name")?));
                let status = match snapshot(&local).await {
                    Ok(stamp) => {
                        if record["localRevision"].as_str() == Some(&stamp.revision) {
                            "unchanged"
                        } else {
                            "modified"
                        }
                    }
                    Err(_) => "missing",
                };
                rows.push(json!({"id":id,"source":record["source"],"name":record["name"],"status":status,"localPath":local.text()}));
            }
            Ok(json!({"items":rows}))
        }
        "working_save" => {
            let dir = job(field(args, "id")?)?;
            save_working_copy(&dir, args["newName"].as_str(), progress).await
        }
        "working_reveal" => {
            let dir = job(field(args, "id")?)?;
            let record = read(&dir)?;
            crate::system::open_in_windows_explorer(
                dir.join("content")
                    .join(field(&record, "name")?)
                    .to_string_lossy()
                    .into_owned(),
                Some(false),
            )?;
            Ok(Value::Null)
        }
        "working_remove" => {
            let id = field(args, "id")?;
            stop_watcher(id);
            let dir = job(id)?;
            let record = read(&dir)?;
            let local = Location::Local(dir.join("content").join(field(&record, "name")?));
            let stamp = optional(&local).await?;
            if stamp
                .as_ref()
                .is_some_and(|s| record["localRevision"].as_str() != Some(&s.revision))
            {
                return Err("[conflict] 工作副本有未回传修改；请先保存或在本地保留，未删除".into());
            }
            // Explicitly addressed, validated owned job only, never a remote
            // or user-selected directory. Links are rejected by local_handle.
            local_handle(&dir)?;
            if std::fs::read_dir(dir.join("content"))
                .map_err(|e| e.to_string())?
                .any(|v| {
                    v.is_err()
                        || v.is_ok_and(|v| {
                            v.file_name() != std::ffi::OsStr::new(record["name"].as_str().unwrap())
                        })
                })
            {
                return Err("[conflict] 工作副本目录还有附加文件，未清理；请先在本地保留".into());
            }
            if let Some(stamp) = stamp {
                if let Location::Local(path) = &local {
                    crate::file_ops::remove_local_transferred_file(
                        progress.app,
                        path,
                        &stamp.revision,
                        &format!("working-{}", random()?),
                        false,
                    )?;
                }
            }
            std::fs::remove_dir(dir.join("content")).map_err(|e| e.to_string())?;
            std::fs::remove_file(dir.join("working-copy.json")).map_err(|e| e.to_string())?;
            std::fs::remove_dir(&dir).map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "document" => {
            let source = Location::parse(field(args, "path")?)?;
            let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
            let (local, stamp) = download(&source, temp.path(), progress).await?;
            let command = field(args, "command")?;
            if command == "rotate_image" {
                crate::system::rotate_image(
                    local.text(),
                    args["degrees"].as_i64().ok_or("Missing degrees")? as i32,
                )?;
                transfer(
                    local,
                    source,
                    false,
                    true,
                    Some(&stamp.revision),
                    None,
                    progress,
                )
                .await?;
                return Ok(Value::Null);
            }
            let result = match command {
                "rtf_to_html" => crate::system::rtf_to_html(local.text()),
                "docx_to_text" => crate::system::docx_to_text(local.text()),
                "read_shortcut" => {
                    return serde_json::to_value(crate::system::read_shortcut(local.text())?)
                        .map_err(|e| e.to_string());
                }
                _ => Err("[unsupported] 未定义的文档操作".into()),
            }?;
            Ok(json!(result))
        }
        _ => Err("[unsupported] 此远端操作尚未接入".into()),
    }
}
