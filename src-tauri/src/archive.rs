use crate::types::*;
use std::io::{BufRead, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::Emitter;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

fn emit_extract_progress(
    app: &tauri::AppHandle,
    src: &str,
    dest: &str,
    transferred: u64,
    total: u64,
    percentage: u32,
    speed: u64,
    status: &str,
) {
    let _ = app.emit(
        "op-progress",
        serde_json::json!({
            "operation": "extract",
            "src": src,
            "dest": dest,
            "bytesTransferred": transferred,
            "totalBytes": total,
            "percentage": percentage,
            "speed": speed,
            "status": status
        }),
    );
}

#[tauri::command(async)]
pub fn list_archive(path: String) -> Result<Vec<ArchiveEntry>, String> {
    let p = PathBuf::from(&path);
    let ext = p
        .extension()
        .map(|e| e.to_string_lossy().into_owned())
        .unwrap_or_default()
        .to_lowercase();
    match ext.as_str() {
        "zip" => list_zip(&p),
        _ => Err("Unsupported archive format".to_string()),
    }
}

fn list_zip(path: &Path) -> Result<Vec<ArchiveEntry>, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    for i in 0..archive.len() {
        let f = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = f.name().to_string();
        entries.push(ArchiveEntry {
            name: name.split('/').last().unwrap_or(&name).to_string(),
            path: name.clone(),
            is_dir: name.ends_with('/'),
            size: f.size(),
            modified: String::new(),
        });
    }
    Ok(entries)
}

#[tauri::command(async)]
pub fn extract_archive(
    path: String,
    dest: String,
    entry_path: Option<String>,
    app: tauri::AppHandle,
    cancel: tauri::State<'_, CancelFlag>,
) -> Result<(), String> {
    *cancel.0.lock().map_err(|e| e.to_string())? = false;
    let p = PathBuf::from(&path);
    let d = PathBuf::from(&dest);
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    let file = std::fs::File::open(&p).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    let mut total = 0u64;
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry_path
            .as_deref()
            .is_none_or(|selected| entry.name() == selected)
        {
            total = total.saturating_add(entry.size());
        }
    }

    emit_extract_progress(&app, &path, &dest, 0, total, 0, 0, "progress");
    let started = std::time::Instant::now();
    let mut last_emit = std::time::Instant::now();
    let mut transferred = 0u64;
    let mut buffer = vec![0u8; 1024 * 1024];

    for i in 0..archive.len() {
        if *cancel.0.lock().map_err(|e| e.to_string())? {
            return Err("Cancelled".to_string());
        }
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry_path
            .as_deref()
            .is_some_and(|selected| entry.name() != selected)
        {
            continue;
        }
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| format!("Unsafe archive path: {}", entry.name()))?
            .to_path_buf();
        let out_path = d.join(relative);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
        loop {
            if *cancel.0.lock().map_err(|e| e.to_string())? {
                let _ = std::fs::remove_file(&out_path);
                return Err("Cancelled".to_string());
            }
            let count = entry.read(&mut buffer).map_err(|e| e.to_string())?;
            if count == 0 {
                break;
            }
            out_file
                .write_all(&buffer[..count])
                .map_err(|e| e.to_string())?;
            transferred = transferred.saturating_add(count as u64);
            let now = std::time::Instant::now();
            if now.duration_since(last_emit).as_millis() >= 100 || transferred >= total {
                last_emit = now;
                let elapsed = started.elapsed().as_secs_f64();
                let speed = if elapsed > 0.0 {
                    (transferred as f64 / elapsed) as u64
                } else {
                    0
                };
                let percentage = if total > 0 {
                    ((transferred.saturating_mul(100) / total).min(99)) as u32
                } else {
                    0
                };
                emit_extract_progress(
                    &app,
                    &path,
                    &dest,
                    transferred,
                    total,
                    percentage,
                    speed,
                    "progress",
                );
            }
        }
        if entry_path.is_some() {
            break;
        }
    }

    emit_extract_progress(&app, &path, &dest, transferred, total, 100, 0, "complete");
    Ok(())
}

#[tauri::command(async)]
pub fn create_archive(sources: Vec<String>, dest: String) -> Result<(), String> {
    let dest_path = PathBuf::from(&dest);
    let file = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;
    let mut zip_writer = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for src in &sources {
        let src_path = PathBuf::from(src);
        if src_path.is_dir() {
            add_dir_to_zip(&mut zip_writer, &src_path, &src_path, &options)?;
        } else {
            let name = src_path.file_name().ok_or("no filename")?.to_string_lossy();
            zip_writer
                .start_file(name.as_ref(), options)
                .map_err(|e| e.to_string())?;
            let mut f = std::fs::File::open(&src_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut zip_writer).map_err(|e| e.to_string())?;
        }
    }
    zip_writer.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn add_dir_to_zip(
    zip_writer: &mut zip::ZipWriter<std::fs::File>,
    base: &Path,
    dir: &Path,
    options: &zip::write::SimpleFileOptions,
) -> Result<(), String> {
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let relative = path.strip_prefix(base).map_err(|e| e.to_string())?;
        let name = relative.to_string_lossy().replace("\\", "/");
        if path.is_dir() {
            zip_writer
                .add_directory(format!("{}/", name), *options)
                .map_err(|e| e.to_string())?;
            add_dir_to_zip(zip_writer, base, &path, options)?;
        } else {
            zip_writer
                .start_file(&name, *options)
                .map_err(|e| e.to_string())?;
            let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, zip_writer).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn find_7z() -> Option<String> {
    let candidates = [
        r"C:\Program Files\7-Zip\7z.exe",
        r"C:\Program Files (x86)\7-Zip\7z.exe",
    ];
    for c in &candidates {
        if Path::new(c).exists() {
            return Some(c.to_string());
        }
    }
    let mut command = std::process::Command::new("where");
    command.arg("7z.exe");
    #[cfg(target_os = "windows")]
    command.creation_flags(0x0800_0000);
    command.output().ok().and_then(|o| {
        if o.status.success() {
            String::from_utf8(o.stdout)
                .ok()
                .map(|s| s.trim().to_string())
        } else {
            None
        }
    })
}

fn percentage_from_7z_line(line: &str) -> Option<u32> {
    let percent_at = line.rfind('%')?;
    let digits: String = line[..percent_at]
        .chars()
        .rev()
        .take_while(|ch| ch.is_ascii_digit() || ch.is_whitespace())
        .filter(|ch| ch.is_ascii_digit())
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    digits.parse::<u32>().ok().map(|value| value.min(100))
}

#[tauri::command(async)]
pub fn extract_7z(
    archive: String,
    dest: String,
    app: tauri::AppHandle,
    cancel: tauri::State<'_, CancelFlag>,
) -> Result<(), String> {
    *cancel.0.lock().map_err(|e| e.to_string())? = false;
    let exe = find_7z().ok_or("7-Zip not installed. Download from 7-zip.org")?;
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    emit_extract_progress(&app, &archive, &dest, 0, 0, 0, 0, "progress");
    let mut command = std::process::Command::new(&exe);
    command
        .args(["x", &archive, &format!("-o{}", dest), "-y", "-bsp1", "-bb0"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(0x0800_0000);
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let (progress_tx, progress_rx) = std::sync::mpsc::channel();
    let progress_reader = child.stdout.take().map(|stdout| {
        std::thread::spawn(move || {
            let mut reader = std::io::BufReader::new(stdout);
            let mut line = Vec::new();
            loop {
                line.clear();
                let count = match reader.read_until(b'\r', &mut line) {
                    Ok(count) => count,
                    Err(_) => break,
                };
                if count == 0 {
                    break;
                }
                if let Some(percentage) = percentage_from_7z_line(&String::from_utf8_lossy(&line)) {
                    let _ = progress_tx.send(percentage.min(99));
                }
            }
        })
    });
    let stderr_reader = child.stderr.take().map(|mut stderr| {
        std::thread::spawn(move || {
            let mut message = String::new();
            let _ = stderr.read_to_string(&mut message);
            message
        })
    });

    let status = loop {
        while let Ok(percentage) = progress_rx.try_recv() {
            emit_extract_progress(&app, &archive, &dest, 0, 0, percentage, 0, "progress");
        }
        if *cancel.0.lock().map_err(|e| e.to_string())? {
            let _ = child.kill();
            let _ = child.wait();
            if let Some(reader) = progress_reader {
                let _ = reader.join();
            }
            if let Some(reader) = stderr_reader {
                let _ = reader.join();
            }
            return Err("Cancelled".to_string());
        }
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    };
    if let Some(reader) = progress_reader {
        let _ = reader.join();
    }
    let stderr = stderr_reader
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default();
    if !status.success() {
        let error = if stderr.trim().is_empty() {
            "7-Zip extraction failed".to_string()
        } else {
            stderr
        };
        return Err(error);
    }
    emit_extract_progress(&app, &archive, &dest, 0, 0, 100, 0, "complete");
    Ok(())
}

#[tauri::command(async)]
pub fn create_7z(sources: Vec<String>, archive: String) -> Result<(), String> {
    let exe = find_7z().ok_or("7-Zip not installed. Download from 7-zip.org")?;
    let mut cmd = std::process::Command::new(&exe);
    cmd.args(["a", &archive, "-mx=5"]);
    for s in &sources {
        cmd.arg(s);
    }
    let output = cmd.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command(async)]
pub fn is_7z_available() -> bool {
    find_7z().is_some()
}

#[cfg(test)]
mod tests {
    use super::percentage_from_7z_line;

    #[test]
    fn parses_7z_progress_lines() {
        assert_eq!(percentage_from_7z_line(" 37% 12 - file.txt"), Some(37));
        assert_eq!(percentage_from_7z_line("Everything is Ok"), None);
    }
}
