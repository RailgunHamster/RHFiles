use crate::model::*;
use base64::Engine;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
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
    fn rotating_group_sessions_keep_transfer_ownership_and_live_revocation(){
        let data=tempfile::tempdir().unwrap();let groups=Arc::new(crate::groups::Groups::open(data.path()).unwrap());let id=groups.create("Home","A",Permissions::default()).unwrap();let auth=Auth::new(data.path()).unwrap();
        let first=auth.group_session(groups.clone(),&id,&groups.device_id()).unwrap();let second=auth.group_session(groups.clone(),&id,&groups.device_id()).unwrap();
        let header=|v:&serde_json::Value|format!("Bearer {}:{}",v["username"].as_str().unwrap(),v["password"].as_str().unwrap());
        let old=auth.authenticate(Some(&header(&first)),"GET").unwrap();let fresh=auth.authenticate(Some(&header(&second)),"GET").unwrap();assert_eq!(old.id,fresh.id);assert_ne!(first["username"],second["username"]);
        auth.sessions.lock().unwrap().get_mut(first["username"].as_str().unwrap()).unwrap().1.group.as_mut().unwrap().3=std::time::Instant::now()-std::time::Duration::from_secs(1);
        assert!(auth.authenticate(Some(&header(&first)),"GET").is_err());assert!(old.check(false,false).is_ok());
        auth.stop();assert!(old.check(false,false).is_err());assert!(fresh.check(false,false).is_err());
    }
    #[test]
    fn permission_changes_invalidate_old_handles_but_keep_the_credential() {
        let data = tempfile::tempdir().unwrap();
        let auth = Auth::new(data.path()).unwrap();
        let credential = auth.issue("phone", Permissions::default()).unwrap();
        let header = format!("Bearer {}:{}", credential.username, credential.password);
        let old = auth.authenticate(Some(&header), "PUT").unwrap();
        assert!(old.check(true, false).is_err());
        auth.set_permissions(
            &credential.username,
            Permissions {
                write: true,
                delete: false,
            },
        )
        .unwrap();
        assert_eq!(old.check(false, false).unwrap_err().code, "unauthorized");
        let current = auth.authenticate(Some(&header), "PUT").unwrap();
        assert!(current.check(true, false).is_ok());
        assert!(current.check(false, true).is_err());
        let restored = Auth::new(data.path()).unwrap();
        assert!(
            restored
                .authenticate(Some(&header), "PUT")
                .unwrap()
                .check(true, false)
                .is_ok()
        );
        auth.set_permissions(&credential.username, Permissions::default())
            .unwrap();
        assert!(current.check(true, false).is_err());
        assert!(
            auth.authenticate(Some(&header), "PUT")
                .unwrap()
                .check(true, false)
                .is_err()
        );
        assert!(
            auth.set_permissions("missing", Permissions::default())
                .is_err()
        );
    }
    #[test]
    fn failed_permission_save_does_not_revoke_or_change_access() {
        let data = tempfile::tempdir().unwrap();
        let auth = Auth::new(data.path()).unwrap();
        let credential = auth.issue("phone", Permissions::default()).unwrap();
        let header = format!("Bearer {}:{}", credential.username, credential.password);
        let access = auth.authenticate(Some(&header), "PUT").unwrap();
        // Make metadata publication fail in this private fixture only.
        std::fs::remove_file(data.path().join("devices.json")).unwrap();
        std::fs::create_dir(data.path().join("devices.json")).unwrap();
        assert!(
            auth.set_permissions(
                &credential.username,
                Permissions {
                    write: true,
                    delete: true
                }
            )
            .is_err()
        );
        assert!(access.check(false, false).is_ok());
        assert!(
            auth.authenticate(Some(&header), "PUT")
                .unwrap()
                .check(true, false)
                .is_err()
        );
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
struct PairCode {
    code: String,
    expires: u64,
    attempts: u8,
    permissions: Permissions,
}
struct Database {
    devices: Vec<StoredDevice>,
    live: HashMap<String, Arc<AtomicBool>>,
    pair: Option<PairCode>,
}
pub struct Auth {
    data: PathBuf,
    state: Mutex<Database>,
    sessions: Mutex<HashMap<String, (String, Access)>>,
    group_live: Arc<AtomicBool>,
}
fn hash(secret: &str) -> String {
    format!("{:x}", Sha256::digest(secret.as_bytes()))
}
impl Auth {
    pub fn new(data: &Path) -> Result<Self> {
        let path = data.join("devices.json");
        let devices: Vec<StoredDevice> = if path.exists() {
            let bytes = std::fs::read(&path)?;
            if bytes.len() > 262144 {
                return Err(Error::new("invalid_config", "设备授权文件过大"));
            }
            serde_json::from_slice(&bytes)
                .map_err(|_| Error::new("invalid_config", "设备授权文件损坏"))?
        } else {
            vec![]
        };
        if devices.len() > 200 {
            return Err(Error::new("invalid_config", "已配对设备过多"));
        }
        let live = devices
            .iter()
            .map(|d| (d.id.clone(), Arc::new(AtomicBool::new(true))))
            .collect();
        Ok(Self {
            data: data.into(),
            sessions: Mutex::new(HashMap::new()),
            group_live: Arc::new(AtomicBool::new(true)),
            state: Mutex::new(Database {
                devices,
                live,
                pair: None,
            }),
        })
    }
    fn persist(&self, state: &Database) -> Result<()> {
        let path = self.data.join("devices.json");
        let temporary = self.data.join(format!("devices-{}.tmp", random()?));
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        use std::io::Write;
        let mut f = options.open(&temporary)?;
        f.write_all(
            &serde_json::to_vec(&state.devices)
                .map_err(|_| Error::new("internal", "无法保存设备"))?,
        )?;
        f.sync_all()?;
        drop(f);
        // std::fs::rename replaces only this service-owned metadata file.
        std::fs::rename(&temporary, &path)?;
        Ok(())
    }
    pub fn devices(&self) -> Vec<Device> {
        self.state
            .lock()
            .unwrap()
            .devices
            .iter()
            .map(Device::from)
            .collect()
    }
    pub fn stop(&self) {
        self.group_live.store(false,Ordering::Release);
        for (_, access) in self.sessions.lock().unwrap().values() {
            access.live.store(false, Ordering::Release);
        }
        for live in self.state.lock().unwrap().live.values() {
            live.store(false, Ordering::Release);
        }
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
            id: format!("group-{}",hash(&format!("{group}:{peer}"))),
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
    pub fn issue(&self, name: &str, permissions: Permissions) -> Result<Credential> {
        if name.trim().is_empty() || name.len() > 120 || name.chars().any(char::is_control) {
            return Err(Error::new("invalid_config", "请填写设备名称"));
        }
        let mut state = self.state.lock().unwrap();
        if state.devices.len() >= 200 {
            return Err(Error::new("too_large", "最多配对 200 台设备"));
        }
        let id = random()?[..16].to_owned();
        let secret = random()?;
        let device = StoredDevice {
            id: id.clone(),
            name: name.trim().into(),
            permissions,
            created_ms: now_ms(),
            secret_hash: hash(&secret),
        };
        state.devices.push(device.clone());
        state
            .live
            .insert(id.clone(), Arc::new(AtomicBool::new(true)));
        if let Err(error) = self.persist(&state) {
            state.devices.pop();
            state.live.remove(&id);
            return Err(error);
        }
        Ok(Credential {
            username: id,
            password: secret,
            device: Device::from(&device),
        })
    }
    pub fn revoke(&self, id: &str) -> Result<()> {
        let mut state = self.state.lock().unwrap();
        let index = state
            .devices
            .iter()
            .position(|d| d.id == id)
            .ok_or_else(|| Error::new("not_found", "设备不存在"))?;
        let old = state.devices.remove(index);
        if let Err(e) = self.persist(&state) {
            state.devices.insert(index, old);
            return Err(e);
        }
        if let Some(live) = state.live.remove(id) {
            live.store(false, Ordering::Release);
        }
        Ok(())
    }
    /// Local administration only. Keep the credential, invalidate in-flight
    /// authorization snapshots, and apply the new grant on the next request.
    pub fn set_permissions(&self, id: &str, permissions: Permissions) -> Result<Device> {
        let mut state = self.state.lock().unwrap();
        let index = state
            .devices
            .iter()
            .position(|d| d.id == id)
            .ok_or_else(|| Error::new("not_found", "设备不存在"))?;
        let old = state.devices[index].permissions.clone();
        state.devices[index].permissions = permissions;
        if let Err(error) = self.persist(&state) {
            state.devices[index].permissions = old;
            return Err(error);
        }
        if let Some(live) = state
            .live
            .insert(id.into(), Arc::new(AtomicBool::new(true)))
        {
            live.store(false, Ordering::Release);
        }
        Ok(Device::from(&state.devices[index]))
    }
    pub fn pairing(&self, permissions: Permissions) -> Result<(String, u64)> {
        let mut bytes = [0u8; 8];
        getrandom::fill(&mut bytes).map_err(|_| Error::new("random", "安全随机数不可用"))?;
        let code = format!("{:010}", u64::from_le_bytes(bytes) % 10000000000);
        let expires = now_ms() + 120000;
        self.state.lock().unwrap().pair = Some(PairCode {
            code: code.clone(),
            expires,
            attempts: 0,
            permissions,
        });
        Ok((code, expires))
    }
    pub fn pair(&self, code: &str, name: &str) -> Result<Credential> {
        let permissions = {
            let mut state = self.state.lock().unwrap();
            let Some(pair) = state.pair.as_mut() else {
                return Err(Error::new("unauthorized", "请在电脑端重新生成配对码"));
            };
            if pair.expires < now_ms() || pair.attempts >= 8 {
                return Err(Error::new("unauthorized", "配对码已过期或尝试次数过多"));
            }
            pair.attempts += 1;
            if !bool::from(pair.code.as_bytes().ct_eq(code.as_bytes())) {
                return Err(Error::new("unauthorized", "配对码错误"));
            }
            let permissions = pair.permissions.clone();
            state.pair = None;
            permissions
        };
        self.issue(name, permissions)
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
        let state = self.state.lock().unwrap();
        let device = state
            .devices
            .iter()
            .find(|d| d.id == id)
            .ok_or_else(|| Error::new("unauthorized", "设备未授权或已撤销"))?;
        if !bool::from(
            hash(&secret)
                .as_bytes()
                .ct_eq(device.secret_hash.as_bytes()),
        ) {
            return Err(Error::new("unauthorized", "凭据错误"));
        }
        Ok(Access {
            id: id.clone(),
            permissions: device.permissions.clone(),
            live: state.live[&id].clone(),
            method: method.into(),
            group: None,
        })
    }
}
