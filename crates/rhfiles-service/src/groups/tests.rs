use super::*;
use std::sync::Arc;
struct ExternalStore {
    groups: Arc<Groups>,
    // Retain the old OS-store incarnation while allocating its replacement,
    // so even allocator reuse cannot simulate an unchanged epoch in this test.
    epochs: Mutex<BTreeMap<String,Arc<()>>>,
}
impl ServerGroupBackend for ExternalStore {
    fn public_key(&self)->String {self.groups.public_key()}
    fn packet(&self,id:&str)->Result<Packet>{self.groups.packet(id)}
    fn advertise(&self,server:Server)->Result<()>{self.groups.advertise(server)}
    fn accept(&self,id:&str,p:&Packet,peer:&str)->Result<String>{self.groups.merge(id,p)?;self.groups.access(id,peer,false)?;Ok(self.groups.doc.lock().unwrap().groups[id].member(peer)?.name)}
    fn access(&self,id:&str,peer:&str,files:bool)->Result<(Permissions,String)>{let (permissions,epoch)=self.groups.session_access(id,peer,files,None)?;let token=format!("{:p}",Arc::as_ptr(&epoch));self.epochs.lock().unwrap().insert(id.into(),epoch);Ok((permissions,token))}
    fn sign(&self,message:&[u8])->Result<Vec<u8>>{Ok(self.groups.key.as_ref().unwrap().sign(&SystemRandom::new(),message).map_err(|_|bad("test signer"))?.as_ref().to_vec())}
    fn approve(&self,id:&str,r:&Signed,invite:bool)->Result<Packet>{self.groups.approve(id,r,invite)}
    fn require_inviter(&self,id:&str)->Result<()>{self.groups.require_inviter(id)}
    fn state(&self)->Result<serde_json::Value>{self.groups.state()}
}
#[tokio::test]
async fn externally_owned_group_identity_serves_real_tls_without_a_second_key_or_database_and_revokes_aba_handles(){
    use crate::connection::{Connector,FileRequest};
    let root=tempfile::tempdir().unwrap();let root_path=root.path().canonicalize().unwrap();
    let desktop=Arc::new(Groups::open(&root_path.join("desktop")).unwrap());
    let phone=Arc::new(Groups::open(&root_path.join("os-owned-store")).unwrap());
    let id=desktop.create("RH","Desktop",Permissions{write:true,delete:true}).unwrap();
    let join=desktop.approve(&id,&phone.request("Phone").unwrap(),true).unwrap();phone.join(join,Permissions{write:true,delete:true}).unwrap();
    let data=root_path.join("service-only-tls-data");let backend=Arc::new(ExternalStore{groups:phone.clone(),epochs:Default::default()});
    let external=Arc::new(Groups::with_server_backend(&data,backend).unwrap());assert_eq!(external.device_id(),phone.device_id());
    assert!(external.create("Must not fork the OS store","Other identity",Permissions::default()).is_err());
    let files=root_path.join("shared");std::fs::create_dir(&files).unwrap();std::fs::write(files.join("read.txt"),b"fixture").unwrap();
    let service=crate::Service::start_grouped(&data,vec![crate::ShareConfig{name:"Files".into(),path:files.clone()}],"127.0.0.1:0".parse().unwrap(),&[],external.clone()).unwrap();
    assert!(!data.join(".rhfiles-service-group-key.pkcs8").exists());assert!(!data.join("groups.json").exists());
    desktop.merge(&id,&phone.packet(&id).unwrap()).unwrap();let client=Connector::new(desktop.clone());
    let mut stream=client.file_request(&id,&phone.device_id(),FileRequest::Content{path:"/Files/read.txt".into(),range:None}).await.unwrap();
    assert_eq!(stream.chunk().await.unwrap().unwrap(),&b"fixture"[..]);
    let old=stream.lease.clone();let prior=external.session_access(&id,&desktop.device_id(),true,None).unwrap().1;
    phone.forget(&id,true).unwrap();assert!(external.session_access(&id,&desktop.device_id(),true,Some(&prior)).is_err());
    let join=desktop.approve(&id,&phone.request("Phone again").unwrap(),true).unwrap();phone.join(join,Permissions::default()).unwrap();
    assert!(old.check().is_ok(),"Client membership was not removed; server revocation is checked server-side");
    // The server's old Access must fail on the changed external-store incarnation.
    assert!(external.session_access(&id,&desktop.device_id(),true,Some(&prior)).is_err());
    let result=client.file_request(&id,&phone.device_id(),FileRequest::Stat{path:"/Files/read.txt".into()}).await.unwrap().json(65536).await.unwrap();assert_eq!(result["size"],7);
    assert!(client.file_request(&id,&phone.device_id(),FileRequest::Mkdir{path:"/Files/denied".into()}).await.err().unwrap().contains("forbidden"));
    assert!(!files.join("denied").exists());drop(service);
}
fn node() -> (tempfile::TempDir, Groups) {
    let d = tempfile::tempdir().unwrap();
    let g = Groups::open(d.path()).unwrap();
    (d, g)
}
fn add(inviter: &Groups, guest: &Groups, id: &str, invite: bool) {
    let r = guest.request("guest").unwrap();
    let p = inviter.approve(id, &r, invite).unwrap();
    guest.join(p, Permissions::default()).unwrap();
}
#[test]
fn offline_introduction_does_not_require_inviter_online() {
    let (_a, a) = node();
    let (_b, b) = node();
    let (_c, c) = node();
    let id = a.create("Home", "A", Permissions::default()).unwrap();
    add(&a, &b, &id, true);
    add(&b, &c, &id, false);
    // A missed C's enrollment and B is not involved in this authentication.
    let n = random().unwrap();
    let proof = c.proof(&id, &n, &"a".repeat(64)).unwrap();
    assert!(a.access(&id, &c.device_id(), true).is_err());
    a.authenticate(&id, &c.packet(&id).unwrap(), &proof, &n, &"a".repeat(64))
        .unwrap();
    assert!(a.access(&id, &c.device_id(), true).is_ok());
    assert!(c.approve(&id, &a.request("A").unwrap(), false).is_err());
}
#[test]
fn refusal_applies_across_existing_and_future_local_groups() {
    let (_a,a)=node();let (_b,b)=node();let first=a.create("First","A",Permissions::default()).unwrap();
    let second=a.create("Second","A",Permissions::default()).unwrap();add(&a,&b,&first,false);add(&a,&b,&second,false);
    a.remove(&first,&b.device_id()).unwrap();assert!(a.access(&second,&b.device_id(),true).is_err());
    let third=a.create("Third","A",Permissions::default()).unwrap();assert!(a.approve(&third,&b.request("renamed B").unwrap(),false).is_err());
    a.restore(&first,&b.device_id(),true).unwrap();assert!(a.access(&second,&b.device_id(),true).is_ok());
}
#[test]
fn local_removal_survives_newer_advertisements_replays_restart_and_join() {
    let (d, a) = node();
    let (_b, b) = node();
    let id = a.create("Home", "A", Permissions::default()).unwrap();
    add(&a, &b, &id, true);
    a.remove(&id, &b.device_id()).unwrap();
    for _ in 0..3 {
        b.advertise(Server {
            endpoints: vec!["https://192.168.1.55:39128".into()],
            fingerprint: "ab".repeat(32),
        })
        .unwrap();
        a.merge(&id, &b.packet(&id).unwrap()).unwrap();
    }
    a.join(
        b.packet(&id).unwrap(),
        Permissions {
            write: true,
            delete: true,
        },
    )
    .unwrap();
    drop(a);
    let a = Groups::open(d.path()).unwrap();
    assert!(a.access(&id, &b.device_id(), false).is_err());
    let n = random().unwrap();
    assert!(
        a.authenticate(
            &id,
            &b.packet(&id).unwrap(),
            &b.proof(&id, &n, &"a".repeat(64)).unwrap(),
            &n,
            &"a".repeat(64)
        )
        .is_err()
    );
    assert!(a.restore(&id, &b.device_id(), false).is_err());
    assert!(a.access(&id, &b.device_id(), false).is_err());
    a.restore(&id, &b.device_id(), true).unwrap();
    assert!(a.access(&id, &b.device_id(), true).is_ok());
    assert!(!a.access(&id, &b.device_id(), true).unwrap().write);
}
#[test]
fn removed_inviter_cannot_introduce_new_members_but_old_peers_survive() {
    let (_a, a) = node();
    let (_b, b) = node();
    let (_c, c) = node();
    let (_d, d) = node();
    let id = a.create("Home", "A", Permissions::default()).unwrap();
    add(&a, &b, &id, true);
    add(&b, &c, &id, false);
    a.merge(&id, &c.packet(&id).unwrap()).unwrap();
    a.remove(&id, &b.device_id()).unwrap();
    add(&b, &d, &id, false);
    a.merge(&id, &d.packet(&id).unwrap()).unwrap();
    assert!(a.access(&id, &c.device_id(), true).is_ok());
    assert!(a.access(&id, &d.device_id(), true).is_err());
    a.restore(&id, &b.device_id(), true).unwrap();
    a.merge(&id, &d.packet(&id).unwrap()).unwrap();
    assert!(a.access(&id, &d.device_id(), true).is_ok());
}
#[test]
fn packet_tampering_cross_group_spoofing_and_unrequested_join_fail() {
    let (_a, a) = node();
    let (_b, b) = node();
    let (_c, c) = node();
    let id = a.create("Home", "A", Permissions::default()).unwrap();
    let request = b.request("B").unwrap();
    let p = a.approve(&id, &request, false).unwrap();
    assert!(c.join(p.clone(), Permissions::default()).is_err());
    b.request("new request").unwrap();
    assert!(b.join(p, Permissions::default()).is_err());
    let mut request = b.request("B").unwrap();
    request.payload.push('A');
    assert!(a.approve(&id, &request, false).is_err());
    add(&a, &b, &id, false); // Already accepted certificate has old nonce; see separate fresh request below.
}
#[test]
fn removal_immediately_invalidates_existing_file_and_webdav_handles() {
    let (d, a) = node();
    let (_b, b) = node();
    let id = a
        .create(
            "Home",
            "A",
            Permissions {
                write: true,
                delete: true,
            },
        )
        .unwrap();
    add(&a, &b, &id, false);
    let groups = Arc::new(a);
    let auth = crate::auth::Auth::new(d.path()).unwrap();
    let credential = auth
        .group_session(groups.clone(), &id, &b.device_id())
        .unwrap();
    let header = format!(
        "Basic {}",
        base64::engine::general_purpose::STANDARD.encode(format!(
            "{}:{}",
            credential["username"].as_str().unwrap(),
            credential["password"].as_str().unwrap()
        ))
    );
    let old = auth.authenticate(Some(&header), "GET").unwrap();
    assert!(old.check(true, true).is_ok());
    groups.configure(&id, true, Permissions::default()).unwrap();
    assert!(old.check(true, false).is_err());
    groups.remove(&id, &b.device_id()).unwrap();
    assert!(old.check(false, false).is_err());
    assert!(auth.authenticate(Some(&header), "GET").is_err());
    assert!(
        !String::from_utf8(std::fs::read(d.path().join("devices.json")).unwrap_or_default())
            .unwrap()
            .contains(credential["password"].as_str().unwrap())
    );
}
#[test]
fn missing_key_or_corrupt_tombstone_file_fails_closed() {
    let (d, a) = node();
    let id = a.create("Home", "A", Permissions::default()).unwrap();
    a.remove(&id, &a.device_id()).unwrap();
    drop(a);
    std::fs::write(d.path().join("groups.json"), b"broken").unwrap();
    assert!(Groups::open(d.path()).is_err());
    std::fs::remove_file(d.path().join(".rhfiles-service-group-key.pkcs8")).unwrap();
    assert!(Groups::open(d.path()).is_err());
}
#[test]
fn network_packets_never_export_local_refusals_grants_or_private_keys() {
    let (_d, a) = node();
    let (_e, b) = node();
    let id = a
        .create(
            "Home",
            "A",
            Permissions {
                write: true,
                delete: true,
            },
        )
        .unwrap();
    add(&a, &b, &id, false);
    a.remove(&id, &b.device_id()).unwrap();
    let wire = serde_json::to_string(&a.packet(&id).unwrap()).unwrap();
    for secret in ["blocked", "removedAt", "permissions", "pkcs8", "password"] {
        assert!(!wire.contains(secret));
    }
    assert!(
        a.advertise(Server {
            endpoints: vec!["https://8.8.8.8:39128".into()],
            fingerprint: "a".repeat(64)
        })
        .is_err()
    );
}

#[test]
fn forgetting_is_confirmed_local_persistent_and_cannot_be_replayed() {
    let (data, a) = node();
    let (_b, b) = node();
    let id = a.create("Home", "A", Permissions::default()).unwrap();
    let other = a.create("Other", "A", Permissions::default()).unwrap();
    add(&a, &b, &id, true);
    let packet = b.packet(&id).unwrap();
    let identity = a.device_id();
    let before = a.state().unwrap();
    assert!(a.forget(&id, false).is_err());
    assert_eq!(a.state().unwrap(), before);
    a.forget(&id, true).unwrap();
    assert_eq!(a.state().unwrap()["groups"].as_array().unwrap().len(), 1);
    assert_eq!(a.state().unwrap()["groups"][0]["id"], other);
    assert!(a.packet(&id).is_err());
    assert!(a.merge(&id, &packet).is_err());
    assert!(a.join(packet, Permissions::default()).is_err());
    assert!(b.packet(&id).is_ok()); // no global deletion
    drop(a);
    let a = Groups::open(data.path()).unwrap();
    assert_eq!(a.device_id(), identity);
    assert!(a.packet(&id).is_err());
    assert!(a.packet(&other).is_ok());
    // Even the original creator can rejoin through a fresh request to a
    // remaining invite-capable member, without reconstructing a different group.
    add(&b, &a, &id, true);
    assert!(a.packet(&id).is_ok());
}

#[test]
fn forgotten_group_credentials_and_handles_stay_invalid_after_manual_rejoin() {
    let (data, a) = node();
    let (_b, b) = node();
    let id = a.create("Home", "A", Permissions::default()).unwrap();
    let other = a.create("Other", "A", Permissions::default()).unwrap();
    add(&a, &b, &id, true);
    let a = Arc::new(a);
    let auth = crate::auth::Auth::new(data.path()).unwrap();
    let header = |id: &str, peer: &str| {
        let c = auth.group_session(a.clone(), id, peer).unwrap();
        format!("Bearer {}:{}", c["username"].as_str().unwrap(), c["password"].as_str().unwrap())
    };
    let old_header = header(&id, &b.device_id());
    let old = auth.authenticate(Some(&old_header), "GET").unwrap();
    let other_header = header(&other, &a.device_id());
    let other_access = auth.authenticate(Some(&other_header), "GET").unwrap();
    a.forget(&id, true).unwrap();
    assert!(old.check(false, false).is_err());
    assert!(auth.authenticate(Some(&old_header), "GET").is_err());
    assert!(other_access.check(false, false).is_ok());
    add(&b, &a, &id, true);
    assert!(old.check(false, false).is_err());
    assert!(auth.authenticate(Some(&old_header), "GET").is_err());
    assert!(other_access.check(false, false).is_ok());
    let fresh = header(&id, &b.device_id());
    assert!(auth.authenticate(Some(&fresh), "GET").unwrap().check(false, false).is_ok());
}

#[test]
fn deleting_last_group_keeps_refusals_for_other_devices() {
    let (data, a) = node();
    let (_b, b) = node();
    let id = a.create("Home", "A", Permissions::default()).unwrap();
    add(&a, &b, &id, false);
    a.remove(&id, &b.device_id()).unwrap();
    a.forget(&id, true).unwrap();
    drop(a);
    let a = Groups::open(data.path()).unwrap();
    assert!(a.state().unwrap()["groups"].as_array().unwrap().is_empty());
    let new = a.create("New", "A", Permissions::default()).unwrap();
    assert!(a.approve(&new, &b.request("B").unwrap(), false).is_err());
}

#[test]
fn self_removed_group_can_be_forgotten_and_explicitly_rejoined_without_restoring_other_groups() {
    let (_data, a) = node();
    let (_b, b) = node();
    let id = a.create("Home", "A", Permissions::default()).unwrap();
    let other = a.create("Other", "A", Permissions::default()).unwrap();
    add(&a, &b, &id, true);
    a.remove(&id, &a.device_id()).unwrap();
    a.forget(&id, true).unwrap();
    assert!(a.join(b.packet(&id).unwrap(), Permissions::default()).is_err());
    add(&b, &a, &id, true);
    assert!(a.access(&id, &b.device_id(), true).is_ok());
    assert!(a.access(&other, &a.device_id(), true).is_err());
}

#[test]
fn failed_forget_persistence_does_not_remove_group_or_revoke_sessions() {
    let (data, a) = node();
    let id = a.create("Home", "A", Permissions::default()).unwrap();
    let before = a.state().unwrap();
    let (_, session) = a.session_access(&id, &a.device_id(), true, None).unwrap();
    std::fs::remove_file(data.path().join("groups.json")).unwrap();
    std::fs::create_dir(data.path().join("groups.json")).unwrap();
    assert!(a.forget(&id, true).is_err());
    assert_eq!(a.state().unwrap(), before);
    assert!(a.session_access(&id, &a.device_id(), true, Some(&session)).is_ok());
}
