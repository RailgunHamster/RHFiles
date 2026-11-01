//! Managed local working copies for programs which require a local filename.
//! Editing never silently becomes a disposable download: changed copies are
//! retained across restarts and can only be committed against the read revision.
use super::*;

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
            if action == "checkout" {
                return Ok(json!({"id":id,"localPath":local.text(),"source":source.text()}));
            }
            let local = local.text();
            let program = args["program"].as_str().unwrap_or("").to_string();
            tokio::task::spawn_blocking(move || match command.as_str() {
                "open_file" => crate::system::open_file(local),
                "open_with_program" => crate::system::open_with_program(local, program),
                "show_open_with_dialog" => crate::system::show_open_with_dialog(local),
                "quicklook" => crate::system::quicklook(local),
                "set_wallpaper" => crate::system::set_wallpaper(local),
                "install_font" => crate::system::install_font(local),
                "install_certificate" => crate::system::install_certificate(local),
                "run_as_admin" => crate::system::run_as_admin(local),
                "reveal_working_copy" => {
                    crate::system::open_in_windows_explorer(local, Some(false))
                }
                _ => Err("[unsupported] 未定义的本地打开方式".into()),
            })
            .await
            .map_err(|e| e.to_string())??;
            Ok(
                json!({"id":id,"localPath":content.join(source.leaf()?).to_string_lossy(),"source":source.text()}),
            )
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
            let mut record = read(&dir)?;
            let original = Location::parse(field(&record, "source")?)?;
            let local = Location::Local(dir.join("content").join(field(&record, "name")?));
            let local_stamp = snapshot(&local).await?;
            let alternate = args["newName"].as_str();
            let target = if let Some(name) = alternate {
                original.parent()?.child(name)?
            } else {
                original.clone()
            };
            hold(&original, progress)?;
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
            write(&dir, &record)?;
            Ok(json!({"saved":true,"path":target.text()}))
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
            let dir = job(field(args, "id")?)?;
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
