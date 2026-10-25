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
    pub id: String,
    pub permissions: Permissions,
    pub live: Arc<AtomicBool>,
    pub method: String,
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
}
impl Access {
    pub fn check(&self, write: bool, delete: bool) -> Result<()> {
        if !self.live.load(Ordering::Acquire) {
            return Err(Error::new("unauthorized", "设备授权已撤销"));
        }
        if let Some((groups, group, peer, _expires, session)) = &self.group {
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
}
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
        })
    }
    pub fn stop(&self) {
        self.group_live.store(false, Ordering::Release);
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
            // Session rotation must not change tus ownership / WebDAV locks.
            id: format!("group-{}", hash(&format!("{group}:{peer}"))),
            permissions,
            live: self.group_live.clone(),
            method: String::new(),
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
    pub fn authenticate(&self, header: Option<&str>, method: &str) -> Result<Access> {
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
        Err(Error::new("unauthorized", "需要设备组授权；独立配对已移除"))
    }
}
