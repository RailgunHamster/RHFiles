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
}
impl Access {
    pub fn check(&self, write: bool, delete: bool) -> Result<()> {
        if !self.live.load(Ordering::Acquire) {
            return Err(Error::new("unauthorized", "设备授权已撤销"));
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
        for live in self.state.lock().unwrap().live.values() {
            live.store(false, Ordering::Release);
        }
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
        })
    }
}
