//! Password-free Android-compatible configuration sync. Network I/O and the
//! local SQLite commit are native; a one-use preview binds ETag and local state.
use base64::{Engine, engine::general_purpose::STANDARD as B64};
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::Emitter;
use url::Url;
const LIMIT: usize = 1024 * 1024;
static RHVIDEO_METADATA: Mutex<()> = Mutex::new(());
pub(crate) fn rhvideo_metadata_guard()->Result<std::sync::MutexGuard<'static,()>,String>{RHVIDEO_METADATA.lock().map_err(error)}
fn validate_rhvideo(value:&Value)->Result<(),String>{
    let fields=value.as_object().ok_or("RHVideo 连接信息无效")?;
    if fields.len()!=2 || !fields.keys().all(|k|["server","username"].contains(&k.as_str())) {return Err("RHVideo 同步只允许服务器地址和用户名，不允许密码、令牌或其他字段".into());}
    let server=value["server"].as_str().filter(|v|v.len()<=4096).ok_or("RHVideo 地址无效")?;
    let url=Url::parse(server).map_err(|_|"RHVideo 地址无效")?;
    if server.chars().any(char::is_control)||!matches!(url.scheme(),"http"|"https")||url.host_str().is_none()||!url.username().is_empty()||url.password().is_some()||url.query().is_some()||url.fragment().is_some(){return Err("RHVideo 地址不能包含密码、账号、查询参数或片段".into());}
    if !value["username"].as_str().is_some_and(|v|v.len()<=256&&!v.chars().any(char::is_control)){return Err("RHVideo 用户名无效".into());}Ok(())
}
fn raw_rhvideo_at(path:&Path)->Result<Option<Value>,String>{
    let file=match std::fs::File::open(path){Ok(file)=>file,Err(e)if e.kind()==std::io::ErrorKind::NotFound=>return Ok(None),_=>return Err("RHVideo 本机连接记录无法读取；未上传".into())};
    let mut bytes=Vec::new();file.take(16385).read_to_end(&mut bytes).map_err(error)?;if bytes.len()>16384{return Err("RHVideo 本机连接记录过大；未上传".into());}
    let value:Value=serde_json::from_slice(&bytes).map_err(|_|"RHVideo 本机连接记录无效；未上传")?;
    if value["server"].as_str()==Some(""){return Ok(None);}
    let public=json!({"server":value["server"],"username":value["username"]});validate_rhvideo(&public)?;Ok(Some(public))
}
fn raw_rhvideo()->Result<Option<Value>,String>{
    #[cfg(test)] return Ok(None); // Unit tests never read the user's media configuration.
    #[cfg(not(test))] raw_rhvideo_at(&crate::profile::data_dir()?.join("rhvideo-client.json"))
}
fn selected_rhvideo(conn:&Connection,raw:Option<Value>)->Result<Option<Value>,String>{
    if state(conn,"rhvideoObserved")?.as_ref()==Some(raw.as_ref().unwrap_or(&Value::Null)) {
        return Ok(state(conn,"document")?.and_then(|v|v.get("rhvideo").cloned()));
    }
    Ok(raw)
}
pub(crate) fn rhvideo_prefill()->Option<Value>{
    #[cfg(test)] return None;
    #[cfg(not(test))] {let conn=db().ok()?;selected_rhvideo(&conn,raw_rhvideo().ok()?).ok()?}
}
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Config {
    enabled: bool,
    url: String,
    username: String,
    password: String,
    insecure: bool,
}
struct Preview {
    token: String,
    at: Instant,
    config: Config,
    local: Value,
    base: Value,
    remote: Value,
    etag: Option<String>,
    missing: bool,
    proxy: Option<String>,
    needs_cleanup: bool,
}
#[derive(Default)]
struct Runtime {
    busy: bool,
    phase: String,
    message: String,
    preview: Option<Preview>,
}
static RUNTIME: OnceLock<Mutex<Runtime>> = OnceLock::new();
fn runtime() -> &'static Mutex<Runtime> {
    RUNTIME.get_or_init(Mutex::default)
}
fn error(message: impl ToString) -> String {
    message.to_string()
}
fn empty() -> Value {
    json!({"schemaVersion":1,"profiles":[],"favorites":[]})
}
fn db() -> Result<Connection, String> {
    let conn = crate::db::get_db()?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS config_sync_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)",
    )
    .map_err(error)?;
    Ok(conn)
}
fn state(conn: &Connection, key: &str) -> Result<Option<Value>, String> {
    let text: Option<String> = conn
        .query_row(
            "SELECT value FROM config_sync_state WHERE key=?1",
            [key],
            |r| r.get(0),
        )
        .optional()
        .map_err(error)?;
    text.map(|s| serde_json::from_str(&s).map_err(error))
        .transpose()
}
fn store(conn: &Connection, key: &str, value: &Value) -> Result<(), String> {
    conn.execute("INSERT INTO config_sync_state(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",rusqlite::params![key,value.to_string()]).map_err(error)?;
    Ok(())
}
fn token() -> Result<String, String> {
    let mut bytes = [0; 24];
    getrandom::fill(&mut bytes).map_err(|_| "无法生成同步事务标识")?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
fn config_path() -> Result<PathBuf, String> {
    Ok(crate::profile::data_dir()?.join("webdav-config.dpapi"))
}
fn vault_scope(path: &Path) -> Result<Vec<u8>, String> {
    let parent = path.parent().ok_or("同步配置路径无效")?;
    std::fs::create_dir_all(parent).map_err(error)?;
    Ok(format!(
        "RHFiles\0WebDAV config v1\0{}",
        std::fs::canonicalize(parent).map_err(error)?.display()
    )
    .into_bytes())
}
#[cfg(windows)]
pub(crate) fn crypt(bytes: &[u8], scope: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    use windows::{
        Win32::{
            Foundation::{HLOCAL, LocalFree},
            Security::Cryptography::*,
        },
        core::PCWSTR,
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len().try_into().map_err(|_| "同步配置过大")?,
        pbData: bytes.as_ptr().cast_mut(),
    };
    let entropy = CRYPT_INTEGER_BLOB {
        cbData: scope.len().try_into().map_err(|_| "同步作用域过大")?,
        pbData: scope.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        let result = if encrypt {
            CryptProtectData(
                &input,
                PCWSTR::null(),
                Some(&entropy),
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                None,
                Some(&entropy),
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        result.map_err(|_| "Windows 无法保护或读取此用户和配置分区的 WebDAV 登录，请重新填写")?;
        let data = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData.cast())));
        Ok(data)
    }
}
#[cfg(not(windows))]
pub(crate) fn crypt(_: &[u8], _: &[u8], _: bool) -> Result<Vec<u8>, String> {
    Err("此平台尚未接入 WebDAV 同步凭据保护，未保存明文密码".into())
}
fn read_config_at(path: &Path) -> Result<Config, String> {
    if !path.exists() {
        return Ok(Config::default());
    }
    if std::fs::metadata(path).map_err(error)?.len() > 65536 {
        return Err("同步登录记录过大".into());
    }
    let bytes = std::fs::read(path).map_err(error)?;
    serde_json::from_slice(&crypt(&bytes, &vault_scope(path)?, false)?)
        .map_err(|_| "本机同步登录记录无效，请重新填写".into())
}
fn read_config() -> Result<Config, String> {
    read_config_at(&config_path()?)
}
fn write_config_at(path: &Path, config: &Config) -> Result<(), String> {
    let scope = vault_scope(path)?;
    let data = crypt(&serde_json::to_vec(config).map_err(error)?, &scope, true)?;
    let mut file =
        tempfile::NamedTempFile::new_in(path.parent().ok_or("同步路径无效")?).map_err(error)?;
    file.write_all(&data)
        .and_then(|_| file.as_file().sync_all())
        .map_err(error)?;
    file.persist(path).map_err(error)?;
    Ok(())
}
fn endpoint(config: &Config) -> Result<Url, String> {
    if config.url.len() > 8192 || config.username.len() > 8192 || config.password.len() > 8192 {
        return Err("同步设置字段过长".into());
    }
    let mut url =
        Url::parse(config.url.trim()).map_err(|_| "请输入 WebDAV 文件夹的完整 HTTPS 地址")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("WebDAV 地址不能包含账号、密码、查询参数或锚点".into());
    }
    if url.scheme() != "https" && !config.insecure {
        return Err("请使用 HTTPS，或明确允许可信局域网的明文 HTTP".into());
    }
    url.path_segments_mut()
        .map_err(|_| "WebDAV 地址不能作为文件夹使用")?
        .pop_if_empty()
        .push("rhfiles-settings-v1.json");
    Ok(url)
}
fn public_config(c: &Config) -> Value {
    json!({"enabled":c.enabled,"url":c.url,"username":c.username,"insecure":c.insecure,"hasPassword":!c.password.is_empty()})
}
fn uuid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_digit() || (b'a'..=b'f').contains(&b)
            }
        })
}
fn safe_name(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && !value
            .chars()
            .any(|c| c.is_control() || "/\\<>:\"|?*".contains(c))
}
fn portable_name(value:&str)->bool {
    !value.trim().is_empty()&&value!="."&&value!=".."&&value.encode_utf16().count()<=240&&!value.chars().any(|c|c<' '||c=='/'||c=='\\')
}
fn segments(url: &Url) -> Result<Vec<String>, String> {
    url.path_segments()
        .into_iter()
        .flatten()
        .filter(|s| !s.is_empty())
        .map(|s| {
            let value = percent_encoding::percent_decode_str(s)
                .decode_utf8()
                .map_err(|_| "收藏路径编码无效")?
                .into_owned();
            if !portable_name(&value) {
                return Err("收藏路径包含无效组件".into());
            }
            Ok(value)
        })
        .collect()
}
fn portable_url(value: &str, ids: &HashSet<String>) -> Result<Url, String> {
    let raw = value
        .strip_prefix("remote://")
        .ok_or("同步收藏路径无效")?
        .split_once('/')
        .map(|v| v.1)
        .unwrap_or("");
    for part in raw
        .trim_end_matches('/')
        .split('/')
        .filter(|p| !p.is_empty())
    {
        let decoded = percent_encoding::percent_decode_str(part)
            .decode_utf8()
            .map_err(|_| "收藏路径编码无效")?;
        if !portable_name(&decoded) {
            return Err("收藏路径包含无效组件".into());
        }
    }
    let url = Url::parse(value).map_err(|_| "同步收藏路径无效")?;
    if value.len() > 8192
        || url.scheme() != "remote"
        || !ids.contains(url.host_str().unwrap_or(""))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("收藏未引用有效的网络位置".into());
    }
    segments(&url)?;
    Ok(url)
}
fn validate_device_aliases(value: &Value) -> Result<(), String> {
    let map = value.as_object().ok_or("设备自定义名称格式无效")?;
    if map.is_empty() || map.len() > 256 {
        return Err("设备自定义名称数量无效".into());
    }
    for (peer_id, alias) in map {
        if peer_id.len() != 64 || !peer_id.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()) {
            return Err("设备自定义名称的设备 ID 无效".into());
        }
        let Some(text) = alias.as_str() else {
            return Err("设备自定义名称必须是字符串".into());
        };
        if text.trim().is_empty() || text.chars().count() > 120 || text.chars().any(char::is_control) {
            return Err("设备自定义名称需要 1–120 个字符且不含控制字符".into());
        }
    }
    Ok(())
}
fn validate(doc: &Value) -> Result<(), String> {
    let has_v2 = doc.get("rhvideo").is_some() || doc.get("deviceAliases").is_some();
    let expected_keys = 3 + usize::from(doc.get("rhvideo").is_some()) + usize::from(doc.get("deviceAliases").is_some());
    if doc.to_string().len() > LIMIT
        || !doc.as_object().is_some_and(|v|v.keys().all(|k|["schemaVersion","profiles","favorites","rhvideo","deviceAliases"].contains(&k.as_str()))&&v.len()==expected_keys)
        || doc["schemaVersion"] != if has_v2 {2}else{1}
    {
        return Err("不是支持的 RHFiles 同步配置：当前支持格式 v1/v2；含 RHVideo 或设备自定义名称时必须使用 v2。请更新 Windows 和 Android 两端；未更改本机设置或云端文件".into());
    }
    if let Some(value)=doc.get("rhvideo"){validate_rhvideo(value)?;}
    if let Some(value)=doc.get("deviceAliases"){validate_device_aliases(value)?;}
    let profiles = doc["profiles"]
        .as_array()
        .filter(|v| v.len() <= 200)
        .ok_or("网络位置超过 200 项或格式无效")?;
    let favorites = doc["favorites"]
        .as_array()
        .filter(|v| v.len() <= 100)
        .ok_or("收藏超过 100 项或格式无效")?;
    let mut ids = HashSet::new();
    for p in profiles {
        let id = p["id"]
            .as_str()
            .filter(|id| uuid(id))
            .ok_or("网络位置 ID 无效")?;
        if p.as_object().map(|v| v.len()) != Some(2) || !ids.insert(id.to_string()) {
            return Err("网络位置 ID 重复或包含未知字段".into());
        }
        let c = p["config"].as_object().ok_or("网络位置配置无效")?;
        for (key, value) in c {
            let valid = match key.as_str() {
                "port" => value.as_u64().is_some_and(|n| (1..=65535).contains(&n)),
                "insecure" => value.is_boolean(),
                "name" | "type" | "host" | "share" | "domain" | "url" | "username" => {
                    value.as_str().is_some_and(|s| s.len() <= 8192)
                }
                _ => false,
            };
            if !valid {
                return Err("同步文件包含密码、设备组信息或未知配置".into());
            }
        }
        let name = p["config"]["name"]
            .as_str()
            .filter(|s| portable_name(s))
            .ok_or("网络位置名称无效")?;
        let _ = name;
        match p["config"]["type"].as_str() {
            Some("smb" | "ftp" | "ftps" | "sftp") => {
                let host = p["config"]["host"]
                    .as_str()
                    .filter(|h| {
                        !h.is_empty()
                            && h.len() <= 253
                            && !h.chars().any(|c| {
                                c.is_whitespace() || c.is_control() || "/\\@?#".contains(c)
                            })
                    })
                    .ok_or("网络主机名无效")?;
                let _ = host;
                if p["config"]["type"] == "ftp" && p["config"]["insecure"] != true {
                    return Err("FTP 明文连接未经明确允许".into());
                }
                if let Some(share) = p["config"]["share"].as_str() {
                    if !share.is_empty() && !portable_name(share) {
                        return Err("共享名无效".into());
                    }
                }
            }
            Some("webdav") => {
                endpoint(&Config {
                    url: p["config"]["url"].as_str().unwrap_or("").into(),
                    insecure: p["config"]["insecure"] == true,
                    ..Default::default()
                })?;
            }
            Some("rhfiles") => return Err("RHFiles 仅支持本机设备组，配置同步不能创建独立配对".into()),
            _ => return Err("[sync_unsupported_protocol] 同步配置包含此版本不能识别的协议，请更新两端应用；未更改配置".into()),
        }
    }
    let mut paths = HashSet::new();
    for f in favorites {
        if !f.as_object().is_some_and(|m| {
            m.keys()
                .all(|k| ["name", "path", "isDir", "label", "parentPath"].contains(&k.as_str()))
        }) {
            return Err("收藏包含未知字段".into());
        }
        for field in ["name", "label"] {
            if field == "label" && f.get(field).is_none() {
                continue;
            }
            if !f[field].as_str().is_some_and(|v| {
                !v.trim().is_empty()
                    && v.chars().count() <= 1024
                    && !v.chars().any(char::is_control)
            }) {
                return Err("收藏名称无效".into());
            }
        }
        if f.get("isDir").is_some_and(|v| !v.is_boolean()) {
            return Err("收藏类型无效".into());
        }
        let path = f["path"].as_str().ok_or("收藏路径无效")?;
        let url = portable_url(path, &ids)?;
        if !paths.insert(path) {
            return Err("收藏路径重复".into());
        }
        if let Some(parent) = f.get("parentPath") {
            let parent = portable_url(parent.as_str().ok_or("收藏上级路径无效")?, &ids)?;
            if parent.host_str() != url.host_str() {
                return Err("收藏上级路径跨越网络位置".into());
            }
        }
    }
    Ok(())
}
fn strip_retired(mut doc: Value) -> Value {
    let retired: HashSet<String> = doc["profiles"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|p| p["config"]["type"] == "rhfiles")
        .filter_map(|p| p["id"].as_str().map(str::to_string))
        .collect();
    if let Some(p) = doc["profiles"].as_array_mut() {
        p.retain(|p| !retired.contains(p["id"].as_str().unwrap_or("")));
    }
    if let Some(f) = doc["favorites"].as_array_mut() {
        f.retain(|f| {
            Url::parse(f["path"].as_str().unwrap_or(""))
                .ok()
                .and_then(|u| u.host_str().map(str::to_string))
                .is_none_or(|id| !retired.contains(&id))
        });
    }
    doc
}
fn unc(value: &str) -> Option<(String, Vec<String>)> {
    let raw = value.strip_prefix("\\\\")?;
    let mut parts = raw.split('\\');
    let host = parts.next()?;
    if host.is_empty() || host.contains(['@', ':', '/']) || host.chars().any(char::is_control) {
        return None;
    }
    let parts = parts
        .filter(|p| !p.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    if !parts.iter().all(|v| safe_name(v)) {
        return None;
    }
    Some((host.to_string(), parts))
}
fn stable_id(host: &str, share: &str) -> String {
    let mut hash = Sha256::digest(
        format!(
            "RHFiles shared SMB v1\0{}\0{}",
            host.to_lowercase(),
            share.to_lowercase()
        )
        .as_bytes(),
    );
    hash[6] = (hash[6] & 15) | 0x40;
    hash[8] = (hash[8] & 63) | 0x80;
    let h: String = hash[..16].iter().map(|v| format!("{v:02x}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        &h[..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..]
    )
}
fn pinned(conn: &Connection) -> Result<Vec<(String, String)>, String> {
    let mut q = conn
        .prepare("SELECT path,name FROM pinned ORDER BY ord")
        .map_err(error)?;
    let result = q
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(error)?;
    Ok(result)
}
fn as_unc(favorite: &Value, profiles: &[Value]) -> Option<String> {
    let u = Url::parse(favorite["path"].as_str()?).ok()?;
    let p = profiles.iter().find(|p| p["id"].as_str() == u.host_str())?;
    let c = &p["config"];
    if c["type"] != "smb" || c["port"].as_u64().unwrap_or(445) != 445 {
        return None;
    }
    let host = c["host"].as_str()?;
    if host.contains([':', '@']) {
        return None;
    }
    let mut out = format!("\\\\{host}");
    if let Some(share) = c["share"].as_str().filter(|v| !v.is_empty()) {
        out.push('\\');
        out.push_str(share);
    }
    for part in segments(&u).ok()? {
        if !safe_name(&part){return None;}
        out.push('\\');
        out.push_str(&part);
    }
    Some(out)
}
fn snapshot(conn: &Connection) -> Result<Value, String> {
    let prior = state(conn, "document")?.unwrap_or_else(empty);
    let mut profiles = prior["profiles"].as_array().cloned().unwrap_or_default();
    let mut actual = Vec::new();
    for (path, label) in pinned(conn)? {
        if let Ok(url)=Url::parse(&path) {if url.scheme()=="remote" {
            if let Some(profile)=profiles.iter().find(|p|p["id"].as_str()==url.host_str()) {
                let old=prior["favorites"].as_array().into_iter().flatten().find(|f|f["path"]==path);
                let parts=segments(&url)?;let name=old.and_then(|f|f["name"].as_str()).unwrap_or_else(||parts.last().map(String::as_str).unwrap_or_else(||profile["config"]["name"].as_str().unwrap_or("Network")));
                let mut item=json!({"name":name,"path":path,"isDir":old.and_then(|f|f["isDir"].as_bool()).unwrap_or(true),"label":label});
                if let Some(parent)=old.and_then(|f|f.get("parentPath")){item["parentPath"]=parent.clone();}actual.push(item);
            }continue;
        }}
        let Some((host, parts)) = unc(&path) else {
            continue;
        };
        let share = parts.first().map(String::as_str).unwrap_or("");
        let matching = profiles
            .iter()
            .position(|p| {
                p["config"]["type"] == "smb"
                    && p["config"]["host"]
                        .as_str()
                        .is_some_and(|h| h.eq_ignore_ascii_case(&host))
                    && p["config"]["share"]
                        .as_str()
                        .unwrap_or("")
                        .eq_ignore_ascii_case(share)
                    && p["config"]["port"].as_u64().unwrap_or(445) == 445
            })
            .or_else(|| {
                profiles.iter().position(|p| {
                    p["config"]["type"] == "smb"
                        && p["config"]["host"]
                            .as_str()
                            .is_some_and(|h| h.eq_ignore_ascii_case(&host))
                        && p["config"]["share"].as_str().unwrap_or("").is_empty()
                        && p["config"]["port"].as_u64().unwrap_or(445) == 445
                })
            });
        let index=matching.unwrap_or_else(||{profiles.push(json!({"id":stable_id(&host,share),"config":{"type":"smb","name":if share.is_empty(){host.clone()}else{format!("{host} - {share}")},"host":host,"share":share,"port":445,"username":""}}));profiles.len()-1});
        let id = profiles[index]["id"]
            .as_str()
            .ok_or("本机网络位置 ID 无效")?;
        let mut url = Url::parse(&format!("remote://{id}/")).map_err(error)?;
        {
            let mut segments = url.path_segments_mut().map_err(|_| "收藏路径无效")?;
            segments.clear();
            let has_share = profiles[index]["config"]["share"]
                .as_str()
                .is_some_and(|v| !v.is_empty());
            for part in parts.iter().skip(usize::from(has_share)) {
                segments.push(part);
            }
        }
        let path = url.to_string();
        let old = prior["favorites"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|f| f["path"] == path);
        let name = old
            .and_then(|f| f["name"].as_str())
            .unwrap_or_else(|| parts.last().map(String::as_str).unwrap_or(&host));
        let mut favorite = json!({"name":name,"path":path,"isDir":old.and_then(|f|f["isDir"].as_bool()).unwrap_or(true),"label":label});
        if let Some(parent) = old.and_then(|f| f.get("parentPath")) {
            favorite["parentPath"] = parent.clone();
        }
        actual.push(favorite);
    }
    let actual_paths:HashSet<_>=actual.iter().filter_map(|f|f["path"].as_str().map(str::to_owned)).collect();
    let materialized=state(conn,"portableFavoritesMaterialized")?==Some(json!(true));
    let mut next = actual.into_iter();
    let mut favorites = Vec::new();
    for old in prior["favorites"].as_array().into_iter().flatten() {
        if as_unc(old, &profiles).is_none() && !materialized && !actual_paths.contains(old["path"].as_str().unwrap_or("")) {
            favorites.push(old.clone());
        } else if let Some(f) = next.next() {
            favorites.push(f);
        }
    }
    favorites.extend(next);
    let mut doc = json!({"schemaVersion":1,"profiles":profiles,"favorites":favorites});
    if let Some(media)=selected_rhvideo(conn,raw_rhvideo()?)?{doc["schemaVersion"]=json!(2);doc["rhvideo"]=media;}
    if let Some(aliases)=prior.get("deviceAliases").and_then(Value::as_object).filter(|m|!m.is_empty()){doc["schemaVersion"]=json!(2);doc["deviceAliases"]=Value::Object(aliases.clone());}
    validate(&doc)?;
    Ok(doc)
}
// Metadata only. The network-location vault binds credentials and SFTP pins to
// the connection identity, so a sync cannot redirect a saved password elsewhere.
pub(crate) fn network_profiles()->Result<Vec<Value>,String> {
    let conn=db()?;Ok(snapshot(&conn)?["profiles"].as_array().cloned().unwrap_or_default())
}
pub(crate) fn device_aliases()->Value {
    db().ok()
        .and_then(|conn| state(&conn, "document").ok().flatten())
        .and_then(|doc| doc.get("deviceAliases").and_then(Value::as_object).cloned())
        .map(Value::Object)
        .unwrap_or_else(|| json!({}))
}
pub(crate) fn save_device_alias(peer_id: &str, alias: Option<&str>) -> Result<Value, String> {
    if peer_id.len() != 64 || !peer_id.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()) {
        return Err("设备 ID 无效".into());
    }
    let cleaned = alias.map(str::trim).filter(|s| !s.is_empty());
    if let Some(text) = cleaned {
        if text.chars().count() > 120 || text.chars().any(char::is_control) {
            return Err("设备自定义名称需要 1–120 个字符且不含控制字符".into());
        }
    }
    let mut runtime = runtime().lock().map_err(error)?;
    if runtime.busy {
        return Err("[busy] 请等待配置同步完成 / Wait for settings synchronization".into());
    }
    let conn = db()?;
    let mut doc = snapshot(&conn)?;
    let mut map = doc.get("deviceAliases").and_then(Value::as_object).cloned().unwrap_or_default();
    if let Some(text) = cleaned {
        map.insert(peer_id.to_string(), Value::String(text.to_string()));
    } else {
        map.remove(peer_id);
    }
    if let Some(obj) = doc.as_object_mut() {
        if map.is_empty() {
            obj.remove("deviceAliases");
            obj.insert("schemaVersion".into(), json!(if obj.contains_key("rhvideo") { 2 } else { 1 }));
        } else {
            obj.insert("deviceAliases".into(), Value::Object(map.clone()));
            obj.insert("schemaVersion".into(), json!(2));
        }
    }
    validate(&doc)?;
    store(&conn, "document", &doc)?;
    runtime.preview = None;
    Ok(Value::Object(map))
}
pub(crate) fn validate_network_config(config:&Value)->Result<(),String>{validate(&json!({"schemaVersion":1,"profiles":[{"id":"00000000-0000-4000-8000-000000000000","config":config}],"favorites":[]}))}
pub(crate) fn save_network_profile(profile:Value,remove:bool)->Result<(),String> {
    let mut runtime=runtime().lock().map_err(error)?;
    if runtime.busy {return Err("[busy] 请等待配置同步完成 / Wait for settings synchronization".into());}
    let conn=db()?;let mut doc=snapshot(&conn)?;
    let id=profile["id"].as_str().filter(|id|uuid(id)).ok_or("Invalid network-location ID")?.to_string();
    let removed_paths=if remove{doc["favorites"].as_array().into_iter().flatten().filter(|f|f["path"].as_str().is_some_and(|p|p.starts_with(&format!("remote://{id}/")))).filter_map(|f|as_local_favorite(f,doc["profiles"].as_array()?)).collect::<Vec<_>>()}else{Vec::new()};
    let profiles=doc["profiles"].as_array_mut().ok_or("Invalid profiles")?;
    if remove {profiles.retain(|p|p["id"]!=id);doc["favorites"].as_array_mut().ok_or("Invalid favorites")?.retain(|f|!f["path"].as_str().is_some_and(|p|p.starts_with(&format!("remote://{id}/"))));}
    else if let Some(prior)=profiles.iter_mut().find(|p|p["id"]==id){*prior=profile;}else{profiles.push(profile);}
    validate(&doc)?;let tx=conn.unchecked_transaction().map_err(error)?;for path in removed_paths{tx.execute("DELETE FROM pinned WHERE path=?1",[path]).map_err(error)?;}store(&tx,"document",&doc)?;tx.commit().map_err(error)?;
    runtime.preview=None;Ok(())
}
fn as_local_favorite(favorite:&Value,profiles:&[Value])->Option<String>{
    as_unc(favorite,profiles).or_else(||{let path=favorite["path"].as_str()?;let url=Url::parse(path).ok()?;(url.scheme()=="remote"&&profiles.iter().any(|p|p["id"].as_str()==url.host_str())).then(||path.into())})
}
fn apply(conn: &Connection, doc: &Value) -> Result<(), String> {
    store(conn,"rhvideoObserved",&raw_rhvideo()?.unwrap_or(Value::Null))?;
    let profiles = doc["profiles"].as_array().ok_or("网络位置无效")?;
    let mut shared = doc["favorites"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|f| {
            as_local_favorite(f, profiles).map(|path| {
                (
                    path,
                    f["label"]
                        .as_str()
                        .or_else(|| f["name"].as_str())
                        .unwrap_or("")
                        .to_string(),
                )
            })
        });
    let mut output = Vec::new();
    for (path, name) in pinned(conn)? {
        if unc(&path).is_some() || path.starts_with("remote://") {
            if let Some(f) = shared.next() {
                output.push(f);
            }
        } else {
            output.push((path, name));
        }
    }
    output.extend(shared);
    conn.execute("DELETE FROM pinned", []).map_err(error)?;
    for (index, (path, name)) in output.into_iter().enumerate() {
        conn.execute(
            "INSERT INTO pinned(path,name,ord) VALUES(?1,?2,?3)",
            rusqlite::params![path, name, index as i64],
        )
        .map_err(error)?;
    }
    store(conn, "document", doc)?;
    store(conn,"portableFavoritesMaterialized",&json!(true))?;
    store(conn, "base", doc)?;
    store(
        conn,
        "lastSuccess",
        &json!(chrono::Utc::now().timestamp_millis()),
    )?;
    Ok(())
}
struct Reply {
    status: u16,
    etag: Option<String>,
    document: Option<Value>,
    needs_cleanup: bool,
}
fn request(
    config: &Config,
    etag: Option<&str>,
    body: Option<&Value>,
    proxy: Option<&str>,
) -> Result<Reply, String> {
    let is_get = body.is_none();
    let url = endpoint(config)?;
    let mut agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(15)))
        .timeout_connect(Some(Duration::from_secs(5)))
        .max_redirects(0)
        .http_status_as_error(false)
        .proxy(None);
    if let Some(proxy) = proxy {
        let address = if proxy.contains("://") {
            proxy.to_string()
        } else {
            format!("http://{proxy}")
        };
        let parsed = Url::parse(&address).map_err(|_| "代理地址无效")?;
        if !matches!(parsed.scheme(), "http" | "https")
            || parsed.host_str().is_none()
            || !parsed.username().is_empty()
            || parsed.password().is_some()
        {
            return Err("代理地址无效或包含不支持的凭据".into());
        }
        agent = agent.proxy(Some(
            ureq::Proxy::new(&address).map_err(|_| "代理地址无效")?,
        ));
    }
    let agent: ureq::Agent = agent.build().into();
    let auth = format!(
        "Basic {}",
        B64.encode(format!("{}:{}", config.username, config.password))
    );
    let has_auth = !config.username.is_empty() || !config.password.is_empty();
    let response = if let Some(body) = body {
        let bytes = serde_json::to_vec(body).map_err(error)?;
        if bytes.len() > LIMIT {
            return Err("同步配置超过 1 MiB 上限".into());
        }
        let mut req = agent
            .put(url.as_str())
            .header("Accept", "application/json")
            .header("Content-Type", "application/json; charset=utf-8");
        if has_auth {
            req = req.header("Authorization", &auth);
        }
        req = req.header(
            if etag.is_some() {
                "If-Match"
            } else {
                "If-None-Match"
            },
            etag.unwrap_or("*"),
        );
        req.send(bytes.as_slice())
    } else {
        let mut req = agent.get(url.as_str()).header("Accept", "application/json");
        if has_auth {
            req = req.header("Authorization", &auth);
        }
        req.call()
    }
    .map_err(|e| format!("WebDAV 连接失败：{e}"))?;
    let (head, body) = response.into_parts();
    let status = head.status.as_u16();
    let etag = head
        .headers
        .get("ETag")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let mut needs_cleanup = false;
    let document = if is_get && status == 200 {
        let mut bytes = Vec::new();
        body.into_reader()
            .take(LIMIT as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(error)?;
        if bytes.len() > LIMIT {
            return Err("同步配置超过 1 MiB 上限".into());
        }
        if bytes.is_empty() {
            None
        } else {
            let raw: Value =
                serde_json::from_slice(&bytes).map_err(|_| "WebDAV 同步文件不是有效 JSON")?;
            let clean = strip_retired(raw.clone());
            needs_cleanup = clean != raw;
            Some(clean)
        }
    } else {
        None
    };
    Ok(Reply {
        status,
        etag,
        document,
        needs_cleanup,
    })
}
fn body_is_success(status: u16) -> bool {
    (200..300).contains(&status)
}
fn strong_etag(value: &str) -> bool {
    let bytes = value.as_bytes();
    (2..=2048).contains(&bytes.len())
        && bytes[0] == b'"'
        && bytes[bytes.len() - 1] == b'"'
        && bytes[1..bytes.len() - 1]
            .iter()
            .all(|b| *b >= 0x21 && *b != b'"' && *b != 0x7f)
}
fn http_error(status: u16) -> String {
    match status {
        401 => "WebDAV 登录失败（401），请检查用户名和密码".into(),
        403 => "WebDAV 拒绝访问（403），请检查目录读写权限".into(),
        404 | 409 => "WebDAV 目录不存在，请先创建所填写的文件夹".into(),
        412 => "云端配置已被其他设备修改，未覆盖；请重新同步".into(),
        300..=399 => "WebDAV 返回重定向，请填写最终地址；没有向其他地址发送密码".into(),
        _ => format!("WebDAV 请求失败（HTTP {status}）"),
    }
}
fn begin() -> Result<(), String> {
    let mut r = runtime().lock().map_err(error)?;
    if r.busy {
        return Err("正在同步，请等待当前操作完成".into());
    }
    r.busy = true;
    r.phase = "syncing".into();
    r.message.clear();
    Ok(())
}
fn consume_preview(r: &mut Runtime, token: &str) -> Result<Preview, String> {
    if r.busy {
        return Err("正在同步，请等待当前操作完成".into());
    }
    let p = r.preview.as_ref().ok_or("同步预览已过期，请重新同步")?;
    if p.token != token || p.at.elapsed() > Duration::from_secs(300) {
        return Err("同步预览已过期，请重新同步".into());
    }
    let preview = r.preview.take().ok_or("同步预览已过期")?;
    r.busy = true;
    r.phase = "syncing".into();
    r.message.clear();
    Ok(preview)
}
fn finish<T>(result: Result<T, String>) -> Result<T, String> {
    if let Ok(mut r) = runtime().lock() {
        r.busy = false;
        if let Err(e) = &result {
            r.phase = "failed".into();
            r.message = e.clone();
            r.preview = None;
        }
    }
    result
}
#[tauri::command(async)]
pub fn config_sync_status() -> Result<Value, String> {
    let config = read_config()?;
    let conn = db()?;
    let local = snapshot(&conn)?;
    let r = runtime().lock().map_err(error)?;
    Ok(
        json!({"config":public_config(&config),"state":if r.phase.is_empty(){"idle"}else{&r.phase},"message":r.message,"lastSuccess":state(&conn,"lastSuccess")?,"profiles":local["profiles"],"rhvideo":local.get("rhvideo"),"busy":r.busy}),
    )
}

#[tauri::command(async)]
pub fn config_sync_disable() -> Result<(), String> {
    let mut r = runtime().lock().map_err(error)?;
    if r.busy {
        return Err("请等待同步完成后再导入或清除配置".into());
    }
    let mut config = read_config()?;
    if config.enabled {
        config.enabled = false;
        write_config_at(&config_path()?, &config)?;
    }
    r.preview = None;
    r.phase = "idle".into();
    r.message.clear();
    Ok(())
}

pub fn reset() -> Result<(), String> {
    let mut r = runtime().lock().map_err(error)?;
    if r.busy {
        return Err("请等待同步完成后再清除配置".into());
    }
    match std::fs::remove_file(config_path()?) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(error(e)),
    }
    db()?
        .execute("DELETE FROM config_sync_state", [])
        .map_err(error)?;
    r.preview = None;
    r.phase = "idle".into();
    r.message.clear();
    Ok(())
}
#[tauri::command(async)]
pub fn config_sync_save(args: Value) -> Result<Value, String> {
    let mut r = runtime().lock().map_err(error)?;
    if r.busy {
        return Err("请等待同步完成后再修改设置".into());
    }
    let old = read_config()?;
    let password = args["password"].as_str().unwrap_or("");
    let same = args["url"].as_str().unwrap_or("").trim() == old.url
        && args["username"].as_str().unwrap_or("") == old.username;
    if !same && password.is_empty() && !old.password.is_empty() && args["clearPassword"] != true {
        return Err("更换地址或账号后请重填密码，或选择清除旧密码".into());
    }
    let config = Config {
        enabled: args["enabled"].as_bool().ok_or("同步开关无效")?,
        url: args["url"].as_str().ok_or("同步地址无效")?.trim().into(),
        username: args["username"].as_str().ok_or("同步账号无效")?.into(),
        password: if args["clearPassword"] == true {
            String::new()
        } else if password.is_empty() && same {
            old.password
        } else {
            password.into()
        },
        insecure: args["insecure"].as_bool().ok_or("HTTP 选项无效")?,
    };
    if config.enabled || !config.url.is_empty() {
        endpoint(&config)?;
    }
    write_config_at(&config_path()?, &config)?;
    if !same {
        let conn = db()?;
        conn.execute(
            "DELETE FROM config_sync_state WHERE key IN ('base','lastSuccess')",
            [],
        )
        .map_err(error)?;
    }
    r.preview = None;
    r.phase = "idle".into();
    r.message.clear();
    drop(r);
    config_sync_status()
}
#[tauri::command]
pub async fn config_sync_preview(manual: bool, proxy: Option<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move||{begin()?;finish((||{let config=read_config()?;if !manual&&!config.enabled{runtime().lock().map_err(error)?.phase="idle".into();return Ok(json!({"skipped":true}));}endpoint(&config)?;let conn=db()?;let local=snapshot(&conn)?;let base=state(&conn,"base")?.unwrap_or_else(empty);let reply=request(&config,None,None,proxy.as_deref())?;let missing=reply.status==404;if !missing&&!body_is_success(reply.status){return Err(http_error(reply.status));}let remote=if missing{empty()}else{reply.document.ok_or("WebDAV 没有返回配置内容")?};validate(&remote)?;let token=token()?;let result=json!({"token":token,"local":local,"base":if missing{empty()}else{base.clone()},"remote":remote});let mut r=runtime().lock().map_err(error)?;r.preview=Some(Preview{token,at:Instant::now(),config,local,base,remote,etag:reply.etag,missing,proxy,needs_cleanup:reply.needs_cleanup});r.phase="ready".into();Ok(result)})())}).await.map_err(error)?
}
#[tauri::command]
pub async fn config_sync_commit(
    token: String,
    document: Value,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let p = {
            let mut state = runtime().lock().map_err(error)?;
            consume_preview(&mut state, &token)?
        };
        finish((|| {
            validate(&document)?;
            let config = read_config()?;
            if serde_json::to_value(&config).map_err(error)?
                != serde_json::to_value(&p.config).map_err(error)?
            {
                return Err("同步设置已改变，请重新同步".into());
            }
            let mut conn = db()?;
            if snapshot(&conn)? != p.local {
                return Err("收藏或网络位置已改变，已保留本机更改，请重新同步".into());
            }
            if p.missing || p.needs_cleanup || document != p.remote {
                if !p.missing && !p.etag.as_deref().is_some_and(strong_etag) {
                    return Err("服务器没有提供强 ETag，已停止上传以防覆盖其他设备的更改".into());
                }
                let reply = request(
                    &config,
                    p.etag.as_deref(),
                    Some(&document),
                    p.proxy.as_deref(),
                )?;
                if !body_is_success(reply.status) {
                    return Err(http_error(reply.status));
                }
            }
            let _metadata=rhvideo_metadata_guard()?;
            let tx = conn
                .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
                .map_err(error)?;
            if snapshot(&tx)? != p.local || state(&tx, "base")?.unwrap_or_else(empty) != p.base {
                return Err("同步期间本机配置已变化，未覆盖；请重新同步".into());
            }
            apply(&tx, &document)?;
            tx.commit().map_err(error)?;
            {
                let mut r = runtime().lock().map_err(error)?;
                r.phase = "success".into();
                r.message = "已同步网络位置、网络收藏和 RHVideo 连接信息；密码、令牌、设备组和本机配置未上传".into();
            }
            let _ = app.emit("config-sync-changed", ());
            Ok(json!({"state":"success"}))
        })())
    })
    .await
    .map_err(error)?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]fn android_contract_roundtrips_all_network_locations_and_bookmarks_without_windows_filename_rules(){
        let doc:Value=serde_json::from_str(include_str!("../../scripts/fixtures/shared-config.contract.json")).unwrap();validate(&doc).unwrap();
        let conn=connection();conn.execute("INSERT INTO pinned(path,name,ord) VALUES('C:\\local','Local',0)",[]).unwrap();apply(&conn,&doc).unwrap();
        assert_eq!(snapshot(&conn).unwrap(),doc);
        let pins=pinned(&conn).unwrap();assert_eq!(pins.len(),4);assert_eq!(pins[0].0,r"C:\local");assert_eq!(pins[1].1,"云端报告");assert!(pins[2].0.starts_with(r"\\nas.example.invalid\Public\"));
        conn.execute("DELETE FROM pinned WHERE path=?1",[&pins[1].0]).unwrap();let next=snapshot(&conn).unwrap();assert_eq!(next["favorites"].as_array().unwrap().len(),2);assert!(!next["favorites"].as_array().unwrap().iter().any(|f|f["label"]=="云端报告"));
    }
    #[test]fn old_non_smb_bookmarks_are_not_interpreted_as_local_deletions_before_migration(){
        let doc:Value=serde_json::from_str(include_str!("../../scripts/fixtures/shared-config.contract.json")).unwrap();let conn=connection();store(&conn,"document",&doc).unwrap();store(&conn,"base",&doc).unwrap();
        let before=snapshot(&conn).unwrap();assert!(before["favorites"].as_array().unwrap().iter().any(|f|f["label"]=="云端报告"));
        apply(&conn,&doc).unwrap();assert_eq!(snapshot(&conn).unwrap(),doc);
    }
    #[test]
    fn media_sync_v2_is_allowlisted_and_never_imports_credentials_or_session_fields(){
        let media=json!({"server":"https://media-qa.invalid/library/","username":"viewer"});let mut doc=empty();doc["schemaVersion"]=json!(2);doc["rhvideo"]=media.clone();validate(&doc).unwrap();
        for key in ["password","token","refreshToken","generation","fingerprint","headers"]{let mut invalid=doc.clone();invalid["rhvideo"][key]=json!("never-export");assert!(validate(&invalid).is_err(),"{key}");}
        for address in ["https://user:secret@media.invalid/","https://media.invalid/?token=secret","https://media.invalid/#secret","file:///C:/private","https://media.invalid/\n"]{let mut invalid=doc.clone();invalid["rhvideo"]["server"]=json!(address);assert!(validate(&invalid).is_err(),"{address}");}
        doc["schemaVersion"]=json!(1);assert!(validate(&doc).is_err());validate(&empty()).unwrap();
        let root=tempfile::tempdir().unwrap();let path=root.path().join("rhvideo-client.json");std::fs::write(&path,json!({"server":media["server"],"username":"viewer","password":"do-not-export","token":"local-only-token"}).to_string()).unwrap();assert_eq!(raw_rhvideo_at(&path).unwrap(),Some(media));
        std::fs::write(&path,vec![b' ';16385]).unwrap();assert!(raw_rhvideo_at(&path).is_err());
    }
    #[test]
    fn synced_media_prefill_preserves_local_edits_and_does_not_bounce_to_the_old_address(){
        let c=connection();let old=json!({"server":"https://old.invalid/","username":"local-user"});let remote=json!({"server":"https://new.invalid/","username":"new-user"});
        let mut doc=empty();doc["schemaVersion"]=json!(2);doc["rhvideo"]=remote.clone();store(&c,"document",&doc).unwrap();store(&c,"rhvideoObserved",&old).unwrap();
        assert_eq!(selected_rhvideo(&c,Some(old)).unwrap(),Some(remote.clone()));assert_eq!(selected_rhvideo(&c,Some(remote.clone())).unwrap(),Some(remote.clone()));
        let edited=json!({"server":"https://manually-edited.invalid/","username":"mine"});assert_eq!(selected_rhvideo(&c,Some(edited.clone())).unwrap(),Some(edited));
        store(&c,"rhvideoObserved",&Value::Null).unwrap();assert_eq!(selected_rhvideo(&c,None).unwrap(),Some(remote));assert_eq!(snapshot(&c).unwrap(),doc);
    }
    #[test]
    fn weak_wildcard_and_malformed_etags_can_never_become_if_match_wildcards() {
        for tag in ["*", "bare", "W/\"tag\"", "\"a\", \"b\"", "\"a\n\"", ""] {
            assert!(!strong_etag(tag), "{tag:?}");
        }
        for tag in ["\"qa-1\"", "\"*\"", "\"\""] {
            assert!(strong_etag(tag));
        }
    }
    #[test]
    fn host_only_android_locations_keep_their_identity_and_parent_metadata() {
        let c = connection();
        let id = stable_id("qa.invalid", "");
        let d = json!({"schemaVersion":1,"profiles":[{"id":id,"config":{"name":"Host","type":"smb","host":"qa.invalid","share":"","username":"local-login"}}],"favorites":[{"name":"Folder","path":format!("remote://{id}/Public/Folder"),"parentPath":format!("remote://{id}/Public"),"label":"Folder","isDir":true}]});
        validate(&d).unwrap();
        apply(&c, &d).unwrap();
        assert_eq!(snapshot(&c).unwrap(), d);
    }
    #[test]
    fn stale_preview_tokens_cannot_consume_a_newer_confirmation() {
        let mut r = Runtime::default();
        r.preview = Some(Preview {
            token: "new-token".into(),
            at: Instant::now(),
            config: Config::default(),
            local: empty(),
            base: empty(),
            remote: empty(),
            etag: None,
            missing: true,
            proxy: None,
            needs_cleanup: false,
        });
        assert!(consume_preview(&mut r, "old-token").is_err());
        assert_eq!(r.preview.as_ref().unwrap().token, "new-token");
        assert!(!r.busy);
        assert!(consume_preview(&mut r, "new-token").is_ok());
        assert!(r.busy);
        assert!(r.preview.is_none());
    }
    fn http_fixture(
        status: &str,
        headers: &str,
        body: Vec<u8>,
    ) -> (
        Config,
        std::sync::mpsc::Receiver<String>,
        std::thread::JoinHandle<()>,
    ) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n{headers}\r\n",
            body.len()
        );
        let (send, receive) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0; 4096];
            loop {
                let n = stream.read(&mut buffer).unwrap();
                if n == 0 {
                    break;
                }
                bytes.extend_from_slice(&buffer[..n]);
                if let Some(end) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
                    let header = String::from_utf8_lossy(&bytes[..end]);
                    let length = header
                        .lines()
                        .find_map(|line| {
                            line.split_once(':')
                                .filter(|(key, _)| key.eq_ignore_ascii_case("content-length"))
                                .and_then(|(_, v)| v.trim().parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if bytes.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            send.send(String::from_utf8_lossy(&bytes).to_string())
                .unwrap();
            stream.write_all(response.as_bytes()).unwrap();
            let _ = stream.write_all(&body);
        });
        (
            Config {
                url: format!("http://{address}/sync/"),
                username: "sync-user".into(),
                password: "synthetic-password".into(),
                insecure: true,
                ..Default::default()
            },
            receive,
            thread,
        )
    }
    #[test]
    fn native_webdav_requests_are_conditional_and_credentials_never_enter_the_document() {
        for etag in [None, Some("\"qa-1\"")] {
            let (c, request_text, thread) = http_fixture("204 No Content", "", Vec::new());
            let reply = request(&c, etag, Some(&empty()), None).unwrap();
            assert_eq!(reply.status, 204);
            let raw = request_text.recv_timeout(Duration::from_secs(5)).unwrap();
            assert!(raw.contains("PUT /sync/rhfiles-settings-v1.json HTTP/1.1"));
            assert!(raw.to_lowercase().contains(if etag.is_some() {
                "if-match: \"qa-1\""
            } else {
                "if-none-match: *"
            }));
            let body = raw.split("\r\n\r\n").nth(1).unwrap();
            assert!(!body.contains("synthetic-password"));
            assert!(!body.contains("password"));
            thread.join().unwrap();
        }
    }
    #[test]
    fn native_webdav_reads_etags_without_forwarding_credentials_on_redirect() {
        let (c, rx, thread) = http_fixture(
            "200 OK",
            "ETag: \"qa-2\"\r\n",
            empty().to_string().into_bytes(),
        );
        let reply = request(&c, None, None, None).unwrap();
        assert_eq!(reply.etag.as_deref(), Some("\"qa-2\""));
        assert_eq!(reply.document, Some(empty()));
        rx.recv_timeout(Duration::from_secs(5)).unwrap();
        thread.join().unwrap();
        let (c, rx, thread) = http_fixture(
            "302 Found",
            "Location: http://should-never-connect.invalid/credentials\r\n",
            Vec::new(),
        );
        let reply = request(&c, None, None, None).unwrap();
        assert_eq!(reply.status, 302);
        rx.recv_timeout(Duration::from_secs(5)).unwrap();
        thread.join().unwrap();
    }
    #[test]
    fn retired_pairings_are_not_returned_to_the_webview_and_require_cloud_cleanup() {
        let id = stable_id("retired", "old");
        let old = json!({"schemaVersion":1,"profiles":[{"id":id,"config":{"name":"old","type":"rhfiles","password":"legacy-secret"}}],"favorites":[{"name":"old","path":format!("remote://{id}/old")}]});
        let (c, rx, thread) = http_fixture(
            "200 OK",
            "ETag: \"qa-old\"\r\n",
            old.to_string().into_bytes(),
        );
        let reply = request(&c, None, None, None).unwrap();
        assert_eq!(reply.document, Some(empty()));
        assert!(reply.needs_cleanup);
        rx.recv_timeout(Duration::from_secs(5)).unwrap();
        thread.join().unwrap();
    }
    #[test]
    fn oversized_webdav_metadata_is_bounded_before_parsing() {
        let (c, rx, thread) = http_fixture("200 OK", "", vec![b' '; LIMIT + 1]);
        assert!(request(&c, None, None, None).is_err());
        rx.recv_timeout(Duration::from_secs(5)).unwrap();
        thread.join().unwrap();
    }
    fn connection() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE pinned(path TEXT PRIMARY KEY,name TEXT,ord INTEGER);CREATE TABLE config_sync_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);").unwrap();
        c
    }
    #[test]
    fn unc_snapshot_roundtrip_is_portable_and_never_exports_device_paths_or_passwords() {
        let c = connection();
        for (i, (p, n)) in [
            (r"C:\local", "Local"),
            (r"\\qa.invalid\Public\中文", "自定义名称"),
            ("rhfiles-device://group/peer/share", "Group"),
        ]
        .into_iter()
        .enumerate()
        {
            c.execute(
                "INSERT INTO pinned VALUES(?1,?2,?3)",
                rusqlite::params![p, n, i],
            )
            .unwrap();
        }
        let d = snapshot(&c).unwrap();
        assert_eq!(d["favorites"].as_array().unwrap().len(), 1);
        assert_eq!(d["favorites"][0]["label"], "自定义名称");
        assert!(!d.to_string().contains("password"));
        assert!(!d.to_string().contains("rhfiles-device"));
        assert!(!d.to_string().contains(r"C:\local"));
        apply(&c, &d).unwrap();
        assert_eq!(pinned(&c).unwrap()[1].0, r"\\qa.invalid\Public\中文");
        assert_eq!(snapshot(&c).unwrap(), d);
    }
    #[test]
    fn imported_smb_order_and_labels_preserve_local_folder_slots() {
        let c = connection();
        c.execute(r"INSERT INTO pinned VALUES('C:\local','Local',0)", [])
            .unwrap();
        let id = stable_id("qa.invalid", "Public");
        let d = json!({"schemaVersion":1,"profiles":[{"id":id,"config":{"name":"QA","type":"smb","host":"qa.invalid","share":"Public"}}],"favorites":[{"name":"Z","label":"中文 Z","path":format!("remote://{id}/Z"),"isDir":true},{"name":"A","path":format!("remote://{id}/A"),"isDir":true}]});
        validate(&d).unwrap();
        apply(&c, &d).unwrap();
        let p = pinned(&c).unwrap();
        assert_eq!(p[0].1, "Local");
        assert_eq!(p[1].1, "中文 Z");
        assert_eq!(p[2].1, "A");
        assert_eq!(
            snapshot(&c).unwrap()["favorites"][0]["path"],
            d["favorites"][0]["path"]
        );
    }
    #[test]
    fn secret_and_group_fields_and_traversal_are_rejected() {
        let id = stable_id("qa", "Public");
        let valid = json!({"schemaVersion":1,"profiles":[{"id":id,"config":{"name":"QA","type":"smb","host":"qa","share":"Public"}}],"favorites":[]});
        for field in ["password", "groupId", "token", "fingerprint"] {
            let mut d = valid.clone();
            d["profiles"][0]["config"][field] = json!("secret");
            assert!(validate(&d).is_err());
        }
        let mut d = valid.clone();
        d["favorites"] = json!([{"name":"Bad","path":format!("remote://{id}/%2e%2e/escape")}]);
        assert!(validate(&d).is_err());
    }
    #[test]
    fn endpoint_is_directory_bound_and_never_contains_credentials_or_queries() {
        assert!(
            endpoint(&Config {
                url: "https://user:pass@qa.invalid/dav/".into(),
                ..Default::default()
            })
            .is_err()
        );
        assert!(
            endpoint(&Config {
                url: "http://qa.invalid/dav".into(),
                ..Default::default()
            })
            .is_err()
        );
        let c = Config {
            url: "https://qa.invalid/dav".into(),
            ..Default::default()
        };
        assert_eq!(
            endpoint(&c).unwrap().as_str(),
            "https://qa.invalid/dav/rhfiles-settings-v1.json"
        );
    }
    #[cfg(windows)]
    #[test]
    fn actual_dpapi_roundtrip_is_encrypted_and_bound_to_profile() {
        let root = tempfile::tempdir().unwrap();
        let a = root.path().join("a/config.dpapi");
        let b = root.path().join("b/config.dpapi");
        let c = Config {
            password: "must-stay-local".into(),
            ..Default::default()
        };
        write_config_at(&a, &c).unwrap();
        assert!(!String::from_utf8_lossy(&std::fs::read(&a).unwrap()).contains("must-stay-local"));
        assert_eq!(read_config_at(&a).unwrap().password, "must-stay-local");
        std::fs::create_dir_all(b.parent().unwrap()).unwrap();
        std::fs::copy(a, &b).unwrap();
        assert!(read_config_at(&b).is_err());
    }
    #[test]
    fn device_aliases_roundtrip_in_v2_and_reject_invalid_peer_ids_or_names() {
        let c = connection();
        let peer = "a".repeat(64);
        let mut doc = empty();
        doc["schemaVersion"] = json!(2);
        doc["deviceAliases"] = json!({ peer.clone(): "客厅服务器" });
        validate(&doc).unwrap();
        apply(&c, &doc).unwrap();
        assert_eq!(snapshot(&c).unwrap(), doc);

        let mut bad_peer = doc.clone();
        bad_peer["deviceAliases"] = json!({ "not-a-peer": "客厅服务器" });
        assert!(validate(&bad_peer).is_err());

        let mut bad_name = doc.clone();
        bad_name["deviceAliases"] = json!({ peer: "bad\nname" });
        assert!(validate(&bad_name).is_err());
    }
}
