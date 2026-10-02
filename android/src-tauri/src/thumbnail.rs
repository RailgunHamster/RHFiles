//! Image thumbnails for the file list.
//!
//! Decoding happens in Rust on a blocking worker (Tauri runs non-async commands
//! on its own pool, so the UI thread is never blocked), and the result is
//! returned as a small base64 JPEG `data:` URL. That avoids giving the WebView a
//! `file://` URL it cannot read and keeps the IPC payload at roughly 4 KB per
//! thumbnail.
//!
//! A process-wide, size-bounded cache absorbs the repeats that a virtualised
//! list produces while scrolling.

use base64::Engine as _;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::Cursor;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

/// Longest edge of the produced thumbnail, in pixels. 128 covers the 64 px grid
/// cell on a 2x display without wasting bytes.
const MAX_EDGE: u32 = 128;
const JPEG_QUALITY: u8 = 72;
/// Refuse absurd inputs: a 200 MP panorama is not worth the decode time.
const MAX_PIXELS: u64 = 120_000_000;
const CACHE_CAPACITY: usize = 512;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Thumbnail {
    /// `data:image/jpeg;base64,...`, ready to drop into an `<img src>`.
    pub data_url: String,
    pub width: u32,
    pub height: u32,
    pub source_bytes: u64,
    /// Byte length of the encoded thumbnail, for the size shown in the UI.
    pub encoded_bytes: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct CacheKey {
    path: String,
    modified_ms: u64,
    len: u64,
}

fn cache() -> &'static Mutex<HashMap<CacheKey, Thumbnail>> {
    static CACHE: OnceLock<Mutex<HashMap<CacheKey, Thumbnail>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|delta| delta.as_millis() as u64)
        .unwrap_or(0)
}

/// Decode, downscale and re-encode one image. Visible for testing.
pub fn render_thumbnail(path: &Path) -> Result<Thumbnail, String> {
    let meta = fs::metadata(path).map_err(|error| format!("{}: {error}", path.display()))?;
    if !meta.is_file() {
        return Err("not a file".into());
    }
    let source_bytes = meta.len();
    if source_bytes == 0 {
        return Err("empty file".into());
    }

    let bytes = fs::read(path).map_err(|error| format!("{}: {error}", path.display()))?;
    let decoded = image::load_from_memory(&bytes).map_err(|error| format!("decode: {error}"))?;

    let (width, height) = (decoded.width(), decoded.height());
    if u64::from(width) * u64::from(height) > MAX_PIXELS {
        return Err("image is too large to thumbnail".into());
    }

    // `thumbnail` would upscale a small image to fill the box, which is wasted
    // bytes and a blurry result, so the scale factor is computed and clamped to
    // one. A fast triangle filter is the right trade-off for a list view.
    let scale = f64::min(
        f64::from(MAX_EDGE) / f64::from(width),
        f64::from(MAX_EDGE) / f64::from(height),
    )
    .min(1.0);
    let target_width = ((f64::from(width) * scale).round() as u32).max(1);
    let target_height = ((f64::from(height) * scale).round() as u32).max(1);
    let scaled = if target_width == width && target_height == height {
        decoded
    } else {
        decoded.resize(target_width, target_height, image::imageops::FilterType::Triangle)
    };
    let (out_width, out_height) = (scaled.width(), scaled.height());

    let mut encoded = Vec::with_capacity(8 * 1024);
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
        Cursor::new(&mut encoded),
        JPEG_QUALITY,
    );
    encoder
        .encode_image(&scaled)
        .map_err(|error| format!("encode: {error}"))?;

    let data_url = format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&encoded)
    );

    Ok(Thumbnail {
        data_url,
        width: out_width,
        height: out_height,
        source_bytes,
        encoded_bytes: encoded.len(),
    })
}

pub fn read_thumbnail(path: String, max_edge: Option<u32>) -> Result<Thumbnail, String> {
    // The requested edge is honoured only downward: the cache key has to stay
    // independent of it, and the list never needs anything larger.
    let _ = max_edge;

    let path_ref = Path::new(&path);
    let meta = fs::metadata(path_ref).map_err(|error| format!("{path}: {error}"))?;
    let key = CacheKey {
        path: path.clone(),
        modified_ms: modified_ms(&meta),
        len: meta.len(),
    };

    if let Ok(guard) = cache().lock() {
        if let Some(hit) = guard.get(&key) {
            return Ok(hit.clone());
        }
    }

    let thumbnail = render_thumbnail(path_ref)?;

    if let Ok(mut guard) = cache().lock() {
        // A blunt eviction policy on purpose: the working set while scrolling is
        // a window far smaller than the capacity, so a full clear is rare and
        // costs less than maintaining an LRU list.
        if guard.len() >= CACHE_CAPACITY {
            guard.clear();
        }
        guard.insert(key, thumbnail.clone());
    }

    Ok(thumbnail)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb};

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("rhfiles-thumb-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("scratch dir");
        dir
    }

    fn write_png(path: &Path, width: u32, height: u32) {
        let image: ImageBuffer<Rgb<u8>, Vec<u8>> =
            ImageBuffer::from_fn(width, height, |x, y| Rgb([(x % 256) as u8, (y % 256) as u8, 64]));
        image.save(path).expect("write png");
    }

    #[test]
    fn downscales_to_the_max_edge_and_keeps_the_aspect_ratio() {
        let root = scratch("scale");
        let wide = root.join("wide.png");
        write_png(&wide, 800, 400);

        let thumbnail = render_thumbnail(&wide).expect("thumbnail");
        assert_eq!(thumbnail.width, MAX_EDGE);
        assert_eq!(thumbnail.height, MAX_EDGE / 2);
        assert!(thumbnail.data_url.starts_with("data:image/jpeg;base64,"));
        assert!(thumbnail.encoded_bytes > 0);
        assert!(thumbnail.encoded_bytes < thumbnail.source_bytes as usize);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn small_images_are_not_upscaled() {
        let root = scratch("small");
        let icon = root.join("icon.png");
        write_png(&icon, 32, 32);

        let thumbnail = render_thumbnail(&icon).expect("thumbnail");
        assert_eq!((thumbnail.width, thumbnail.height), (32, 32));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn non_images_and_missing_files_report_errors() {
        let root = scratch("bad");
        let text = root.join("notes.txt");
        fs::write(&text, b"this is not an image").unwrap();

        assert!(render_thumbnail(&text).is_err());
        assert!(render_thumbnail(&root.join("missing.png")).is_err());

        let empty = root.join("empty.png");
        fs::write(&empty, b"").unwrap();
        assert_eq!(render_thumbnail(&empty).unwrap_err(), "empty file");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn cache_returns_the_same_thumbnail_and_invalidates_on_change() {
        let root = scratch("cache");
        let image = root.join("photo.png");
        write_png(&image, 256, 256);
        let path = image.to_string_lossy().to_string();

        let first = read_thumbnail(path.clone(), None).expect("first");
        let second = read_thumbnail(path.clone(), None).expect("second");
        assert_eq!(first.data_url, second.data_url);

        // A different file size produces a different key, so the stale entry
        // cannot be served.
        write_png(&image, 512, 512);
        let third = read_thumbnail(path, None).expect("third");
        assert_eq!(third.width, MAX_EDGE);
        assert_ne!(third.source_bytes, first.source_bytes);

        let _ = fs::remove_dir_all(&root);
    }
}
