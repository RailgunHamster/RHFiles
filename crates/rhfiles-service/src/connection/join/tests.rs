use super::*;
use crate::{
    Service, ShareConfig,
    connection::{Connector, FileRequest},
};
use serde_json::{Value, json};
use std::sync::Arc;

fn node(root: &std::path::Path, name: &str) -> Arc<Groups> {
    Arc::new(Groups::open(&root.join(name)).unwrap())
}
fn edited(uri: &str, update: impl FnOnce(&mut Value)) -> String {
    let mut value: Value = serde_json::from_slice(
        &B64.decode(uri.strip_prefix(INVITATION_PREFIX).unwrap())
            .unwrap(),
    )
    .unwrap();
    update(&mut value);
    format!(
        "{INVITATION_PREFIX}{}",
        B64.encode(serde_json::to_vec(&value).unwrap())
    )
}
fn fixture() -> (tempfile::TempDir, Arc<Groups>, String, Service) {
    let dir = tempfile::tempdir().unwrap();
    let groups = node(dir.path(), "inviter");
    let id = groups
        .create(
            "Generated QA only",
            "Inviter",
            Permissions {
                write: true,
                delete: true,
            },
        )
        .unwrap();
    let files = dir.path().join("files");
    std::fs::create_dir(&files).unwrap();
    std::fs::write(files.join("fixture.txt"), b"generated fixture").unwrap();
    // macOS's system temp path traverses /var -> /private/var. Match the other
    // service fixtures without weakening the production no-symlink root guard.
    let files = files.canonicalize().unwrap();
    let service = Service::start_grouped(
        &dir.path().join("service"),
        vec![ShareConfig {
            name: "Files".into(),
            path: files,
        }],
        "127.0.0.1:0".parse().unwrap(),
        &[],
        groups.clone(),
    )
    .unwrap();
    (dir, groups, id, service)
}
#[tokio::test]
async fn real_tls_invitation_joins_a_computer_once_and_file_access_uses_group_authorization() {
    let (dir, inviter, id, service) = fixture();
    let guest = node(dir.path(), "guest");
    let uri = service.group_invitation(&id, false).unwrap()["uri"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(
        join_invitation(&guest, &uri, "QA computer", true, Permissions::default())
            .await
            .unwrap(),
        id
    );
    assert!(!guest.access(&id, &inviter.device_id(), true).unwrap().write);
    let connector = Connector::new(guest.clone());
    let mut result = connector
        .file_request(
            &id,
            &inviter.device_id(),
            FileRequest::Content {
                path: "/Files/fixture.txt".into(),
                range: None,
            },
        )
        .await
        .unwrap();
    assert_eq!(
        result.chunk().await.unwrap().unwrap(),
        &b"generated fixture"[..]
    );
    // Incoming invitations never supply an independent authorization.
    inviter.remove(&id, &guest.device_id()).unwrap();
    assert!(
        connector
            .file_request(
                &id,
                &inviter.device_id(),
                FileRequest::Stat {
                    path: "/Files/fixture.txt".into()
                }
            )
            .await
            .is_err()
    );
    let second = node(dir.path(), "second");
    assert!(
        join_invitation(
            &second,
            &uri,
            "Other computer",
            true,
            Permissions::default()
        )
        .await
        .unwrap_err()
        .contains("已使用或过期")
    );
    assert!(
        second.state().unwrap()["groups"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}
#[tokio::test]
async fn wrong_pin_is_terminal_and_does_not_consume_the_invitation() {
    let (dir, _, id, service) = fixture();
    let guest = node(dir.path(), "guest");
    let uri = service.group_invitation(&id, false).unwrap()["uri"]
        .as_str()
        .unwrap()
        .to_owned();
    let wrong = edited(&uri, |v| v["fingerprint"] = json!("00".repeat(32)));
    assert!(
        join_invitation(&guest, &wrong, "QA", true, Permissions::default())
            .await
            .unwrap_err()
            .contains("证书身份不符")
    );
    assert!(
        guest.state().unwrap()["groups"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        join_invitation(&guest, &uri, "QA", true, Permissions::default())
            .await
            .unwrap(),
        id
    );
}
#[tokio::test]
async fn unconfirmed_invitation_does_not_mutate_pending_requests_or_consume_token() {
    let (dir, inviter, id, service) = fixture();
    let guest = node(dir.path(), "guest");
    let prior = guest.request("Offline request").unwrap();
    let uri = service.group_invitation(&id, false).unwrap()["uri"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(
        join_invitation(&guest, &uri, "QA", false, Permissions::default())
            .await
            .unwrap_err()
            .contains("确认信任")
    );
    let approval = inviter.approve(&id, &prior, false).unwrap();
    guest.join(approval, Permissions::default()).unwrap();
    let other = node(dir.path(), "other");
    join_invitation(
        &other,
        &uri,
        "Other",
        true,
        Permissions {
            write: true,
            delete: true,
        },
    )
    .await
    .unwrap();
    let grant = other.access(&id, &inviter.device_id(), true).unwrap();
    assert!(grant.write && grant.delete);
}
#[tokio::test]
async fn only_pre_send_connection_failure_can_fall_back_to_another_address() {
    let (dir, _, id, service) = fixture();
    let guest = node(dir.path(), "guest");
    let uri = service.group_invitation(&id, false).unwrap()["uri"]
        .as_str()
        .unwrap()
        .to_owned();
    let closed = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = closed.local_addr().unwrap();
    drop(closed);
    let uri = edited(&uri, |v| {
        v["endpoints"]
            .as_array_mut()
            .unwrap()
            .insert(0, json!(format!("https://{address}")));
    });
    assert_eq!(
        join_invitation(&guest, &uri, "QA", true, Permissions::default())
            .await
            .unwrap(),
        id
    );
}
#[test]
fn invitation_input_rejects_bad_type_encoding_identity_token_and_public_addresses() {
    let value = json!({"version":1,"groupId":"ab".repeat(32),"deviceId":"cd".repeat(32),"fingerprint":"ef".repeat(32),"endpoints":["https://127.0.0.1:39128"],"token":B64.encode([7u8;32])});
    let uri = format!("{INVITATION_PREFIX}{}", B64.encode(value.to_string()));
    assert!(parse(&uri).is_ok());
    for (key, value) in [
        ("version", json!(2)),
        ("groupId", json!("not-an-id")),
        ("deviceId", json!("AB".repeat(32))),
        ("fingerprint", json!("wrong")),
        ("token", json!("short")),
        ("endpoints", json!(["https://8.8.8.8:443"])),
        ("endpoints", json!(["http://127.0.0.1:39128"])),
        ("endpoints", json!([])),
    ] {
        assert!(parse(&edited(&uri, |v| v[key] = value)).is_err(), "{key}");
    }
    for invalid in [
        "rhfiles-group-request:v1:abc".into(),
        format!("{INVITATION_PREFIX}invalid!"),
        "a".repeat(360_001),
    ] {
        assert!(parse(&invalid).is_err());
    }
}
#[tokio::test]
async fn a_tls_connect_timeout_before_sending_can_use_the_next_private_address() {
    let (dir, _, id, service) = fixture();
    let guest = node(dir.path(), "guest");
    let stalled = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = stalled.local_addr().unwrap();
    let task = tokio::spawn(async move {
        let (_stream, _) = stalled.accept().await.unwrap();
        std::future::pending::<()>().await;
    });
    let uri = service.group_invitation(&id, false).unwrap()["uri"]
        .as_str()
        .unwrap()
        .to_owned();
    let uri = edited(&uri, |v| {
        v["endpoints"]
            .as_array_mut()
            .unwrap()
            .insert(0, json!(format!("https://{address}")));
    });
    let result = join_invitation(&guest, &uri, "QA", true, Permissions::default()).await;
    task.abort();
    let _ = task.await;
    assert_eq!(result.unwrap(), id);
}
#[test]
fn approval_must_match_the_invited_group_device_and_current_request() {
    let (dir, inviter, id, service) = fixture();
    let guest = node(dir.path(), "guest");
    let uri = service.group_invitation(&id, false).unwrap()["uri"]
        .as_str()
        .unwrap()
        .to_owned();
    let invitation = parse(&uri).unwrap();
    let request = guest.request("QA").unwrap();
    let packet = inviter.approve(&id, &request, false).unwrap();
    validate_packet(&invitation, &request, &packet).unwrap();
    let newer = guest.request("QA again").unwrap();
    assert!(validate_packet(&invitation, &newer, &packet).is_err());
    let mut wrong = parse(&uri).unwrap();
    wrong.group_id = "00".repeat(32);
    assert!(validate_packet(&wrong, &request, &packet).is_err());
    wrong = parse(&uri).unwrap();
    wrong.device_id = "00".repeat(32);
    assert!(validate_packet(&wrong, &request, &packet).is_err());
}
#[tokio::test]
async fn a_post_that_reached_the_server_is_never_replayed_after_a_timeout() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let dir = tempfile::tempdir().unwrap();
    let guest = node(dir.path(), "guest");
    let identity = dir.path().join("tls");
    std::fs::create_dir(&identity).unwrap();
    let (fingerprint, tls) = crate::identity::load(&identity).unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let address = listener.local_addr().unwrap();
    let endpoint = format!("https://{address}");
    let count = Arc::new(AtomicUsize::new(0));
    let counter = count.clone();
    let router = axum::Router::new().route(
        "/api/v1/groups/invitations/redeem",
        axum::routing::post(move |body: axum::body::Bytes| {
            let counter = counter.clone();
            async move {
                assert!(!body.is_empty());
                counter.fetch_add(1, Ordering::SeqCst);
                std::future::pending::<String>().await
            }
        }),
    );
    let handle = axum_server::Handle::new();
    let stopping = handle.clone();
    let task = tokio::spawn(async move {
        axum_server::from_tcp_rustls(
            listener,
            axum_server::tls_rustls::RustlsConfig::from_config(tls),
        )
        .unwrap()
        .handle(handle)
        .serve(router.into_make_service())
        .await
        .unwrap();
    });
    stopping.listening().await.unwrap();
    let value = json!({"version":1,"groupId":"ab".repeat(32),"deviceId":"cd".repeat(32),"fingerprint":fingerprint,
        "endpoints":[endpoint,format!("https://[::ffff:127.0.0.1]:{}",address.port())],"token":B64.encode([7u8;32])});
    // Use a second valid address to the same listener; duplicates must not be
    // the reason the mutation isn't retried.
    let uri = format!("{INVITATION_PREFIX}{}", B64.encode(value.to_string()));
    let result = join_invitation(&guest, &uri, "QA", true, Permissions::default()).await;
    stopping.shutdown();
    task.await.unwrap();
    assert!(result.unwrap_err().contains("未自动重发"));
    assert_eq!(count.load(Ordering::SeqCst), 1);
    assert!(
        guest.state().unwrap()["groups"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}
