//! Decentralized introductions. Local refusals are deliberately NOT part of
//! exchanged packets, and remote messages can never clear them or change grants.
use crate::model::{Error, Permissions, Result, now_ms, random};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD as B64};
use ring::{
    rand::SystemRandom,
    signature::{self, KeyPair},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::Mutex,
};

const DOMAIN: &[u8] = b"RHFiles-Group-v1\0";
#[cfg(test)]
mod tests;
// Base64 public proofs must also fit the local automation API's 256 KiB
// request budget, including JSON framing. Leave space for parameters.
pub const MAX_PACKET: usize = 160000;
fn bad(message: &str) -> Error {
    Error::new("invalid_group", message)
}
pub fn key_id(key: &str) -> String {
    format!("{:x}", Sha256::digest(key.as_bytes()))
}
fn text(value: &str) -> Result<()> {
    if value.trim().is_empty() || value.len() > 120 || value.chars().any(char::is_control) {
        Err(bad("设备或组名称无效"))
    } else {
        Ok(())
    }
}
pub fn decode(value: &str) -> Result<Vec<u8>> {
    B64.decode(value).map_err(|_| bad("设备组编码无效"))
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Server {
    pub endpoints: Vec<String>,
    pub fingerprint: String,
}
impl Server {
    pub fn validate(&self) -> Result<()> {
        if self.endpoints.is_empty()
            || self.endpoints.len() > 16
            || self.fingerprint.len() != 64
            || !self
                .fingerprint
                .bytes()
                .all(|v| v.is_ascii_hexdigit() && !v.is_ascii_uppercase())
        {
            return Err(bad("电脑地址或证书指纹无效"));
        }
        for endpoint in &self.endpoints {
            let rest = endpoint
                .strip_prefix("https://")
                .ok_or_else(|| bad("电脑地址必须使用 HTTPS"))?;
            let address = rest
                .parse::<std::net::SocketAddr>()
                .map_err(|_| bad("电脑地址必须为明确的 IP 和端口"))?;
            if address.port() == 0 || !crate::network_scope::allowed(address.ip()) {
                return Err(bad("设备组不接受公网地址"));
            }
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Claims {
    pub v: u32,
    pub kind: String,
    pub group: String,
    pub key: String,
    pub issuer: String,
    pub name: String,
    pub label: String,
    pub invite: bool,
    pub nonce: String,
    pub seq: u64,
    pub server: Option<Server>,
}
impl Claims {
    fn new(kind: &str, key: String, name: String) -> Self {
        Self {
            v: 1,
            kind: kind.into(),
            group: String::new(),
            issuer: key.clone(),
            key,
            name,
            label: String::new(),
            invite: false,
            nonce: String::new(),
            seq: 0,
            server: None,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Signed {
    pub payload: String,
    pub signature: String,
}
impl Signed {
    pub fn read(&self) -> Result<Claims> {
        if self.payload.len() > 8192 || self.signature.len() > 128 {
            return Err(bad("设备组证明过大"));
        }
        let bytes = decode(&self.payload)?;
        let claims: Claims =
            serde_json::from_slice(&bytes).map_err(|_| bad("设备组证明结构无效"))?;
        if claims.v != 1 || claims.seq > i64::MAX as u64 || decode(&claims.key)?.len() != 65 || decode(&claims.issuer)?.len() != 65
        {
            return Err(bad("设备组版本或公钥无效"));
        }
        let mut message = DOMAIN.to_vec();
        message.extend_from_slice(&bytes);
        signature::UnparsedPublicKey::new(
            &signature::ECDSA_P256_SHA256_ASN1,
            decode(&claims.issuer)?,
        )
        .verify(&message, &decode(&self.signature)?)
        .map_err(|_| bad("设备组签名校验失败"))?;
        Ok(claims)
    }
    pub fn id(&self) -> Result<String> {
        Ok(format!("{:x}", Sha256::digest(decode(&self.payload)?)))
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Packet {
    pub root: Signed,
    pub members: Vec<Signed>,
    pub servers: Vec<Signed>,
}
impl Packet {
    pub fn group_id(&self) -> Result<String> {
        let root = self.root.read()?;
        if root.kind != "root"
            || !root.group.is_empty()
            || root.key != root.issuer
            || !root.invite
            || root.server.is_some()
            || root.nonce.len() != 43
            || decode(&root.nonce)?.len() != 32
            || root.seq != 0
        {
            return Err(bad("设备组根证明无效"));
        }
        text(&root.name)?;
        text(&root.label)?;
        if self.members.len() > 128
            || self.servers.len() > 128
            || serde_json::to_vec(self)
                .map_err(|_| bad("设备组结构无效"))?
                .len()
                > MAX_PACKET
        {
            return Err(bad("设备组超过大小或成员上限"));
        }
        self.root.id()
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Refusal {
    removed_at: u64,
    version: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Group {
    packet: Packet,
    blocked: BTreeMap<String, Refusal>,
    permissions: Permissions,
    enabled: bool,
    left: bool,
}
impl Group {
    fn members(&self) -> Result<BTreeMap<String, Claims>> {
        let mut members = BTreeMap::new();
        let root = self.packet.root.read()?;
        members.insert(key_id(&root.key), root);
        for member in &self.packet.members {
            let claim = member.read()?;
            members.insert(key_id(&claim.key), claim);
        }
        Ok(members)
    }
    fn merge(&mut self, incoming: &Packet) -> Result<()> {
        let group_id = self.packet.group_id()?;
        if incoming.group_id()? != group_id {
            return Err(bad("不是同一个设备组"));
        }
        let mut accepted = self.members()?;
        // Existing accepted keys are independent local trust anchors. Removing
        // an introducer stops its NEW introductions, not previously accepted peers.
        let mut pending = Vec::new();
        for certificate in &incoming.members {
            let c = certificate.read()?;
            if c.kind != "member"
                || c.group != group_id
                || c.server.is_some()
                || c.nonce.len() != 43
                || !c.label.is_empty()
                || c.seq != 0
            {
                return Err(bad("成员证明无效"));
            }
            text(&c.name)?;
            if !accepted.contains_key(&key_id(&c.key)) {
                pending.push((certificate.clone(), c));
            }
        }
        for _ in 0..128 {
            let mut progress = false;
            pending.retain(|(certificate, c)| {
                let subject = key_id(&c.key);
                let issuer = key_id(&c.issuer);
                if self.blocked.contains_key(&subject) || self.blocked.contains_key(&issuer) {
                    return false;
                }
                if accepted.get(&issuer).is_some_and(|v| v.invite) {
                    if !accepted.contains_key(&subject) {
                        self.packet.members.push(certificate.clone());
                        accepted.insert(subject, c.clone());
                    }
                    progress = true;
                    false
                } else {
                    true
                }
            });
            if !progress {
                break;
            }
        }
        // Unresolvable records are not imported. A valid peer can carry a stale
        // certificate from a locally removed introducer; this is not restoration.
        for advertisement in &incoming.servers {
            let c = advertisement.read()?;
            if c.kind != "server"
                || c.group != group_id
                || c.key != c.issuer
                || c.invite
                || !c.label.is_empty()
                || !c.nonce.is_empty()
                || c.seq == 0
            {
                return Err(bad("电脑服务证明无效"));
            }
            c.server
                .as_ref()
                .ok_or_else(|| bad("缺少电脑服务地址"))?
                .validate()?;
            let id = key_id(&c.key);
            if !accepted.contains_key(&id) || self.blocked.contains_key(&id) {
                continue;
            }
            let old = self
                .packet
                .servers
                .iter()
                .position(|v| v.read().is_ok_and(|v| v.key == c.key));
            if let Some(index) = old {
                if self.packet.servers[index].read()?.seq < c.seq {
                    self.packet.servers[index] = advertisement.clone();
                }
            } else {
                self.packet.servers.push(advertisement.clone());
            }
        }
        self.packet.group_id()?;
        Ok(())
    }
    fn member(&self, key: &str) -> Result<Claims> {
        if self.left || self.blocked.contains_key(key) {
            return Err(Error::new(
                "forbidden",
                "本机已移除此设备或已退出设备组，必须在本机手动确认恢复",
            ));
        }
        self.members()?
            .remove(key)
            .ok_or_else(|| Error::new("unauthorized", "设备没有有效的组成员证明"))
    }
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Document {
    version: u64,
    groups: BTreeMap<String, Group>,
    #[serde(default)]
    pending: Option<String>,
    #[serde(default)]
    refusals: BTreeMap<String, Refusal>,
}
pub struct Groups {
    data: PathBuf,
    key: signature::EcdsaKeyPair,
    doc: Mutex<Document>,
}
impl std::fmt::Debug for Groups {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Groups").finish_non_exhaustive()
    }
}
fn save(path: &Path, bytes: &[u8]) -> Result<()> {
    use std::io::Write;
    let temporary = path.with_file_name(format!(".rhfiles-service-group-{}.tmp", random()?));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| {
        let mut file = options.open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temporary, path)
    })()
    .map_err(Error::from);
    if result.is_err() {
        let _ = std::fs::remove_file(temporary);
    }
    result
}
impl Groups {
    pub fn open(data: &Path) -> Result<Self> {
        std::fs::create_dir_all(data)?;
        let key_path = data.join(".rhfiles-service-group-key.pkcs8");
        let key = if key_path.exists() {
            std::fs::read(&key_path)?
        } else {
            if data.join("groups.json").exists() {
                return Err(bad("设备组私钥缺失；不会生成新身份覆盖原记录"));
            }
            let key = signature::EcdsaKeyPair::generate_pkcs8(
                &signature::ECDSA_P256_SHA256_ASN1_SIGNING,
                &SystemRandom::new(),
            )
            .map_err(|_| bad("无法创建设备身份"))?;
            let bytes = key.as_ref().to_vec();
            use std::io::Write;
            let mut options=std::fs::OpenOptions::new();options.write(true).create_new(true);
            #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
            match options.open(&key_path) {
                Ok(mut file)=>{file.write_all(&bytes)?;file.sync_all()?;bytes},
                Err(e) if e.kind()==std::io::ErrorKind::AlreadyExists=>std::fs::read(&key_path)?,
                Err(e)=>return Err(e.into()),
            }
        };
        if key.len() > 4096 {
            return Err(bad("设备组私钥文件无效"));
        }
        let key = signature::EcdsaKeyPair::from_pkcs8(
            &signature::ECDSA_P256_SHA256_ASN1_SIGNING,
            &key,
            &SystemRandom::new(),
        )
        .map_err(|_| bad("设备组私钥损坏"))?;
        let doc = match std::fs::read(data.join("groups.json")) {
            Ok(bytes) if bytes.len() <= 4 * 1024 * 1024 => {
                serde_json::from_slice::<Document>(&bytes)
                    .map_err(|_| bad("设备组记录损坏；拒绝忽略本机移除记录"))?
            }
            Ok(_) => return Err(bad("设备组记录过大")),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Document::default(),
            Err(e) => return Err(e.into()),
        };
        if doc.groups.len() > 16 {
            return Err(bad("设备组数量超过上限"));
        }
        for (id, g) in &doc.groups {
            if g.packet.group_id()? != *id {
                return Err(bad("设备组记录不匹配"));
            }
            g.members()?;
        }
        Ok(Self {
            data: data.into(),
            key,
            doc: Mutex::new(doc),
        })
    }
    pub fn public_key(&self) -> String {
        B64.encode(self.key.public_key().as_ref())
    }
    pub fn device_id(&self) -> String {
        key_id(&self.public_key())
    }
    fn sign(&self, claims: &Claims) -> Result<Signed> {
        let bytes = serde_json::to_vec(claims).map_err(|_| bad("无法创建设备组证明"))?;
        let mut message = DOMAIN.to_vec();
        message.extend_from_slice(&bytes);
        let signature = self
            .key
            .sign(&SystemRandom::new(), &message)
            .map_err(|_| bad("设备组签名失败"))?;
        Ok(Signed {
            payload: B64.encode(bytes),
            signature: B64.encode(signature.as_ref()),
        })
    }
    fn change<T>(&self, mutate: impl FnOnce(&mut Document) -> Result<T>) -> Result<T> {
        let mut doc = self.doc.lock().map_err(|_| bad("设备组状态不可用"))?;
        let mut next = doc.clone();
        let result = mutate(&mut next)?;
        next.version = next
            .version
            .checked_add(1)
            .ok_or_else(|| bad("设备组操作序号溢出"))?;
        let bytes = serde_json::to_vec(&next).map_err(|_| bad("无法保存设备组"))?;
        if bytes.len() > 4 * 1024 * 1024 {
            return Err(bad("设备组记录过大"));
        }
        save(&self.data.join("groups.json"), &bytes)?;
        *doc = next;
        Ok(result)
    }
    pub fn request(&self, name: &str) -> Result<Signed> {
        text(name)?;
        let mut c = Claims::new("request", self.public_key(), name.into());
        c.nonce = random()?;
        let proof = self.sign(&c)?;
        self.change(|doc| {
            doc.pending = Some(c.nonce);
            Ok(proof)
        })
    }
    pub fn create(&self, label: &str, name: &str, permissions: Permissions) -> Result<String> {
        text(label)?;
        text(name)?;
        let mut root = Claims::new("root", self.public_key(), name.into());
        root.label = label.into();
        root.invite = true;
        root.nonce = random()?;
        let root = self.sign(&root)?;
        let packet = Packet {
            root,
            members: vec![],
            servers: vec![],
        };
        let id = packet.group_id()?;
        self.change(|doc| {
            if doc.groups.len() >= 16 {
                return Err(bad("最多加入 16 个设备组"));
            }
            doc.groups.insert(
                id.clone(),
                Group {
                    packet,
                    blocked: doc.refusals.clone(),
                    permissions,
                    enabled: true,
                    left: false,
                },
            );
            Ok(id)
        })
    }
    pub fn approve(&self, id: &str, request: &Signed, invite: bool) -> Result<Packet> {
        let request = request.read()?;
        if request.kind != "request"
            || request.key != request.issuer
            || !request.group.is_empty()
            || request.nonce.len() != 43
            || decode(&request.nonce)?.len() != 32
            || request.invite
            || request.server.is_some()
            || !request.label.is_empty()
            || request.seq != 0
        {
            return Err(bad("入组请求无效"));
        }
        text(&request.name)?;
        self.change(|doc| {
            let g = doc.groups.get_mut(id).ok_or_else(|| bad("设备组不存在"))?;
            if !g.member(&self.device_id())?.invite {
                return Err(Error::new("forbidden", "本机没有邀请权限"));
            }
            if g.blocked.contains_key(&key_id(&request.key)) {
                return Err(Error::new(
                    "forbidden",
                    "本机曾移除此设备，请先在成员列表手动确认恢复",
                ));
            }
            let subject = key_id(&request.key);
            let can_invite = g
                .members()?
                .get(&subject)
                .map(|c| c.invite)
                .unwrap_or(invite);
            let mut c = Claims::new("member", request.key, request.name);
            c.group = id.into();
            c.issuer = self.public_key();
            c.invite = can_invite;
            c.nonce = request.nonce;
            let certificate = self.sign(&c)?;
            let mut packet = g.packet.clone();
            packet
                .members
                .retain(|v| !v.read().is_ok_and(|c| key_id(&c.key) == subject));
            packet.members.push(certificate);
            g.merge(&packet)?;
            // Rebind approval to this request without remotely rewriting any
            // already pinned member's role in existing local trust stores.
            Ok(packet)
        })
    }
    pub fn join(&self, packet: Packet, permissions: Permissions) -> Result<String> {
        let id = packet.group_id()?;
        self.change(|doc| {
            if let Some(existing) = doc.groups.get_mut(&id) {
                existing.member(&self.device_id())?;
                existing.merge(&packet)?;
                return Ok(id);
            }
            if doc.groups.len() >= 16 {
                return Err(bad("最多加入 16 个设备组"));
            }
            let own = packet
                .members
                .iter()
                .map(Signed::read)
                .collect::<Result<Vec<_>>>()?
                .into_iter()
                .find(|c| c.key == self.public_key())
                .ok_or_else(|| bad("证明中没有本机身份"))?;
            if doc.pending.as_deref() != Some(&own.nonce) {
                return Err(bad("不是本机当前入组请求的批准，请重新生成请求"));
            }
            let mut group = Group {
                packet: Packet {
                    root: packet.root.clone(),
                    members: vec![],
                    servers: vec![],
                },
                blocked: doc.refusals.clone(),
                permissions,
                enabled: true,
                left: false,
            };
            group.merge(&packet)?;
            group.member(&self.device_id())?;
            doc.groups.insert(id.clone(), group);
            doc.pending = None;
            Ok(id)
        })
    }
    pub fn packet(&self, id: &str) -> Result<Packet> {
        let doc = self.doc.lock().unwrap();
        let g = doc.groups.get(id).ok_or_else(|| bad("设备组不存在"))?;
        g.member(&self.device_id())?;
        Ok(g.packet.clone())
    }
    pub fn merge(&self, id: &str, packet: &Packet) -> Result<()> {
        self.change(|doc| {
            let g = doc.groups.get_mut(id).ok_or_else(|| bad("设备组不存在"))?;
            if g.left {
                return Err(Error::new("forbidden", "本机已退出此组，不能自动重新加入"));
            }
            g.merge(packet)
        })
    }
    pub fn access(&self, id: &str, peer: &str, files: bool) -> Result<Permissions> {
        let doc = self.doc.lock().unwrap();
        let g = doc.groups.get(id).ok_or_else(|| bad("设备组不存在"))?;
        g.member(peer)?;
        g.member(&self.device_id())?;
        if files && !g.enabled {
            return Err(Error::new("forbidden", "本机未向此设备组开放文件服务"));
        }
        Ok(g.permissions.clone())
    }
    pub fn remove(&self, id: &str, peer: &str) -> Result<()> {
        self.change(|doc| {
            let version = doc
                .version
                .checked_add(1)
                .ok_or_else(|| bad("操作序号溢出"))?;
            let g = doc.groups.get(id).ok_or_else(|| bad("设备组不存在"))?;
            g.members()?.get(peer).ok_or_else(|| bad("成员不存在"))?;
            let refusal = Refusal {
                removed_at: now_ms(),
                version,
            };
            doc.refusals.insert(peer.into(), refusal.clone());
            for g in doc.groups.values_mut() {
                g.blocked.insert(peer.into(), refusal.clone());
            }
            Ok(())
        })
    }
    pub fn restore(&self, id: &str, peer: &str, confirmed: bool) -> Result<()> {
        if !confirmed {
            return Err(Error::new(
                "confirmation_required",
                "恢复访问必须在本机手动确认",
            ));
        }
        self.change(|doc| {
            let g = doc.groups.get(id).ok_or_else(|| bad("设备组不存在"))?;
            if !g.blocked.contains_key(peer) {
                return Err(bad("此设备不在本机移除列表中"));
            }
            doc.refusals.remove(peer);
            for g in doc.groups.values_mut() {
                g.blocked.remove(peer);
            }
            Ok(())
        })
    }
    pub fn configure(&self, id: &str, enabled: bool, permissions: Permissions) -> Result<()> {
        self.change(|doc| {
            let g = doc.groups.get_mut(id).ok_or_else(|| bad("设备组不存在"))?;
            g.enabled = enabled;
            g.permissions = permissions;
            Ok(())
        })
    }
    pub fn advertise(&self, server: Server) -> Result<()> {
        server.validate()?;
        self.change(|doc| {
            for (id, g) in &mut doc.groups {
                if g.member(&self.device_id()).is_err() {
                    continue;
                }
                let seq = g
                    .packet
                    .servers
                    .iter()
                    .filter_map(|v| v.read().ok())
                    .filter(|v| v.key == self.public_key())
                    .map(|v| v.seq)
                    .max()
                    .unwrap_or(0)
                    .checked_add(1)
                    .ok_or_else(|| bad("服务序号溢出"))?;
                let mut c = Claims::new(
                    "server",
                    self.public_key(),
                    g.member(&self.device_id())?.name,
                );
                c.group = id.clone();
                c.seq = seq;
                c.server = Some(server.clone());
                let mut packet = g.packet.clone();
                packet
                    .servers
                    .retain(|v| !v.read().is_ok_and(|v| v.key == c.key));
                packet.servers.push(self.sign(&c)?);
                g.merge(&packet)?;
            }
            Ok(())
        })
    }
    pub fn proof(&self, id: &str, nonce: &str, server_fingerprint: &str) -> Result<Signed> {
        if nonce.len() != 43 || decode(nonce)?.len() != 32 || server_fingerprint.len() != 64 {
            return Err(bad("身份挑战无效"));
        }
        self.access(id, &self.device_id(), false)?;
        let mut c = Claims::new("auth", self.public_key(), String::new());
        c.group = id.into();
        c.nonce = nonce.into();
        c.label = server_fingerprint.into();
        self.sign(&c)
    }
    pub fn authenticate(
        &self,
        id: &str,
        packet: &Packet,
        proof: &Signed,
        nonce: &str,
        fingerprint: &str,
    ) -> Result<(String, String)> {
        let c = proof.read()?;
        if c.kind != "auth"
            || c.group != id
            || c.nonce != nonce
            || c.label != fingerprint
            || c.key != c.issuer
            || c.server.is_some()
            || !c.name.is_empty()
            || c.invite
            || c.seq != 0
        {
            return Err(bad("设备组身份挑战校验失败"));
        }
        let key = key_id(&c.key);
        self.change(|doc| {
            let g = doc
                .groups
                .get_mut(id)
                .ok_or_else(|| bad("本机没有加入此设备组"))?;
            g.merge(packet)?;
            let member = g.member(&key)?;
            g.member(&self.device_id())?;
            Ok((key, member.name))
        })
    }
    /// Bind the TLS endpoint back to its group public key; another member
    /// cannot alias a locally removed server's certificate fingerprint.
    pub fn server_proof(&self,id:&str,nonce:&str,fingerprint:&str)->Result<Signed>{
        self.access(id,&self.device_id(),false)?;
        let mut c=Claims::new("server-auth",self.public_key(),String::new());
        c.group=id.into();c.nonce=nonce.into();c.label=fingerprint.into();self.sign(&c)
    }
    pub fn state(&self) -> Result<serde_json::Value> {
        let doc = self.doc.lock().unwrap();
        let mut out = Vec::new();
        for (id, g) in &doc.groups {
            let mut members = Vec::new();
            for (key, c) in g.members()? {
                let server = g
                    .packet
                    .servers
                    .iter()
                    .filter_map(|v| v.read().ok())
                    .find(|v| v.key == c.key)
                    .and_then(|v| v.server);
                members.push(serde_json::json!({"id":key,"name":c.name,"canInvite":c.invite,"blocked":g.blocked.contains_key(&key),"removedAt":g.blocked.get(&key).map(|v|v.removed_at),"server":server,"self":key==self.device_id()}));
            }
            out.push(serde_json::json!({"id":id,"name":g.packet.root.read()?.label,"permissions":g.permissions,"enabled":g.enabled,"members":members,"left":g.left}));
        }
        Ok(serde_json::json!({"deviceId":self.device_id(),"groups":out,"version":doc.version}))
    }
}
