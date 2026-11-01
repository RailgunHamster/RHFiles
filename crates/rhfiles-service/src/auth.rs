use crate::model::*;
use base64::Engine;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::Path,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
use subtle::ConstantTimeEq;

#[derive(Debug, Clone)]
pub struct Access {
    pub edit_revision:Option<String>,
    pub committed_entry:Arc<Mutex<Option<(String,String)>>>,
    pub id: String,
    pub permissions: Permissions,
    pub live: Arc<AtomicBool>,
    pub method: String,
    pub compatibility_binding: Option<String>,
    pub credential_live: Option<Arc<AtomicBool>>,
    pub group: Option<(
        Arc<crate::groups::Groups>,
        String,
        String,
        std::time::Instant,
        Arc<()>,
    )>,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn old_password_database_is_cleared_and_never_restores_authorization() {
        let data = tempfile::tempdir().unwrap();
        let old = serde_json::json!([{"id":"old-device","name":"Old phone","permissions":{"write":true,"delete":true},"createdMs":1,"secretHash":hash("old-secret")}]);
        for _ in 0..2 {
            std::fs::write(data.path().join("devices.json"), old.to_string()).unwrap();
            let auth = Auth::new(data.path()).unwrap();
            assert!(
                auth.authenticate(Some("Bearer old-device:old-secret"), "GET")
                    .is_err()
            );
            let basic = format!(
                "Basic {}",
                base64::engine::general_purpose::STANDARD.encode("old-device:old-secret")
            );
            assert!(auth.authenticate(Some(&basic), "PUT").is_err());
            assert_eq!(
                std::fs::read_to_string(data.path().join("devices.json")).unwrap(),
                "[]"
            );
        }
    }
    #[test]
    fn rotating_group_sessions_keep_transfer_ownership_and_live_revocation() {
        let data = tempfile::tempdir().unwrap();
        let groups = Arc::new(crate::groups::Groups::open(data.path()).unwrap());
        let id = groups.create("Home", "A", Permissions::default()).unwrap();
        let auth = Auth::new(data.path()).unwrap();
        let first = auth
            .group_session(groups.clone(), &id, &groups.device_id())
            .unwrap();
        let second = auth
            .group_session(groups.clone(), &id, &groups.device_id())
            .unwrap();
        let header = |v: &serde_json::Value| {
            format!(
                "Bearer {}:{}",
                v["username"].as_str().unwrap(),
                v["password"].as_str().unwrap()
            )
        };
        let old = auth.authenticate(Some(&header(&first)), "GET").unwrap();
        let fresh = auth.authenticate(Some(&header(&second)), "GET").unwrap();
        assert_eq!(old.id, fresh.id);
        assert_ne!(first["username"], second["username"]);
        auth.sessions
            .lock()
            .unwrap()
            .get_mut(first["username"].as_str().unwrap())
            .unwrap()
            .1
            .group
            .as_mut()
            .unwrap()
            .3 = std::time::Instant::now() - std::time::Duration::from_secs(1);
        assert!(auth.authenticate(Some(&header(&first)), "GET").is_err());
        assert!(old.check(false, false).is_ok());
        auth.stop();
        assert!(old.check(false, false).is_err());
        assert!(fresh.check(false, false).is_err());
    }
    #[test]
    fn webdav_grants_survive_restart_but_not_remove_restore_or_forget() {
        let data=tempfile::tempdir().unwrap();
        let groups=Arc::new(crate::groups::Groups::open(data.path()).unwrap());
        let group=groups.create("DAV QA","Host",Permissions{write:true,delete:true}).unwrap();let peer=groups.device_id();
        let auth=Auth::new(data.path()).unwrap();
        assert!(auth.compatibility_grant(groups.clone(),&group,&peer).is_err());
        auth.compatibility_enabled(true);
        let credentials=auth.compatibility_grant(groups.clone(),&group,&peer).unwrap();
        let header=format!("Basic {}",base64::engine::general_purpose::STANDARD.encode(format!("{}:{}",credentials["username"].as_str().unwrap(),credentials["password"].as_str().unwrap())));
        let file=std::fs::read_to_string(data.path().join("webdav-grants.json")).unwrap();assert!(!file.contains(credentials["password"].as_str().unwrap()));
        let access=auth.authenticate_grouped(Some(&header),"GET",Some(&groups)).unwrap();assert!(access.check(true,true).is_ok());
        let restarted=Auth::new(data.path()).unwrap();let reopened=Arc::new(crate::groups::Groups::open(data.path()).unwrap());
        restarted.compatibility_enabled(true);assert!(restarted.authenticate_grouped(Some(&header),"GET",Some(&reopened)).is_ok());drop(reopened);
        groups.remove(&group,&peer).unwrap();assert!(access.check(false,false).is_err());assert!(auth.authenticate_grouped(Some(&header),"GET",Some(&groups)).is_err());
        groups.restore(&group,&peer,true).unwrap();assert!(auth.authenticate_grouped(Some(&header),"GET",Some(&groups)).is_err());
        assert!(access.check(false,false).is_err());
        let fresh=auth.compatibility_grant(groups.clone(),&group,&peer).unwrap();assert_ne!(fresh["username"],credentials["username"]);
        let fresh_header=format!("Bearer {}:{}",fresh["username"].as_str().unwrap(),fresh["password"].as_str().unwrap());
        assert!(auth.authenticate_grouped(Some(&fresh_header),"GET",Some(&groups)).is_ok());
        auth.compatibility_revoke(&group,&peer).unwrap();assert!(auth.authenticate_grouped(Some(&fresh_header),"GET",Some(&groups)).is_err());
        groups.forget(&group,true).unwrap();let final_groups=Arc::new(crate::groups::Groups::open(data.path()).unwrap());assert!(restarted.authenticate_grouped(Some(&header),"GET",Some(&final_groups)).is_err());
    }
}
#[cfg(test)]mod client_grant_tests{
    use super::*;
    #[test]
    fn client_windows_access_requires_owner_consent_and_never_revives_a_revoked_grant(){
        let data=tempfile::tempdir().unwrap();let groups=Arc::new(crate::groups::Groups::open(data.path()).unwrap());
        let group=groups.create("Client DAV QA","Host",Permissions{write:false,delete:false}).unwrap();let peer=groups.device_id();let auth=Auth::new(data.path()).unwrap();auth.compatibility_enabled(true);
        assert_eq!(auth.compatibility_client_grant(groups.clone(),&group,&peer).unwrap_err().code,"compatibility_permission_required");
        let manual=auth.compatibility_grant(groups.clone(),&group,&peer).unwrap();
        let client=auth.compatibility_client_grant(groups.clone(),&group,&peer).unwrap();
        let header=|c:&serde_json::Value|format!("Basic {}",base64::engine::general_purpose::STANDARD.encode(format!("{}:{}",c["username"].as_str().unwrap(),c["password"].as_str().unwrap())));
        let manual_access=auth.authenticate_grouped(Some(&header(&manual)),"GET",Some(&groups)).unwrap();let client_access=auth.authenticate_grouped(Some(&header(&client)),"GET",Some(&groups)).unwrap();
        assert!(manual_access.check(false,false).is_ok());assert!(client_access.check(false,false).is_ok());assert!(client_access.check(true,false).is_err());
        let file=std::fs::read_to_string(data.path().join("webdav-grants.json")).unwrap();assert!(!file.contains(client["password"].as_str().unwrap()));
        auth.compatibility_revoke(&group,&peer).unwrap();assert!(client_access.check(false,false).is_err());assert!(manual_access.check(false,false).is_err());
        assert_eq!(auth.compatibility_client_grant(groups.clone(),&group,&peer).unwrap_err().code,"compatibility_permission_required");
    }
}
impl Access {
    pub fn check(&self, write: bool, delete: bool) -> Result<()> {
        if !self.live.load(Ordering::Acquire) {
            return Err(Error::new("unauthorized", "设备授权已撤销"));
        }
        if self.credential_live.as_ref().is_some_and(|v|!v.load(Ordering::Acquire)){return Err(Error::new("unauthorized","WebDAV 兼容凭据已撤销"));}
        if let Some((groups, group, peer, _expires, session)) = &self.group {
            if let Some(binding) = &self.compatibility_binding {
                if groups.compatibility_binding(group, peer)? != *binding { return Err(Error::new("unauthorized", "WebDAV 设备组授权已撤销")); }
            }
            // Expiry gates NEW HTTP requests, not an already authorized large
            // stream. Local removal/grant changes still apply on every chunk.
            let current = groups.session_access(group, peer, true, Some(session))?.0;
            if write && !current.write || delete && !current.delete {
                return Err(Error::new("forbidden", "本机未向设备组授予此权限"));
            }
        }
        if write && !self.permissions.write || delete && !self.permissions.delete {
            return Err(Error::new(
                "forbidden",
                "此设备没有该操作权限，请在电脑端授权",
            ));
        }
        Ok(())
    }
}
pub struct Auth {
    sessions: Mutex<HashMap<String, (String, Access)>>,
    group_live: Arc<AtomicBool>,
    compatibility_enabled: Arc<AtomicBool>,
    compatibility: Mutex<std::collections::BTreeMap<String, CompatibilityGrant>>,
    compatibility_path: std::path::PathBuf,
}
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
struct CompatibilityGrant { group: String, peer: String, binding: String, secret_hash: String, #[serde(skip,default="grant_live")] live:Arc<AtomicBool> }
fn grant_live()->Arc<AtomicBool>{Arc::new(AtomicBool::new(true))}
fn hash(secret: &str) -> String {
    format!("{:x}", Sha256::digest(secret.as_bytes()))
}
impl Auth {
    pub fn new(data: &Path) -> Result<Self> {
        let path = data.join("devices.json");
        // Never load retired standalone credentials, even from an old backup.
        // Only RAM sessions backed by live signed group membership authorize.
        if path.exists() {
            std::fs::write(&path, b"[]")?;
        }
        Ok(Self {
            sessions: Mutex::new(HashMap::new()),
            group_live: Arc::new(AtomicBool::new(true)),
            compatibility_enabled: Arc::new(AtomicBool::new(false)),
            compatibility: Mutex::new(match std::fs::read(data.join("webdav-grants.json")) {
                Ok(bytes) if bytes.len() <= 262144 => {
                    let grants: std::collections::BTreeMap<String,CompatibilityGrant> = serde_json::from_slice(&bytes).map_err(|_|Error::new("invalid_group","WebDAV 兼容授权文件损坏"))?;
                    if grants.len()>256 || grants.iter().any(|(id,g)|id.len()!=43 || [&g.group,&g.peer,&g.binding,&g.secret_hash].iter().any(|v|v.len()!=64||!v.bytes().all(|b|b.is_ascii_hexdigit()))) { return Err(Error::new("invalid_group","WebDAV 兼容授权文件无效")); }
                    grants
                },
                Ok(_)=>return Err(Error::new("too_large","WebDAV 兼容授权文件过大")),
                Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Default::default(),
                Err(e)=>return Err(e.into()),
            }),
            compatibility_path: data.join("webdav-grants.json"),
        })
    }
    pub fn stop(&self) {
        self.compatibility_enabled(false);
        self.group_live.store(false, Ordering::Release);
    }
    pub fn compatibility_enabled(&self, enabled: bool) { self.compatibility_enabled.store(enabled,Ordering::Release); }
    fn save_compatibility(&self, grants: &std::collections::BTreeMap<String,CompatibilityGrant>)->Result<()> {
        use std::io::Write;
        let temporary=self.compatibility_path.with_file_name(format!(".rhfiles-service-webdav-{}.tmp",random()?));
        let mut options=std::fs::OpenOptions::new();options.write(true).create_new(true);
        #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
        let result=(|| { let mut file=options.open(&temporary)?;file.write_all(&serde_json::to_vec(grants).map_err(|_|std::io::Error::other("Invalid grants"))?)?;file.sync_all()?;drop(file);std::fs::rename(&temporary,&self.compatibility_path) })();
        if result.is_err(){let _=std::fs::remove_file(temporary);}result.map_err(Error::from)
    }
    /// Local administration only. This is a credential for an already accepted
    /// group member, not another pairing database. Only its digest is retained.
    pub fn compatibility_grant(&self, groups: Arc<crate::groups::Groups>,group:&str,peer:&str)->Result<serde_json::Value>{
        self.issue_compatibility_grant(groups,group,peer,true)
    }
    pub fn compatibility_client_grant(&self,groups:Arc<crate::groups::Groups>,group:&str,peer:&str)->Result<serde_json::Value>{
        self.issue_compatibility_grant(groups,group,peer,false)
    }
    fn issue_compatibility_grant(&self, groups: Arc<crate::groups::Groups>,group:&str,peer:&str,rotate:bool)->Result<serde_json::Value>{
        if !self.compatibility_enabled.load(Ordering::Acquire){return Err(Error::new("forbidden","请先启用可信 HTTPS WebDAV 入口"));}
        let binding=groups.compatibility_binding(group,peer)?;
        let mut grants=self.compatibility.lock().unwrap();let mut next=grants.clone();
        if rotate{next.retain(|_,g|!(g.group==group&&g.peer==peer));}
        else if !next.values().any(|g|g.group==group&&g.peer==peer&&g.binding==binding){return Err(Error::new("compatibility_permission_required","请先由服务器在 WebDAV 兼容设置中为此成员生成一次凭据，授权其使用 Windows 程序"));}
        else if next.values().filter(|g|g.group==group&&g.peer==peer).count()>=4{return Err(Error::new("busy","此设备的 Windows 兼容授权已达上限；请在服务器撤销该成员的兼容授权后重新连接"));}
        if next.len()>=256{return Err(Error::new("busy","WebDAV 授权过多"));}
        let username=random()?;let password=random()?;
        next.insert(username.clone(),CompatibilityGrant{group:group.into(),peer:peer.into(),binding,secret_hash:hash(&password),live:grant_live()});
        self.save_compatibility(&next)?;for (id,grant)in grants.iter(){if !next.contains_key(id){grant.live.store(false,Ordering::Release);}}*grants=next;
        Ok(serde_json::json!({"username":username,"password":password,"groupId":group,"peerId":peer,"groupBound":true}))
    }
    pub fn compatibility_revoke(&self,group:&str,peer:&str)->Result<()> {
        let mut grants=self.compatibility.lock().unwrap();let mut next=grants.clone();next.retain(|_,g|g.group!=group||g.peer!=peer);self.save_compatibility(&next)?;for (id,grant)in grants.iter(){if !next.contains_key(id){grant.live.store(false,Ordering::Release);}}*grants=next;Ok(())
    }
    pub fn group_session(
        &self,
        groups: Arc<crate::groups::Groups>,
        group: &str,
        peer: &str,
    ) -> Result<serde_json::Value> {
        let (permissions, session) = groups.session_access(group, peer, false, None)?;
        let mut sessions = self.sessions.lock().unwrap();
        sessions.retain(|_, (_, a)| {
            a.group
                .as_ref()
                .is_some_and(|v| v.3 > std::time::Instant::now())
        });
        if sessions.len() >= 256 {
            return Err(Error::new("busy", "设备组会话过多，请稍后重试"));
        }
        let id = random()?;
        let password = random()?;
        let access = Access {
            edit_revision:None,committed_entry:Arc::new(Mutex::new(None)),
            // Session rotation must not change tus ownership / WebDAV locks.
            id: format!("group-{}", hash(&format!("{group}:{peer}"))),
            permissions,
            live: self.group_live.clone(),
            method: String::new(),
            compatibility_binding: None,
            credential_live: None,
            group: Some((
                groups,
                group.into(),
                peer.into(),
                std::time::Instant::now() + std::time::Duration::from_secs(1800),
                session,
            )),
        };
        sessions.insert(id.clone(), (hash(&password), access));
        Ok(serde_json::json!({"username":id,"password":password,"expiresIn":1800}))
    }
    #[cfg(test)]
    pub fn authenticate(&self, header: Option<&str>, method: &str) -> Result<Access> {
        self.authenticate_grouped(header,method,None)
    }
    pub fn authenticate_grouped(&self, header: Option<&str>, method: &str, groups:Option<&Arc<crate::groups::Groups>>) -> Result<Access> {
        let header = header.ok_or_else(|| Error::new("unauthorized", "需要设备凭据"))?;
        if header.len() > 1024 {
            return Err(Error::new("unauthorized", "凭据无效"));
        }
        let (id, secret) = if let Some(value) = header.strip_prefix("Basic ") {
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(value)
                .map_err(|_| Error::new("unauthorized", "凭据无效"))?;
            let value =
                String::from_utf8(decoded).map_err(|_| Error::new("unauthorized", "凭据无效"))?;
            let (id, secret) = value
                .split_once(':')
                .ok_or_else(|| Error::new("unauthorized", "凭据无效"))?;
            (id.to_owned(), secret.to_owned())
        } else if let Some(value) = header.strip_prefix("Bearer ") {
            let (id, secret) = value
                .split_once(':')
                .ok_or_else(|| Error::new("unauthorized", "凭据无效"))?;
            (id.to_owned(), secret.to_owned())
        } else {
            return Err(Error::new("unauthorized", "不支持的认证方式"));
        };
        if let Some((expected, access)) = self.sessions.lock().unwrap().get(&id) {
            if !bool::from(hash(&secret).as_bytes().ct_eq(expected.as_bytes())) {
                return Err(Error::new("unauthorized", "凭据错误"));
            }
            let mut access = access.clone();
            access.method = method.into();
            let (groups, group, peer, expires, session) = access.group.as_ref().unwrap();
            if *expires <= std::time::Instant::now() || !access.live.load(Ordering::Acquire) {
                return Err(Error::new("unauthorized", "设备组会话已到期"));
            }
            access.permissions = groups.session_access(group, peer, false, Some(session))?.0;
            return Ok(access);
        }
        if let Some(groups)=groups.filter(|_|self.compatibility_enabled.load(Ordering::Acquire)) {
            if let Some(grant)=self.compatibility.lock().unwrap().get(&id).cloned() {
                if !bool::from(hash(&secret).as_bytes().ct_eq(grant.secret_hash.as_bytes())) {return Err(Error::new("unauthorized","凭据错误"));}
                if groups.compatibility_binding(&grant.group,&grant.peer)?!=grant.binding {return Err(Error::new("unauthorized","WebDAV 设备组授权已撤销，请重新生成兼容凭据"));}
                let (permissions,session)=groups.session_access(&grant.group,&grant.peer,true,None)?;
                return Ok(Access{edit_revision:None,committed_entry:Arc::new(Mutex::new(None)),id:format!("webdav-{id}"),permissions,live:self.compatibility_enabled.clone(),method:method.into(),compatibility_binding:Some(grant.binding),credential_live:Some(grant.live),group:Some((groups.clone(),grant.group,grant.peer,std::time::Instant::now()+std::time::Duration::from_secs(86400),session))});
            }
        }
        Err(Error::new("unauthorized", "需要设备组授权；独立配对已移除"))
    }
}
