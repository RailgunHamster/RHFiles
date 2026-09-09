use crate::types::CancelFlag;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegStatus {
    available: bool,
    path: Option<String>,
    version: Option<String>,
    source: Option<&'static str>,
    error: Option<String>,
}

#[derive(Debug, Clone)]
struct FfmpegExecutable {
    command: PathBuf,
    display_path: String,
    source: &'static str,
    version: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaConversionOptions {
    input_path: String,
    output_path: String,
    media_kind: String,
    output_format: String,
    #[serde(default)]
    video_codec: String,
    #[serde(default)]
    quality: u8,
    #[serde(default)]
    preset: String,
    #[serde(default)]
    resolution: String,
    #[serde(default)]
    audio_bitrate: String,
    #[serde(default)]
    sample_rate: String,
    #[serde(default)]
    channels: String,
    #[serde(default)]
    image_width: String,
    #[serde(default)]
    overwrite: bool,
}

struct CancelClearGuard<'a> {
    flag: &'a CancelFlag,
    operation_id: &'a str,
}

impl Drop for CancelClearGuard<'_> {
    fn drop(&mut self) {
        self.flag.clear(Some(self.operation_id));
    }
}

fn silent_command(path: &Path) -> Command {
    let mut command = Command::new(path);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

fn ffmpeg_version(path: &Path) -> Result<String, String> {
    let output = silent_command(path)
        .arg("-version")
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("FFmpeg could not be started: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "FFmpeg version check failed (exit code {})",
            output
                .status
                .code()
                .map_or_else(|| "unknown".to_string(), |code| code.to_string())
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().next().unwrap_or("FFmpeg").trim().to_string())
}

fn configured_executable(raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw.trim().trim_matches('"'));
    if !path.is_file() {
        return Err(format!(
            "The configured FFmpeg executable does not exist: {raw}"
        ));
    }
    Ok(path)
}

fn resolve_ffmpeg(
    app: &tauri::AppHandle,
    configured_path: Option<&str>,
) -> Result<FfmpegExecutable, String> {
    if let Some(raw) = configured_path.filter(|value| !value.trim().is_empty()) {
        let path = configured_executable(raw)?;
        let version = ffmpeg_version(&path)?;
        return Ok(FfmpegExecutable {
            display_path: path.to_string_lossy().into_owned(),
            command: path,
            source: "configured",
            version,
        });
    }

    let mut candidates = Vec::<(&'static str, PathBuf)>::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(("bundled", resource_dir.join("ffmpeg.exe")));
        candidates.push((
            "bundled",
            resource_dir.join("thirdparty").join("ffmpeg.exe"),
        ));
    }
    if let Ok(current_exe) = std::env::current_exe()
        && let Some(directory) = current_exe.parent()
    {
        candidates.push(("portable", directory.join("ffmpeg.exe")));
        candidates.push(("portable", directory.join("thirdparty").join("ffmpeg.exe")));
    }
    if cfg!(debug_assertions) {
        candidates.push((
            "development",
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("thirdparty")
                .join("ffmpeg.exe"),
        ));
    }
    for (source, path) in candidates {
        if !path.is_file() {
            continue;
        }
        if let Ok(version) = ffmpeg_version(&path) {
            return Ok(FfmpegExecutable {
                display_path: path.to_string_lossy().into_owned(),
                command: path,
                source,
                version,
            });
        }
    }

    let path_command = PathBuf::from("ffmpeg");
    let version = ffmpeg_version(&path_command).map_err(|error| {
        format!(
            "FFmpeg was not found beside RHFiles or in PATH. Configure ffmpeg.exe in Settings. {error}"
        )
    })?;
    Ok(FfmpegExecutable {
        command: path_command,
        display_path: "ffmpeg (PATH)".to_string(),
        source: "path",
        version,
    })
}

#[tauri::command(async)]
pub fn detect_ffmpeg(app: tauri::AppHandle, configured_path: Option<String>) -> FfmpegStatus {
    match resolve_ffmpeg(&app, configured_path.as_deref()) {
        Ok(executable) => FfmpegStatus {
            available: true,
            path: Some(executable.display_path),
            version: Some(executable.version),
            source: Some(executable.source),
            error: None,
        },
        Err(error) => FfmpegStatus {
            available: false,
            path: None,
            version: None,
            source: None,
            error: Some(error),
        },
    }
}

fn parse_duration_seconds(text: &str) -> Option<f64> {
    let marker = "Duration: ";
    let start = text.find(marker)? + marker.len();
    let value = text[start..].split(',').next()?.trim();
    let mut parts = value.split(':');
    let hours = parts.next()?.parse::<f64>().ok()?;
    let minutes = parts.next()?.parse::<f64>().ok()?;
    let seconds = parts.next()?.parse::<f64>().ok()?;
    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

fn probe_duration(executable: &Path, input: &Path) -> Option<f64> {
    let output = silent_command(executable)
        .args(["-hide_banner", "-i"])
        .arg(input)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .ok()?;
    parse_duration_seconds(&String::from_utf8_lossy(&output.stderr))
}

fn normalize_format(raw: &str) -> String {
    raw.trim()
        .trim_start_matches('.')
        .to_ascii_lowercase()
        .replace("jpeg", "jpg")
}

fn validated_choice<'a>(value: &'a str, allowed: &[&str], fallback: &'a str) -> &'a str {
    if allowed.contains(&value) {
        value
    } else {
        fallback
    }
}

fn quality_to_crf(quality: u8) -> u8 {
    let quality = quality.clamp(1, 100) as f32;
    (38.0 - quality * 0.22).round().clamp(16.0, 38.0) as u8
}

fn image_quality_to_qscale(quality: u8) -> u8 {
    let quality = quality.clamp(1, 100) as f32;
    (31.0 - quality * 0.29).round().clamp(2.0, 31.0) as u8
}

fn append_video_args(
    options: &MediaConversionOptions,
    args: &mut Vec<String>,
) -> Result<(), String> {
    const FORMATS: &[&str] = &["mp4", "mkv", "mov", "avi", "webm", "gif"];
    let format = normalize_format(&options.output_format);
    if !FORMATS.contains(&format.as_str()) {
        return Err(format!("Unsupported video output format: {format}"));
    }
    let height = validated_choice(
        options.resolution.as_str(),
        &["original", "2160", "1080", "720", "480"],
        "original",
    );
    if format == "gif" {
        let mut filters = vec!["fps=15".to_string()];
        if height != "original" {
            filters.push(format!("scale=-2:min({height}\\,ih):flags=lanczos"));
        }
        args.extend(["-vf".to_string(), filters.join(",")]);
        args.push("-an".to_string());
        return Ok(());
    }

    let requested_codec = validated_choice(
        options.video_codec.as_str(),
        &["auto", "h264", "h265", "vp9"],
        "auto",
    );
    let codec = match requested_codec {
        "h264" => "libx264",
        "h265" => "libx265",
        "vp9" => "libvpx-vp9",
        _ if format == "webm" => "libvpx-vp9",
        _ => "libx264",
    };
    if format == "webm" && !matches!(requested_codec, "auto" | "vp9") {
        return Err("WebM output currently supports the automatic or VP9 codec".to_string());
    }
    args.extend(["-c:v".to_string(), codec.to_string()]);
    let crf = quality_to_crf(if options.quality == 0 {
        72
    } else {
        options.quality
    });
    args.extend(["-crf".to_string(), crf.to_string()]);
    if codec == "libvpx-vp9" {
        args.extend(["-b:v".to_string(), "0".to_string()]);
    } else {
        let preset = validated_choice(
            options.preset.as_str(),
            &["ultrafast", "fast", "medium", "slow", "veryslow"],
            "medium",
        );
        args.extend(["-preset".to_string(), preset.to_string()]);
        args.extend(["-pix_fmt".to_string(), "yuv420p".to_string()]);
    }
    if height != "original" {
        args.extend(["-vf".to_string(), format!("scale=-2:min({height}\\,ih)")]);
    }
    let bitrate = validated_choice(
        options.audio_bitrate.as_str(),
        &["96k", "128k", "192k", "256k", "320k"],
        "192k",
    );
    if format == "webm" {
        args.extend(["-c:a".to_string(), "libopus".to_string()]);
    } else {
        args.extend(["-c:a".to_string(), "aac".to_string()]);
    }
    args.extend(["-b:a".to_string(), bitrate.to_string()]);
    Ok(())
}

fn append_audio_args(
    options: &MediaConversionOptions,
    args: &mut Vec<String>,
) -> Result<(), String> {
    let format = normalize_format(&options.output_format);
    let codec = match format.as_str() {
        "mp3" => "libmp3lame",
        "wav" => "pcm_s16le",
        "flac" => "flac",
        "aac" | "m4a" => "aac",
        "ogg" => "libvorbis",
        "opus" => "libopus",
        _ => return Err(format!("Unsupported audio output format: {format}")),
    };
    args.extend(["-vn".to_string(), "-c:a".to_string(), codec.to_string()]);
    if !matches!(format.as_str(), "wav" | "flac") {
        let bitrate = validated_choice(
            options.audio_bitrate.as_str(),
            &["96k", "128k", "192k", "256k", "320k"],
            "192k",
        );
        args.extend(["-b:a".to_string(), bitrate.to_string()]);
    }
    let sample_rate = validated_choice(
        options.sample_rate.as_str(),
        &["original", "44100", "48000"],
        "original",
    );
    if sample_rate != "original" {
        args.extend(["-ar".to_string(), sample_rate.to_string()]);
    }
    match options.channels.as_str() {
        "mono" => args.extend(["-ac".to_string(), "1".to_string()]),
        "stereo" => args.extend(["-ac".to_string(), "2".to_string()]),
        _ => {}
    }
    Ok(())
}

fn append_image_args(
    options: &MediaConversionOptions,
    args: &mut Vec<String>,
) -> Result<(), String> {
    let format = normalize_format(&options.output_format);
    if !["png", "jpg", "webp", "bmp", "tiff", "avif"].contains(&format.as_str()) {
        return Err(format!("Unsupported image output format: {format}"));
    }
    args.extend(["-frames:v".to_string(), "1".to_string()]);
    let quality = if options.quality == 0 {
        82
    } else {
        options.quality.clamp(1, 100)
    };
    match format.as_str() {
        "jpg" => args.extend([
            "-q:v".to_string(),
            image_quality_to_qscale(quality).to_string(),
        ]),
        "webp" => args.extend(["-quality".to_string(), quality.to_string()]),
        "avif" => args.extend([
            "-c:v".to_string(),
            "libaom-av1".to_string(),
            "-crf".to_string(),
            quality_to_crf(quality).to_string(),
        ]),
        "png" => {
            let compression = ((100 - quality) as f32 / 100.0 * 9.0).round() as u8;
            args.extend(["-compression_level".to_string(), compression.to_string()]);
        }
        _ => {}
    }
    let width = validated_choice(
        options.image_width.as_str(),
        &["original", "3840", "2560", "1920", "1280", "800"],
        "original",
    );
    if width != "original" {
        args.extend(["-vf".to_string(), format!("scale=min({width}\\,iw):-2")]);
    }
    Ok(())
}

fn conversion_args(options: &MediaConversionOptions) -> Result<Vec<String>, String> {
    let mut args = Vec::new();
    match options.media_kind.as_str() {
        "video" => append_video_args(options, &mut args)?,
        "audio" => append_audio_args(options, &mut args)?,
        "image" => append_image_args(options, &mut args)?,
        kind => return Err(format!("Unsupported conversion category: {kind}")),
    }
    Ok(args)
}

fn emit_conversion_progress(
    app: &tauri::AppHandle,
    operation_id: &str,
    input: &Path,
    output: &Path,
    percentage: u32,
    output_bytes: u64,
    speed: u64,
    status: &str,
) {
    let current_name = output
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let _ = app.emit(
        "op-progress",
        serde_json::json!({
            "operationId": operation_id,
            "operation": "convert",
            "src": input.to_string_lossy(),
            "dest": output.to_string_lossy(),
            "currentPath": output.to_string_lossy(),
            "currentName": current_name,
            "bytesTransferred": output_bytes,
            "totalBytes": 0,
            "percentage": percentage,
            "speed": speed,
            "status": status,
        }),
    );
}

fn bounded_error(stderr: String) -> String {
    const LIMIT: usize = 7000;
    let trimmed = stderr.trim();
    if trimmed.len() <= LIMIT {
        return trimmed.to_string();
    }
    let mut start = trimmed.len() - LIMIT;
    while !trimmed.is_char_boundary(start) {
        start += 1;
    }
    format!("…{}", &trimmed[start..])
}

fn sidecar_path(output: &Path, operation_id: &str, role: &str) -> Result<PathBuf, String> {
    let parent = output.parent().filter(|path| !path.as_os_str().is_empty());
    let directory = parent.unwrap_or_else(|| Path::new("."));
    let stem = output
        .file_stem()
        .map(|value| value.to_string_lossy().into_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "output".to_string());
    let extension = output
        .extension()
        .map(|value| value.to_string_lossy().into_owned())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "The conversion output must have a file extension".to_string())?;
    let token = operation_id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .take(72)
        .collect::<String>();
    let token = if token.is_empty() {
        "operation"
    } else {
        &token
    };
    for suffix in 0..1000u16 {
        let counter = if suffix == 0 {
            String::new()
        } else {
            format!("-{suffix}")
        };
        let candidate = directory.join(format!(
            ".{stem}.rhfiles-{role}-{token}{counter}.{extension}"
        ));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err(format!(
        "Unable to reserve a temporary conversion file beside {}",
        output.display()
    ))
}

fn commit_converted_file(
    temporary: &Path,
    output: &Path,
    overwrite: bool,
    operation_id: &str,
) -> Result<(), String> {
    if !temporary.is_file() {
        return Err("FFmpeg completed without creating an output file".to_string());
    }
    if !output.exists() {
        return std::fs::rename(temporary, output).map_err(|error| {
            let _ = std::fs::remove_file(temporary);
            format!("Unable to finish the converted file: {error}")
        });
    }
    if !overwrite {
        let _ = std::fs::remove_file(temporary);
        return Err(format!(
            "The output file appeared while converting and was not replaced: {}",
            output.display()
        ));
    }
    if !output.is_file() {
        let _ = std::fs::remove_file(temporary);
        return Err(format!(
            "The conversion target is not a regular file: {}",
            output.display()
        ));
    }

    let backup = match sidecar_path(output, operation_id, "backup") {
        Ok(path) => path,
        Err(error) => {
            let _ = std::fs::remove_file(temporary);
            return Err(error);
        }
    };
    std::fs::rename(output, &backup).map_err(|error| {
        let _ = std::fs::remove_file(temporary);
        format!("Unable to preserve the existing output before replacement: {error}")
    })?;
    match std::fs::rename(temporary, output) {
        Ok(()) => {
            let _ = std::fs::remove_file(backup);
            Ok(())
        }
        Err(error) => match std::fs::rename(&backup, output) {
            Ok(()) => {
                let _ = std::fs::remove_file(temporary);
                Err(format!(
                    "Unable to replace the output; the original file was restored: {error}"
                ))
            }
            Err(restore_error) => Err(format!(
                "Unable to replace the output ({error}) and unable to restore the original ({restore_error}). The original is preserved at {}",
                backup.display()
            )),
        },
    }
}

#[tauri::command(async)]
pub fn convert_media(
    app: tauri::AppHandle,
    cancel: tauri::State<'_, CancelFlag>,
    options: MediaConversionOptions,
    configured_ffmpeg_path: Option<String>,
    operation_id: String,
) -> Result<String, String> {
    cancel.reset(Some(&operation_id))?;
    let _cancel_guard = CancelClearGuard {
        flag: &cancel,
        operation_id: &operation_id,
    };

    let executable = resolve_ffmpeg(&app, configured_ffmpeg_path.as_deref())?;
    let input = PathBuf::from(options.input_path.trim());
    let output = PathBuf::from(options.output_path.trim());
    if !input.is_file() {
        return Err(format!("Input file does not exist: {}", input.display()));
    }
    if input
        .to_string_lossy()
        .eq_ignore_ascii_case(&output.to_string_lossy())
    {
        return Err("The output path must be different from the input path".to_string());
    }
    let expected_extension = normalize_format(&options.output_format);
    let output_extension = normalize_format(
        &output
            .extension()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_default(),
    );
    if output_extension != expected_extension {
        return Err(format!(
            "The output extension .{output_extension} does not match the selected format .{expected_extension}"
        ));
    }
    if output.exists() && !options.overwrite {
        return Err(format!(
            "The output file already exists: {}. Enable overwrite or choose another name.",
            output.display()
        ));
    }
    if output.exists() && !output.is_file() {
        return Err(format!(
            "The conversion target is not a regular file: {}",
            output.display()
        ));
    }
    if let Some(parent) = output.parent().filter(|path| !path.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Unable to create the output folder: {error}"))?;
    }
    let temporary_output = sidecar_path(&output, &operation_id, "partial")?;

    let duration = probe_duration(&executable.command, &input);
    let mut args = vec![
        "-hide_banner".to_string(),
        "-nostdin".to_string(),
        "-n".to_string(),
        "-i".to_string(),
        input.to_string_lossy().into_owned(),
    ];
    args.extend(conversion_args(&options)?);
    args.extend([
        "-progress".to_string(),
        "pipe:1".to_string(),
        "-nostats".to_string(),
        temporary_output.to_string_lossy().into_owned(),
    ]);

    let mut command = silent_command(&executable.command);
    command
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("Unable to start FFmpeg: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Unable to read FFmpeg progress".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Unable to read FFmpeg errors".to_string())?;
    let (progress_sender, progress_receiver) = mpsc::channel::<String>();
    let progress_reader = thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = progress_sender.send(line);
        }
    });
    let error_reader = thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut value = String::new();
        let _ = reader.read_to_string(&mut value);
        value
    });

    let started = Instant::now();
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let mut last_bytes = 0u64;
    let mut last_bytes_at = started;
    let mut out_time_seconds = 0.0f64;
    emit_conversion_progress(&app, &operation_id, &input, &output, 0, 0, 0, "preparing");

    let exit_status = loop {
        while let Ok(line) = progress_receiver.try_recv() {
            if let Some(raw) = line
                .strip_prefix("out_time_us=")
                .or_else(|| line.strip_prefix("out_time_ms="))
                && let Ok(value) = raw.parse::<f64>()
            {
                out_time_seconds = value / 1_000_000.0;
            }
        }
        if cancel.is_cancelled(Some(&operation_id))? {
            let _ = child.kill();
            let _ = child.wait();
            let _ = std::fs::remove_file(&temporary_output);
            emit_conversion_progress(&app, &operation_id, &input, &output, 0, 0, 0, "cancelled");
            let _ = progress_reader.join();
            let _ = error_reader.join();
            return Err("Cancelled".to_string());
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {}
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = std::fs::remove_file(&temporary_output);
                let _ = progress_reader.join();
                let _ = error_reader.join();
                emit_conversion_progress(&app, &operation_id, &input, &output, 0, 0, 0, "failed");
                return Err(format!("Unable to monitor FFmpeg: {error}"));
            }
        }
        if last_emit.elapsed() >= Duration::from_millis(140) {
            let now = Instant::now();
            let output_bytes = temporary_output
                .metadata()
                .map(|meta| meta.len())
                .unwrap_or(0);
            let interval = now.duration_since(last_bytes_at).as_secs_f64();
            let speed = if interval > 0.0 {
                (output_bytes.saturating_sub(last_bytes) as f64 / interval) as u64
            } else {
                0
            };
            last_bytes = output_bytes;
            last_bytes_at = now;
            let percentage = duration
                .filter(|value| *value > 0.0)
                .map(|value| (out_time_seconds / value * 100.0).clamp(0.0, 99.0) as u32)
                .unwrap_or(0);
            emit_conversion_progress(
                &app,
                &operation_id,
                &input,
                &output,
                percentage,
                output_bytes,
                speed,
                "progress",
            );
            last_emit = now;
        }
        thread::sleep(Duration::from_millis(35));
    };

    let _ = progress_reader.join();
    let stderr = error_reader.join().unwrap_or_default();
    if !exit_status.success() {
        let _ = std::fs::remove_file(&temporary_output);
        let detail = bounded_error(stderr);
        emit_conversion_progress(&app, &operation_id, &input, &output, 0, 0, 0, "failed");
        return Err(if detail.is_empty() {
            format!(
                "FFmpeg conversion failed with exit code {}",
                exit_status
                    .code()
                    .map_or_else(|| "unknown".to_string(), |code| code.to_string())
            )
        } else {
            detail
        });
    }

    if let Err(error) =
        commit_converted_file(&temporary_output, &output, options.overwrite, &operation_id)
    {
        emit_conversion_progress(&app, &operation_id, &input, &output, 0, 0, 0, "failed");
        return Err(error);
    }

    let output_bytes = output.metadata().map(|meta| meta.len()).unwrap_or(0);
    let elapsed = started.elapsed().as_secs_f64();
    let speed = if elapsed > 0.0 {
        (output_bytes as f64 / elapsed) as u64
    } else {
        0
    };
    emit_conversion_progress(
        &app,
        &operation_id,
        &input,
        &output,
        100,
        output_bytes,
        speed,
        "complete",
    );
    Ok(output.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_directory(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "rhfiles-media-{name}-{}-{nonce}",
            std::process::id()
        ))
    }

    fn base_options(kind: &str, format: &str) -> MediaConversionOptions {
        MediaConversionOptions {
            input_path: "input.dat".to_string(),
            output_path: format!("output.{format}"),
            media_kind: kind.to_string(),
            output_format: format.to_string(),
            video_codec: "auto".to_string(),
            quality: 80,
            preset: "medium".to_string(),
            resolution: "original".to_string(),
            audio_bitrate: "192k".to_string(),
            sample_rate: "original".to_string(),
            channels: "original".to_string(),
            image_width: "original".to_string(),
            overwrite: false,
        }
    }

    #[test]
    fn parses_ffmpeg_duration() {
        assert_eq!(
            parse_duration_seconds("Duration: 01:02:03.50, start: 0.000000"),
            Some(3723.5)
        );
        assert_eq!(parse_duration_seconds("Duration: N/A"), None);
    }

    #[test]
    fn builds_video_audio_and_image_arguments() {
        let video = conversion_args(&base_options("video", "mp4")).unwrap();
        assert!(video.windows(2).any(|args| args == ["-c:v", "libx264"]));
        let audio = conversion_args(&base_options("audio", "flac")).unwrap();
        assert!(audio.windows(2).any(|args| args == ["-c:a", "flac"]));
        let image = conversion_args(&base_options("image", "webp")).unwrap();
        assert!(image.windows(2).any(|args| args == ["-frames:v", "1"]));
    }

    #[test]
    fn rejects_incompatible_or_unknown_formats() {
        let mut webm = base_options("video", "webm");
        webm.video_codec = "h264".to_string();
        assert!(conversion_args(&webm).unwrap_err().contains("WebM"));
        assert!(conversion_args(&base_options("audio", "exe")).is_err());
        assert!(conversion_args(&base_options("image", "svg")).is_err());
    }

    #[test]
    fn temporary_output_preserves_the_selected_extension() {
        let output = Path::new(r"C:\Media\holiday movie.mp4");
        let temporary = sidecar_path(output, "convert:42", "partial").unwrap();
        assert_eq!(
            temporary.extension().and_then(|value| value.to_str()),
            Some("mp4")
        );
        assert!(
            temporary
                .file_name()
                .unwrap()
                .to_string_lossy()
                .contains("rhfiles-partial-convert42")
        );
    }

    #[test]
    fn committing_an_overwrite_keeps_the_old_file_until_the_new_file_is_ready() {
        let directory = test_directory("commit");
        std::fs::create_dir_all(&directory).unwrap();
        let output = directory.join("output.mp3");
        let temporary = directory.join(".output.rhfiles-partial-test.mp3");
        std::fs::write(&output, b"original").unwrap();
        std::fs::write(&temporary, b"converted").unwrap();

        commit_converted_file(&temporary, &output, true, "test").unwrap();

        assert_eq!(std::fs::read(&output).unwrap(), b"converted");
        assert!(!temporary.exists());
        assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 1);
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn committing_without_overwrite_preserves_an_existing_file() {
        let directory = test_directory("no-overwrite");
        std::fs::create_dir_all(&directory).unwrap();
        let output = directory.join("output.webp");
        let temporary = directory.join(".output.rhfiles-partial-test.webp");
        std::fs::write(&output, b"original").unwrap();
        std::fs::write(&temporary, b"converted").unwrap();

        let error = commit_converted_file(&temporary, &output, false, "test").unwrap_err();

        assert!(error.contains("not replaced"));
        assert_eq!(std::fs::read(&output).unwrap(), b"original");
        assert!(!temporary.exists());
        std::fs::remove_dir_all(directory).unwrap();
    }
}
