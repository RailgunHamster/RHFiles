//! Warm local file pages and on-open scans for the shipped VLC plugins.
//! VLC remains responsible for choosing and loading every executable module.
use serde_json::{json, Value};
use std::{
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    sync::{atomic::{AtomicUsize, Ordering}, OnceLock},
    time::{Duration, Instant},
};

const COMMON: &[&str] = &[
    "codec/libavcodec_plugin.dll", "video_chroma/libswscale_plugin.dll",
    "video_output/libdirect3d11_plugin.dll", "codec/libd3d11va_plugin.dll",
    "demux/libmp4_plugin.dll", "demux/libmkv_plugin.dll", "demux/libavi_plugin.dll",
    "demux/libts_plugin.dll", "access/libfilesystem_plugin.dll", "access/libhttp_plugin.dll",
    "access/libaccess_http_plugin.dll", "access/liblibbluray_plugin.dll", "access/libvdr_plugin.dll",
    "stream_filter/libprefetch_plugin.dll", "stream_filter/libcache_read_plugin.dll",
    "stream_filter/libcache_block_plugin.dll", "stream_filter/libskiptags_plugin.dll",
    "stream_filter/libhds_plugin.dll", "stream_filter/libinflate_plugin.dll",
    "stream_filter/libadf_plugin.dll", "stream_filter/librecord_plugin.dll",
    "demux/libplaylist_plugin.dll", "stream_extractor/libarchive_plugin.dll",
    "lua/liblua_plugin.dll", "meta_engine/libtaglib_plugin.dll",
    "text_renderer/libfreetype_plugin.dll", "audio_output/libdirectsound_plugin.dll",
    "audio_filter/libscaletempo_plugin.dll", "audio_mixer/libfloat_mixer_plugin.dll",
    "video_output/libdrawable_plugin.dll", "video_output/libwinhibit_plugin.dll",
];
const BUDGET: Duration = Duration::from_secs(8);
const MAX_FILES: usize = 112;

struct Warmup {
    started: Instant,
    read: AtomicUsize,
    finished_ms: OnceLock<u64>,
}

static WARMUP: OnceLock<Warmup> = OnceLock::new();

pub(super) fn started() -> bool {
    WARMUP.get().is_some()
}

pub(super) fn read_plugins(runtime: &Path) {
    if WARMUP.set(Warmup {
        started: Instant::now(), read: AtomicUsize::new(0), finished_ms: OnceLock::new(),
    }).is_err() {
        return;
    }
    let state = WARMUP.get().unwrap();
    let plugins = runtime.join("plugins");
    let mut paths: Vec<PathBuf> = COMMON.iter().map(|name| plugins.join(name)).collect();
    for group in ["codec", "video_chroma", "audio_filter"] {
        let Ok(entries) = fs::read_dir(plugins.join(group)) else { continue };
        paths.extend(entries.filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
            .map(|entry| entry.path())
            .filter(|path| path.extension().is_some_and(|ext| ext == "dll")));
    }
    let mut seen = std::collections::HashSet::new();
    paths.retain(|path| seen.insert(path.clone()));
    paths.truncate(MAX_FILES);
    let next = AtomicUsize::new(0);
    std::thread::scope(|scope| {
        for _ in 0..4 {
            let _ = std::thread::Builder::new().spawn_scoped(scope, || {
                while state.started.elapsed() < BUDGET {
                    let Some(path) = paths.get(next.fetch_add(1, Ordering::Relaxed)) else { break };
                    if File::open(path).and_then(|mut file| file.read_exact(&mut [0])).is_ok() {
                        state.read.fetch_add(1, Ordering::Relaxed);
                    }
                }
            });
        }
    });
    let _ = state.finished_ms.set(state.started.elapsed().as_millis() as u64);
}

pub(super) fn snapshot() -> Option<Value> {
    let state = WARMUP.get()?;
    Some(json!({"filesRead":state.read.load(Ordering::Relaxed),"elapsedMs":state.finished_ms.get()}))
}
