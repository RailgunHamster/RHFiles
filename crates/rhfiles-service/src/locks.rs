//! Conservative Unicode/case-normalized keys stop Windows/macOS path aliases
//! bypassing a lock through the other protocol. Replies retain original URIs.
use dav_server::{davpath::DavPath, ls::*, memls::MemLs};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime},
};
use unicode_normalization::UnicodeNormalization;
#[derive(Clone, Debug)]
pub struct Locks {
    inner: Box<MemLs>,
    original: Arc<Mutex<HashMap<String, (Box<DavPath>, Option<SystemTime>)>>>,
    versions:Arc<Mutex<HashMap<String,String>>>,
}
fn canonical(p: &DavPath) -> DavPath {
    let text = String::from_utf8_lossy(p.as_bytes())
        .nfc()
        .collect::<String>()
        .to_uppercase();
    let text = if text == "/" {
        text.as_str()
    } else {
        text.trim_end_matches('/')
    };
    let encoded = text
        .split('/')
        .map(|v| {
            percent_encoding::utf8_percent_encode(v, percent_encoding::NON_ALPHANUMERIC).to_string()
        })
        .collect::<Vec<_>>()
        .join("/");
    DavPath::new(&encoded).expect("valid normalized virtual URI")
}
pub(crate) fn resource_key(path: &str) -> String {
    path.nfc()
        .collect::<String>()
        .to_uppercase()
        .trim_end_matches('/')
        .to_owned()
}
impl Locks {
    pub fn new() -> Box<Self> {
        Box::new(Self {
            inner: MemLs::new(),
            original: Arc::new(Mutex::new(HashMap::new())),
            versions:Arc::new(Mutex::new(HashMap::new())),
        })
    }
    fn reply(&self, mut lock: DavLock) -> DavLock {
        if let Some((path, _)) = self.original.lock().unwrap().get(&lock.token) {
            lock.path = path.clone();
        }
        lock
    }
    pub(crate) fn remember_version(&self,token:&str,revision:&str){
        let originals=self.original.lock().unwrap();if originals.contains_key(token){self.versions.lock().unwrap().entry(token.into()).or_insert_with(||revision.into());}
    }
    pub(crate) fn advance_version(&self,token:&str,previous:&str,next:&str){let mut versions=self.versions.lock().unwrap();if let Some(value)=versions.get_mut(token){if value==previous{*value=next.into();}}}
    pub(crate) async fn edit_version(&self,path:&DavPath,principal:&str,condition:&str)->Option<(String,String)>{
        let tokens = parse_if_lock_tokens(condition, path)?;
        if tokens.is_empty() { return None; }
        for lock in self.discover(path).await {
            if !lock.shared
                && lock.principal.as_deref() == Some(principal)
                && canonical(&lock.path).as_bytes() == canonical(path).as_bytes()
                && tokens.iter().any(|token| token == &lock.token)
            {
                return self
                    .versions
                    .lock()
                    .unwrap()
                    .get(&lock.token)
                    .cloned()
                    .map(|revision| (lock.token, revision));
            }
        }
        None
    }
}

fn tag_matches_path(tag: &str, target: &DavPath) -> bool {
    let raw_path = if let Ok(uri) = tag.parse::<axum::http::Uri>() {
        uri.path().to_owned()
    } else if tag.starts_with('/') {
        tag.to_owned()
    } else {
        return false;
    };
    let stripped = raw_path
        .strip_prefix("/dav")
        .map(|rest| if rest.is_empty() { "/" } else { rest })
        .unwrap_or(&raw_path);
    let Ok(decoded_tag) = percent_encoding::percent_decode_str(stripped).decode_utf8() else {
        return false;
    };
    let target_text = String::from_utf8_lossy(target.as_bytes());
    resource_key(&decoded_tag) == resource_key(&target_text)
}

/// Extract positive lock tokens applying to `target` from an RFC 4918 `If` header.
/// Supports both untagged `(<token>)` and tagged `<https://.../dav/path> (<token> ["etag"])`
/// forms used by Windows WebClient, while rejecting negated (`Not`) or malformed lists.
fn parse_if_lock_tokens(condition: &str, target: &DavPath) -> Option<Vec<String>> {
    if condition.len() > 4096 {
        return None;
    }
    let bytes = condition.as_bytes();
    let mut i = 0;
    let mut tokens = Vec::new();
    let skip_ws = |idx: &mut usize| {
        while *idx < bytes.len() && bytes[*idx].is_ascii_whitespace() {
            *idx += 1;
        }
    };
    skip_ws(&mut i);
    while i < bytes.len() {
        let mut applies = true;
        if bytes[i] == b'<' {
            let start = i + 1;
            let end = condition[start..].find('>')? + start;
            applies = tag_matches_path(condition[start..end].trim(), target);
            i = end + 1;
            skip_ws(&mut i);
            if i >= bytes.len() || bytes[i] != b'(' {
                return None;
            }
        }
        if bytes[i] != b'(' {
            return None;
        }
        while i < bytes.len() && bytes[i] == b'(' {
            i += 1;
            skip_ws(&mut i);
            let mut list_tokens = Vec::new();
            let mut list_negated = false;
            while i < bytes.len() && bytes[i] != b')' {
                if bytes[i] == b'<' {
                    let start = i + 1;
                    let end = condition[start..].find('>')? + start;
                    let token = condition[start..end].trim();
                    if token.is_empty() {
                        return None;
                    }
                    list_tokens.push(token.to_owned());
                    i = end + 1;
                } else if bytes[i] == b'[' {
                    i += 1;
                    let mut in_quotes = false;
                    let mut escaped = false;
                    let mut closed = false;
                    while i < bytes.len() {
                        let b = bytes[i];
                        i += 1;
                        if escaped {
                            escaped = false;
                            continue;
                        }
                        if in_quotes {
                            if b == b'\\' {
                                escaped = true;
                            } else if b == b'"' {
                                in_quotes = false;
                            }
                        } else if b == b'"' {
                            in_quotes = true;
                        } else if b == b']' {
                            closed = true;
                            break;
                        }
                    }
                    if !closed {
                        return None;
                    }
                } else {
                    let start = i;
                    while i < bytes.len()
                        && !bytes[i].is_ascii_whitespace()
                        && !matches!(bytes[i], b'<' | b'[' | b')')
                    {
                        i += 1;
                    }
                    let word = &condition[start..i];
                    if word.eq_ignore_ascii_case("Not") {
                        list_negated = true;
                    } else {
                        return None;
                    }
                }
                skip_ws(&mut i);
            }
            if i >= bytes.len() || bytes[i] != b')' {
                return None;
            }
            i += 1;
            if applies && !list_negated {
                tokens.extend(list_tokens);
            }
            skip_ws(&mut i);
        }
    }
    Some(tokens)
}
impl DavLockSystem for Locks {
    fn lock<'a>(
        &'a self,
        p: &DavPath,
        principal: Option<&str>,
        owner: Option<&xmltree::Element>,
        timeout: Option<Duration>,
        shared: bool,
        deep: bool,
    ) -> LsFuture<'a, std::result::Result<DavLock, DavLock>> {
        let original = Box::new(p.to_owned());
        let p = canonical(p);
        let principal = principal.map(str::to_owned);
        let owner = owner.cloned();
        Box::pin(async move {
            {
                let mut originals = self.original.lock().unwrap();
                originals.retain(|_, (_, expiry)| expiry.is_none_or(|t| t > SystemTime::now()));
                self.versions.lock().unwrap().retain(|token,_|originals.contains_key(token));
                if originals.len() >= 4096 {
                    return Err(DavLock {
                        token: String::new(),
                        path: original,
                        principal,
                        owner: owner.map(Box::new),
                        timeout,
                        timeout_at: None,
                        shared,
                        deep,
                    });
                }
            }
            match self
                .inner
                .lock(
                    &p,
                    principal.as_deref(),
                    owner.as_ref(),
                    timeout,
                    shared,
                    deep,
                )
                .await
            {
                Ok(mut lock) => {
                    self.original
                        .lock()
                        .unwrap()
                        .insert(lock.token.clone(), (original.clone(), lock.timeout_at));
                    lock.path = original;
                    Ok(lock)
                }
                Err(lock) => Err(self.reply(lock)),
            }
        })
    }
    fn unlock<'a>(&'a self, p: &DavPath, token: &str) -> LsFuture<'a, std::result::Result<(), ()>> {
        let p = canonical(p);
        let token = token.to_owned();
        Box::pin(async move {
            self.inner.unlock(&p, &token).await?;
            self.original.lock().unwrap().remove(&token);
            self.versions.lock().unwrap().remove(&token);
            Ok(())
        })
    }
    fn refresh<'a>(
        &'a self,
        p: &DavPath,
        token: &str,
        timeout: Option<Duration>,
    ) -> LsFuture<'a, std::result::Result<DavLock, ()>> {
        let p = canonical(p);
        let token = token.to_owned();
        Box::pin(async move {
            let lock = self.inner.refresh(&p, &token, timeout).await?;
            if let Some((_, expiry)) = self.original.lock().unwrap().get_mut(&token) {
                *expiry = lock.timeout_at;
            }
            Ok(self.reply(lock))
        })
    }
    fn check<'a>(
        &'a self,
        p: &DavPath,
        principal: Option<&str>,
        ignore: bool,
        deep: bool,
        tokens: &[String],
    ) -> LsFuture<'a, std::result::Result<(), DavLock>> {
        let p = canonical(p);
        let principal = principal.map(str::to_owned);
        let tokens = tokens.to_vec();
        Box::pin(async move {
            self.inner
                .check(&p, principal.as_deref(), ignore, deep, &tokens)
                .await
                .map_err(|lock| self.reply(lock))
        })
    }
    fn discover<'a>(&'a self, p: &DavPath) -> LsFuture<'a, Vec<DavLock>> {
        let p = canonical(p);
        Box::pin(async move {
            self.inner
                .discover(&p)
                .await
                .into_iter()
                .map(|lock| self.reply(lock))
                .collect()
        })
    }
    fn delete<'a>(&'a self, p: &DavPath) -> LsFuture<'a, std::result::Result<(), ()>> {
        let p = canonical(p);
        Box::pin(async move {
            self.inner.delete(&p).await?;
            let prefix = String::from_utf8_lossy(p.as_bytes());
            self.original.lock().unwrap().retain(|_, (original, _)| {
                let original = canonical(original);
                let key = String::from_utf8_lossy(original.as_bytes());
                !(prefix == "/" || key == prefix || key.starts_with(&format!("{prefix}/")))
            });
            Ok(())
        })
    }
}
