use rhfiles_service::{
    Permissions, Service, ShareConfig,
    connection::Connector,
    groups::{Groups, Server},
};
use std::sync::Arc;
use std::time::Duration;

struct Fixture {
    _dir: tempfile::TempDir,
    server: Service,
    client: Arc<Groups>,
    id: String,
    peer: String,
}
fn setup() -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    // macOS temporary roots commonly start with /var -> /private/var. The
    // production share guard correctly refuses symlink ancestors; normalize
    // the fixture rather than weakening that guard or skipping these tests.
    let root = dir.path().canonicalize().unwrap();
    let data = root.join("server");
    let files = root.join("files");
    std::fs::create_dir_all(&files).unwrap();
    let host = Arc::new(Groups::open(&data).unwrap());
    let id = host
        .create("Recovery test", "Host", Permissions::default())
        .unwrap();
    let client = Arc::new(Groups::open(&root.join("client")).unwrap());
    let request = client.request("Client").unwrap();
    let approval = host.approve(&id, &request, false).unwrap();
    client.join(approval, Permissions::default()).unwrap();
    let peer = host.device_id();
    let server = Service::start_grouped(
        &data,
        vec![ShareConfig {
            name: "Files".into(),
            path: files,
        }],
        "127.0.0.1:0".parse().unwrap(),
        &[],
        host.clone(),
    )
    .unwrap();
    let status = server.status();
    host.advertise(Server {
        fingerprint: status.fingerprint,
        endpoints: vec![format!("https://127.0.0.1:{}", status.port)],
    })
    .unwrap();
    client.merge(&id, &host.packet(&id).unwrap()).unwrap();
    Fixture {
        _dir: dir,
        server,
        client,
        id,
        peer,
    }
}
#[tokio::test]
async fn real_tls_authenticates_expected_group_key_and_redacts_diagnostics() {
    let f = setup();
    let c = Connector::new(f.client.clone());
    let r = c.connect(&f.id, &f.peer, None, "test").await;
    assert_eq!(r.outcome, "connected", "{r:?}");
    assert_eq!(r.certainty, "confirmed");
    let text = serde_json::to_string(&c.diagnostics()).unwrap();
    for secret in ["password", "username", "Authorization", "privateKey"] {
        assert!(!text.contains(secret));
    }
    assert!(
        r.steps
            .iter()
            .any(|s| s.method == "mdns" && s.code == "already_connected")
    );
}
#[tokio::test]
async fn stale_address_recovers_to_a_signed_new_address_without_new_pairing() {
    let f = setup();
    let host = f.server.groups();
    let status = f.server.status();
    let live = status.endpoints[0].clone();
    host.advertise(Server {
        fingerprint: status.fingerprint,
        endpoints: vec!["https://127.0.0.1:1".into(), live.clone()],
    })
    .unwrap();
    f.client.merge(&f.id, &host.packet(&f.id).unwrap()).unwrap();
    let c = Connector::new(f.client.clone());
    let r = c
        .connect(&f.id, &f.peer, Some("https://127.0.0.1:1".into()), "test")
        .await;
    assert_eq!(r.outcome, "connected", "{r:?}");
    assert_eq!(r.endpoint, Some(live));
    assert!(r.steps.iter().any(|s| s.outcome == "failed"));
    assert!(r.duration_ms < 15000);
}
#[tokio::test]
async fn reused_ip_with_another_certificate_never_receives_group_credentials() {
    let f = setup();
    let rogue = setup();
    let rogue_url = rogue.server.status().endpoints[0].clone();
    let c = Connector::new(f.client.clone());
    let r = c
        .connect(&f.id, &f.peer, Some(rogue_url.clone()), "test")
        .await;
    assert_eq!(r.outcome, "authorization_rejected", "{r:?}");
    assert_eq!(r.endpoint, None);
    assert!(r.steps.iter().any(|s| s.code == "identity_mismatch"));
    assert_eq!(rogue.server.groups().state().unwrap()["groups"].as_array().unwrap().len(),1);
}
#[tokio::test]
async fn group_deletion_and_remote_denial_do_not_trigger_discovery() {
    let f = setup();
    let c = Connector::new(f.client.clone());
    f.server
        .groups()
        .configure(&f.id, false, Permissions::default())
        .unwrap();
    let denied = c.connect(&f.id, &f.peer, None, "test").await;
    assert_eq!(denied.outcome, "authorization_rejected", "{denied:?}");
    assert!(!denied.steps.iter().any(|s| s.method == "mdns"));
    f.client.forget(&f.id, true).unwrap();
    let removed = c.connect(&f.id, &f.peer, None, "test").await;
    assert_eq!(removed.outcome, "authorization_revoked");
    assert_eq!(removed.steps.len(), 1);
}

#[tokio::test]
async fn cancelling_a_hung_tls_connection_releases_the_task_promptly() {
    let f = setup();
    let connector = Arc::new(Connector::new(f.client.clone()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let hold = tokio::spawn(async move {
        let (_socket, _) = listener.accept().await.unwrap();
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    });
    let c = connector.clone();
    let id = f.id.clone();
    let peer = f.peer.clone();
    let task = tokio::spawn(async move {
        c.connect(&id, &peer, Some(format!("https://{address}")), "test")
            .await
    });
    tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    assert!(connector.cancel(&f.id, &f.peer));
    let report = tokio::time::timeout(std::time::Duration::from_secs(1), task)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(report.outcome, "cancelled");
    hold.abort();
}

#[tokio::test]
async fn invalid_manual_addresses_never_leak_pasted_credentials_into_diagnostics() {
    let f = setup();
    let connector = Connector::new(f.client.clone());
    let report = connector
        .connect(
            &f.id,
            &f.peer,
            Some("https://user:secret@8.8.8.8/?token=private".into()),
            "test",
        )
        .await;
    assert_eq!(report.outcome, "invalid_endpoint");
    let text = serde_json::to_string(&connector.diagnostics()).unwrap();
    assert!(!text.contains("secret"));
    assert!(!text.contains("token="));
}

#[tokio::test]
async fn concurrent_requests_coalesce_instead_of_repeating_authentication() {
    let f = setup();
    let connector = Connector::new(f.client.clone());
    let (a, b) = tokio::join!(
        connector.connect(&f.id, &f.peer, None, "test"),
        connector.connect(&f.id, &f.peer, None, "test")
    );
    assert_eq!(a.outcome, "connected");
    assert_eq!(b.outcome, "connected");
    assert!(
        a.steps
            .iter()
            .chain(b.steps.iter())
            .any(|s| s.code == "reused_verified_route")
    );
}

// A real TCP/TLS tunnel gives the resolver a slow cold handshake or a single
// dropped connection, without mocking identity verification or changing the OS.
async fn proxy(
    f: &Fixture,
    delay: Duration,
    drop_first: bool,
) -> (String, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("https://{}", listener.local_addr().unwrap());
    let port = f.server.status().port;
    f.server
        .groups()
        .advertise(Server {
            fingerprint: f.server.status().fingerprint,
            endpoints: vec![url.clone()],
        })
        .unwrap();
    f.client
        .merge(&f.id, &f.server.groups().packet(&f.id).unwrap())
        .unwrap();
    let handle = tokio::spawn(async move {
        let mut first = true;
        while let Ok((mut incoming, _)) = listener.accept().await {
            if first && drop_first {
                first = false;
                drop(incoming);
                continue;
            }
            first = false;
            let mut upstream = tokio::net::TcpStream::connect(("127.0.0.1", port))
                .await
                .unwrap();
            tokio::spawn(async move {
                tokio::time::sleep(delay).await;
                let _ = tokio::io::copy_bidirectional(&mut incoming, &mut upstream).await;
            });
        }
    });
    (url, handle)
}
#[tokio::test]
async fn cold_tls_after_idle_can_take_more_than_the_old_connect_timeout() {
    let f = setup();
    let (url, task) = proxy(&f, Duration::from_millis(2500), false).await;
    let c = Connector::new(f.client.clone());
    let r = c.connect(&f.id, &f.peer, None, "file_request").await;
    task.abort();
    assert_eq!(r.outcome, "connected", "{r:?}");
    assert_eq!(r.endpoint, Some(url));
    assert_eq!(r.attempts, 1);
    assert!(r.duration_ms >= 2500 && r.duration_ms < 15000);
}
#[tokio::test]
async fn transient_transport_failure_retries_the_same_endpoint_once() {
    let f = setup();
    let (url, task) = proxy(&f, Duration::ZERO, true).await;
    let c = Connector::new(f.client.clone());
    let r = c.connect(&f.id, &f.peer, None, "file_request").await;
    task.abort();
    assert_eq!(r.outcome, "connected", "{r:?}");
    assert_eq!(r.endpoint, Some(url));
    assert_eq!(r.attempts, 2);
    assert!(r.steps.iter().any(|s| s.code == "bounded_transport_retry"));
}
#[tokio::test]
async fn last_success_is_restored_without_persisting_session_credentials() {
    let f = setup();
    let c = Connector::new(f.client.clone());
    let first = c.connect(&f.id, &f.peer, None, "file_request").await;
    assert_eq!(first.outcome, "connected");
    let c = Connector::new(f.client.clone());
    let r = c.connect(&f.id, &f.peer, None, "file_request").await;
    assert_eq!(r.outcome, "connected");
    assert!(
        r.steps
            .iter()
            .any(|s| s.method == "last_success" && s.outcome == "succeeded")
    );
    let text =
        std::fs::read_to_string(f._dir.path().join("client/connection-history.json")).unwrap();
    for secret in ["password", "username", "credential", "privateKey"] {
        assert!(!text.contains(secret));
    }
    f.client.forget(&f.id, true).unwrap();
    let removed = Connector::new(f.client.clone())
        .connect(&f.id, &f.peer, None, "file_request")
        .await;
    assert_eq!(removed.outcome, "authorization_revoked");
    assert_eq!(removed.attempts, 0);
}
#[tokio::test]
async fn manual_retry_can_recover_while_automatic_calls_are_cooling_down() {
    let f = setup();
    let status = f.server.status();
    let host = f.server.groups();
    f.server.stop();
    tokio::time::sleep(Duration::from_millis(100)).await;
    let c = Connector::new(f.client.clone());
    let failed = c.connect(&f.id, &f.peer, None, "file_request").await;
    assert_eq!(failed.outcome, "unreachable", "{failed:?}");
    let blocked = c.connect(&f.id, &f.peer, None, "file_request").await;
    assert_eq!(blocked.outcome, "cooldown");
    assert_eq!(blocked.attempts, 0);
    let root = f._dir.path().canonicalize().unwrap();
    let _restarted = Service::start_grouped(
        &root.join("server"),
        vec![ShareConfig {
            name: "Files".into(),
            path: root.join("files"),
        }],
        format!("127.0.0.1:{}", status.port).parse().unwrap(),
        &[],
        host,
    )
    .unwrap();
    let r = c.connect(&f.id, &f.peer, None, "manual").await;
    assert_eq!(r.outcome, "connected", "{r:?}");
    assert!(r.steps.iter().any(|s| s.code == "manual_retry_allowed"));
}
