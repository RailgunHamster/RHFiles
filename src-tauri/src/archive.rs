use crate::types::*;
use std::path::{Path, PathBuf};

#[tauri::command]
pub fn list_archive(path: String) -> Result<Vec<ArchiveEntry>, String> {
    let p = PathBuf::from(&path);
    let ext = p.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default().to_lowercase();
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

#[tauri::command]
pub fn extract_archive(path: String, dest: String, entry_path: Option<String>) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let d = PathBuf::from(&dest);
    let file = std::fs::File::open(&p).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    if let Some(ep) = entry_path {
        for i in 0..archive.len() {
            let mut f = archive.by_index(i).map_err(|e| e.to_string())?;
            if f.name() == ep {
                let out_path = d.join(f.name().replace('/', "\\"));
                if f.is_dir() {
                    std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
                } else {
                    if let Some(parent) = out_path.parent() {
                        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }
                    let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
                    std::io::copy(&mut f, &mut out_file).map_err(|e| e.to_string())?;
                }
                break;
            }
        }
    } else {
        archive.extract(&d).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
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
            zip_writer.start_file(name.as_ref(), options).map_err(|e| e.to_string())?;
            let mut f = std::fs::File::open(&src_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut zip_writer).map_err(|e| e.to_string())?;
        }
    }
    zip_writer.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn add_dir_to_zip(zip_writer: &mut zip::ZipWriter<std::fs::File>, base: &Path, dir: &Path, options: &zip::write::SimpleFileOptions) -> Result<(), String> {
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let relative = path.strip_prefix(base).map_err(|e| e.to_string())?;
        let name = relative.to_string_lossy().replace("\\", "/");
        if path.is_dir() {
            zip_writer.add_directory(format!("{}/", name), *options).map_err(|e| e.to_string())?;
            add_dir_to_zip(zip_writer, base, &path, options)?;
        } else {
            zip_writer.start_file(&name, *options).map_err(|e| e.to_string())?;
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
    std::process::Command::new("where")
        .arg("7z.exe")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string())
            } else {
                None
            }
        })
}

#[tauri::command]
pub fn extract_7z(archive: String, dest: String) -> Result<(), String> {
    let exe = find_7z().ok_or("7-Zip not installed. Download from 7-zip.org")?;
    let output = std::process::Command::new(&exe)
        .args(["x", &archive, &format!("-o{}", dest), "-y"])
        .output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
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

#[tauri::command]
pub fn is_7z_available() -> bool {
    find_7z().is_some()
}
