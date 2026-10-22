use rhfiles_service::{Service,ShareConfig,Permissions,groups::{Groups,Packet}};
use serde_json::{Value,json};
fn client(service:&Service)->reqwest::Client{reqwest::Client::builder().no_proxy().https_only(true).add_root_certificate(reqwest::Certificate::from_pem(service.status().certificate_pem.as_bytes()).unwrap()).timeout(std::time::Duration::from_secs(10)).build().unwrap()}
async fn session(c:&reqwest::Client,s:&Service,g:&Groups,id:&str)->reqwest::Response{
    let url=format!("https://127.0.0.1:{}",s.status().port);
    let challenge:Value=c.post(format!("{url}/api/v1/groups/challenge")).json(&json!({"groupId":id,"deviceId":g.device_id()})).send().await.unwrap().json().await.unwrap();
    let nonce=challenge["nonce"].as_str().unwrap();let proof=g.proof(id,nonce,&s.status().fingerprint).unwrap();
    c.post(format!("{url}/api/v1/groups/session")).json(&json!({"groupId":id,"nonce":nonce,"packet":g.packet(id).unwrap(),"proof":proof})).send().await.unwrap()
}
#[tokio::test]
async fn real_tls_sessions_offline_introductions_local_removal_restart_and_manual_restore(){
    let data=tempfile::tempdir().unwrap();let files=tempfile::tempdir().unwrap();std::fs::write(files.path().join("中文.txt"),b"group-transfer").unwrap();
    let shares=vec![ShareConfig{name:"Files".into(),path:files.path().into()}];let server=Service::start(data.path(),shares.clone(),"127.0.0.1:0".parse().unwrap()).unwrap();
    let a=server.groups();let id=a.create("Home","A",Permissions{write:true,delete:true}).unwrap();server.advertise_group_host().unwrap();
    let bdata=tempfile::tempdir().unwrap();let b=Groups::open(bdata.path()).unwrap();let request=b.request("B").unwrap();b.join(a.approve(&id,&request,true).unwrap(),Permissions::default()).unwrap();
    let cdata=tempfile::tempdir().unwrap();let c=Groups::open(cdata.path()).unwrap();let request=c.request("C").unwrap();c.join(b.approve(&id,&request,false).unwrap(),Permissions::default()).unwrap();
    // B has no listener and does not participate in C -> A authentication.
    let http=client(&server);let result=session(&http,&server,&c,&id).await;assert_eq!(result.status(),200);let reply:Value=result.json().await.unwrap();
    let proof:rhfiles_service::groups::Signed=serde_json::from_value(reply["serverProof"].clone()).unwrap();let proof=proof.read().unwrap();assert_eq!(proof.kind,"server-auth");assert_eq!(rhfiles_service::groups::key_id(&proof.key),a.device_id());assert_eq!(proof.group,id);assert_eq!(proof.label,server.status().fingerprint);
    let packet:Packet=serde_json::from_value(reply["packet"].clone()).unwrap();c.merge(&id,&packet).unwrap();let user=reply["credential"]["username"].as_str().unwrap();let password=reply["credential"]["password"].as_str().unwrap();
    let url=format!("https://127.0.0.1:{}",server.status().port);
    let get=||http.get(format!("{url}/api/v1/content?path=/Files/%E4%B8%AD%E6%96%87.txt")).basic_auth(user,Some(password));
    assert_eq!(get().send().await.unwrap().bytes().await.unwrap(),&b"group-transfer"[..]);
    a.remove(&id,&c.device_id()).unwrap();assert_eq!(get().send().await.unwrap().status(),403);
    assert_eq!(session(&http,&server,&c,&id).await.status(),403);
    a.merge(&id,&c.packet(&id).unwrap()).unwrap();assert!(a.restore(&id,&c.device_id(),false).is_err());
    assert_eq!(http.request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(),format!("{url}/dav/Files/")).header("Depth","1").basic_auth(user,Some(password)).send().await.unwrap().status(),403);
    server.stop();drop(server);drop(a);
    let server=Service::start(data.path(),shares,"127.0.0.1:0".parse().unwrap()).unwrap();let http=client(&server);
    assert_eq!(session(&http,&server,&c,&id).await.status(),403);
    server.groups().restore(&id,&c.device_id(),true).unwrap();assert_eq!(session(&http,&server,&c,&id).await.status(),200);
    let url=format!("https://127.0.0.1:{}",server.status().port);
    let challenge:Value=http.post(format!("{url}/api/v1/groups/challenge")).json(&json!({"groupId":id,"deviceId":c.device_id()})).send().await.unwrap().json().await.unwrap();let nonce=challenge["nonce"].as_str().unwrap();
    let body=json!({"groupId":id,"nonce":nonce,"packet":c.packet(&id).unwrap(),"proof":c.proof(&id,nonce,&server.status().fingerprint).unwrap()});
    assert_eq!(http.post(format!("{url}/api/v1/groups/session")).json(&body).send().await.unwrap().status(),200);
    assert_eq!(http.post(format!("{url}/api/v1/groups/session")).json(&body).send().await.unwrap().status(),401);
    assert_eq!(http.post(format!("{url}/api/v1/groups/challenge")).header("Origin","https://evil.invalid").json(&json!({"groupId":id,"deviceId":c.device_id()})).send().await.unwrap().status(),403);
}
