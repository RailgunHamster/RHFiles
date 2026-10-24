use rhfiles_service::{
    Permissions, Service, ShareConfig,
    connection::Connector,
    groups::{Groups, Server},
};
use std::sync::Arc;

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
    assert_eq!(r.outcome, "connected", "{r:?}");
    assert_ne!(r.endpoint, Some(rogue_url));
    assert!(r.steps.iter().any(|s| s.code == "identity_mismatch"));
    assert!(rogue.server.status().devices.is_empty());
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
