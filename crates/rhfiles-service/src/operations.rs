//! Owner-bound mutation receipts. Looking up a receipt never repeats a write.
use crate::model::*;
use axum::{
    body::Body,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

pub(crate) const HEADER: &str = "X-RHFiles-Operation-Id";
pub(crate) const PREFIX: &str = "/api/v1/operations/";
pub(crate) fn supported(path: &str) -> bool {
    matches!(
        path,
        "/api/v1/recycle-checked"
            | "/api/v1/recycle-restore"
            | "/api/v1/delete-checked"
            | "/api/v1/rename-checked"
            | "/api/v1/mkdir"
            | "/api/v1/rename"
            | "/api/v1/copy"
            | "/api/v1/delete"
    )
}
fn valid(id: &str) -> bool {
    id.split_once('.').is_some_and(|(time, nonce)| {
        time.parse::<u64>().is_ok()
            && time.len() <= 16
            && nonce.len() == 43
            && nonce
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
    })
}
struct Completed {
    status: StatusCode,
    body: bytes::Bytes,
    at: Instant,
}
pub(crate) struct Receipt {
    id: String,
    owner: String,
    digest: String,
    completed: Mutex<Option<Completed>>,
}
impl Receipt {
    pub fn finish(&self, status: StatusCode, body: bytes::Bytes) {
        *self.completed.lock().unwrap() = Some(Completed {
            status,
            body,
            at: Instant::now(),
        });
    }
    pub fn response(&self) -> Response {
        let completed = self.completed.lock().unwrap();
        let mut response = if let Some(done) = completed.as_ref() {
            let mut r = Response::new(Body::from(done.body.clone()));
            *r.status_mut() = done.status;
            r.headers_mut()
                .insert("Content-Type", "application/json".parse().unwrap());
            r
        } else {
            (
                StatusCode::ACCEPTED,
                axum::Json(serde_json::json!({"operationId":self.id,"state":"running"})),
            )
                .into_response()
        };
        response
            .headers_mut()
            .insert(HEADER, self.id.parse().unwrap());
        response
            .headers_mut()
            .insert("Cache-Control", "no-store".parse().unwrap());
        response
    }
}
#[derive(Default)]
struct Records {
    results: HashMap<String, Arc<Receipt>>,
    seen: HashSet<[u8; 32]>,
}
#[derive(Default)]
pub(crate) struct Operations(Mutex<Records>);
impl Operations {
    pub fn submit(&self, id: &str, owner: &str, digest: &str) -> Result<(Arc<Receipt>, bool)> {
        if !valid(id) {
            return Err(Error::new("invalid_request", "操作标识无效"));
        }
        let mut records = self.0.lock().unwrap();
        let all = &mut records.results;
        if let Some(item) = all.get(id) {
            if item.owner != owner || item.digest != digest {
                return Err(Error::new("conflict", "操作标识已使用，未重复执行"));
            }
            return Ok((item.clone(), false));
        }
        // Tombstones survive result eviction for this service lifetime. Never
        // trust a client's clock to decide whether an old write may run again.
        let key: [u8; 32] = Sha256::digest(id.as_bytes()).into();
        if records.seen.contains(&key) {
            return Err(Error::new(
                "conflict",
                "操作标识已经使用，回执已过期；未重复执行",
            ));
        }
        if records.seen.len() >= 262144 {
            return Err(Error::new(
                "busy",
                "操作记录已满，请等待服务维护；未提交本次操作",
            ));
        }
        let all = &mut records.results;
        all.retain(|_, v| {
            v.completed
                .lock()
                .unwrap()
                .as_ref()
                .is_none_or(|c| c.at.elapsed() < Duration::from_secs(3600))
        });
        if all
            .values()
            .filter(|v| v.completed.lock().unwrap().is_none())
            .count()
            >= 16
        {
            return Err(Error::new("busy", "后台文件操作过多，未提交本次操作"));
        }
        if all.len() >= 2048 {
            let oldest = all
                .iter()
                .filter_map(|(id, v)| {
                    v.completed
                        .lock()
                        .unwrap()
                        .as_ref()
                        .map(|c| (id.clone(), c.at))
                })
                .min_by_key(|(_, at)| *at)
                .map(|(id, _)| id);
            if let Some(id) = oldest {
                all.remove(&id);
            }
        }
        let item = Arc::new(Receipt {
            id: id.into(),
            owner: owner.into(),
            digest: digest.into(),
            completed: Mutex::new(None),
        });
        all.insert(id.into(), item.clone());
        records.seen.insert(key);
        Ok((item, true))
    }
    pub fn lookup(&self, id: &str, owner: &str) -> Result<Arc<Receipt>> {
        if !valid(id) {
            return Err(Error::new("invalid_request", "操作标识无效"));
        }
        self.0
            .lock()
            .unwrap()
            .results
            .get(id)
            .filter(|v| v.owner == owner)
            .cloned()
            .ok_or_else(|| {
                Error::new(
                    "not_found",
                    "操作回执不可用，可能服务已重启；不能据此判断操作未执行",
                )
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn id() -> String {
        format!("{}.{}", now_ms(), random().unwrap())
    }
    #[test]
    fn receipts_are_owner_and_payload_bound_and_do_not_repeat() {
        let all = Operations::default();
        let key = id();
        let (receipt, new) = all.submit(&key, "a", "delete-original-revision").unwrap();
        assert!(new);
        assert_eq!(receipt.response().status(), StatusCode::ACCEPTED);
        assert!(!all.submit(&key, "a", "delete-original-revision").unwrap().1);
        assert!(all.submit(&key, "a", "delete-new-occupant").is_err());
        assert!(all.submit(&key, "b", "delete-original-revision").is_err());
        assert!(all.lookup(&key, "b").is_err());
        receipt.finish(
            StatusCode::OK,
            bytes::Bytes::from_static(b"{\"receipt\":\"undo-token\"}"),
        );
        assert_eq!(
            all.lookup(&key, "a").unwrap().response().status(),
            StatusCode::OK
        );
        assert!(!all.submit(&key, "a", "delete-original-revision").unwrap().1);
        assert!(Operations::default().lookup(&key, "a").is_err());
    }
    #[test]
    fn pending_work_is_bounded_and_clock_skew_cannot_reject_a_new_operation() {
        let all = Operations::default();
        for _ in 0..16 {
            all.submit(&id(), "a", "work").unwrap();
        }
        assert_eq!(all.submit(&id(), "a", "work").err().unwrap().code, "busy");
        assert!(
            Operations::default()
                .submit(&format!("1.{}", random().unwrap()), "a", "work")
                .is_ok()
        );
    }
    #[test]
    fn large_batches_evict_results_without_reexecuting_old_ids() {
        let all = Operations::default();
        let first = id();
        for i in 0..2050 {
            let key = if i == 0 { first.clone() } else { id() };
            let (r, fresh) = all.submit(&key, "a", "delete").unwrap();
            assert!(fresh);
            r.finish(StatusCode::NO_CONTENT, bytes::Bytes::new());
        }
        assert!(all.lookup(&first, "a").is_err());
        assert!(all.submit(&first, "a", "delete").is_err());
        assert!(all.0.lock().unwrap().results.len() <= 2048);
    }
}
