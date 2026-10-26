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
use serde_json::Value;
use std::{path::PathBuf, sync::Arc};

struct Fixture {
    _root: tempfile::TempDir,
    files: PathBuf,
    service: Service,
    client: Arc<Groups>,
    connector: Connector,
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
    let connector = Connector::new(client.clone());
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
