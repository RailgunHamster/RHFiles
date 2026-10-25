use rhfiles_service::{Service,ShareConfig,Permissions,groups::{Groups,Packet}};
use serde_json::{Value,json};
#[tokio::test]
async fn one_scan_invitation_introduces_group_member_only_and_is_single_use(){
    use base64::Engine;
    let data=tempfile::tempdir().unwrap();let files=tempfile::tempdir().unwrap();
    let server=Service::start(data.path(),vec![ShareConfig{name:"Files".into(),path:files.path().canonicalize().unwrap()}],"127.0.0.1:0".parse().unwrap()).unwrap();
    let id=server.groups().create("RH","Host",Permissions{write:true,delete:true}).unwrap();server.advertise_group_host().unwrap();
    let invite=server.group_invitation(&id,false).unwrap();assert!(invite["qrSvg"].as_str().unwrap().contains("<svg"));
    let uri=invite["uri"].as_str().unwrap();let payload:Value=serde_json::from_slice(&base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(uri.strip_prefix("rhfiles-group-invite:v1:").unwrap()).unwrap()).unwrap();
    assert_eq!(payload["groupId"],id);assert_eq!(payload["groupName"],"RH");assert!(uri.len()<2000);assert!(payload.get("password").is_none());
    let phone_data=tempfile::tempdir().unwrap();let phone=Groups::open(phone_data.path()).unwrap();let request=phone.request("Moto").unwrap();let http=client(&server);let url=format!("https://127.0.0.1:{}",server.status().port);
    let body=json!({"token":payload["token"],"request":request});
    assert_eq!(http.post(format!("{url}/api/v1/groups/invitations/redeem")).header("Origin","https://evil.example").json(&body).send().await.unwrap().status(),403);
    let response=http.post(format!("{url}/api/v1/groups/invitations/redeem")).json(&body).send().await.unwrap();assert_eq!(response.status(),200);
    let packet:Packet=response.json().await.unwrap();phone.join(packet,Permissions::default()).unwrap();
    assert_eq!(http.post(format!("{url}/api/v1/groups/invitations/redeem")).json(&body).send().await.unwrap().status(),401);
    let reply:Value=session(&http,&server,&phone,&id).await.json().await.unwrap();
    let list=||http.get(format!("{url}/api/v1/list")).basic_auth(reply["credential"]["username"].as_str().unwrap(),reply["credential"]["password"].as_str());
    assert_eq!(list().send().await.unwrap().status(),200);server.groups().forget(&id,true).unwrap();assert!(!list().send().await.unwrap().status().is_success());
}
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
    // macOS tempdir lives under /var -> /private/var. Resolve our fixture,
    // rather than weakening production's symlink-free shared-root policy.
    let shares=vec![ShareConfig{name:"Files".into(),path:files.path().canonicalize().unwrap()}];let server=Service::start(data.path(),shares.clone(),"127.0.0.1:0".parse().unwrap()).unwrap();
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

#[tokio::test]
async fn forgetting_a_live_group_denies_fresh_file_reads_and_has_no_independent_credential_fallback() {
    let data = tempfile::tempdir().unwrap();
    let files = tempfile::tempdir().unwrap();
    std::fs::write(files.path().join("not-cached.txt"), b"fresh file data").unwrap();
    let shares = vec![ShareConfig {
        name: "Files".into(),
        path: files.path().canonicalize().unwrap(),
    }];
    let server = Service::start(data.path(), shares.clone(), "127.0.0.1:0".parse().unwrap()).unwrap();
    let groups = server.groups();
    let id = groups.create("Delete this", "Server", Permissions { write: true, delete: true }).unwrap();
    let other = groups.create("Keep this", "Server", Permissions::default()).unwrap();
    server.advertise_group_host().unwrap();
    let phone_data = tempfile::tempdir().unwrap();
    let phone = Groups::open(phone_data.path()).unwrap();
    for group in [&id, &other] {
        let request = phone.request("Phone").unwrap();
        phone.join(groups.approve(group, &request, true).unwrap(), Permissions::default()).unwrap();
    }
    let http = client(&server);
    let header = |reply: &Value| {
        use base64::Engine;
        format!("Basic {}", base64::engine::general_purpose::STANDARD.encode(format!(
            "{}:{}", reply["credential"]["username"].as_str().unwrap(), reply["credential"]["password"].as_str().unwrap()
        )))
    };
    let old = header(&session(&http, &server, &phone, &id).await.json::<Value>().await.unwrap());
    let retained = header(&session(&http, &server, &phone, &other).await.json::<Value>().await.unwrap());
    let url = format!("https://127.0.0.1:{}", server.status().port);
    let routes = [
        ("GET", "/api/v1/list?path=/Files"),
        ("GET", "/api/v1/stat?path=/Files/not-cached.txt"),
        ("GET", "/api/v1/content?path=/Files/not-cached.txt"),
        ("HEAD", "/api/v1/content?path=/Files/not-cached.txt"),
        ("GET", "/dav/Files/not-cached.txt"),
        ("PROPFIND", "/dav/Files/"),
    ];
    for (method, path) in routes {
        assert!(http.request(method.parse::<reqwest::Method>().unwrap(), format!("{url}{path}"))
            .header("Authorization", &old).header("Depth", "1").send().await.unwrap().status().is_success());
    }
    groups.forget(&id, true).unwrap();
    for (method, path) in routes {
        assert!(!http.request(method.parse::<reqwest::Method>().unwrap(), format!("{url}{path}"))
            .header("Authorization", &old).header("Depth", "1").send().await.unwrap().status().is_success(), "{method} {path}");
    }
    assert!(!http.post(format!("{url}/api/v1/mkdir")).header("Authorization", &old)
        .json(&json!({"path":"/Files/forbidden"})).send().await.unwrap().status().is_success());
    assert!(!files.path().join("forbidden").exists());
    assert!(!http.post(format!("{url}/api/v1/groups/challenge"))
        .json(&json!({"groupId":id,"deviceId":phone.device_id()})).send().await.unwrap().status().is_success());
    // An unrelated surviving group remains valid; no independent grant exists.
    let content = format!("{url}/api/v1/content?path=/Files/not-cached.txt");
    assert_eq!(http.get(&content).header("Authorization", &retained).send().await.unwrap().bytes().await.unwrap(), &b"fresh file data"[..]);
    assert_eq!(http.get(&content).basic_auth("old-device", Some("retired-password")).send().await.unwrap().status(),401);
    let request = groups.request("Server").unwrap();
    groups.join(phone.approve(&id, &request, true).unwrap(), Permissions::default()).unwrap();
    assert!(!http.get(&content).header("Authorization", &old).send().await.unwrap().status().is_success());
    assert_eq!(session(&http, &server, &phone, &id).await.status(), 200);
    groups.forget(&id, true).unwrap();
    server.stop(); drop(server); drop(groups);
    let restarted = Service::start(data.path(), shares, "127.0.0.1:0".parse().unwrap()).unwrap();
    assert!(restarted.groups().packet(&id).is_err());
    assert!(restarted.groups().packet(&other).is_ok());
}
