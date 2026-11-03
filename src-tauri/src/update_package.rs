//! Explicit, verified handoff. Never rediscover a downloaded package with a glob.
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs::{self, File, OpenOptions}, io::{Read, Write}, os::windows::fs::{MetadataExt, OpenOptionsExt}, path::Path};
use velopack::{VelopackAsset, locator::VelopackLocator};
const RECEIPT: &str = "rhfiles-verified-update.json";
#[derive(Serialize, Deserialize)]
struct Receipt { schema: u32, asset: VelopackAsset }

fn metadata(asset: &VelopackAsset, locator: &VelopackLocator) -> Result<(), String> {
    super::updates::validate_asset_name(&asset.FileName).map_err(|e| e.to_string())?;
    if asset.PackageId != locator.get_manifest_id() || asset.Type != "Full"
        || !asset.FileName.ends_with("-full.nupkg") || asset.Size == 0 || asset.Size > 10 * 1024 * 1024 * 1024
        || asset.SHA256.len() != 64 || !asset.SHA256.bytes().all(|b| b.is_ascii_hexdigit())
        || Version::parse(&asset.Version).map_err(|e| e.to_string())? <= locator.get_manifest_version() {
        return Err("[update_package] 更新包元数据无效或不是新版本 / Invalid update metadata or version".into());
    }
    Ok(())
}

fn verify(path: &Path, asset: &VelopackAsset, locator: &VelopackLocator) -> Result<File, String> {
    metadata(asset, locator)?;
    let info = fs::symlink_metadata(path).map_err(|e| format!("[update_package] {}: {e}", path.display()))?;
    if !info.is_file() || info.file_attributes() & 0x400 != 0 { return Err("[update_package] Update package is not a regular file".into()); }
    // Keep writes/deletion denied while hashing and inspecting this exact file.
    let mut file = OpenOptions::new().read(true).share_mode(1).open(path).map_err(|e| format!("[update_package] Cannot open package: {e}"))?;
    if file.metadata().map_err(|e| e.to_string())?.len() != asset.Size { return Err("[update_package] 更新包大小不符 / Package size mismatch".into()); }
    let mut hash = Sha256::new(); let mut buffer = vec![0u8; 1024 * 1024];
    loop { let n = file.read(&mut buffer).map_err(|e| e.to_string())?; if n == 0 { break; } hash.update(&buffer[..n]); }
    if !format!("{:x}", hash.finalize()).eq_ignore_ascii_case(&asset.SHA256) { return Err("[update_package] 更新包 SHA-256 校验失败 / Package checksum mismatch".into()); }
    let manifest = velopack::bundle::load_bundle_from_file(path).and_then(|mut b| b.read_manifest())
        .map_err(|e| format!("[update_package] 无法读取更新包清单 / Cannot read package manifest: {e}"))?;
    if manifest.id != asset.PackageId || manifest.version != Version::parse(&asset.Version).map_err(|e| e.to_string())?
        || manifest.channel != locator.get_manifest_channel() || manifest.main_exe != "RHFiles.exe"
        || manifest.os != "win" {
        return Err("[update_package] 更新包内部版本、平台或身份不匹配 / Package identity, platform or version mismatch".into());
    }
    Ok(file)
}

pub struct Verified { pub asset: VelopackAsset, pub file: File }
pub fn ready(locator: &VelopackLocator) -> Result<Option<Verified>, String> {
    let path = locator.get_packages_dir().join(RECEIPT);
    if !path.try_exists().map_err(|e| e.to_string())? { return Ok(None); }
    let file = File::open(path).map_err(|e| e.to_string())?;
    let receipt: Receipt = serde_json::from_reader(file.take(2 * 1024 * 1024)).map_err(|e| format!("[update_package] Invalid download receipt: {e}"))?;
    if receipt.schema != 1 { return Err("[update_package] Unsupported download receipt".into()); }
    if Version::parse(&receipt.asset.Version).map_err(|e| e.to_string())? <= locator.get_manifest_version() { return Ok(None); }
    let file = verify(&locator.get_packages_dir().join(&receipt.asset.FileName), &receipt.asset, locator)?;
    Ok(Some(Verified { asset: receipt.asset, file }))
}

pub fn stage(locator: &VelopackLocator, asset: &VelopackAsset, download: impl FnOnce(&Path) -> Result<(), String>) -> Result<(), String> {
    metadata(asset, locator)?;
    let directory = locator.get_packages_dir();
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let _lock = locator.try_get_exclusive_lock().map_err(|e| e.to_string())?;
    let destination = directory.join(&asset.FileName);
    let cached = destination.try_exists().map_err(|e| e.to_string())?;
    if !cached || verify(&destination, asset, locator).is_err() {
        if cached {
            // Preserve a bad old cache for diagnosis instead of falsely claiming
            // a successful download, or deleting files discovered by wildcard.
            let marker = tempfile::Builder::new().prefix("quarantined-").suffix(".invalid").tempfile_in(&directory).map_err(|e| e.to_string())?;
            let quarantine = marker.into_temp_path();
            fs::rename(&destination, &quarantine).map_err(|e| e.to_string())?;
            let _ = quarantine.keep().map_err(|e| e.to_string())?;
        }
        let temp = tempfile::Builder::new().prefix("rhfiles-download-").suffix(".partial").tempfile_in(&directory).map_err(|e| e.to_string())?.into_temp_path();
        download(&temp)?;
        // Fsync before committing; validate both bytes and embedded manifest.
        OpenOptions::new().write(true).open(&temp).and_then(|f| f.sync_all()).map_err(|e| e.to_string())?;
        drop(verify(&temp, asset, locator)?);
        temp.persist_noclobber(&destination).map_err(|e| e.to_string())?;
    }
    drop(verify(&destination, asset, locator)?);
    let mut record = tempfile::NamedTempFile::new_in(&directory).map_err(|e| e.to_string())?;
    serde_json::to_writer(record.as_file_mut(), &Receipt { schema: 1, asset: asset.clone() }).map_err(|e| e.to_string())?;
    record.as_file_mut().flush().and_then(|_| record.as_file().sync_all()).map_err(|e| e.to_string())?;
    record.persist(directory.join(RECEIPT)).map_err(|e| e.to_string())?;
    // Returning success means the independent installer call can load the exact
    // committed target, including when installation paths contain [] characters.
    ready(locator)?.ok_or("[update_package] Verified download was not committed")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    fn fixture() -> (tempfile::TempDir, VelopackLocator, VelopackAsset, Vec<u8>) {
        let directory = tempfile::Builder::new().prefix("RHFiles [更新] ").tempdir().unwrap();
        let config = velopack::locator::create_config_from_root_dir(directory.path());
        let locator = VelopackLocator::new_with_manifest(config, velopack::bundle::Manifest {
            id: "RHFiles".into(), version: Version::new(0,1,99), channel: "win".into(), ..Default::default()
        });
        let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file("RHFiles.nuspec",zip::write::SimpleFileOptions::default()).unwrap();
        zip.write_all(b"<package><metadata><id>RHFiles</id><version>0.1.100</version><channel>win</channel><mainExe>RHFiles.exe</mainExe><os>win</os></metadata></package>").unwrap();
        let bytes = zip.finish().unwrap().into_inner();
        let asset = VelopackAsset { PackageId:"RHFiles".into(), Version:"0.1.100".into(), Type:"Full".into(), FileName:"RHFiles-0.1.100-full.nupkg".into(), Size:bytes.len() as u64, SHA256:format!("{:x}",Sha256::digest(&bytes)), ..Default::default() };
        (directory,locator,asset,bytes)
    }
    #[test] fn verified_download_survives_reopening_and_bracketed_paths() {
        let (_root,locator,asset,bytes) = fixture();
        stage(&locator,&asset,|path|fs::write(path,&bytes).map_err(|e|e.to_string())).unwrap();
        assert!(locator.get_packages_dir().to_string_lossy().contains('['));
        assert!(velopack::locator::find_latest_full_package(&locator.get_packages_dir()).is_none(),"Pinned SDK wildcard scan misses literal brackets");
        let proof=ready(&locator).unwrap().unwrap();assert_eq!(proof.asset.Version,"0.1.100");drop(proof);
        stage(&locator,&asset,|_|panic!("Verified cache should not be downloaded again")).unwrap();
    }
    #[test] fn corrupt_cache_is_quarantined_and_replaced_once_not_reused() {
        let (_root,locator,asset,bytes)=fixture();fs::create_dir_all(locator.get_packages_dir()).unwrap();
        fs::write(locator.get_packages_dir().join(&asset.FileName),b"incomplete").unwrap();
        let count=std::sync::atomic::AtomicUsize::new(0);
        stage(&locator,&asset,|path|{count.fetch_add(1,std::sync::atomic::Ordering::Relaxed);fs::write(path,&bytes).map_err(|e|e.to_string())}).unwrap();
        assert_eq!(count.load(std::sync::atomic::Ordering::Relaxed),1);assert!(ready(&locator).unwrap().is_some());
        assert!(fs::read_dir(locator.get_packages_dir()).unwrap().flatten().any(|p|p.path().extension().is_some_and(|e|e=="invalid")));
    }
    #[test] fn matching_hash_of_the_wrong_internal_version_is_not_ready() {
        let (_root,locator,mut asset,bytes)=fixture();asset.Version="0.1.101".into();
        assert!(stage(&locator,&asset,|path|fs::write(path,&bytes).map_err(|e|e.to_string())).unwrap_err().contains("mismatch"));
        assert!(ready(&locator).unwrap().is_none());
    }
    #[test] fn tampering_after_download_does_not_turn_into_generic_missing_pending() {
        let (_root,locator,asset,bytes)=fixture();stage(&locator,&asset,|path|fs::write(path,&bytes).map_err(|e|e.to_string())).unwrap();
        fs::write(locator.get_packages_dir().join(asset.FileName),b"changed").unwrap();
        assert!(ready(&locator).err().unwrap().contains("size mismatch"));
    }
}
