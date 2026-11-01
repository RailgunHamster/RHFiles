//! Short-lived native workspaces for existing archive/conversion providers.
//! Only a random handle and validated relative outputs can be published.
use super::*;
use std::sync::{Arc, Mutex, OnceLock};
struct Job {
    directory: tempfile::TempDir,
    sources: Vec<Location>,
    stamps: Vec<Snapshot>,
    leases: Vec<FileLease>,
    expected: Mutex<
        std::collections::HashMap<String, std::collections::HashMap<String, Option<Snapshot>>>,
    >,
}
static JOBS: OnceLock<Mutex<std::collections::HashMap<String, Arc<Job>>>> = OnceLock::new();
fn jobs() -> &'static Mutex<std::collections::HashMap<String, Arc<Job>>> {
    JOBS.get_or_init(Default::default)
}
fn get(args: &Value) -> Result<Arc<Job>, String> {
    let job = jobs()
        .lock()
        .map_err(|e| e.to_string())?
        .get(field(args, "id")?)
        .cloned()
        .ok_or("[not_found] 工作区已关闭，请重新操作")?;
    for lease in &job.leases {
        lease.check()?;
    }
    Ok(job)
}
fn relative(value: &str) -> Result<PathBuf, String> {
    if value.is_empty() || value.starts_with(['/', '\\']) || value.contains(['\\', ':', '\0']) {
        return Err("[invalid_path] 工作区路径无效".into());
    }
    let root = DevicePath::new(&"0".repeat(64), &"0".repeat(64), "/")?;
    let mut path = PathBuf::new();
    for part in value.trim_end_matches('/').split('/') {
        root.child(part)?;
        path.push(part);
    }
    Ok(path)
}
fn nested(root: &Location, tail: &str) -> Result<Location, String> {
    let _ = relative(tail)?;
    let mut path = root.clone();
    for name in tail.trim_end_matches('/').split('/') {
        path = path.child(name)?;
    }
    Ok(path)
}
pub(super) async fn execute(
    action: &str,
    args: &Value,
    progress: &mut Progress<'_>,
) -> Result<Value, String> {
    match action {
        "stage" => {
            if jobs().lock().map_err(|e| e.to_string())?.len() >= 16 {
                return Err("[busy] 临时工作区已满；请关闭正在浏览的压缩包".into());
            }
            let paths = args["paths"]
                .as_array()
                .filter(|v| (!v.is_empty() || args["empty"] == true) && v.len() <= 10000)
                .ok_or("[invalid_request] 工作区输入数量无效")?;
            let mut sources = paths
                .iter()
                .map(|v| Location::parse(v.as_str().ok_or("Invalid source")?))
                .collect::<Result<Vec<_>, String>>()?;
            let all = sources.clone();
            sources.retain(|p| !all.iter().any(|a| a.text() != p.text() && a.contains(p)));
            let mut names = std::collections::HashSet::new();
            for source in &sources {
                if !names.insert(source.leaf()?.to_lowercase()) {
                    return Err(
                        "[conflict] 不同输入具有同名根项目，请分别操作，未合并或覆盖".into(),
                    );
                }
            }
            let directory = tempfile::Builder::new()
                .prefix("rhfiles-device-job-")
                .tempdir()
                .map_err(|e| e.to_string())?;
            let input = directory.path().join("input");
            let output = directory.path().join("output");
            std::fs::create_dir(&input).map_err(|e| e.to_string())?;
            std::fs::create_dir(&output).map_err(|e| e.to_string())?;
            let mut mapped = Vec::new();
            let mut leases = Vec::new();
            let mut stamps = Vec::new();
            for source in &sources {
                hold(source, progress)?;
                if let Location::Remote(p) = source {
                    leases.push(crate::device_groups::connector()?.file_lease(&p.group, &p.peer)?);
                }
                let local = Location::Local(input.join(source.leaf()?));
                let stamp = snapshot(source).await?;
                transfer(
                    source.clone(),
                    local.clone(),
                    false,
                    false,
                    None,
                    Some(&stamp.revision),
                    progress,
                )
                .await?;
                verify_source(source, &stamp).await?;
                stamps.push(stamp);
                mapped.push(json!({"source":source.text(),"localPath":local.text()}));
            }
            let id = random()?;
            let out = json!({"id":id,"inputs":mapped,"output":output.to_string_lossy()});
            let job = Arc::new(Job {
                directory,
                sources,
                stamps,
                leases,
                expected: Mutex::new(Default::default()),
            });
            let mut map = jobs().lock().map_err(|e| e.to_string())?;
            if map.len() >= 16 {
                return Err("[busy] 临时工作区已满，未提交输出".into());
            }
            map.insert(id, job);
            Ok(out)
        }
        "release_stage" => {
            // Removing a handle cannot delete user folders: the directory is
            // the original TempDir, not a renderer-provided filesystem path.
            jobs()
                .lock()
                .map_err(|e| e.to_string())?
                .remove(field(args, "id")?);
            Ok(Value::Null)
        }
        "validate_stage" => {
            let job = get(args)?;
            for (source, stamp) in job.sources.iter().zip(&job.stamps) {
                verify_source(source, stamp).await?;
            }
            Ok(json!({"valid":true}))
        }
        "plan_output" => {
            let job = get(args)?;
            let dest = Location::parse(field(args, "dest")?)?;
            hold(&dest, progress)?;
            let old = optional(&dest).await?;
            if old.as_ref().is_some_and(|v| v.directory)
                || job
                    .sources
                    .iter()
                    .any(|s| s.text().eq_ignore_ascii_case(&dest.text()))
            {
                return Err("[conflict] 不能覆盖文件夹或输入文件".into());
            }
            let id = random()?;
            let mut expected = std::collections::HashMap::new();
            expected.insert(dest.text(), old);
            let mut plans = job.expected.lock().map_err(|e| e.to_string())?;
            if plans.len() >= 64 {
                return Err("[busy] 待确认的输出操作过多".into());
            }
            plans.insert(id.clone(), expected);
            Ok(json!({"planId":id}))
        }
        "inspect_stage" => {
            let job = get(args)?;
            let original = field(args, "source")?;
            let source = job
                .sources
                .iter()
                .find(|s| s.text() == original)
                .ok_or("[invalid_path] 输入不属于此工作区")?;
            let archive = job.directory.path().join("input").join(source.leaf()?);
            let entry = args["entryPath"].as_str().map(str::to_owned);
            let password = args["password"].as_str().map(str::to_owned);
            let entries = tokio::task::spawn_blocking(move || {
                crate::archive::selected_manifest(&archive, entry.as_deref(), password.as_deref())
            })
            .await
            .map_err(|e| e.to_string())??;
            let dest = Location::parse(field(args, "dest")?)?;
            hold(&dest, progress)?;
            let mut conflicts = Vec::new();
            let mut expected = std::collections::HashMap::new();
            for entry in &entries {
                progress.check()?;
                let target = nested(&dest, &entry.path.replace('\\', "/"))?;
                let old = optional(&target).await?;
                let protected = job
                    .sources
                    .iter()
                    .any(|s| s.text().eq_ignore_ascii_case(&target.text()));
                if old.as_ref().is_some_and(|s| !entry.is_dir || !s.directory) || protected {
                    conflicts.push(json!({"entryPath":entry.path,"targetPath":target.text(),"protectedInput":protected}));
                }
                expected.insert(target.text(), old);
            }
            let plan_id = random()?;
            {
                let mut plans = job.expected.lock().map_err(|e| e.to_string())?;
                if plans.len() >= 64 {
                    return Err("[busy] 待确认的解压操作过多，请重新打开压缩包".into());
                }
                plans.insert(plan_id.clone(), expected);
            }
            let password_entry = entries
                .iter()
                .filter(|e| e.encrypted && !e.is_dir)
                .min_by_key(|e| e.size)
                .map(|e| &e.path);
            Ok(json!({"passwordEntry":password_entry,"conflicts":conflicts,"planId":plan_id}))
        }
        "publish_stage" => {
            let job = get(args)?;
            progress.leases.extend(job.leases.iter().cloned());
            let from = job
                .directory
                .path()
                .join("output")
                .join(relative(field(args, "relative")?)?);
            let local = Location::Local(from);
            let dest = Location::parse(field(args, "dest")?)?;
            hold(&dest, progress)?;
            let tree = args["tree"].as_bool().unwrap_or(false);
            let policy = args["overwrite"].as_str().unwrap_or("fail");
            if !["fail", "rename", "replace", "skip"].contains(&policy) {
                return Err("[invalid_request] 冲突策略无效".into());
            }
            if tree && optional(&dest).await?.is_some_and(|s| !s.directory) {
                return Err("[conflict] 解压目标不是文件夹，未覆盖".into());
            }
            let plan = scan(local.clone(), progress).await?;
            let mut targets = Vec::new();
            let expected = job
                .expected
                .lock()
                .map_err(|e| e.to_string())?
                .remove(args["planId"].as_str().unwrap_or(""))
                .unwrap_or_default();
            let mut remapped = Vec::<(String, Location)>::new();
            let mut skipped = Vec::<String>::new();
            for (source, stamp) in &plan {
                if source.text() == local.text() && tree {
                    continue;
                }
                if skipped.iter().any(|p| {
                    source.text() == *p
                        || source
                            .text()
                            .starts_with(&(p.clone() + std::path::MAIN_SEPARATOR_STR))
                }) {
                    continue;
                }
                let tail = if tree {
                    Path::new(&source.text())
                        .strip_prefix(Path::new(&local.text()))
                        .map_err(|e| e.to_string())?
                        .to_string_lossy()
                        .replace('\\', "/")
                } else {
                    String::new()
                };
                let mut target = if tail.is_empty() {
                    dest.clone()
                } else {
                    nested(&dest, &tail)?
                };
                for (prefix, mapped) in remapped.iter().rev() {
                    if let Some(tail) = source
                        .text()
                        .strip_prefix(&(prefix.clone() + std::path::MAIN_SEPARATOR_STR))
                    {
                        target = nested(mapped, &tail.replace('\\', "/"))?;
                        break;
                    }
                }
                let old = optional(&target).await?;
                if stamp.directory && old.as_ref().is_some_and(|s| s.directory) {
                    continue;
                }
                if let Some(old) = old {
                    if policy == "fail" {
                        return Err("[conflict] 输出已存在，未覆盖".into());
                    }
                    if policy == "skip" {
                        if stamp.directory {
                            skipped.push(source.text());
                        }
                        continue;
                    }
                    let protected = job
                        .sources
                        .iter()
                        .any(|s| s.text().eq_ignore_ascii_case(&target.text()));
                    if policy == "replace" && !stamp.directory && !old.directory && !protected {
                        // Only an object present during the real inspection
                        // may be replaced. A new occupant is never authorized.
                        let approved = expected
                            .get(&target.text())
                            .and_then(Option::as_ref)
                            .map(|s| s.revision.as_str());
                        if approved != Some(&old.revision) {
                            return Err("[conflict] 确认期间目标已变化，未覆盖输出".into());
                        }
                        targets.push((source.clone(), target, Some(old)));
                        continue;
                    }
                    if policy == "replace" {
                        return Err("[conflict] 不能替换文件夹或输入压缩包".into());
                    }
                    let leaf = target.leaf()?;
                    let parent = target.parent()?;
                    let mut allocated = None;
                    for index in 1..10000 {
                        let candidate = parent.child(&format!(
                            "{} ({index}){}",
                            Path::new(&leaf)
                                .file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or(&leaf),
                            Path::new(&leaf)
                                .extension()
                                .and_then(|s| s.to_str())
                                .map(|e| format!(".{e}"))
                                .unwrap_or_default()
                        ))?;
                        if optional(&candidate).await?.is_none() {
                            allocated = Some(candidate);
                            break;
                        }
                    }
                    target = allocated.ok_or("[conflict] 无法分配输出名称")?;
                    if stamp.directory {
                        remapped.push((source.text(), target.clone()));
                    }
                }
                targets.push((source.clone(), target, None));
            }
            // The root output directory may not have existed at inspection.
            if tree && optional(&dest).await?.is_none() {
                create_directory(&dest, progress).await?;
            }
            for (source, target, old) in targets {
                progress.check()?;
                if snapshot(&source).await?.directory {
                    create_directory(&target, progress).await?;
                } else {
                    transfer(
                        source,
                        target,
                        false,
                        old.is_some(),
                        old.as_ref().map(|s| s.revision.as_str()),
                        None,
                        progress,
                    )
                    .await?;
                }
            }
            Ok(json!({"path":dest.text()}))
        }
        _ => Err("[unsupported] 临时工作区操作无效".into()),
    }
}
async fn create_directory(path: &Location, progress: &mut Progress<'_>) -> Result<(), String> {
    progress.check()?;
    match path {
        Location::Remote(p) => {
            remote_child(path)?;
            request(
                p,
                FileRequest::Mkdir {
                    path: p.path.clone(),
                },
            )
            .await?;
        }
        Location::Local(p) => {
            local_handle(p.parent().ok_or("Invalid parent")?)?;
            std::fs::create_dir(p).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
