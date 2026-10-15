use super::*;
use std::net::Shutdown;
fn wait(mut ready: impl FnMut() -> bool) {
    let end = std::time::Instant::now() + Duration::from_secs(15);
    while !ready() {
        assert!(std::time::Instant::now() < end, "condition timed out");
        std::thread::sleep(Duration::from_millis(20));
    }
}
struct Fixture {
    root: tempfile::TempDir,
    service: Service,
}
impl Fixture {
    fn new(alias: &str) -> Self {
        let root = tempfile::tempdir().unwrap();
        let service = Service::start(root.path().join("config"), alias.into(), 0, false).unwrap();
        Self { root, service }
    }
    fn address(&self) -> String {
        format!("127.0.0.1:{}", self.service.0.port)
    }
    fn dest(&self) -> PathBuf {
        let dest = self.root.path().join("dest");
        fs::create_dir_all(&dest).unwrap();
        dest
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.service.stop();
        std::thread::sleep(Duration::from_millis(75));
    }
}
fn request(receiver: &Fixture, request: Request) -> Value {
    let (mut stream, _) = tls::client(
        receiver.address().parse().unwrap(),
        Some(receiver.service.0.id.clone()),
    )
    .unwrap();
    tls::write_json(&mut stream, &request).unwrap();
    tls::read_json(&mut stream).unwrap()
}
#[test]
fn validates_portable_paths_and_parent_collisions() {
    for name in [
        "../x",
        "a/../b",
        "/root",
        "C:/x",
        "a\\b",
        "a//b",
        "a/./b",
        "CON.txt",
        "a:stream",
        "x\0y",
        "trailing.",
        "x?y",
        "LPT1",
    ] {
        assert!(files::relative(name).is_err(), "{name}");
    }
    assert!(files::relative("中文/hello 🙂.txt").is_ok());
    let entry = |path: &str, is_dir| files::Entry {
        path: path.into(),
        is_dir,
        size: 0,
    };
    assert!(files::validate(&[entry("a", false), entry("A", false)]).is_err());
    assert!(files::validate(&[entry("a", false), entry("a/b", false)]).is_err());
    assert!(files::validate(&[]).is_err());
}
#[test]
fn connection_scope_excludes_public_and_multicast() {
    for ip in [
        "0.0.0.0",
        "8.8.8.8",
        "224.0.0.168",
        "255.255.255.255",
        "2606:4700:4700::1111",
    ] {
        assert!(!lan_address(ip.parse().unwrap()), "{ip}");
    }
    for ip in [
        "127.0.0.1",
        "192.168.1.2",
        "10.0.2.2",
        "169.254.10.1",
        "::1",
        "fd00::1",
    ] {
        assert!(lan_address(ip.parse().unwrap()), "{ip}");
    }
}
#[test]
fn identity_is_persistent_and_private() {
    let folder = tempfile::tempdir().unwrap();
    let a = Service::start(folder.path().into(), "A".into(), 0, false).unwrap();
    let id = a.status().id;
    a.stop();
    let b = Service::start(folder.path().into(), "B".into(), 0, false).unwrap();
    assert_eq!(id, b.status().id);
    b.stop();
}
#[test]
fn actual_tls_transfer_preserves_tree_empty_files_and_source() {
    let sender = Fixture::new("Windows");
    let receiver = Fixture::new("Android");
    let peer = sender.service.probe(&receiver.address()).unwrap();
    let src = sender.root.path().join("中文 Bundle");
    fs::create_dir_all(src.join("empty")).unwrap();
    fs::create_dir_all(src.join("nested")).unwrap();
    let bytes = (0..1_500_000).map(|i| (i % 251) as u8).collect::<Vec<_>>();
    fs::write(src.join("nested/file.bin"), &bytes).unwrap();
    fs::write(src.join("zero"), []).unwrap();
    let id = sender
        .service
        .send(&peer.id, &peer.id, vec![src.clone()])
        .unwrap();
    wait(|| !receiver.service.status().transfers.is_empty());
    let incoming = receiver.service.status().transfers[0].clone();
    assert_eq!(incoming.state, "waiting");
    let destination = receiver.dest();
    fs::write(destination.join("keep"), "untouched").unwrap();
    assert_eq!(
        fs::read_dir(&destination).unwrap().count(),
        1,
        "no write before consent"
    );
    receiver
        .service
        .accept(&incoming.id, destination.clone())
        .unwrap();
    wait(|| {
        sender
            .service
            .status()
            .transfers
            .iter()
            .any(|t| t.id == id && !active(&t.state))
    });
    let outgoing = sender
        .service
        .status()
        .transfers
        .into_iter()
        .find(|t| t.id == id)
        .unwrap();
    assert_eq!(outgoing.state, "completed", "{}", outgoing.message);
    let received = receiver.service.status().transfers[0].clone();
    assert_eq!(received.state, "completed");
    let output = PathBuf::from(received.output);
    assert_eq!(
        fs::read(output.join("中文 Bundle/nested/file.bin")).unwrap(),
        bytes
    );
    assert!(output.join("中文 Bundle/empty").is_dir());
    assert_eq!(
        fs::metadata(output.join("中文 Bundle/zero")).unwrap().len(),
        0
    );
    assert_eq!(fs::read(src.join("nested/file.bin")).unwrap(), bytes);
    assert_eq!(
        fs::read_to_string(destination.join("keep")).unwrap(),
        "untouched"
    );
    assert_eq!(outgoing.bytes, 1_500_000);
    assert!(receiver.service.status().interrupted.is_empty());
}
#[test]
fn sender_requires_the_exact_confirmed_certificate() {
    let sender = Fixture::new("A");
    let receiver = Fixture::new("B");
    let peer = sender.service.probe(&receiver.address()).unwrap();
    assert!(sender
        .service
        .send(&peer.id, &"0".repeat(64), vec![])
        .is_err());
    assert!(tls::client(receiver.address().parse().unwrap(), Some("0".repeat(64))).is_err());
    assert!(receiver.service.status().transfers.is_empty());
}
#[test]
fn rejected_receiver_never_writes_or_changes_source() {
    let sender = Fixture::new("A");
    let receiver = Fixture::new("B");
    let peer = sender.service.probe(&receiver.address()).unwrap();
    let src = sender.root.path().join("file");
    fs::write(&src, "source").unwrap();
    sender
        .service
        .send(&peer.id, &peer.id, vec![src.clone()])
        .unwrap();
    wait(|| !receiver.service.status().transfers.is_empty());
    let incoming = receiver.service.status().transfers[0].id.clone();
    receiver.service.cancel(&incoming).unwrap();
    wait(|| sender.service.status().transfers[0].state == "failed");
    assert_eq!(fs::read_to_string(src).unwrap(), "source");
    assert!(!receiver.root.path().join("dest").exists());
}
#[test]
fn unauthorized_upload_and_traversal_cannot_write() {
    let receiver = Fixture::new("B");
    let bad = request(
        &receiver,
        Request::Offer {
            version: 1,
            alias: "evil".into(),
            entries: vec![files::Entry {
                path: "../escape".into(),
                is_dir: false,
                size: 1,
            }],
        },
    );
    assert_eq!(bad["state"], "error");
    assert!(receiver.service.status().transfers.is_empty());
    let good = request(
        &receiver,
        Request::Offer {
            version: 1,
            alias: "test".into(),
            entries: vec![files::Entry {
                path: "safe".into(),
                is_dir: false,
                size: 3,
            }],
        },
    );
    let id = good["id"].as_str().unwrap();
    let token = good["token"].as_str().unwrap();
    assert_eq!(
        request(
            &receiver,
            Request::Upload {
                id: id.into(),
                token: "forged".into()
            }
        )["state"],
        "error"
    );
    assert_eq!(
        request(
            &receiver,
            Request::Upload {
                id: id.into(),
                token: token.into()
            }
        )["state"],
        "error"
    );
    assert_eq!(receiver.service.status().transfers[0].state, "waiting");
}
#[test]
fn broken_and_hash_mismatched_streams_cleanup_only_owned_staging() {
    for wrong_hash in [false, true] {
        let receiver = Fixture::new("B");
        let dest = receiver.dest();
        fs::write(dest.join("keep"), "original").unwrap();
        let offer = request(
            &receiver,
            Request::Offer {
                version: 1,
                alias: "test".into(),
                entries: vec![files::Entry {
                    path: "safe".into(),
                    is_dir: false,
                    size: 3,
                }],
            },
        );
        let id = offer["id"].as_str().unwrap().to_string();
        receiver.service.accept(&id, dest.clone()).unwrap();
        let (mut stream, _) = tls::client(
            receiver.address().parse().unwrap(),
            Some(receiver.service.0.id.clone()),
        )
        .unwrap();
        tls::write_json(
            &mut stream,
            &Request::Upload {
                id: id.clone(),
                token: offer["token"].as_str().unwrap().into(),
            },
        )
        .unwrap();
        stream.write_all(b"abc").unwrap();
        stream.flush().unwrap();
        wait(|| receiver.service.status().transfers[0].state == "receiving");
        if wrong_hash {
            stream.write_all(&[0; 32]).unwrap();
            stream.flush().unwrap();
            let reply: Value = tls::read_json(&mut stream).unwrap();
            assert_eq!(reply["state"], "error");
        } else {
            stream.sock.shutdown(Shutdown::Both).unwrap();
        }
        drop(stream);
        wait(|| receiver.service.status().transfers[0].state == "failed");
        assert_eq!(fs::read_to_string(dest.join("keep")).unwrap(), "original");
        assert_eq!(fs::read_dir(dest).unwrap().count(), 1);
        assert!(receiver.service.status().interrupted.is_empty());
    }
}
#[test]
fn stop_cancels_pending_transfers_without_sending() {
    let sender = Fixture::new("A");
    let receiver = Fixture::new("B");
    let peer = sender.service.probe(&receiver.address()).unwrap();
    let src = sender.root.path().join("file");
    fs::write(&src, "source").unwrap();
    let id = sender
        .service
        .send(&peer.id, &peer.id, vec![src.clone()])
        .unwrap();
    wait(|| !receiver.service.status().transfers.is_empty());
    sender.service.stop();
    assert_eq!(
        sender
            .service
            .status()
            .transfers
            .into_iter()
            .find(|t| t.id == id)
            .unwrap()
            .state,
        "canceled"
    );
    assert_eq!(fs::read_to_string(src).unwrap(), "source");
}
