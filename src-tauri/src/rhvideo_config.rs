//! Metadata-only RHVideo backup documents. No credentials or automatic replay.
use serde_json::{Value,json};
use std::{io::Read, sync::{Mutex,OnceLock}, time::{Duration,Instant}};
pub const LIMIT:usize=20*1024*1024;
const TTL:Duration=Duration::from_secs(5*60);
const NAMES:[&str;16]=["page_volume","rotate","mix_pictures","grid_tag_prefs","media_tag_filter","strip_layout","strip_speed","kenburns_duration","kenburns_overlap","kenburns_fade_min","kenburns_fade_max","kenburns_fade_ratio","novel_settings","favshow_image","favshow_video","favshow_fade"];
pub fn preferences(value:&Value)->Result<(),String>{
    let values=value.as_object().filter(|v|v.len()<=32).ok_or("页面偏好格式无效")?;
    if values.iter().any(|(k,v)|!NAMES.contains(&k.as_str())||!v.as_str().is_some_and(|v|v.chars().count()<=16384)){return Err("备份包含不支持的页面偏好".into());}Ok(())
}
pub fn document(value:&Value)->Result<(),String>{
    let object=value.as_object().ok_or("文件不是 RHVideo 配置备份")?;
    if value["format"]!="RHVideo.config-backup"||value["version"]!=1||!value["created_at"].is_string()||object.keys().any(|k|!["format","version","created_at","favorites","watch_folders","reading_progress","ui_preferences"].contains(&k.as_str())){return Err("文件不是受支持的 RHVideo 配置备份（版本 1）".into());}
    for (key,max) in [("favorites",50000),("watch_folders",1000),("reading_progress",50000)]{if value.get(key).is_some_and(|v|!v.as_array().is_some_and(|v|v.len()<=max)){return Err(format!("备份的 {key} 格式或数量无效"));}}
    if let Some(value)=value.get("ui_preferences"){preferences(value)?;}Ok(())
}
pub fn read(path:&str)->Result<Value,String>{
    if !std::path::Path::new(path).is_absolute(){return Err("请选择本机配置文件的完整路径".into());}
    let input=std::fs::File::open(path).map_err(|e|format!("无法读取备份：{e}"))?;
    let mut bytes=Vec::new();input.take((LIMIT+1)as u64).read_to_end(&mut bytes).map_err(|e|format!("无法读取备份：{e}"))?;
    if bytes.len()>LIMIT{return Err("配置备份不能超过 20 MB".into());}
    let value=serde_json::from_slice(&bytes).map_err(|_|"文件不是有效的 JSON 配置备份")?;document(&value)?;Ok(value)
}
struct Pending{generation:u64,ticket:String,value:Value,created:Instant}
pub fn summary(value:&Value,applied:bool)->Result<(),String>{
    if value["applied"]!=applied||!value["preferences"].is_u64()||!value["issues"].as_array().is_some_and(|v|v.len()<=50){return Err("服务器未返回有效的配置恢复结果，请核对当前记录；不会自动重复恢复".into());}
    for (key,fields)in [("favorites",&["total","add","existing","unmatched"][..]),("watch_folders",&["total","add","existing","skipped"][..]),("reading_progress",&["total","update","kept","unmatched"][..])]{if fields.iter().any(|field|!value[key][*field].is_u64()){return Err("配置恢复结果缺少匹配统计".into());}}
    if let Some(prefs)=value.get("ui_preferences"){preferences(prefs)?;}Ok(())
}
static PENDING:OnceLock<Mutex<Option<Pending>>>=OnceLock::new();
fn pending()->&'static Mutex<Option<Pending>>{PENDING.get_or_init(||Mutex::new(None))}
pub fn clear(){if let Ok(mut value)=pending().lock(){*value=None;}}
pub fn stage(generation:u64,value:Value,preview:Value)->Result<Value,String>{
    document(&value)?;summary(&preview,false)?;let mut random=[0u8;16];getrandom::fill(&mut random).map_err(|_|"无法生成备份预览标识")?;let ticket=random.iter().map(|v|format!("{v:02x}")).collect::<String>();
    *pending().lock().map_err(|_|"备份准备不可用")?=Some(Pending{generation,ticket:ticket.clone(),value,created:Instant::now()});
    Ok(json!({"ticket":ticket,"preview":preview}))
}
pub fn consume(generation:u64,ticket:&str)->Result<Value,String>{
    let mut slot=pending().lock().map_err(|_|"备份准备不可用")?;
    if !slot.as_ref().is_some_and(|v|v.generation==generation&&v.ticket==ticket&&v.created.elapsed()<TTL){return Err("备份预览已失效，请重新选择文件并预览".into());}
    Ok(slot.take().unwrap().value)
}
#[cfg(test)]mod tests{
    use super::*;
    fn sample()->Value{json!({"format":"RHVideo.config-backup","version":1,"created_at":"2026-10-28T00:00:00Z","favorites":[],"watch_folders":[],"reading_progress":[],"ui_preferences":{"page_volume":"0.2"}})}
    fn preview()->Value{json!({"applied":false,"favorites":{"total":0,"add":0,"existing":0,"unmatched":0},"watch_folders":{"total":0,"add":0,"existing":0,"skipped":0},"reading_progress":{"total":0,"update":0,"kept":0,"unmatched":0},"preferences":1,"issues":[]})}
    #[test]fn only_reference_preferences_and_versioned_metadata_are_accepted(){
        assert!(document(&sample()).is_ok());for (key,value)in [("password",json!("never")),("version",json!(2)),("favorites",json!({}))]{let mut v=sample();v[key]=value;assert!(document(&v).is_err());}
        assert!(preferences(&json!({"server":"https://not-a-page-preference"})).is_err());assert!(preferences(&json!({"rotate":true})).is_err());
    }
    #[test]fn preview_is_account_scoped_one_shot_and_replacing_it_revokes_the_old_ticket(){
        let first=stage(9,sample(),preview()).unwrap();assert!(consume(10,first["ticket"].as_str().unwrap()).is_err());
        let next=stage(9,sample(),preview()).unwrap();assert!(consume(9,first["ticket"].as_str().unwrap()).is_err());assert_eq!(consume(9,next["ticket"].as_str().unwrap()).unwrap(),sample());assert!(consume(9,next["ticket"].as_str().unwrap()).is_err());
    }
    #[test]fn malformed_server_results_do_not_manufacture_a_successful_preview(){assert!(summary(&json!({}),false).is_err());assert!(summary(&preview(),true).is_err());let mut invalid=preview();invalid["favorites"]["add"]=json!(-1);assert!(summary(&invalid,false).is_err());}
}
