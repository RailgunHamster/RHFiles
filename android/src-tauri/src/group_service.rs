//! JNI host for the same HTTPS/JSON/WebDAV service as Windows. Android keeps
//! its Keystore identity and membership; this module never opens another key.
use base64::{Engine,engine::general_purpose::URL_SAFE_NO_PAD as B64};
use jni::{JNIEnv,JavaVM,objects::{GlobalRef,JObject,JString,JValue},sys::jstring};
use rhfiles_service::{groups::{Groups,Packet,Server,Signed,ServerGroupBackend},Error,Permissions,Service,ShareConfig};
use serde::Deserialize;
use serde_json::{Value,json};
use std::{path::PathBuf,sync::{Arc,Mutex,OnceLock}};

static SERVICE:OnceLock<Mutex<Option<Service>>>=OnceLock::new();
fn slot()->&'static Mutex<Option<Service>>{SERVICE.get_or_init(Default::default)}
fn bad(message:&str)->Error{Error::new("invalid_group",message)}
struct Authority {vm:JavaVM,object:GlobalRef,key:String}
impl Authority {
    fn invoke(&self,command:&str,args:Value)->rhfiles_service::Result<Value>{
        let mut env=self.vm.attach_current_thread_as_daemon().map_err(|_|bad("无法连接 Android 设备组存储"))?;
        let result=env.with_local_frame(16,|env|->jni::errors::Result<String>{
            let op=env.new_string(command)?;let args=env.new_string(args.to_string())?;
            let reply=JString::from(env.call_method(self.object.as_obj(),"invoke","(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;",&[JValue::Object(op.as_ref()),JValue::Object(args.as_ref())])?.l()?);
            let text:String=env.get_string(&reply)?.into();Ok(text)
        });
        let text=match result {Ok(v)=>v,Err(_)=>{let _=env.exception_clear();return Err(bad("Android 设备组回调失败"));}};
        if text.len()>4*1024*1024{return Err(bad("Android 设备组响应过大"));}
        let value:Value=serde_json::from_str(&text).map_err(|_|bad("Android 设备组响应无效"))?;
        if let Some(error)=value.get("error"){
            let code=match error["code"].as_str(){Some("unauthorized")=>"unauthorized",Some("forbidden")=>"forbidden",_=>"invalid_group"};
            return Err(Error::new(code,error["message"].as_str().unwrap_or("设备组授权不可用").chars().take(240).collect::<String>()));
        }
        value.get("result").cloned().ok_or_else(||bad("Android 设备组响应缺少结果"))
    }
}
impl ServerGroupBackend for Authority {
    fn public_key(&self)->String{self.key.clone()}
    fn packet(&self,id:&str)->rhfiles_service::Result<Packet>{serde_json::from_value(self.invoke("packet",json!({"id":id}))?).map_err(|_|bad("Android 组证明无效"))}
    fn advertise(&self,server:Server)->rhfiles_service::Result<()>{self.invoke("advertise",json!({"server":server}))?;Ok(())}
    fn accept(&self,id:&str,packet:&Packet,peer:&str)->rhfiles_service::Result<String>{self.invoke("accept",json!({"id":id,"packet":packet,"peer":peer}))?.as_str().map(str::to_owned).ok_or_else(||bad("组成员名称无效"))}
    fn access(&self,id:&str,peer:&str,files:bool)->rhfiles_service::Result<(Permissions,String)>{
        let value=self.invoke("access",json!({"id":id,"peer":peer,"files":files}))?;
        Ok((serde_json::from_value(value["permissions"].clone()).map_err(|_|bad("设备组权限无效"))?,value["epoch"].as_str().ok_or_else(||bad("设备组实例无效"))?.into()))
    }
    fn sign(&self,message:&[u8])->rhfiles_service::Result<Vec<u8>>{let result=self.invoke("sign",json!({"message":B64.encode(message)}))?;B64.decode(result.as_str().ok_or_else(||bad("设备身份签名无效"))?).map_err(|_|bad("设备身份签名编码无效"))}
    fn approve(&self,id:&str,request:&Signed,invite:bool)->rhfiles_service::Result<Packet>{serde_json::from_value(self.invoke("approve",json!({"id":id,"request":request,"invite":invite}))?).map_err(|_|bad("入组证明无效"))}
    fn require_inviter(&self,id:&str)->rhfiles_service::Result<()>{self.invoke("requireInviter",json!({"id":id}))?;Ok(())}
    fn state(&self)->rhfiles_service::Result<Value>{self.invoke("state",json!({}))}
}
#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Config {directory:PathBuf,shares:Vec<ShareConfig>,port:u16}
fn start(env:&mut JNIEnv<'_>,config:JString<'_>,authority:JObject<'_>)->Result<Value,String>{
    let mut all=slot().lock().map_err(|_|"文件服务状态不可用")?;
    if all.is_some(){return Err("文件服务已经运行，请先停止再修改共享目录".into());}
    let raw:String=env.get_string(&config).map_err(|_|"文件服务参数无效")?.into();if raw.len()>65536{return Err("文件服务参数过大".into());}
    let config:Config=serde_json::from_str(&raw).map_err(|_|"文件服务参数无效")?;
    if !config.directory.is_absolute(){return Err("服务私有目录无效".into());}
    let mut bridge=Authority{vm:env.get_java_vm().map_err(|_|"Java VM 不可用")?,object:env.new_global_ref(authority).map_err(|_|"无法登记设备组回调")?,key:String::new()};
    bridge.key=bridge.invoke("publicKey",json!({})).map_err(|e|e.to_string())?.as_str().ok_or("Android 设备公钥无效")?.into();
    let groups=Arc::new(Groups::with_server_backend(&config.directory,Arc::new(bridge)).map_err(|e|e.to_string())?);
    let service=Service::start_grouped(&config.directory,config.shares,([0,0,0,0],config.port).into(),&[],groups).map_err(|e|e.to_string())?;
    let result=json!(service.status());*all=Some(service);Ok(result)
}
fn reply(env:&JNIEnv<'_>,result:Result<Value,String>)->jstring{
    let value=match result{Ok(value)=>json!({"result":value}),Err(error)=>json!({"error":error})};
    env.new_string(value.to_string()).map(|v|v.into_raw()).unwrap_or(std::ptr::null_mut())
}
#[no_mangle]
pub extern "system" fn Java_com_railgunhamster_rhfiles_GroupServiceNative_start(mut env:JNIEnv<'_>,_:JObject<'_>,config:JString<'_>,authority:JObject<'_>)->jstring{let result=start(&mut env,config,authority);reply(&env,result)}
#[no_mangle]
pub extern "system" fn Java_com_railgunhamster_rhfiles_GroupServiceNative_state(env:JNIEnv<'_>,_:JObject<'_>)->jstring{let result=slot().lock().map(|v|v.as_ref().map(|s|json!(s.status())).unwrap_or_else(||json!({"running":false}))).map_err(|_|"文件服务状态不可用".into());reply(&env,result)}
#[no_mangle]
pub extern "system" fn Java_com_railgunhamster_rhfiles_GroupServiceNative_advertise(env:JNIEnv<'_>,_:JObject<'_>)->jstring{let result=(||{let v=slot().lock().map_err(|_|"文件服务状态不可用".to_string())?;if let Some(s)=v.as_ref(){s.advertise_group_host().map_err(|e|e.to_string())?;}Ok(json!({}))})();reply(&env,result)}
#[no_mangle]
pub extern "system" fn Java_com_railgunhamster_rhfiles_GroupServiceNative_stop(env:JNIEnv<'_>,_:JObject<'_>)->jstring{let result=slot().lock().map(|mut v|{if let Some(service)=v.take(){service.stop();}json!({"running":false})}).map_err(|_|"文件服务状态不可用".into());reply(&env,result)}
