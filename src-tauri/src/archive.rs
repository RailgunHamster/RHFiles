use crate::types::*;
use std::io::{BufRead, Read};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::Emitter;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

struct CancelClearGuard<'a> {
    cancel: &'a CancelFlag,
    operation_id: &'a str,
}

impl Drop for CancelClearGuard<'_> {
    fn drop(&mut self) {
        self.cancel.clear(Some(self.operation_id));
    }
}

fn emit_extract_progress(
    app: &tauri::AppHandle,
    operation_id: &str,
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
            "operationId": operation_id,
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
    let exe = find_7z().ok_or(ARCHIVE_7Z_REQUIRED)?;
    list_archive_with_7z(&exe, &p)
}

#[tauri::command(async)]
pub fn extract_archive(
    path: String,
    dest: String,
    entry_path: Option<String>,
    operation_id: Option<String>,
    app: tauri::AppHandle,
    cancel: tauri::State<'_, CancelFlag>,
) -> Result<(), String> {
    let operation_id = operation_id.unwrap_or_else(|| "legacy".to_string());
    cancel.reset(Some(&operation_id))?;
    let _cancel_clear = CancelClearGuard {
        cancel: &cancel,
        operation_id: &operation_id,
    };
    let entry = entry_path.as_deref().map(sanitize_7z_entry).transpose()?;
    let exe = find_7z().ok_or(ARCHIVE_7Z_REQUIRED)?;
    run_7z_extraction(&exe, &path, &dest, entry, &operation_id, &app, &cancel)
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

/// All archive extraction and browsing goes through 7-Zip: it covers far more
/// formats than the built-in `zip` crate (7z, RAR, cab, ISO, …), reads split
/// ZIP volumes (`name.z01` … `name.zip`) that the crate cannot, and restores
/// timestamps. The portable build bundles `7z.exe` + `7z.dll` next to
/// RHFiles.exe, so the message below only appears when that pair was removed
/// and no system 7-Zip is installed.
const ARCHIVE_7Z_REQUIRED: &str =
    "7-Zip not found. Keep the bundled 7z.exe beside RHFiles.exe, or install 7-Zip from 7-zip.org";

/// 7-Zip treats extract filters as wildcard patterns and leading `-`/`@` as
/// switches, so refuse entry names that cannot be passed through literally.
fn sanitize_7z_entry(entry: &str) -> Result<&str, String> {
    if entry.is_empty() {
        return Err("Empty archive entry name".to_string());
    }
    if entry.chars().any(|c| c == '*' || c == '?') {
        return Err(format!("Unsupported characters in archive entry: {entry}"));
    }
    if entry.starts_with('-') || entry.starts_with('@') {
        return Err(format!("Unsupported archive entry name: {entry}"));
    }
    Ok(entry)
}

fn make_7z_entry(path: String, is_dir: bool, size: u64, modified: &str) -> ArchiveEntry {
    let name = path
        .rsplit(|c| c == '/' || c == '\\')
        .next()
        .unwrap_or(&path)
        .to_string();
    ArchiveEntry {
        name,
        path,
        is_dir,
        size,
        modified: modified.to_string(),
    }
}

/// Parse the blocks emitted by `7z l -slt -ba` (fields as `Key = value` lines,
/// one blank-line-separated block per entry, folders flagged `Folder = +`).
fn parse_7z_listing(text: &str) -> Result<Vec<ArchiveEntry>, String> {
    let mut entries = Vec::new();
    let mut path: Option<String> = None;
    let mut is_dir = false;
    let mut size = 0u64;
    let mut modified = String::new();
    for line in text.lines() {
        let line = line.trim_end_matches('\r');
        if let Some(value) = line.strip_prefix("Path = ") {
            if let Some(existing) = path.take() {
                entries.push(make_7z_entry(existing, is_dir, size, &modified));
            }
            path = Some(value.to_string());
            is_dir = false;
            size = 0;
            modified.clear();
        } else if path.is_some() {
            if let Some(value) = line.strip_prefix("Folder = ") {
                is_dir = value.trim() == "+" || value.trim() == "1";
            } else if let Some(value) = line.strip_prefix("Size = ") {
                size = value.trim().parse().unwrap_or(0);
            } else if let Some(value) = line.strip_prefix("Modified = ") {
                modified = value.trim().to_string();
            }
        }
    }
    if let Some(existing) = path.take() {
        entries.push(make_7z_entry(existing, is_dir, size, &modified));
    }
    if entries.is_empty() {
        return Err("7-Zip returned no archive entries".to_string());
    }
    Ok(entries)
}

fn list_archive_with_7z(exe: &str, path: &Path) -> Result<Vec<ArchiveEntry>, String> {
    let mut command = std::process::Command::new(exe);
    command
        .arg("l")
        .args(["-slt", "-ba", "-sccUTF-8"])
        .arg(path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(0x0800_0000);
    let output = command.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if error.is_empty() {
            "7-Zip listing failed".to_string()
        } else {
            error
        });
    }
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    parse_7z_listing(&stdout)
}

/// Shared 7-Zip extraction used both by the explicit `extract_7z` command and
/// as the fallback for split ZIP archives. `entry` optionally restricts the
/// extraction to a single archive member (wildcard-safe names only).
fn run_7z_extraction(
    exe: &str,
    archive: &str,
    dest: &str,
    entry: Option<&str>,
    operation_id: &str,
    app: &tauri::AppHandle,
    cancel: &CancelFlag,
) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    emit_extract_progress(app, operation_id, archive, dest, 0, 0, 0, 0, "progress");
    let mut command = std::process::Command::new(exe);
    command.arg("x").arg(archive);
    if let Some(entry) = entry {
        command.arg(entry);
    }
    command
        .arg(format!("-o{dest}"))
        .args(["-y", "-p", "-bsp1", "-bb0"])
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
            emit_extract_progress(
                app,
                operation_id,
                archive,
                dest,
                0,
                0,
                percentage,
                0,
                "progress",
            );
        }
        if cancel.is_cancelled(Some(operation_id))? {
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
    emit_extract_progress(app, operation_id, archive, dest, 0, 0, 100, 0, "complete");
    cancel.clear(Some(operation_id));
    Ok(())
}

fn find_7z() -> Option<String> {
    // Prefer the copy bundled with RHFiles: portable builds keep 7z.exe and
    // its engine 7z.dll next to RHFiles.exe. Both must exist, 7z.exe alone
    // cannot run.
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(dir) = current_exe.parent() {
            let bundled = dir.join("7z.exe");
            if bundled.is_file() && dir.join("7z.dll").is_file() {
                return Some(bundled.to_string_lossy().into_owned());
            }
        }
    }
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
    operation_id: Option<String>,
    app: tauri::AppHandle,
    cancel: tauri::State<'_, CancelFlag>,
) -> Result<(), String> {
    let operation_id = operation_id.unwrap_or_else(|| "legacy".to_string());
    cancel.reset(Some(&operation_id))?;
    let _cancel_clear = CancelClearGuard {
        cancel: &cancel,
        operation_id: &operation_id,
    };
    let exe = find_7z().ok_or(ARCHIVE_7Z_REQUIRED)?;
    run_7z_extraction(&exe, &archive, &dest, None, &operation_id, &app, &cancel)
}

#[tauri::command(async)]
pub fn create_7z(sources: Vec<String>, archive: String) -> Result<(), String> {
    let exe = find_7z().ok_or(ARCHIVE_7Z_REQUIRED)?;
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
    use super::{
        find_7z, list_archive_with_7z, make_7z_entry, parse_7z_listing, percentage_from_7z_line,
        sanitize_7z_entry,
    };
    use std::path::PathBuf;

    fn test_dir(unique: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "rhfiles-archive-{}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("create archive test directory");
        dir
    }

    #[test]
    fn parses_7z_progress_lines() {
        assert_eq!(percentage_from_7z_line(" 37% 12 - file.txt"), Some(37));
        assert_eq!(percentage_from_7z_line("Everything is Ok"), None);
    }

    #[test]
    fn sanitize_7z_entry_rejects_wildcards_and_switches() {
        assert_eq!(sanitize_7z_entry("vamzhb/VaM.exe"), Ok("vamzhb/VaM.exe"));
        assert_eq!(sanitize_7z_entry("vamzhb\\VaM.exe"), Ok("vamzhb\\VaM.exe"));
        assert!(sanitize_7z_entry("file*.txt").is_err());
        assert!(sanitize_7z_entry("file?.txt").is_err());
        assert!(sanitize_7z_entry("-switch").is_err());
        assert!(sanitize_7z_entry("@list").is_err());
        assert!(sanitize_7z_entry("").is_err());
    }

    #[test]
    fn make_7z_entry_derives_display_name() {
        let entry = make_7z_entry("vamzhb\\AddonPackages\\pack.var".to_string(), false, 2245, "");
        assert_eq!(entry.name, "pack.var");
        assert_eq!(entry.path, "vamzhb\\AddonPackages\\pack.var");
        assert!(!entry.is_dir);
        assert_eq!(entry.size, 2245);
    }

    #[test]
    fn parses_7z_listing_blocks() {
        let text = "Path = vamzhb\r\n\
                    Folder = +\r\n\
                    Size = 0\r\n\
                    Modified = 2026-05-27 22:40:05.8123076\r\n\
                    Attributes = D\r\n\
                    \r\n\
                    Path = vamzhb\\AddonPackages\\04_PG.FollowMe.1.var\r\n\
                    Folder = -\r\n\
                    Size = 2245\r\n\
                    Modified = 2026-05-27 01:23:03.4778233\r\n\
                    Attributes = A\r\n\
                    \r\n";
        let entries = parse_7z_listing(text).expect("parse listing");
        assert_eq!(entries.len(), 2);
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].name, "vamzhb");
        assert_eq!(entries[0].modified, "2026-05-27 22:40:05.8123076");
        assert!(!entries[1].is_dir);
        assert_eq!(entries[1].name, "04_PG.FollowMe.1.var");
        assert_eq!(entries[1].path, "vamzhb\\AddonPackages\\04_PG.FollowMe.1.var");
        assert_eq!(entries[1].size, 2245);
    }

    #[test]
    fn parse_7z_listing_requires_entries() {
        assert!(parse_7z_listing("").is_err());
        assert!(parse_7z_listing("Listing archive: demo.zip\n\nError: no entries").is_err());
    }

    #[test]
    fn lists_plain_zip_with_7z() {
        let Some(exe) = find_7z() else {
            return;
        };
        let dir = test_dir("plain-list");
        let archive = dir.join("plain.zip");
        let mut writer = zip::ZipWriter::new(std::fs::File::create(&archive).expect("create zip"));
        writer
            .start_file("hello.txt", zip::write::SimpleFileOptions::default())
            .expect("start entry");
        std::io::Write::write_all(&mut writer, b"RHFiles plain zip probe").expect("write entry");
        writer.finish().expect("finish zip");
        let entries = list_archive_with_7z(&exe, &archive).expect("list plain zip with 7-Zip");
        assert!(
            entries
                .iter()
                .any(|e| e.path == "hello.txt" && e.size == b"RHFiles plain zip probe".len() as u64),
            "unexpected entries: {:?}",
            entries
                .iter()
                .map(|e| (e.path.as_str(), e.size))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn lists_split_zip_volumes_with_7z() {
        let Some(exe) = find_7z() else {
            return;
        };
        let dir = test_dir("split-list");
        let full = dir.join("full.zip");
        let mut writer = zip::ZipWriter::new(std::fs::File::create(&full).expect("create zip"));
        let options = zip::write::SimpleFileOptions::default();
        writer
            .start_file("nested/hello.txt", options)
            .expect("start entry");
        std::io::Write::write_all(&mut writer, b"RHFiles split zip probe").expect("write entry");
        writer.finish().expect("finish zip");
        let bytes = std::fs::read(&full).expect("read zip");

        // Convert the single-volume zip into a two-volume split set the way
        // real splitters (WinRAR/Bandizip) do: volume 1 holds the local entry
        // data, the last volume holds the central directory plus zip64 records
        // whose offsets are relative to the last volume's own start.
        let eocd_pos = bytes.len() - 22;
        let entries_total =
            u16::from_le_bytes([bytes[eocd_pos + 10], bytes[eocd_pos + 11]]) as u64;
        let cd_size = u32::from_le_bytes([
            bytes[eocd_pos + 12],
            bytes[eocd_pos + 13],
            bytes[eocd_pos + 14],
            bytes[eocd_pos + 15],
        ]) as u64;
        let cd_offset = u32::from_le_bytes([
            bytes[eocd_pos + 16],
            bytes[eocd_pos + 17],
            bytes[eocd_pos + 18],
            bytes[eocd_pos + 19],
        ]) as usize;
        let cut = cd_offset;

        std::fs::write(dir.join("probe.z01"), &bytes[..cut]).expect("write first volume");

        let mut zip: Vec<u8> = Vec::new();
        zip.extend_from_slice(&bytes[cut..eocd_pos]);
        let mut z64 = [0u8; 56];
        z64[0..4].copy_from_slice(&[0x50, 0x4B, 0x06, 0x06]);
        z64[4..12].copy_from_slice(&44u64.to_le_bytes());
        z64[12..14].copy_from_slice(&45u16.to_le_bytes());
        z64[14..16].copy_from_slice(&45u16.to_le_bytes());
        z64[16..20].copy_from_slice(&1u32.to_le_bytes());
        z64[20..24].copy_from_slice(&1u32.to_le_bytes());
        z64[24..32].copy_from_slice(&entries_total.to_le_bytes());
        z64[32..40].copy_from_slice(&entries_total.to_le_bytes());
        z64[40..48].copy_from_slice(&cd_size.to_le_bytes());
        z64[48..56].copy_from_slice(&0u64.to_le_bytes());
        zip.extend_from_slice(&z64);
        let mut locator = [0u8; 20];
        locator[0..4].copy_from_slice(&[0x50, 0x4B, 0x06, 0x07]);
        locator[4..8].copy_from_slice(&1u32.to_le_bytes());
        locator[8..16].copy_from_slice(&((eocd_pos - cut) as u64).to_le_bytes());
        locator[16..20].copy_from_slice(&2u32.to_le_bytes());
        zip.extend_from_slice(&locator);
        let mut eocd = [0u8; 22];
        eocd.copy_from_slice(&bytes[eocd_pos..]);
        eocd[4..6].copy_from_slice(&1u16.to_le_bytes());
        eocd[6..8].copy_from_slice(&1u16.to_le_bytes());
        eocd[16..20].copy_from_slice(&u32::MAX.to_le_bytes());
        zip.extend_from_slice(&eocd);
        std::fs::write(dir.join("probe.zip"), &zip).expect("write last volume");

        let entries =
            list_archive_with_7z(&exe, &dir.join("probe.zip")).expect("list split zip with 7-Zip");
        let probe = b"RHFiles split zip probe";
        assert!(
            entries.iter().any(|e| {
                e.path.replace('\\', "/") == "nested/hello.txt" && e.size == probe.len() as u64
            }),
            "unexpected entries: {:?}",
            entries
                .iter()
                .map(|e| (e.path.as_str(), e.size))
                .collect::<Vec<_>>()
        );
    }
}
