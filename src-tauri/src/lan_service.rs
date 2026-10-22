//! Local-only administrative API. Nothing under the network listener can
//! change roots, issue an app credential, or grant itself more permissions.
use rhfiles_service::{Service,ShareConfig,Permissions};
use serde::{Deserialize,Serialize};
use std::sync::{Mutex,OnceLock};
static SERVICE:OnceLock<Mutex<Option<Service>>>=OnceLock::new();
fn slot()->&'static Mutex<Option<Service>>{SERVICE.get_or_init(||Mutex::new(None))}
fn directory()->Result<std::path::PathBuf,String>{Ok(crate::profile::data_dir()?.join("lan-service-v1"))}
#[derive(Default,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Config{#[serde(default)]shares:Vec<ShareConfig>,#[serde(default="port")]port:u16}
fn port()->u16{39128}
#[tauri::command]
pub async fn lan_service_state()->Result<serde_json::Value,String>{
    tauri::async_runtime::spawn_blocking(||{
        let config=std::fs::read(directory()?.join("config.json")).ok().and_then(|bytes|serde_json::from_slice::<Config>(&bytes).ok()).unwrap_or(Config{shares:vec![],port:port()});
        Ok(serde_json::json!({"config":config,"status":slot().lock().map_err(|_|"服务状态不可用")?.as_ref().map(Service::status)}))
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn lan_service_start(config:Config)->Result<rhfiles_service::Status,String>{
    tauri::async_runtime::spawn_blocking(move||{
        let mut service=slot().lock().map_err(|_|"服务状态不可用")?;
        if service.as_ref().is_some_and(|s|s.status().running){return Err("请先停止文件服务，再更改共享或端口".into());}
        service.take();
        let directory=directory()?;
        let running=Service::start(&directory,config.shares.clone(),([0,0,0,0],config.port).into()).map_err(|e|e.to_string())?;
        // Config contains roots only, never pairing secrets or private keys.
        let path=directory.join("config.json");
        std::fs::write(path,serde_json::to_vec_pretty(&config).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
        let status=running.status();*service=Some(running);Ok(status)
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn lan_service_stop()->Result<(),String>{slot().lock().map_err(|_|"服务状态不可用")?.take();Ok(())}
#[tauri::command]
pub async fn lan_service_pair(permissions:Permissions)->Result<rhfiles_service::Pairing,String>{slot().lock().map_err(|_|"服务状态不可用")?.as_ref().ok_or("文件服务尚未启动")?.pairing(permissions).map_err(|e|e.to_string())}
#[tauri::command]
pub async fn lan_service_credential(name:String,permissions:Permissions)->Result<rhfiles_service::Credential,String>{slot().lock().map_err(|_|"服务状态不可用")?.as_ref().ok_or("文件服务尚未启动")?.credential(&name,permissions).map_err(|e|e.to_string())}
#[tauri::command]
pub async fn lan_service_revoke(id:String)->Result<(),String>{slot().lock().map_err(|_|"服务状态不可用")?.as_ref().ok_or("文件服务尚未启动")?.revoke(&id).map_err(|e|e.to_string())}
