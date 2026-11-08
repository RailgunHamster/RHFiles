//! Disposable loopback fixture for Android integration tests; never user shares.
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rhfiles_service::{Permissions, Service, ShareConfig, groups::Signed};
use serde_json::{Value, json};
use std::{io::{self, BufRead, Write}, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(std::env::args_os().nth(1).ok_or("Missing owned fixture directory")?).canonicalize()?;
    let temp = std::env::temp_dir().canonicalize()?;
    if root.parent() != Some(temp.as_path()) || !root.file_name().and_then(|v| v.to_str()).is_some_and(|v| v.starts_with("rhfiles-preview-native-")) {
        return Err("Only an explicitly created preview fixture under the system temporary directory is allowed".into());
    }
    let data = tempfile::Builder::new().prefix("rhfiles-preview-service-").tempdir()?;
    let service = Service::start(data.path(), vec![ShareConfig{name:"Files".into(),path:root}], "127.0.0.1:0".parse()?)?;
    let groups = service.groups();
    let group = groups.create("Remote preview QA", "Preview QA PC", Permissions::default())?;
    groups.configure(&group, true, Permissions::default())?;
    service.advertise_group_host()?;
    let mut output = io::BufWriter::new(io::stdout().lock());
    writeln!(output,"{}",json!({"port":service.status().port,"group":group,"peer":groups.device_id(),"readOnly":true}))?;
    output.flush()?;
    for line in io::stdin().lock().lines() {
        let line = line?;
        if line.len() > 360000 { return Err("Oversized fixture control request".into()); }
        let request:Value = serde_json::from_str(&line)?;
        let result = (|| -> Result<Value,Box<dyn std::error::Error>> {
            let uri = request["uri"].as_str().ok_or("Missing group request URI")?.trim();
            let encoded = uri.strip_prefix("rhfiles-group-request:v1:").ok_or("Not a group request")?;
            let signed:Signed = serde_json::from_slice(&URL_SAFE_NO_PAD.decode(encoded)?)?;
            let packet = groups.approve(&group,&signed,false)?;
            Ok(json!({"uri":format!("rhfiles-group-approval:v1:{}",URL_SAFE_NO_PAD.encode(serde_json::to_vec(&packet)?))}))
        })();
        let response = match result { Ok(value)=>json!({"id":request["id"],"value":value}),Err(error)=>json!({"id":request["id"],"error":error.to_string()}) };
        writeln!(output,"{response}")?;output.flush()?;
    }
    service.stop();
    Ok(())
}
