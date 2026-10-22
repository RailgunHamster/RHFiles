use base64::Engine;
use reqwest::{Client, Method};
use rhfiles_service::{Permissions, Service, ShareConfig};
use serde_json::{Value, json};
struct Fixture {
    _temp: tempfile::TempDir,
    data: std::path::PathBuf,
    share: std::path::PathBuf,
    service: Service,
    client: Client,
    base: String,
    user: String,
    password: String,
}
#[tokio::test]
async fn webdav_put_copy_and_conditional_download() {
    let f = Fixture::new(true, true);
    assert_eq!(
        f.request("PUT", "/dav/Files/new.txt")
            .body("new data")
            .send()
            .await
            .unwrap()
            .status(),
        201
    );
    let response = f
        .request("COPY", "/dav/Files/new.txt")
        .header("Destination", format!("{}/dav/Files/copy.txt", f.base))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 201, "{}", response.text().await.unwrap());
    let response = f
        .request("GET", "/dav/Files/copy.txt")
        .send()
        .await
        .unwrap();
    let etag = response.headers()["etag"].to_str().unwrap().to_owned();
    assert_eq!(response.text().await.unwrap(), "new data");
    assert_eq!(
        f.request("GET", "/dav/Files/copy.txt")
            .header("If-None-Match", etag)
            .send()
            .await
            .unwrap()
            .status(),
        304
    );
    assert_eq!(
        f.request("COPY", "/dav/Files/new.txt")
            .header("Destination", format!("{}/dav/Files/copy.txt", f.base))
            .header("Overwrite", "T")
            .send()
            .await
            .unwrap()
            .status(),
        412
    );
}
#[tokio::test]
async fn tus_offsets_and_credentials_survive_server_restart() {
    let f = Fixture::new(true, false);
    let location = f.upload("/Files/restart.bin", 6).await;
    assert_eq!(
        f.request("PATCH", &location)
            .header("Tus-Resumable", "1.0.0")
            .header("Upload-Offset", 0)
            .header("Content-Type", "application/offset+octet-stream")
            .body("abc")
            .send()
            .await
            .unwrap()
            .status(),
        204
    );
    let old_fingerprint = f.service.status().fingerprint;
    f.service.stop();
    // Model an unacknowledged tail written just before process death. A new
    // server must resume the fsynced/journaled offset, not the allocated length.
    let record = f
        .data
        .join("uploads")
        .join(format!("{}.json", location.rsplit('/').next().unwrap()));
    let record: Value = serde_json::from_slice(&std::fs::read(record).unwrap()).unwrap();
    use std::io::Write;
    let mut partial = std::fs::OpenOptions::new()
        .append(true)
        .open(
            f.share
                .join(".rhfiles-service-staging")
                .join(record["staging"].as_str().unwrap()),
        )
        .unwrap();
    partial.write_all(b"bad").unwrap();
    drop(partial);
    let restarted = Service::start(
        &f.data,
        vec![ShareConfig {
            name: "Files".into(),
            path: f.share.clone(),
        }],
        "127.0.0.1:0".parse().unwrap(),
    )
    .unwrap();
    assert_eq!(restarted.status().fingerprint, old_fingerprint);
    let url = format!("{}{}", restarted.status().endpoints[0], location);
    let response = f
        .client
        .head(&url)
        .basic_auth(&f.user, Some(&f.password))
        .header("Tus-Resumable", "1.0.0")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["upload-offset"], "3");
    assert_eq!(
        f.client
            .patch(&url)
            .basic_auth(&f.user, Some(&f.password))
            .header("Tus-Resumable", "1.0.0")
            .header("Upload-Offset", 3)
            .header("Content-Type", "application/offset+octet-stream")
            .body("def")
            .send()
            .await
            .unwrap()
            .status(),
        204
    );
    assert_eq!(
        std::fs::read(f.share.join("restart.bin")).unwrap(),
        b"abcdef"
    );
    let database = std::fs::read_to_string(f.data.join("devices.json")).unwrap();
    assert!(!database.contains(&f.password));
}
#[tokio::test]
async fn upload_owner_isolation_cancellation_and_no_implicit_delete_grant() {
    let f = Fixture::new(true, false);
    let path = f.upload("/Files/cancel.bin", 5).await;
    let other = f
        .service
        .credential(
            "other",
            Permissions {
                write: true,
                delete: false,
            },
        )
        .unwrap();
    assert_eq!(
        f.client
            .head(format!("{}{path}", f.base))
            .basic_auth(other.username, Some(other.password))
            .header("Tus-Resumable", "1.0.0")
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        f.request("DELETE", &path)
            .header("Tus-Resumable", "1.0.0")
            .send()
            .await
            .unwrap()
            .status(),
        204
    );
    assert!(!f.share.join("cancel.bin").exists());
    assert_eq!(f.service.status().active_uploads, 0);
    assert_eq!(
        f.request("DELETE", "/dav/Files/folder")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
}
#[tokio::test]
async fn pairing_guess_limit_and_request_body_limits() {
    let f = Fixture::new(false, false);
    let pair = f.service.pairing(Permissions::default()).unwrap();
    let url = format!("{}/api/v1/pair", f.base);
    let wrong = if pair.code == "0000000000" {
        "1111111111"
    } else {
        "0000000000"
    };
    for _ in 0..8 {
        assert_eq!(
            f.client
                .post(&url)
                .json(&json!({"code":wrong,"name":"guess"}))
                .send()
                .await
                .unwrap()
                .status(),
            401
        );
    }
    assert_eq!(
        f.client
            .post(&url)
            .json(&json!({"code":pair.code,"name":"phone"}))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    assert_eq!(
        f.client
            .post(&url)
            .body("a".repeat(17000))
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    assert_eq!(
        f.request("PROPFIND", "/dav/Files")
            .header("Depth", "infinity")
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
}
#[tokio::test]
async fn image_thumbnail_has_bounds_and_is_not_an_original_file_download() {
    let f = Fixture::new(false, false);
    image::RgbImage::new(2000, 1000)
        .save(f.share.join("picture.png"))
        .unwrap();
    let response = f
        .request("GET", "/api/v1/thumbnail?path=/Files/picture.png")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["content-type"], "image/png");
    let image = image::load_from_memory(&response.bytes().await.unwrap()).unwrap();
    assert_eq!((image.width(), image.height()), (320, 160));
}
#[tokio::test]
async fn reject_unsafe_share_roots_and_preserve_corrupt_identity() {
    let f = Fixture::new(false, false);
    assert!(
        Service::start(
            &f.data,
            vec![ShareConfig {
                name: "Secrets".into(),
                path: f.data.parent().unwrap().into()
            }],
            "127.0.0.1:0".parse().unwrap()
        )
        .is_err()
    );
    let bad = f._temp.path().join("bad-state");
    std::fs::create_dir(&bad).unwrap();
    std::fs::write(bad.join("identity.json"), "corrupt").unwrap();
    assert!(
        Service::start(
            &bad,
            vec![ShareConfig {
                name: "Files".into(),
                path: f.share.clone()
            }],
            "127.0.0.1:0".parse().unwrap()
        )
        .is_err()
    );
    assert_eq!(
        std::fs::read_to_string(bad.join("identity.json")).unwrap(),
        "corrupt"
    );
}
impl Fixture {
    fn new(write: bool, delete: bool) -> Self {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("state");
        let share = temp.path().join("files");
        std::fs::create_dir(&share).unwrap();
        // macOS TMPDIR commonly starts with the OS /var -> /private/var
        // alias. Fixtures must pass real local roots to the strict service.
        let share = share.canonicalize().unwrap();
        std::fs::write(share.join("中文 file.txt"), b"0123456789").unwrap();
        std::fs::create_dir(share.join("folder")).unwrap();
        let service = Service::start(
            &data,
            vec![ShareConfig {
                name: "Files".into(),
                path: share.clone(),
            }],
            "127.0.0.1:0".parse().unwrap(),
        )
        .unwrap();
        let credential = service
            .credential("test", Permissions { write, delete })
            .unwrap();
        let identity: Value =
            serde_json::from_slice(&std::fs::read(data.join("identity.json")).unwrap()).unwrap();
        let der: Vec<u8> = serde_json::from_value(identity["certificate"].clone()).unwrap();
        let client = Client::builder()
            .no_proxy()
            .add_root_certificate(reqwest::Certificate::from_der(&der).unwrap())
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .unwrap();
        let base = service.status().endpoints[0].clone();
        Self {
            _temp: temp,
            data,
            share,
            service,
            client,
            base,
            user: credential.username,
            password: credential.password,
        }
    }
    fn request(&self, method: &str, path: &str) -> reqwest::RequestBuilder {
        self.client
            .request(
                Method::from_bytes(method.as_bytes()).unwrap(),
                format!("{}{path}", self.base),
            )
            .basic_auth(&self.user, Some(&self.password))
    }
    async fn upload(&self, path: &str, size: u64) -> String {
        let response = self
            .request("POST", "/api/v1/uploads")
            .header("Tus-Resumable", "1.0.0")
            .header("Upload-Length", size)
            .header(
                "Upload-Metadata",
                format!(
                    "path {}",
                    base64::engine::general_purpose::STANDARD.encode(path)
                ),
            )
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 201, "{}", response.text().await.unwrap());
        response.headers()["location"].to_str().unwrap().into()
    }
}
#[tokio::test]
async fn api_webdav_unicode_and_range_share_the_same_content() {
    let f = Fixture::new(false, false);
    assert_eq!(
        f.client
            .get(format!("{}/api/v1/list", f.base))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let root: Value = f
        .request("GET", "/api/v1/list")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(root["entries"][0]["name"], "Files");
    assert!(
        !root
            .to_string()
            .contains(&f.share.to_string_lossy().to_string())
    );
    let list: Value = f
        .request("GET", "/api/v1/list?path=/Files&limit=1")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(list["total"], 2);
    assert_eq!(list["entries"][0]["name"], "folder");
    let response = f
        .request("PROPFIND", "/dav/Files/")
        .header("Depth", "1")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 207);
    assert!(response.text().await.unwrap().contains("file.txt"));
    let response = f
        .request("GET", "/api/v1/content")
        .query(&[("path", "/Files/中文 file.txt")])
        .header("Range", "bytes=2-5")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 206);
    assert_eq!(response.headers()["content-range"], "bytes 2-5/10");
    assert_eq!(response.text().await.unwrap(), "2345");
}
#[tokio::test]
async fn readonly_and_revocation_are_enforced_in_both_protocols() {
    let f = Fixture::new(false, false);
    for (method, path) in [
        ("PUT", "/dav/Files/new"),
        ("DELETE", "/dav/Files/folder"),
        ("MKCOL", "/dav/Files/newdir"),
        ("MOVE", "/dav/Files/folder"),
    ] {
        assert_eq!(
            f.request(method, path).send().await.unwrap().status(),
            403,
            "{method}"
        );
    }
    assert_eq!(
        f.request("POST", "/api/v1/mkdir")
            .json(&json!({"path":"/Files/new"}))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    f.service.revoke(&f.user).unwrap();
    assert_eq!(
        f.request("GET", "/api/v1/list")
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    assert!(!f.share.join("new").exists());
}
#[tokio::test]
async fn tus_partial_resume_and_publish_without_overwrite() {
    let f = Fixture::new(true, false);
    let path = f.upload("/Files/resume.bin", 6).await;
    for (offset, body) in [(0, "abc"), (3, "def")] {
        let response = f
            .request("PATCH", &path)
            .header("Tus-Resumable", "1.0.0")
            .header("Upload-Offset", offset)
            .header("Content-Type", "application/offset+octet-stream")
            .body(body)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 204, "{}", response.text().await.unwrap());
        if offset == 0 {
            assert!(!f.share.join("resume.bin").exists());
            let head = f
                .request("HEAD", &path)
                .header("Tus-Resumable", "1.0.0")
                .send()
                .await
                .unwrap();
            assert_eq!(head.headers()["upload-offset"], "3");
            assert_eq!(
                f.request("PATCH", &path)
                    .header("Tus-Resumable", "1.0.0")
                    .header("Upload-Offset", 0)
                    .header("Content-Type", "application/offset+octet-stream")
                    .body("zzz")
                    .send()
                    .await
                    .unwrap()
                    .status(),
                409
            );
        }
    }
    assert_eq!(
        std::fs::read(f.share.join("resume.bin")).unwrap(),
        b"abcdef"
    );
    assert_eq!(
        f.request("PUT", "/dav/Files/resume.bin")
            .body("replace")
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    assert_eq!(
        std::fs::read(f.share.join("resume.bin")).unwrap(),
        b"abcdef"
    );
}
#[tokio::test]
async fn concurrent_destination_creation_is_not_overwritten() {
    let f = Fixture::new(true, true);
    let path = f.upload("/Files/racing", 3).await;
    std::fs::write(f.share.join("racing"), "original").unwrap();
    assert_eq!(
        f.request("PATCH", &path)
            .header("Tus-Resumable", "1.0.0")
            .header("Upload-Offset", 0)
            .header("Content-Type", "application/offset+octet-stream")
            .body("new")
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    assert_eq!(
        std::fs::read_to_string(f.share.join("racing")).unwrap(),
        "original"
    );
    // A complete *staging* file is not a completed published upload. A client
    // recovering a 409 must not mistake HEAD's offset for successful commit.
    assert_eq!(
        f.request("HEAD", &path)
            .header("Tus-Resumable", "1.0.0")
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
}
#[tokio::test]
async fn rename_directory_and_dav_move_never_replace_target() {
    let f = Fixture::new(true, true);
    std::fs::write(f.share.join("folder/a"), "a").unwrap();
    let response = f
        .request("POST", "/api/v1/rename")
        .json(&json!({"path":"/Files/folder","destination":"/Files/renamed"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 204, "{}", response.text().await.unwrap());
    assert!(f.share.join("renamed/a").exists());
    std::fs::create_dir(f.share.join("target")).unwrap();
    std::fs::write(f.share.join("target/keep"), "keep").unwrap();
    let response = f
        .request("MOVE", "/dav/Files/renamed")
        .header("Destination", format!("{}/dav/Files/target", f.base))
        .header("Overwrite", "T")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 412);
    assert!(f.share.join("target/keep").exists());
    assert!(f.share.join("renamed/a").exists());
}
#[tokio::test]
async fn native_mutations_respect_webdav_locks() {
    let f = Fixture::new(true, true);
    let response=f.request("LOCK","/dav/Files/folder/").header("Content-Type","application/xml").body("<D:lockinfo xmlns:D=\"DAV:\"><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockinfo>").send().await.unwrap();
    assert!(
        response.status().is_success(),
        "{}",
        response.text().await.unwrap()
    );
    let response = f
        .request("POST", "/api/v1/rename")
        .json(&json!({"path":"/Files/folder","destination":"/Files/other"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 423, "{}", response.text().await.unwrap());
    assert!(f.share.join("folder").exists());
    let response = f
        .request("POST", "/api/v1/rename")
        .json(&json!({"path":"/Files/FOLDER","destination":"/Files/other"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 423, "{}", response.text().await.unwrap());
}
#[tokio::test]
async fn pairing_single_use_and_no_cross_origin_requests() {
    let f = Fixture::new(false, false);
    let pair = f.service.pairing(Permissions::default()).unwrap();
    assert!(pair.connection_uri.starts_with("rhfiles-connect:v1:"));
    assert!(pair.qr_svg.contains("<svg"));
    let url = format!("{}/api/v1/pair", f.base);
    let p = json!({"code":pair.code,"name":"phone"});
    assert_eq!(
        f.client
            .post(&url)
            .header("Origin", "https://evil.example")
            .json(&p)
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    let response = f.client.post(&url).json(&p).send().await.unwrap();
    assert_eq!(response.status(), 200);
    let credential: Value = response.json().await.unwrap();
    assert!(!credential["password"].as_str().unwrap().is_empty());
    assert_eq!(
        f.client.post(&url).json(&p).send().await.unwrap().status(),
        401
    );
}
#[tokio::test]
async fn traversal_private_names_and_root_changes_are_denied() {
    let f = Fixture::new(true, true);
    for path in [
        "/Files/../state/identity.json",
        "/Files/.rhfiles-service-staging/x",
        "/Files/C:/x",
        "/Files/a\\b",
    ] {
        let r = f
            .request("GET", "/api/v1/stat")
            .query(&[("path", path)])
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 403, "{path}");
    }
    for path in ["/Files", "/"] {
        assert_eq!(
            f.request("POST", "/api/v1/delete")
                .json(&json!({"path":path}))
                .send()
                .await
                .unwrap()
                .status(),
            403
        );
        let response = f
            .request("DELETE", &format!("/dav{path}"))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 403);
    }
    assert!(f.data.join("identity.json").exists());
    assert!(f.share.join("中文 file.txt").exists());
    assert!(f.share.join("folder").exists());
}
#[tokio::test]
async fn webdav_copy_move_cannot_recurse_into_the_source_or_move_a_share_root() {
    let f = Fixture::new(true, true);
    std::fs::write(f.share.join("folder/keep"), "keep").unwrap();
    for method in ["COPY", "MOVE"] {
        for destination in ["FOLDER/child", "folder//child", "folder%2fchild"] {
            let response = f
                .request(method, "/dav/Files/folder")
                .header("Destination", format!("{}/dav/Files/{destination}", f.base))
                .send()
                .await
                .unwrap();
            assert_eq!(response.status(), 403, "{}", response.text().await.unwrap());
        }
    }
    assert_eq!(
        f.request("MOVE", "/dav/Files/")
            .header("Destination", format!("{}/dav/Files/moved", f.base))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        std::fs::read_to_string(f.share.join("folder/keep")).unwrap(),
        "keep"
    );
    assert!(!f.share.join("folder/child").exists());
}
