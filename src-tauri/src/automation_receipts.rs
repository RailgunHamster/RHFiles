//! Process-owned completion records for actions which retire their WebView.
//! No disk, arguments, credentials, listener, or automatic operation replay.
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::VecDeque,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Run {
    id: String,
    action: String,
    key: Option<String>,
    fingerprint: String,
    started_at: u64,
    completion_result: Option<Value>,
}
struct Entry {
    run: Run,
    hash: [u8; 32],
    value: Value,
    touched: Instant,
}
struct Retired {
    id: String,
    key: Option<String>,
    hash: [u8; 32],
    action: String,
    touched: Instant,
}
#[derive(Default)]
struct Store {
    entries: VecDeque<Entry>,
    retired: VecDeque<Retired>,
}
enum Admission {
    New,
    Existing(Result<Value, String>),
}
const TTL: Duration = Duration::from_secs(30 * 60);
impl Store {
    fn prune(&mut self) {
        self.entries
            .retain(|v| v.value["state"] == "running" || v.touched.elapsed() < TTL);
        self.retired.retain(|v| v.touched.elapsed() < TTL);
        while self.entries.len() >= 128 {
            if self.retired.len() >= 4096 {
                break;
            }
            let Some(index) = self
                .entries
                .iter()
                .position(|v| v.value["state"] != "running")
            else {
                break;
            };
            let old = self.entries.remove(index).unwrap();
            self.retired.push_back(Retired {
                id: old.run.id,
                key: old.run.key,
                hash: old.hash,
                action: old.run.action,
                touched: old.touched,
            });
        }
    }
    fn begin(&mut self, run: Run, native_action: &str) -> Result<Admission, String> {
        let valid = match native_action {
            "player.close" => matches!(
                run.action.as_str(),
                "rhvideo.player.close" | "rhvideo.player.input" | "ui.invoke"
            ),
            "player.back" => matches!(
                run.action.as_str(),
                "rhvideo.player.back" | "rhvideo.player.input" | "ui.invoke"
            ),
            "grid.close" => matches!(
                run.action.as_str(),
                "rhvideo.grid.close" | "rhvideo.grid.input" | "ui.invoke"
            ),
            _ => false,
        };
        if !valid
            || run.id.is_empty()
            || run.id.len() > 240
            || run
                .key
                .as_ref()
                .is_some_and(|v| v.is_empty() || v.len() > 800)
            || run.fingerprint.len() > 1024 * 1024
            || run.started_at > 9_007_199_254_740_991
            || match (&run.completion_result, run.action.as_str()) {
                (Some(value), "ui.invoke") => value.as_object().is_none_or(|v| {
                    v.len() != 2
                        || v.get("controlId")
                            .and_then(Value::as_str)
                            .is_none_or(|v| v.is_empty() || v.len() > 240)
                        || v.get("event").and_then(Value::as_str).is_none_or(|v| {
                            v.is_empty()
                                || v.len() > 32
                                || !v.bytes().all(|c| c.is_ascii_lowercase())
                        })
                }),
                (None, "ui.invoke") => true,
                (Some(_), _) => true,
                _ => false,
            }
        {
            return Err("无效的窗口操作回执".into());
        }
        self.prune();
        let hash: [u8; 32] = Sha256::digest(run.fingerprint.as_bytes()).into();
        let previous = self
            .entries
            .iter()
            .rev()
            .find(|v| v.run.id == run.id || run.key.is_some() && v.run.key == run.key);
        if let Some(old) = previous {
            if old.hash != hash || old.run.action != run.action {
                return Err("该请求标识已用于不同操作，未重复执行".into());
            }
            let result = match old.value["state"].as_str() {
                Some("succeeded") => Ok(old.value["result"].clone()),
                Some("failed") => Err(old.value["error"]["message"]
                    .as_str()
                    .unwrap_or("窗口操作失败")
                    .to_owned()),
                _ => return Err("该窗口操作仍在处理；请查询回执，不要重复提交".into()),
            };
            if old.run.id != run.id {
                if self.entries.len() >= 128 {
                    return Err("操作回执保留空间已满，请稍后查询旧请求".into());
                }
                let id = run.id.clone();
                self.insert(run, hash);
                self.finish_id(&id, &result);
            }
            return Ok(Admission::Existing(result));
        }
        if let Some(old) = self
            .retired
            .iter()
            .find(|v| v.id == run.id || run.key.is_some() && v.key == run.key)
        {
            return Err(if old.hash == hash && old.action == run.action {
                "旧操作结果已过期，未重复执行"
            } else {
                "该请求标识已用于不同操作，未重复执行"
            }
            .into());
        }
        if self.entries.len() >= 128
            || self
                .entries
                .iter()
                .filter(|v| v.value["state"] == "running")
                .count()
                >= 32
        {
            return Err("窗口操作回执过多，请等待现有操作完成".into());
        }
        self.insert(run, hash);
        Ok(Admission::New)
    }
    fn insert(&mut self, mut run: Run, hash: [u8; 32]) {
        // Keep only the digest; never retain arbitrary UI arguments in a receipt.
        run.fingerprint.clear();
        let value = json!({"id":run.id,"action":run.action,"state":"running","startedAt":run.started_at,"finishedAt":null});
        self.entries.push_back(Entry {
            run,
            hash,
            value,
            touched: Instant::now(),
        });
    }
    fn finish_id(&mut self, id: &str, result: &Result<Value, String>) {
        if let Some(entry) = self.entries.iter_mut().find(|v| v.run.id == id) {
            entry.value["finishedAt"] = json!(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64
            );
            entry.touched = Instant::now();
            match result {
                Ok(value) => {
                    entry.value["state"] = json!("succeeded");
                    entry.value["result"] = entry
                        .run
                        .completion_result
                        .clone()
                        .unwrap_or_else(|| value.clone());
                }
                Err(error) => {
                    entry.value["state"] = json!("failed");
                    entry.value["error"] = json!({"code":"ACTION_FAILED","message":error.chars().take(1024).collect::<String>()});
                }
            }
        }
    }
    fn lookup(&self, query: &Query) -> Option<Value> {
        self.entries
            .iter()
            .rev()
            .find(|v| {
                (v.value["state"] == "running" || v.touched.elapsed() < TTL)
                    && (query.run_id.as_ref().is_some_and(|id| id == &v.run.id)
                        || query
                            .key
                            .as_ref()
                            .is_some_and(|key| Some(key) == v.run.key.as_ref()))
            })
            .map(|v| v.value.clone())
    }
    fn expired(&self, query: &Query) -> bool {
        self.retired.iter().any(|v| {
            v.touched.elapsed() < TTL
                && (query.run_id.as_ref().is_some_and(|id| id == &v.id)
                    || query
                        .key
                        .as_ref()
                        .is_some_and(|key| Some(key) == v.key.as_ref()))
        })
    }
}
static STORE: OnceLock<Mutex<Store>> = OnceLock::new();
fn store() -> &'static Mutex<Store> {
    STORE.get_or_init(|| Mutex::new(Store::default()))
}
pub(crate) fn begin(
    value: Value,
    native_action: &str,
) -> Result<Option<Result<Value, String>>, String> {
    let run: Run = serde_json::from_value(value).map_err(|_| "无效的窗口操作回执")?;
    match store()
        .lock()
        .map_err(|_| "操作回执不可用")?
        .begin(run, native_action)?
    {
        Admission::New => Ok(None),
        Admission::Existing(result) => Ok(Some(result)),
    }
}
pub(crate) fn finish(id: &str, result: &Result<Value, String>) {
    if let Ok(mut store) = store().lock() {
        store.finish_id(id, result);
    }
}
pub(crate) struct Completion(Option<String>);
impl Completion {
    pub(crate) fn new(id: String) -> Self {
        Self(Some(id))
    }
    pub(crate) fn finish(mut self, result: &Result<Value, String>) {
        if let Some(id) = self.0.take() {
            finish(&id, result);
        }
    }
}
impl Drop for Completion {
    fn drop(&mut self) {
        if let Some(id) = self.0.take() {
            finish(
                &id,
                &Err("窗口操作未能确认完成；请检查当前状态，不要自动重复执行".into()),
            );
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Query {
    run_id: Option<String>,
    key: Option<String>,
    timeout_ms: Option<u64>,
}
#[tauri::command]
pub(crate) async fn automation_receipt(query: Query) -> Result<Option<Value>, Value> {
    if query.run_id.is_some() == query.key.is_some()
        || query.timeout_ms.unwrap_or(0) > 30000
        || query
            .run_id
            .as_ref()
            .is_some_and(|v| v.is_empty() || v.len() > 240)
        || query
            .key
            .as_ref()
            .is_some_and(|v| v.is_empty() || v.len() > 800)
    {
        return Err(json!({"code":"INVALID_PARAMS","message":"无效的回执查询"}));
    }
    let end = Instant::now() + Duration::from_millis(query.timeout_ms.unwrap_or(0));
    loop {
        let value = {
            let store = store()
                .lock()
                .map_err(|_| json!({"code":"RECEIPT_UNAVAILABLE","message":"操作回执不可用"}))?;
            let value = store.lookup(&query);
            if value.is_none() && store.expired(&query) {
                return Err(
                    json!({"code":"RESULT_EXPIRED","message":"旧操作结果已过期；不要自动重复执行"}),
                );
            }
            value
        };
        if value.as_ref().is_none_or(|v| v["state"] != "running") || Instant::now() >= end {
            return Ok(value);
        }
        tokio::time::sleep(
            Duration::from_millis(25).min(end.saturating_duration_since(Instant::now())),
        )
        .await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn run(id: &str, key: &str) -> Run {
        Run {
            id: id.into(),
            action: "rhvideo.player.close".into(),
            key: Some(key.into()),
            fingerprint: "close:{}".into(),
            started_at: 1,
            completion_result: None,
        }
    }
    fn query(id: &str) -> Query {
        Query {
            run_id: Some(id.into()),
            key: None,
            timeout_ms: None,
        }
    }
    #[test]
    fn a_ui_close_retains_the_public_ui_result_shape() {
        let mut s = Store::default();
        let mut request = run("ui-close", "ui-close");
        request.action = "ui.invoke".into();
        request.completion_result = Some(json!({"controlId":"ui-5","event":"click"}));
        s.begin(request, "player.back").unwrap();
        s.finish_id("ui-close", &Ok(json!({"closed":true})));
        assert_eq!(
            s.lookup(&query("ui-close")).unwrap()["result"],
            json!({"controlId":"ui-5","event":"click"})
        );
        let mut bad = run("bad", "bad");
        bad.completion_result = Some(json!({"forged":true}));
        assert!(s.begin(bad, "player.close").is_err());
    }
    #[test]
    fn retention_pressure_refuses_new_actions_instead_of_forgetting_request_keys() {
        let mut s = Store::default();
        for i in 0..128 {
            let id = i.to_string();
            let request = run(&id, &id);
            s.insert(request, Sha256::digest(b"close:{}").into());
            s.finish_id(&id, &Ok(json!({"closed":true})));
        }
        for i in 0..4096 {
            s.retired.push_back(Retired {
                id: format!("old-{i}"),
                key: Some(format!("old-{i}")),
                hash: Sha256::digest(b"close:{}").into(),
                action: "rhvideo.player.close".into(),
                touched: Instant::now(),
            });
        }
        assert!(s.begin(run("new", "new"), "player.close").is_err());
        assert!(s.begin(run("alias", "0"), "player.close").is_err());
        assert!(s.begin(run("again", "old-0"), "player.close").is_err());
        assert_eq!(s.entries.len(), 128);
        assert_eq!(s.retired.len(), 4096);
    }
    #[test]
    fn completion_survives_its_producer_and_contains_no_arguments() {
        let mut s = Store::default();
        assert!(matches!(
            s.begin(run("old", "key"), "player.close").unwrap(),
            Admission::New
        ));
        assert_eq!(s.lookup(&query("old")).unwrap()["state"], "running");
        s.finish_id("old", &Ok(json!({"closed":true})));
        let value = s.lookup(&query("old")).unwrap();
        assert_eq!(value["result"]["closed"], true);
        assert_eq!(value["state"], "succeeded");
        assert!(!value.to_string().contains("fingerprint"));
        assert!(s.entries[0].run.fingerprint.is_empty());
    }
    #[test]
    fn a_reused_key_does_not_close_a_new_player() {
        let mut s = Store::default();
        s.begin(run("old", "key"), "player.close").unwrap();
        s.finish_id("old", &Ok(json!({"closed":true})));
        assert!(matches!(
            s.begin(run("new", "key"), "player.close").unwrap(),
            Admission::Existing(Ok(_))
        ));
        assert_eq!(s.lookup(&query("new")).unwrap()["state"], "succeeded");
        let mut changed = run("wrong", "key");
        changed.fingerprint = "different".into();
        assert!(s.begin(changed, "player.close").is_err());
    }
    #[test]
    fn running_and_failed_actions_are_not_implicitly_reexecuted() {
        let mut s = Store::default();
        s.begin(run("old", "key"), "player.close").unwrap();
        assert!(s.begin(run("new", "key"), "player.close").is_err());
        s.finish_id("old", &Err("guard rejected".into()));
        assert!(matches!(
            s.begin(run("new", "key"), "player.close").unwrap(),
            Admission::Existing(Err(_))
        ));
    }
    #[test]
    fn bounds_expiry_and_operation_allowlist_are_enforced() {
        let mut s = Store::default();
        assert!(s.begin(run("not-close", "key"), "favorite").is_err());
        for i in 0..300 {
            let id = i.to_string();
            s.begin(run(&id, &id), "player.close").unwrap();
            s.finish_id(&id, &Ok(json!({"closed":true})));
        }
        assert!(s.entries.len() <= 128);
        assert!(s.lookup(&query("0")).is_none());
        assert!(s.expired(&query("0")));
        assert!(s.begin(run("reused", "0"), "player.close").is_err());
        s.entries.back_mut().unwrap().touched = Instant::now() - TTL;
        assert!(s.lookup(&query("299")).is_none());
    }
    #[test]
    fn an_active_run_does_not_expire_from_submission() {
        let mut s = Store::default();
        s.begin(run("slow", "slow"), "player.close").unwrap();
        s.entries[0].touched = Instant::now() - TTL;
        assert_eq!(s.lookup(&query("slow")).unwrap()["state"], "running");
        s.finish_id("slow", &Ok(json!({"closed":true})));
        assert_eq!(s.lookup(&query("slow")).unwrap()["state"], "succeeded");
    }
    #[test]
    fn dropped_completion_becomes_uncertain_failure_not_a_permanent_running_task() {
        let value=serde_json::to_value(json!({"id":"drop-qa","action":"rhvideo.player.close","key":"drop-qa","fingerprint":"close:{}","startedAt":1})).unwrap();
        assert!(begin(value, "player.close").unwrap().is_none());
        drop(Completion::new("drop-qa".into()));
        assert_eq!(
            store().lock().unwrap().lookup(&query("drop-qa")).unwrap()["state"],
            "failed"
        );
    }
}
