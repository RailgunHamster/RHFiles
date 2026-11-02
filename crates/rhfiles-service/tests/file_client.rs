use rhfiles_service::{
    Permissions, Service, ShareConfig,
    connection::{Connector, FileRequest},
    groups::{Groups, Server},
};

#[test]
fn identity_uris_preserve_case_unicode_and_literal_percent_without_normalizing_traversal() {
    use rhfiles_service::connection::DevicePath;
    let group = "a".repeat(64);
    let peer = "b".repeat(64);
    let p = DevicePath::new(&group, &peer, "/Files/中文 % #/A.txt").unwrap();
    assert_eq!(DevicePath::parse(&p.uri()).unwrap(), p);
    assert_ne!(p.uri(), p.uri().replace("A.txt", "a.txt"));
    for tail in [
        "/../secret",
        "/%2e%2e/secret",
        "/Files/a%2fb",
        "/Files/a%5cb",
        "//Files",
        "/Files/CON.txt",
        "/Files/file.",
        "/Files/a?token=x",
        "/Files/a#x",
        "/Files/a%00",
        "/Files/%",
    ] {
        assert!(
            DevicePath::parse(&format!(
                "{}{}{peer}{tail}",
                DevicePath::PREFIX,
                format!("{group}/")
            ))
            .is_err(),
            "{tail}"
        );
    }
}

#[tokio::test]
async fn checked_mutations_replace_only_the_confirmed_file_and_never_delete_a_recreated_source(){
    let f=fixture();
    let stat=|name:&str|FileRequest::Stat{path:format!("/Files/{name}")};
    std::fs::write(f.files.join("source"),b"new").unwrap();std::fs::write(f.files.join("target"),b"old").unwrap();
    let source=f.connector.file_request(&f.group,&f.peer,stat("source")).await.unwrap().json(65536).await.unwrap();
    let target=f.connector.file_request(&f.group,&f.peer,stat("target")).await.unwrap().json(65536).await.unwrap();
    let op=|source_rev:&str,target_rev:&str|FileRequest::CheckedMutation{path:"/Files/source".into(),destination:Some("/Files/target".into()),revision:source_rev.into(),target_revision:Some(target_rev.into())};
    std::fs::rename(f.files.join("target"),f.files.join("original-target")).unwrap();std::fs::write(f.files.join("target"),b"xyz").unwrap();
    let error=f.connector.file_request(&f.group,&f.peer,op(source["revision"].as_str().unwrap(),target["revision"].as_str().unwrap())).await.err().unwrap();assert!(error.starts_with("[conflict]"),"{error}");
    assert_eq!(std::fs::read(f.files.join("target")).unwrap(),b"xyz");assert_eq!(std::fs::read(f.files.join("source")).unwrap(),b"new");
    let current=f.connector.file_request(&f.group,&f.peer,stat("target")).await.unwrap().json(65536).await.unwrap();
    f.connector.file_request(&f.group,&f.peer,op(source["revision"].as_str().unwrap(),current["revision"].as_str().unwrap())).await.unwrap();
    assert_eq!(std::fs::read(f.files.join("target")).unwrap(),b"new");assert!(!f.files.join("source").exists());
    std::fs::write(f.files.join("source"),b"aba").unwrap();
    let error=f.connector.file_request(&f.group,&f.peer,FileRequest::CheckedMutation{path:"/Files/source".into(),destination:None,revision:source["revision"].as_str().unwrap().into(),target_revision:None}).await.err().unwrap();assert!(error.starts_with("[conflict]"));assert_eq!(std::fs::read(f.files.join("source")).unwrap(),b"aba");
    std::fs::create_dir(f.files.join("folder")).unwrap();std::fs::write(f.files.join("folder/keep"),b"keep").unwrap();
    let folder=f.connector.file_request(&f.group,&f.peer,stat("folder")).await.unwrap().json(65536).await.unwrap();
    assert!(f.connector.file_request(&f.group,&f.peer,FileRequest::CheckedMutation{path:"/Files/folder".into(),destination:None,revision:folder["revision"].as_str().unwrap().into(),target_revision:None}).await.is_err());
    assert_eq!(std::fs::read(f.files.join("folder/keep")).unwrap(),b"keep");
}

#[tokio::test]
async fn dropping_a_connection_deadline_does_not_leave_a_live_cancel_handle() {
    let f = fixture();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("https://{}", listener.local_addr().unwrap());
    assert!(
        tokio::time::timeout(
            std::time::Duration::from_millis(30),
            f.connector
                .connect(&f.group, &f.peer, Some(endpoint), "test")
        )
        .await
        .is_err()
    );
    assert!(
        !f.connector.cancel(&f.group, &f.peer),
        "A dropped request cannot remain live or cancel a later operation"
    );
}
#[tokio::test]
async fn server_local_removal_remains_an_authorization_error_with_or_without_session_recovery(){
    let f=fixture();std::fs::write(f.files.join("revoked.txt"),b"fixture").unwrap();
    let stat=||FileRequest::Stat{path:"/Files/revoked.txt".into()};
    f.connector.file_request(&f.group,&f.peer,stat()).await.unwrap();
    f.service.groups().remove(&f.group,&f.client.device_id()).unwrap();
    let error=f.connector.file_request(&f.group,&f.peer,stat()).await.err().unwrap();
    assert!(error.starts_with("[forbidden]")||error.starts_with("[unauthorized]"),"{error}");
    f.connector.invalidate();
    let recovered=f.connector.file_request(&f.group,&f.peer,stat()).await.err().unwrap();
    assert!(recovered.starts_with("[unauthorized]"),"{recovered}");
}
use serde_json::Value;
use std::{path::PathBuf, sync::Arc};

struct Fixture {
    _root: tempfile::TempDir,
    files: PathBuf,
    service: Service,
    client: Arc<Groups>,
    connector: Arc<Connector>,
    group: String,
    peer: String,
}
fn fixture() -> Fixture {
    let root = tempfile::tempdir().unwrap();
    let base = root.path().canonicalize().unwrap();
    let files = base.join("files");
    std::fs::create_dir(&files).unwrap();
    let host = Arc::new(Groups::open(&base.join("host")).unwrap());
    let group = host
        .create(
            "RH",
            "Test host",
            Permissions {
                write: true,
                delete: true,
            },
        )
        .unwrap();
    let client = Arc::new(Groups::open(&base.join("client")).unwrap());
    client
        .join(
            host.approve(&group, &client.request("Test computer").unwrap(), true)
                .unwrap(),
            Permissions::default(),
        )
        .unwrap();
    let service = Service::start_grouped(
        &base.join("host"),
        vec![ShareConfig {
            name: "Files".into(),
            path: files.clone(),
        }],
        "127.0.0.1:0".parse().unwrap(),
        &[],
        host.clone(),
    )
    .unwrap();
    host.advertise(Server {
        fingerprint: service.status().fingerprint,
        endpoints: vec![format!("https://127.0.0.1:{}", service.status().port)],
    })
    .unwrap();
    client.merge(&group, &host.packet(&group).unwrap()).unwrap();
    let peer = host.device_id();
    let connector = Arc::new(Connector::new(client.clone()));
    Fixture {
        _root: root,
        files,
        service,
        client,
        connector,
        group,
        peer,
    }
}

#[tokio::test]
async fn version_bound_ranges_supply_exact_bytes_and_digest_and_reject_stale_versions() {
    use sha2::{Digest, Sha256};
    let f = fixture();
    std::fs::write(f.files.join("range.bin"), b"0123456789").unwrap();
    let info = json(&f, FileRequest::Stat { path: "/Files/range.bin".into() }).await;
    let revision = info["readRevision"].as_str().unwrap();
    let fetch = |range: &str, rev: &str| FileRequest::ContentChecked { path: "/Files/range.bin".into(), range: Some(range.into()), revision: rev.into() };
    let mut response = f.connector.file_request(&f.group, &f.peer, fetch("bytes=2-6", revision)).await.unwrap();
    assert_eq!(response.response.status().as_u16(), 206);
    assert_eq!(response.response.headers()["Content-Range"], "bytes 2-6/10");
    assert_eq!(response.response.headers()["ETag"], format!("\"{revision}\""));
    assert_eq!(response.response.headers()["X-RHFiles-Chunk-SHA256"], format!("{:x}", Sha256::digest(b"23456")));
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.unwrap() { bytes.extend_from_slice(&chunk); }
    assert_eq!(bytes, b"23456");
    assert!(f.connector.file_request(&f.group, &f.peer, fetch("bytes=0-10", revision)).await.err().unwrap().starts_with("[range_not_satisfiable]"));
    let original = std::fs::metadata(f.files.join("range.bin")).unwrap().modified().unwrap();
    std::fs::rename(f.files.join("range.bin"), f.files.join("original.bin")).unwrap();
    std::fs::write(f.files.join("range.bin"), b"0123456789").unwrap();
    std::fs::File::options().write(true).open(f.files.join("range.bin")).unwrap().set_modified(original).unwrap();
    assert!(f.connector.file_request(&f.group, &f.peer, fetch("bytes=2-6", revision)).await.err().unwrap().starts_with("[conflict]"));
}

#[tokio::test]
async fn an_in_place_edit_with_restored_size_and_mtime_cannot_reuse_a_read_generation() {
    let f=fixture(); let path=f.files.join("in-place.bin");
    std::fs::write(&path,b"0123456789").unwrap();
    let stat=||FileRequest::Stat{path:"/Files/in-place.bin".into()};
    let before=json(&f,stat()).await;
    let modified=std::fs::metadata(&path).unwrap().modified().unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    std::fs::write(&path,b"ABCDEFGHIJ").unwrap();
    std::fs::File::options().write(true).open(&path).unwrap().set_modified(modified).unwrap();
    let after=json(&f,stat()).await;
    assert_eq!(before["revision"],after["revision"],"mutation identity intentionally tolerates metadata-preserving edits");
    assert_ne!(before["readRevision"],after["readRevision"]);
    let old=f.connector.file_request(&f.group,&f.peer,FileRequest::ContentChecked{path:"/Files/in-place.bin".into(),range:Some("bytes=0-9".into()),revision:before["readRevision"].as_str().unwrap().into()}).await.err().unwrap();
    assert!(old.starts_with("[conflict]"),"{old}");
}

#[tokio::test]
async fn renewed_server_authorization_cannot_resume_an_old_read_generation() {
    let f=fixture();std::fs::write(f.files.join("grant.bin"),b"same bytes").unwrap();
    let stat=||FileRequest::Stat{path:"/Files/grant.bin".into()};
    let before=json(&f,stat()).await;
    f.service.groups().remove(&f.group,&f.client.device_id()).unwrap();
    f.service.groups().restore(&f.group,&f.client.device_id(),true).unwrap();
    let after=json(&f,stat()).await;
    assert_eq!(before["revision"],after["revision"]);
    assert_ne!(before["readRevision"],after["readRevision"],"same bytes do not authorize resuming a revoked read");
    let error=f.connector.file_request(&f.group,&f.peer,FileRequest::ContentChecked{path:"/Files/grant.bin".into(),range:Some("bytes=0-9".into()),revision:before["readRevision"].as_str().unwrap().into()}).await.err().unwrap();
    assert!(error.starts_with("[conflict]"),"{error}");
}

#[tokio::test]
async fn download_rate_limit_is_shared_by_all_the_files_range_workers() {
    use rhfiles_service::connection::{DevicePath,Download,DownloadOptions};
    let f=fixture();std::fs::write(f.files.join("limited.bin"),vec![9;256*1024]).unwrap();
    let info=json(&f,FileRequest::Stat{path:"/Files/limited.bin".into()}).await;
    let start=std::time::Instant::now();
    let mut reader=Download::open(f.connector.clone(),DevicePath::new(&f.group,&f.peer,"/Files/limited.bin").unwrap(),256*1024,info["readRevision"].as_str().unwrap().into(),DownloadOptions{parallelism:4,bytes_per_second:512*1024}).await.unwrap();
    let mut received=0;while let Some(block)=reader.next().await.unwrap(){received+=block.bytes.len();}
    assert_eq!(received,256*1024);
    assert!(start.elapsed()>=std::time::Duration::from_millis(450),"parallel workers must not multiply the rate allowance");
}

#[tokio::test]
async fn bounded_parallel_download_keeps_order_and_checks_every_segment_including_the_tail() {
    use rhfiles_service::connection::{DevicePath, Download, DownloadOptions};
    use sha2::{Digest, Sha256};
    let f = fixture();
    let bytes = (0..(32 * 1024 * 1024 + 713)).map(|v| ((v * 17 + v / 65536) % 251) as u8).collect::<Vec<_>>();
    std::fs::write(f.files.join("并行 %.bin"), &bytes).unwrap();
    let info = json(&f, FileRequest::Stat { path: "/Files/并行 %.bin".into() }).await;
    for streams in [1, 2, 4] {
        let mut reader = Download::open(f.connector.clone(), DevicePath::new(&f.group, &f.peer, "/Files/并行 %.bin").unwrap(), bytes.len() as u64, info["readRevision"].as_str().unwrap().into(), DownloadOptions { parallelism: streams, ..Default::default() }).await.unwrap();
        let mut hash = Sha256::new(); let mut offset = 0;
        while let Some(block) = reader.next().await.unwrap() {
            assert!(block.bytes.len() <= 8 * 1024 * 1024);
            assert_eq!(&block.bytes[..], &bytes[offset..offset + block.bytes.len()]);
            offset += block.bytes.len(); hash.update(&block.bytes);
        }
        assert_eq!(offset, bytes.len());
        assert_eq!(hash.finalize(), Sha256::digest(&bytes));
        assert!(reader.next().await.unwrap().is_none(), "EOF must remain stable");
    }
    let reports = f.connector.diagnostics();
    assert!(reports.iter().any(|v| v.trigger == "file.download" && v.outcome == "completed"));
}

#[tokio::test]
async fn removal_discards_already_buffered_download_data_and_a_changed_source_cannot_resume() {
    use rhfiles_service::connection::{DevicePath, Download, DownloadOptions};
    let f = fixture();
    std::fs::write(f.files.join("data.bin"), vec![7; 48 * 1024 * 1024]).unwrap();
    let info = json(&f, FileRequest::Stat { path: "/Files/data.bin".into() }).await;
    let path = DevicePath::new(&f.group, &f.peer, "/Files/data.bin").unwrap();
    let mut reader = Download::open(f.connector.clone(), path.clone(), 48 * 1024 * 1024, info["readRevision"].as_str().unwrap().into(), DownloadOptions::default()).await.unwrap();
    assert!(reader.next().await.unwrap().is_some());
    f.client.remove(&f.group, &f.peer).unwrap();
    assert!(reader.next().await.err().unwrap().starts_with("[authorization_revoked]"));
    f.client.restore(&f.group, &f.peer, true).unwrap();
    assert!(reader.next().await.is_err(), "restoring membership cannot revive an old transfer");
    drop(reader);
    let mut reader = Download::open(f.connector.clone(), path, 48 * 1024 * 1024, info["readRevision"].as_str().unwrap().into(), DownloadOptions::default()).await.unwrap();
    assert!(reader.next().await.unwrap().is_some());
    std::fs::rename(f.files.join("data.bin"), f.files.join("old.bin")).unwrap();
    std::fs::write(f.files.join("data.bin"), vec![8; 48 * 1024 * 1024]).unwrap();
    loop { match reader.next().await { Ok(Some(_)) => {}, Ok(None) => panic!("changed source accepted"), Err(_) => break } }
}
async fn json(f: &Fixture, request: FileRequest) -> Value {
    f.connector
        .file_request(&f.group, &f.peer, request)
        .await
        .unwrap()
        .json(2 * 1024 * 1024)
        .await
        .unwrap()
}

#[tokio::test]
async fn desktop_reads_real_tls_roots_pages_unicode_stat_and_ranges_without_reauthenticating_each_folder()
 {
    let f = fixture();
    std::fs::create_dir(f.files.join("中文 % #")).unwrap();
    std::fs::write(f.files.join("中文 % #").join("你好.txt"), b"0123456789").unwrap();
    let roots = json(
        &f,
        FileRequest::List {
            path: "/".into(),
            offset: 0,
            limit: 200,
            revision: None,
            fresh:false,
        },
    )
    .await;
    assert_eq!(roots["entries"][0]["name"], "Files");
    let first = json(
        &f,
        FileRequest::List {
            path: "/Files".into(),
            offset: 0,
            limit: 1,
            revision: None,
            fresh:false,
        },
    )
    .await;
    assert_eq!(first["entries"][0]["path"], "/Files/中文 % #");
    let second = json(
        &f,
        FileRequest::List {
            path: "/Files".into(),
            offset: 1,
            limit: 1,
            revision: Some(first["revision"].as_str().unwrap().into()),
            fresh:false,
        },
    )
    .await;
    assert_eq!(second["entries"].as_array().unwrap().len(), 0);
    let stat = json(
        &f,
        FileRequest::Stat {
            path: "/Files/中文 % #/你好.txt".into(),
        },
    )
    .await;
    assert_eq!(stat["size"], 10);
    assert_eq!(stat["isDir"], false);
    let mut file = f
        .connector
        .file_request(
            &f.group,
            &f.peer,
            FileRequest::Content {
                path: "/Files/中文 % #/你好.txt".into(),
                range: Some("bytes=3-6".into()),
            },
        )
        .await
        .unwrap();
    assert_eq!(file.response.status().as_u16(), 206);
    assert_eq!(file.response.headers()["content-range"], "bytes 3-6/10");
    let mut bytes = vec![];
    while let Some(chunk) = file.chunk().await.unwrap() {
        bytes.extend_from_slice(&chunk)
    }
    assert_eq!(bytes, b"3456");
    assert_eq!(
        f.connector
            .diagnostics()
            .iter()
            .filter(|r| r.steps.iter().any(|s| s.method == "challenge"))
            .count(),
        1,
        "A warm directory read must reuse the verified signed session"
    );
    let diagnostic = serde_json::to_string(&f.connector.diagnostics()).unwrap();
    for secret in ["password", "Authorization", "credential"] {
        assert!(!diagnostic.contains(secret));
    }
}

#[tokio::test]
async fn desktop_writes_use_tus_and_cannot_replace_existing_targets_or_replay_a_denied_delete() {
    let f = fixture();
    f.connector
        .file_request(
            &f.group,
            &f.peer,
            FileRequest::Mkdir {
                path: "/Files/上传".into(),
            },
        )
        .await
        .unwrap();
    let upload = f
        .connector
        .file_request(
            &f.group,
            &f.peer,
            FileRequest::UploadCreate {
                path: "/Files/上传/文件.txt".into(),
                length: 6,
            },
        )
        .await
        .unwrap();
    let id = upload.response.headers()["location"]
        .to_str()
        .unwrap()
        .strip_prefix("/api/v1/uploads/")
        .unwrap()
        .to_string();
    assert!(
        !f.files.join("上传/文件.txt").exists(),
        "Partial upload is not a visible completed file"
    );
    f.connector
        .file_request(
            &f.group,
            &f.peer,
            FileRequest::UploadAppend {
                id: id.clone(),
                offset: 0,
                bytes: b"abc".to_vec(),
            },
        )
        .await
        .unwrap();
    assert!(!f.files.join("上传/文件.txt").exists());
    f.connector
        .file_request(
            &f.group,
            &f.peer,
            FileRequest::UploadAppend {
                id,
                offset: 3,
                bytes: b"def".to_vec(),
            },
        )
        .await
        .unwrap();
    assert_eq!(
        std::fs::read(f.files.join("上传/文件.txt")).unwrap(),
        b"abcdef"
    );
    std::fs::write(f.files.join("keep.txt"), b"KEEP").unwrap();
    assert!(
        f.connector
            .file_request(
                &f.group,
                &f.peer,
                FileRequest::Rename {
                    path: "/Files/上传/文件.txt".into(),
                    destination: "/Files/keep.txt".into()
                }
            )
            .await
            .err()
            .unwrap()
            .contains("[conflict]")
    );
    assert_eq!(std::fs::read(f.files.join("keep.txt")).unwrap(), b"KEEP");
    f.service
        .groups()
        .configure(&f.group, false, Permissions::default())
        .unwrap();
    assert!(
        f.connector
            .file_request(
                &f.group,
                &f.peer,
                FileRequest::Delete {
                    path: "/Files/keep.txt".into()
                }
            )
            .await
            .err()
            .unwrap()
            .contains("[forbidden]")
    );
    assert!(f.files.join("keep.txt").exists());
    assert_eq!(
        f.connector
            .diagnostics()
            .iter()
            .filter(|r| r.trigger == "file.delete")
            .count(),
        1,
        "Denied writes must not be resubmitted"
    );
}

#[tokio::test]
async fn invalid_paths_ranges_and_upload_ids_fail_before_any_network_probe() {
    let f = fixture();
    for request in [
        FileRequest::Stat {
            path: "/Files/../secret".into(),
        },
        FileRequest::Content {
            path: "/Files/a".into(),
            range: Some("bytes=0-3,8-9".into()),
        },
        FileRequest::UploadCancel {
            id: "../../groups".into(),
        },
        FileRequest::List {
            path: "/".into(),
            offset: 0,
            limit: 2001,
            revision: None,
            fresh:false,
        },
    ] {
        assert!(
            f.connector
                .file_request(&f.group, &f.peer, request)
                .await
                .is_err()
        );
    }
    assert!(f.connector.diagnostics().is_empty());
}

#[tokio::test]
async fn local_revocation_invalidates_an_inflight_stream_and_fresh_join_cannot_revive_its_lease() {
    let f = fixture();
    std::fs::write(f.files.join("stream.txt"), b"content").unwrap();
    let mut stream = f
        .connector
        .file_request(
            &f.group,
            &f.peer,
            FileRequest::Content {
                path: "/Files/stream.txt".into(),
                range: None,
            },
        )
        .await
        .unwrap();
    f.client.forget(&f.group, true).unwrap();
    assert!(stream.chunk().await.is_err());
    let approval = f
        .service
        .groups()
        .approve(&f.group, &f.client.request("Rejoined").unwrap(), true)
        .unwrap();
    f.client.join(approval, Permissions::default()).unwrap();
    assert!(
        stream.lease.check().is_err(),
        "Old file handles cannot survive group ABA"
    );
    let newer = f
        .connector
        .file_request(
            &f.group,
            &f.peer,
            FileRequest::Stat {
                path: "/Files/stream.txt".into(),
            },
        )
        .await
        .unwrap();
    f.connector.invalidate();
    assert!(
        newer.lease.check().is_err(),
        "Local trust changes revoke outstanding handles immediately"
    );
}
