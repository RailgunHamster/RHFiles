//! Favorite ZIP jobs live on RHVideo, not in a renderer. Selection preparation
//! is bounded and one-shot; no archive bytes or credentials cross the UI bridge.
use serde_json::{json, Value};
use std::{collections::HashSet, sync::{Mutex, OnceLock}, time::{Duration, Instant}};

pub const MAX_ITEMS: usize = 50_000;
const CHUNK: usize = 200;
const TTL: Duration = Duration::from_secs(300);
const SAFE_INTEGER: u64 = 9_007_199_254_740_991;

pub fn uuid(value: &str) -> bool {
    value.len() == 36 && value.bytes().enumerate().all(|(i, b)| {
        if [8, 13, 18, 23].contains(&i) { b == b'-' } else { b.is_ascii_hexdigit() }
    })
}

fn fields(value: &Value, allowed: &[&str]) -> Result<(), String> {
    if value.as_object().is_none_or(|o| o.keys().any(|key| !allowed.contains(&key.as_str()))) {
        return Err("导出参数无效".into());
    }
    Ok(())
}

fn reference(value: &Value) -> Result<(String, String), String> {
    fields(value, &["type", "id"])?;
    let kind = value["type"].as_str().filter(|v| ["video", "picture", "novel"].contains(v))
        .ok_or("导出媒体类型无效")?;
    let id = value["id"].as_str().filter(|s| (1..=36).contains(&s.chars().count()) && !s.contains('\0'))
        .ok_or("导出媒体编号无效")?;
    Ok((kind.to_owned(), id.to_owned()))
}

struct Draft {
    generation: u64,
    ticket: String,
    total: usize,
    items: Vec<Value>,
    keys: HashSet<(String, String)>,
    created: Instant,
}

#[derive(Default)]
pub struct Drafts { drafts: Vec<Draft> }

impl Drafts {
    fn prune(&mut self, generation: u64) {
        self.drafts.retain(|d| d.generation == generation && d.created.elapsed() < TTL);
    }

    pub fn prepare(&mut self, generation: u64, args: &Value) -> Result<Value, String> {
        fields(args, &["ticket", "offset", "total", "items"])?;
        let ticket = args["ticket"].as_str().filter(|v| uuid(v)).ok_or("导出准备标识无效")?;
        let total = args["total"].as_u64().filter(|v| (1..=MAX_ITEMS as u64).contains(v))
            .ok_or("一次最多导出 50000 项")? as usize;
        let offset = args["offset"].as_u64().filter(|v| *v < total as u64).ok_or("导出分段位置无效")? as usize;
        let items = args["items"].as_array().filter(|v| (1..=CHUNK).contains(&v.len()) && offset + v.len() <= total)
            .ok_or("每次最多准备 200 项，且不能超过声明总数")?;
        // Validate the complete chunk before changing a draft, including duplicates.
        let keys = items.iter().map(reference).collect::<Result<HashSet<_>, _>>()?;
        if keys.len() != items.len() { return Err("导出选择包含重复条目".into()); }
        self.prune(generation);
        let index = self.drafts.iter().position(|d| d.ticket == ticket);
        let already = self.drafts.iter().map(|d| d.items.len()).sum::<usize>();
        if already + items.len() > 100_000 { return Err("准备中的导出合计不能超过 100000 项".into()); }
        let draft = if let Some(index) = index {
            let draft = &mut self.drafts[index];
            if draft.total != total || draft.items.len() != offset {
                return Err("导出选择已改变或分段重复，请重新准备；未提交打包".into());
            }
            if keys.iter().any(|key| draft.keys.contains(key)) { return Err("导出选择包含重复条目".into()); }
            draft
        } else {
            if offset != 0 || self.drafts.len() >= 4 { return Err("导出准备已失效或准备任务过多".into()); }
            self.drafts.push(Draft {generation, ticket: ticket.into(), total, items: Vec::new(), keys: HashSet::new(), created: Instant::now()});
            self.drafts.last_mut().unwrap()
        };
        draft.items.extend(items.iter().cloned());
        draft.keys.extend(keys);
        Ok(json!({"ticket":ticket,"count":draft.items.len(),"total":total,"ready":draft.items.len()==total}))
    }

    pub fn discard(&mut self, generation: u64, args: &Value) -> Result<Value, String> {
        fields(args, &["ticket"])?;
        let ticket = args["ticket"].as_str().filter(|v| uuid(v)).ok_or("导出准备标识无效")?;
        let before = self.drafts.len();
        self.drafts.retain(|d| d.generation != generation || d.ticket != ticket);
        Ok(json!({"removed":before != self.drafts.len()}))
    }

    pub fn consume(&mut self, generation: u64, args: &Value) -> Result<Value, String> {
        fields(args, &["requestId", "ticket"])?;
        let request = args["requestId"].as_str().filter(|v| uuid(v)).ok_or("导出请求标识无效")?;
        if !args.as_object().unwrap().contains_key("ticket") { return Ok(json!({"request_id":request})); }
        let ticket = args["ticket"].as_str().filter(|v| uuid(v)).ok_or("导出准备标识无效")?;
        self.prune(generation);
        let index = self.drafts.iter().position(|d| d.ticket == ticket && d.items.len() == d.total)
            .ok_or("导出选择尚未准备完整或已失效，请重新准备")?;
        // Consume BEFORE network I/O. An ambiguous write is never replayed.
        let draft = self.drafts.remove(index);
        Ok(json!({"request_id":request,"selection":draft.items}))
    }
}

static DRAFTS: OnceLock<Mutex<Drafts>> = OnceLock::new();
pub fn store() -> &'static Mutex<Drafts> { DRAFTS.get_or_init(|| Mutex::new(Drafts::default())) }
pub fn clear() { if let Ok(mut store) = store().lock() { *store = Drafts::default(); } }

pub fn job(value: &Value) -> Result<(), String> {
    let invalid = || "服务器返回的 ZIP 导出状态无效；请查看最近导出，不会自动重复打包".to_owned();
    if !value.is_object() || ["id", "request_id"].iter().any(|k| !value[*k].as_str().is_some_and(uuid))
        || !value["status"].as_str().is_some_and(|v| ["queued","running","completed","failed","cancelled","expired"].contains(&v))
        || !value["total"].as_u64().is_some_and(|v| (1..=MAX_ITEMS as u64).contains(&v))
        || !value["archive_bytes"].as_u64().is_some_and(|v| v <= SAFE_INTEGER)
        || !value["cancel_requested"].is_boolean() || !value["can_download"].is_boolean()
        || value["can_download"] == true && value["status"] != "completed" { return Err(invalid()); }
    for key in ["created_at", "finished_at", "expires_at"] {
        let date = &value[key];
        if key != "created_at" && date.is_null() { continue; }
        if !date.as_str().is_some_and(|s| s.len() <= 64 && chrono::DateTime::parse_from_rfc3339(s).is_ok()) { return Err(invalid()); }
    }
    if !value["error_message"].is_null() && !value["error_message"].as_str().is_some_and(|s| s.chars().count() <= 16384) { return Err(invalid()); }
    let progress = value["progress"].as_object().ok_or_else(invalid)?;
    for key in ["done", "included", "skipped", "bytes_done", "bytes_total"] {
        if let Some(n) = progress.get(key) {
            let max = if key.starts_with("bytes_") { SAFE_INTEGER } else { value["total"].as_u64().unwrap() };
            if !n.as_u64().is_some_and(|n| n <= max) { return Err(invalid()); }
        }
    }
    if progress.get("percent").is_some_and(|n| !n.as_f64().is_some_and(|n| n.is_finite() && (0.0..=100.0).contains(&n)))
        || progress.get("current").is_some_and(|n| !n.as_str().is_some_and(|s| s.chars().count() <= 32768)) { return Err(invalid()); }
    Ok(())
}

pub fn response(name: &str, value: &Value) -> Result<(), String> {
    if name == "exports.list" {
        let items = value["items"].as_array().filter(|v| v.len() <= 100).ok_or("导出列表格式无效")?;
        let mut ids = HashSet::new();
        for item in items { job(item)?; if !ids.insert(item["id"].as_str().unwrap().to_ascii_lowercase()) { return Err("导出列表包含重复任务".into()); } }
        Ok(())
    } else { job(value) }
}

pub fn identity(value: &Value, field: &str, expected: &str) -> Result<(), String> {
    if !value[field].as_str().is_some_and(|id| id.eq_ignore_ascii_case(expected)) {
        return Err("服务器返回的导出任务与请求不匹配，请查看最近导出核对；不会自动重复执行".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const T: &str = "c8f17f3e-28c5-4fca-9fb2-204fb8713980";
    const R: &str = "dafcc457-e7ac-42f6-a808-53841219d5ec";
    fn chunk(offset: usize, total: usize, items: Vec<Value>) -> Value { json!({"ticket":T,"offset":offset,"total":total,"items":items}) }
    fn sample() -> Value { json!({"id":T,"request_id":R,"status":"queued","total":3,"archive_bytes":0,"cancel_requested":false,"can_download":false,"created_at":"2026-10-29T00:00:00.123456Z","finished_at":null,"expires_at":null,"error_message":null,"progress":{}}) }
    #[test]
    fn full_selection_is_chunked_includes_novels_and_is_consumed_once() {
        let mut drafts = Drafts::default();
        for offset in (0..MAX_ITEMS).step_by(CHUNK) {
            let items = (offset..(offset+CHUNK).min(MAX_ITEMS)).map(|n| json!({"type":if n%3==0 {"novel"} else {"picture"},"id":n.to_string()})).collect();
            let result = drafts.prepare(7,&chunk(offset,MAX_ITEMS,items)).unwrap();
            assert_eq!(result["ready"],offset+CHUNK==MAX_ITEMS);
        }
        let body = drafts.consume(7,&json!({"requestId":R,"ticket":T})).unwrap();
        assert_eq!(body["selection"].as_array().unwrap().len(),MAX_ITEMS);
        assert_eq!(body["selection"][0]["type"],"novel");
        assert!(drafts.consume(7,&json!({"requestId":R,"ticket":T})).is_err());
    }
    #[test]
    fn invalid_or_duplicate_chunks_never_partially_mutate_a_selection() {
        let mut drafts=Drafts::default();
        let one=json!({"type":"picture","id":"一"});
        drafts.prepare(7,&chunk(0,3,vec![one.clone()])).unwrap();
        for value in [chunk(0,3,vec![one.clone()]),chunk(1,3,vec![one]),chunk(1,3,vec![json!({"type":"novel","id":"二"}),json!({"type":"file","id":"bad"})])]{assert!(drafts.prepare(7,&value).is_err());}
        drafts.prepare(7,&chunk(1,3,vec![json!({"type":"novel","id":"二"}),json!({"type":"video","id":"三"})])).unwrap();
        assert!(drafts.consume(7,&json!({"requestId":"bad","ticket":T})).is_err());
        assert_eq!(drafts.consume(7,&json!({"requestId":R,"ticket":T})).unwrap()["selection"].as_array().unwrap().len(),3);
    }
    #[test]
    fn all_favorites_omits_selection_and_stale_incomplete_or_expired_drafts_cannot_submit() {
        let mut drafts=Drafts::default();
        assert_eq!(drafts.consume(7,&json!({"requestId":R})).unwrap(),json!({"request_id":R}));
        assert!(drafts.consume(7,&json!({"requestId":R,"ticket":null})).is_err());
        drafts.prepare(7,&chunk(0,2,vec![json!({"type":"video","id":"a"})])).unwrap();
        assert!(drafts.consume(7,&json!({"requestId":R,"ticket":T})).is_err());
        drafts.drafts[0].created=Instant::now()-TTL;
        assert!(drafts.consume(7,&json!({"requestId":R,"ticket":T})).is_err());
        drafts.prepare(7,&chunk(0,1,vec![json!({"type":"video","id":"a"})])).unwrap();
        assert!(drafts.consume(8,&json!({"requestId":R,"ticket":T})).is_err());
    }
    #[test]
    fn replies_validate_real_job_states_numbers_dates_and_download_readiness() {
        let base=sample();job(&base).unwrap();
        for (key,value) in [("status",json!("unknown")),("id",json!("../download")),("total",json!(50001)),("can_download",json!(true)),("created_at",json!("yesterday")),("progress",json!({"percent":101})),("progress",json!({"bytes_done":-1}))]{let mut v=base.clone();v[key]=value;assert!(job(&v).is_err(),"{v}");}
        response("exports.list",&json!({"items":[base.clone()]})).unwrap();
        assert!(response("exports.list",&json!({"items":[base.clone(),base]})).is_err());
        identity(&sample(),"request_id",R).unwrap();
        identity(&sample(),"id",&T.to_ascii_uppercase()).unwrap();
        assert!(identity(&sample(),"id",R).is_err());
    }
}
