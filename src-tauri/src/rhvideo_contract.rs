//! Shared allowlist: the UI cannot turn an operation into an arbitrary URL,
//! change its HTTP verb, or silently invoke a destructive operation.
use serde_json::Value;
use std::sync::OnceLock;

pub fn manifest() -> &'static Value {
    static SPEC: OnceLock<Value> = OnceLock::new();
    SPEC.get_or_init(|| {
        serde_json::from_str(include_str!("../../src/rhvideo-operations.json"))
            .expect("RHVideo contract")
    })
}
fn valid(value: &Value, rule: &str) -> bool {
    if rule == "bool" {
        return value.is_boolean();
    }
    if rule == "uuid" {
        return value.as_str().is_some_and(super::exports::uuid);
    }
    if rule == "media-key" {
        return value.as_str().is_some_and(|s| s.len() <= 50 && s.split_once(':').is_some_and(|(kind,id)|
            matches!(kind,"video"|"picture") && valid(&Value::String(id.into()),"id")));
    }
    if rule == "id" {
        return value.as_str().is_some_and(|s| {
            !s.is_empty()
                && s.len() <= 128
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        });
    }
    if rule == "task" {
        return value.as_str().is_some_and(|s| {
            s.len() <= 160
                && s.split_once(':').is_some_and(|(kind, id)| {
                    ["run", "video", "replace"].contains(&kind)
                        && valid(&Value::String(id.into()), "id")
                })
        });
    }
    if rule == "resolution" {
        return value.is_null()
            || value.as_str().is_some_and(|s| {
                s.is_empty()
                    || s.split_once('x').is_some_and(|(w, h)| {
                        [w, h].iter().all(|n| {
                            (2..=4).contains(&n.len())
                                && !n.starts_with('0')
                                && n.parse::<u32>().is_ok_and(|n| (10..=9999).contains(&n))
                        })
                    })
            });
    }
    if let Some(max) = rule
        .strip_prefix("text:")
        .and_then(|n| n.parse::<usize>().ok())
    {
        return value
            .as_str()
            .is_some_and(|s| s.chars().count() <= max && !s.contains('\0'));
    }
    if let Some(max) = rule
        .strip_prefix("ids:")
        .and_then(|n| n.parse::<usize>().ok())
    {
        return value
            .as_array()
            .is_some_and(|a| !a.is_empty() && a.len() <= max && a.iter().all(|v| valid(v, "id")));
    }
    if let Some(range) = rule.strip_prefix("int:") {
        let (min, max) = range.split_once(':').unwrap();
        return value
            .as_i64()
            .is_some_and(|n| (min.parse::<i64>().unwrap()..=max.parse().unwrap()).contains(&n));
    }
    rule.split('|').any(|s| {
        value.as_str() == Some(s) || value.as_i64().is_some_and(|n| s.parse::<i64>() == Ok(n))
    })
}
pub struct Request {
    pub method: reqwest::Method,
    pub path: String,
    pub query: Vec<(String, String)>,
    pub body: Option<Value>,
    pub invalidates_catalog: bool,
}
pub fn request(args: &Value) -> Result<Request, String> {
    let name = args
        .get("name")
        .and_then(Value::as_str)
        .ok_or("缺少操作名称")?;
    let spec = manifest()["operations"]
        .get(name)
        .filter(|s| s["internal"] != true)
        .ok_or("不支持的 RHVideo 操作")?;
    if args.as_object().is_none_or(|a| {
        a.keys()
            .any(|k| !["name", "params", "query", "body", "confirmation"].contains(&k.as_str()))
    }) {
        return Err("操作参数无效".into());
    }
    if spec["risk"] == "destructive"
        && args["confirmation"].as_str() != Some(&format!("RHVIDEO:{name}"))
    {
        return Err("此操作需要显式确认".into());
    }
    let mut path = spec["path"].as_str().unwrap().to_owned();
    let empty = serde_json::Map::new();
    let params = match args.get("params") {
        Some(v) => v.as_object().ok_or("路径参数无效")?,
        None => &empty,
    };
    for (key, value) in params {
        if !path.contains(&format!("{{{key}}}"))
            || !valid(value, spec["params"][key].as_str().unwrap_or("id"))
        {
            return Err(format!("路径参数无效：{key}"));
        }
        path = path.replace(&format!("{{{key}}}"), value.as_str().unwrap());
    }
    if path.contains(['{', '}']) {
        return Err("缺少路径参数".into());
    }
    if let Some(required)=spec["requiredBody"].as_array() {
        for field in required {
            let key=field.as_str().ok_or("无效的接口契约")?;
            if args.get("body").and_then(|body|body.get(key)).is_none(){return Err(format!("缺少请求参数：{key}"));}
        }
    }
    let mut query = Vec::new();
    for section in ["query", "body"] {
        if let Some(value) = args.get(section) {
            let values = value.as_object().ok_or("接口参数必须是对象")?;
            for (key, value) in values {
                let rule = spec[section][key]
                    .as_str()
                    .ok_or_else(|| format!("不支持的参数：{key}"))?;
                if !valid(value, rule) {
                    return Err(format!("参数无效：{key}"));
                }
                if section == "query" {
                    query.push((
                        key.clone(),
                        value
                            .as_str()
                            .map(str::to_owned)
                            .unwrap_or_else(|| value.to_string()),
                    ));
                }
            }
        }
    }
    Ok(Request {
        method: spec["method"].as_str().unwrap().parse().unwrap(),
        path: format!("api/v1/{path}"),
        query,
        body: args.get("body").cloned(),
        invalidates_catalog: spec["invalidatesCatalog"] == true,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn contract_blocks_path_escape_verbs_and_unconfirmed_deletion() {
        for a in [
            json!({"name":"evil"}),
            json!({"name":"video.info","params":{"id":"../auth/me"}}),
            json!({"name":"video.info","params":{"id":"ok"},"query":{"url":"https://evil"}}),
            json!({"name":"trash.stage","params":{"id":"a","kind":"video"}}),
            json!({"name":"account.refresh"}),
            json!({"name":"video.info","method":"DELETE"}),
        ] {
            assert!(request(&a).is_err(), "{a}");
        }
        let r=request(&json!({"name":"trash.stage","params":{"id":"a","kind":"video"},"confirmation":"RHVIDEO:trash.stage"})).unwrap();
        assert_eq!(r.path, "api/v1/trash/video/a");
    }
    #[test]
    fn bounds_and_task_identifiers_match_both_clients() {
        assert!(request(
            &json!({"name":"tasks.detail","params":{"queue":"replacement","entry":"replace:42"}})
        )
        .is_ok());
        assert!(request(&json!({"name":"tasks.list","query":{"limit":51}})).is_err());
        assert!(request(&json!({"name":"batches.create","body":{"video_ids":[],"crf":39},"confirmation":"RHVIDEO:batches.create"})).is_err());
    }
    #[test]
    fn exports_only_use_fixed_routes_canonical_ids_and_bounded_private_lists() {
        let id = "c8f17f3e-28c5-4fca-9fb2-204fb8713980";
        let call = request(&json!({"name":"exports.cancel","params":{"id":id}})).unwrap();
        assert_eq!(call.method, reqwest::Method::DELETE);
        assert_eq!(call.path, format!("api/v1/favorite-exports/{id}"));
        assert!(!call.invalidates_catalog); // Cancelling a ZIP never deletes source media.
        for args in [json!({"name":"exports.get","params":{"id":"../auth/me"}}),json!({"name":"exports.get","params":{"id":"archive.zip"}}),json!({"name":"exports.list","query":{"limit":101}}),json!({"name":"exports.list","query":{"user_id":"other-owner"}}),json!({"name":"exports.create","body":{"request_id":id}})] {
            assert!(request(&args).is_err(), "{args}");
        }
    }
    #[test]
    fn duplicate_reviews_require_the_snapshot_keeper_and_explicit_confirmation() {
        let id="c8f17f3e-28c5-4fca-9fb2-204fb8713980";
        let args=json!({"name":"duplicates.confirm","body":{"request_id":id,"group_id":id,"scan_id":id,"keeper_key":"video:sample"},"confirmation":"RHVIDEO:duplicates.confirm"});
        let accepted=request(&args).unwrap();assert_eq!(accepted.path,"api/v1/duplicates/reviews");assert!(accepted.invalidates_catalog);
        for key in ["request_id","group_id","scan_id","keeper_key"] {
            let mut bad=args.clone();bad["body"].as_object_mut().unwrap().remove(key);assert!(request(&bad).is_err(),"missing {key}");
        }
        let mut bad=args.clone();bad.as_object_mut().unwrap().remove("confirmation");assert!(request(&bad).is_err());
        for key in ["", "other:sample", "video:../file", "picture:bad?url", "video:a:b"] {
            let mut bad=args.clone();bad["body"]["keeper_key"]=json!(key);assert!(request(&bad).is_err(),"{key}");
        }
        assert!(request(&json!({"name":"duplicates.scan"})).is_err());
        assert!(request(&json!({"name":"duplicates.groups","query":{"kind":"novel"}})).is_err());
        assert!(request(&json!({"name":"duplicates.members","params":{"id":id},"query":{"limit":25}})).is_err());
        let cancel=request(&json!({"name":"duplicates.cancel","params":{"id":id}})).unwrap();assert_eq!(cancel.method,reqwest::Method::DELETE);assert!(!cancel.invalidates_catalog);
    }
    #[test]
    fn queued_task_promotion_is_a_fixed_post_not_a_retry_or_catalog_mutation() {
        let accepted=request(&json!({"name":"tasks.prioritize","params":{"queue":"default","entry":"video:sample"}})).unwrap();
        assert_eq!(accepted.method,reqwest::Method::POST);assert_eq!(accepted.path,"api/v1/processing-tasks/default/video:sample/prioritize");assert!(!accepted.invalidates_catalog);
        assert!(accepted.body.is_none());
        assert!(request(&json!({"name":"tasks.prioritize","params":{"queue":"default","entry":"video:../escape"}})).is_err());
        assert!(request(&json!({"name":"tasks.prioritize","params":{"queue":"unknown","entry":"video:sample"}})).is_err());
        assert!(request(&json!({"name":"tasks.prioritize","params":{"queue":"replacement","entry":"replace:12"},"body":{"retry":true}})).is_err());
    }
}
