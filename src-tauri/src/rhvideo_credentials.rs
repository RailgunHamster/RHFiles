//! Native, profile-bound login continuity. Never a configuration/sync payload.
use serde::{Deserialize,Serialize};
use std::{io::Write,path::PathBuf};

const LIMIT:usize=65536;
const MAGIC:&[u8]=b"RHVIDEO-LOGIN-1\0";
#[derive(Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Record {
    pub version:u8,pub server:String,pub username:String,pub token:String,pub refresh_at:u64,
}
impl Record {
    fn validate(&self)->Result<(),String>{
        if self.version!=1||self.username.trim().is_empty()||self.username.len()>1024||self.username.chars().any(char::is_control)
            ||self.token.is_empty()||self.token.len()>32768||self.token.chars().any(char::is_control)||self.refresh_at==0 {
            return Err("已保存的登录格式无效，请重新登录".into());
        }
        super::base_url(&self.server)?;Ok(())
    }
}
pub(super) struct Vault {directory:PathBuf}
impl Vault {
    pub fn profile()->Result<Self,String>{Ok(Self{directory:crate::profile::data_dir()?})}
    fn path(&self)->PathBuf{self.directory.join("rhvideo-login.dpapi")}
    fn scope(&self)->Result<Vec<u8>,String>{
        // A copied record must not sign a different virtual-desktop/profile in.
        let path=std::fs::canonicalize(&self.directory).map_err(|_|"无法定位本机登录存储目录")?;
        Ok(format!("RHFiles\0RHVideo login v1\0{}",path.to_string_lossy()).into_bytes())
    }
    pub fn exists(&self)->bool{self.path().is_file()}
    pub fn save(&self,value:&Record)->Result<(),String>{
        value.validate()?;std::fs::create_dir_all(&self.directory).map_err(|_|"无法创建本机登录存储目录")?;
        let plain=serde_json::to_vec(value).map_err(|_|"无法编码本机登录")?;
        if plain.len()>LIMIT{return Err("本机登录记录超过上限".into());}
        let encrypted=crypt(&plain,&self.scope()?,true)?;
        let mut file=tempfile::NamedTempFile::new_in(&self.directory).map_err(|_|"无法准备本机登录存储")?;
        file.write_all(MAGIC).and_then(|_|file.write_all(&encrypted)).and_then(|_|file.as_file().sync_all()).map_err(|_|"无法写入本机登录存储")?;
        file.persist(self.path()).map_err(|_|"无法提交本机登录存储")?;Ok(())
    }
    pub fn read(&self)->Result<Option<Record>,String>{
        let path=self.path();let metadata=match std::fs::metadata(&path){Ok(m)=>m,Err(e)if e.kind()==std::io::ErrorKind::NotFound=>return Ok(None),Err(_)=>return Err("无法读取本机保存的登录".into())};
        if metadata.len()>2*LIMIT as u64{return Err("本机登录存储超过上限".into());}
        let bytes=std::fs::read(path).map_err(|_|"无法读取本机保存的登录")?;
        let encrypted=bytes.strip_prefix(MAGIC).ok_or("本机登录存储格式无效")?;
        let plain=crypt(encrypted,&self.scope()?,false)?;
        if plain.len()>LIMIT{return Err("本机登录记录超过上限".into());}
        let record:Record=serde_json::from_slice(&plain).map_err(|_|"本机登录存储内容无效")?;record.validate()?;Ok(Some(record))
    }
    pub fn clear(&self)->Result<(),String>{match std::fs::remove_file(self.path()){Ok(())=>Ok(()),Err(e)if e.kind()==std::io::ErrorKind::NotFound=>Ok(()),Err(_)=>Err("无法移除本机保存的登录，退出未完成；请检查配置目录权限".into())}}
}
#[cfg(windows)]
fn crypt(bytes:&[u8],scope:&[u8],encrypt:bool)->Result<Vec<u8>,String>{
    use windows::{core::PCWSTR,Win32::{Foundation::{HLOCAL,LocalFree},Security::Cryptography::*}};
    let input=CRYPT_INTEGER_BLOB{cbData:bytes.len().try_into().map_err(|_|"登录数据过大")?,pbData:bytes.as_ptr().cast_mut()};
    let entropy=CRYPT_INTEGER_BLOB{cbData:scope.len().try_into().map_err(|_|"登录作用域过大")?,pbData:scope.as_ptr().cast_mut()};
    let mut output=CRYPT_INTEGER_BLOB::default();
    unsafe{
        // Current Windows user only. Never CRYPTPROTECT_LOCAL_MACHINE.
        let result=if encrypt{CryptProtectData(&input,PCWSTR::null(),Some(&entropy),None,None,CRYPTPROTECT_UI_FORBIDDEN,&mut output)}else{CryptUnprotectData(&input,None,Some(&entropy),None,None,CRYPTPROTECT_UI_FORBIDDEN,&mut output)};
        result.map_err(|_|if encrypt{"Windows 无法保护本机登录；本次登录仍可使用，但重启后需重新登录"}else{"Windows 无法解密此用户／配置分区保存的登录，请重新登录"})?;
        let value=if output.cbData==0{Vec::new()}else{std::slice::from_raw_parts(output.pbData,output.cbData as usize).to_vec()};let _=LocalFree(Some(HLOCAL(output.pbData.cast())));Ok(value)
    }
}
#[cfg(not(windows))]
fn crypt(_bytes:&[u8],_scope:&[u8],_encrypt:bool)->Result<Vec<u8>,String>{Err("此平台尚未接入系统登录保护，未保存明文令牌".into())}

#[cfg(all(test,windows))]
mod tests {
    use super::*;
    fn record()->Record{Record{version:1,server:"https://example.invalid/rhvideo/".into(),username:"native-test".into(),token:"test-only-secret-token".into(),refresh_at:1800000000}}
    #[test]fn actual_dpapi_roundtrip_is_encrypted_scoped_and_revocable(){
        let root=tempfile::tempdir().unwrap();let vault=Vault{directory:root.path().join("desktop-a")};vault.save(&record()).unwrap();
        assert!(!String::from_utf8_lossy(&std::fs::read(vault.path()).unwrap()).contains("test-only-secret-token"));assert_eq!(vault.read().unwrap().unwrap().token,record().token);
        let other=Vault{directory:root.path().join("desktop-b")};std::fs::create_dir(&other.directory).unwrap();std::fs::copy(vault.path(),other.path()).unwrap();assert!(other.read().is_err(),"A copied record cannot cross profile scope");
        vault.clear().unwrap();assert!(!vault.exists());assert!(vault.read().unwrap().is_none());vault.clear().unwrap();
    }
    #[test]fn tampered_oversized_and_plaintext_records_cannot_restore(){
        let root=tempfile::tempdir().unwrap();let vault=Vault{directory:root.path().to_owned()};vault.save(&record()).unwrap();let mut bytes=std::fs::read(vault.path()).unwrap();let end=bytes.len()-1;bytes[end]^=1;std::fs::write(vault.path(),bytes).unwrap();assert!(vault.read().is_err());
        std::fs::write(vault.path(),vec![0;2*LIMIT+1]).unwrap();assert!(vault.read().is_err());std::fs::write(vault.path(),serde_json::to_vec(&record()).unwrap()).unwrap();assert!(vault.read().is_err());
        let mut invalid=record();invalid.server="https://user:secret@example.invalid".into();assert!(vault.save(&invalid).is_err());
    }
}
