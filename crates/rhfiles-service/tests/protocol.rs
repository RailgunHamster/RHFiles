use base64::Engine;
use reqwest::{Client, Method};
use rhfiles_service::{Permissions, Service, ShareConfig};
use serde_json::{Value, json};
struct Fixture {
    _temp: tempfile::TempDir,
    data: std::path::PathBuf,
    share: std::path::PathBuf,
    service: Service,
    client: Client,
    base: String,
    group: String,
    user: String,
    password: String,
}

async fn wait_for_activity(f:&Fixture,active:bool){
    tokio::time::timeout(std::time::Duration::from_secs(8),async{
        while (f.service.update_activity(std::time::Duration::from_secs(30)).active_requests>0)!=active {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    }).await.expect("HTTP work must release its update admission after completion or disconnect");
}

#[tokio::test]
async fn streamed_webdav_and_native_downloads_block_updates_through_the_response_body(){
    use futures_util::StreamExt;
    let f=Fixture::new(true,true).await;
    let file=std::fs::File::create(f.share.join("large.bin")).unwrap();file.set_len(64*1024*1024).unwrap();drop(file);
    for url in ["/dav/Files/large.bin","/api/v1/content?path=/Files/large.bin"] {
        let response=f.request("GET",url).send().await.unwrap();assert!(response.status().is_success());
        let mut body=response.bytes_stream();assert!(!body.next().await.unwrap().unwrap().is_empty());
        wait_for_activity(&f,true).await;
        assert_eq!(f.service.reserve_update(std::time::Duration::ZERO).err().unwrap().code,"update_deferred");
        drop(body);wait_for_activity(&f,false).await;
        assert!(f.service.update_activity(std::time::Duration::from_secs(30)).quiet_remaining_ms>0);
        assert!(f.service.reserve_update(std::time::Duration::from_secs(30)).is_err());
    }
    let reservation=f.service.reserve_update(std::time::Duration::ZERO).unwrap();
    assert_eq!(f.request("PUT","/dav/Files/not-accepted.txt").body("must not be written").send().await.unwrap().status(),429);
    assert!(!f.share.join("not-accepted.txt").exists());drop(reservation);
    assert!(f.request("PUT","/dav/Files/after-aborted-update.txt").body("available again").send().await.unwrap().status().is_success());
    assert_eq!(std::fs::read(f.share.join("after-aborted-update.txt")).unwrap(),b"available again");
}

#[tokio::test]
async fn stalled_webdav_uploads_are_work_but_completed_tus_records_do_not_block_updates_forever(){
    use futures_util::StreamExt;
    let f=Fixture::new(true,true).await;
    let stream=futures_util::stream::once(async{Ok::<_,std::io::Error>(bytes::Bytes::from_static(b"partial"))})
        .chain(futures_util::stream::pending());
    let request=f.request("PUT","/dav/Files/partial.bin").body(reqwest::Body::wrap_stream(stream));
    let task=tokio::spawn(async move{request.send().await});wait_for_activity(&f,true).await;
    assert!(f.service.reserve_update(std::time::Duration::ZERO).is_err());
    task.abort();let _=task.await;wait_for_activity(&f,false).await;assert!(!f.share.join("partial.bin").exists());
    let upload=f.request("POST","/api/v1/uploads").header("Tus-Resumable","1.0.0").header("Upload-Length","1").header("Upload-Metadata","path L0ZpbGVzL2RvbmUuYmlu").send().await.unwrap();
    assert_eq!(upload.status(),201);let location=upload.headers()["Location"].to_str().unwrap().to_owned();
    let response=f.request("PATCH",&location).header("Tus-Resumable","1.0.0").header("Content-Type","application/offset+octet-stream").header("Upload-Offset","0").body("x").send().await.unwrap();
    assert_eq!(response.status(),204);drop(response);drop(upload);wait_for_activity(&f,false).await;
    assert_eq!(std::fs::read(f.share.join("done.bin")).unwrap(),b"x");
    assert!(f.service.status().active_uploads>0,"durable completed tus receipt remains available");
    assert!(f.service.reserve_update(std::time::Duration::ZERO).is_ok(),"a completed upload receipt is not an active transfer");
}

#[tokio::test]
async fn recycle_checks_permissions_revision_and_share_boundaries_before_touching_files() {
    for permitted in [false, true] {
        let f=Fixture::new(false,permitted).await;
        let file=f.share.join("recycle-keep.txt");std::fs::write(&file,b"preserve").unwrap();
        let caps:Value=f.request("GET","/api/v1/capabilities").send().await.unwrap().json().await.unwrap();
        assert_eq!(caps["recycleBin"],cfg!(windows));
        let response=f.request("POST","/api/v1/recycle-checked").json(&json!({"path":"/Files/recycle-keep.txt","revision":"stale"})).send().await.unwrap();
        assert_eq!(response.status(),if permitted{409}else{403});
        assert_eq!(std::fs::read(&file).unwrap(),b"preserve");
        for path in ["/Files", "/Files/../outside", "/Files/.rhfiles-service-staging/entry"] {
            let response=f.request("POST","/api/v1/recycle-checked").json(&json!({"path":path,"revision":"stale"})).send().await.unwrap();
            assert!(!response.status().is_success());
        }
        let response=f.request("POST","/api/v1/recycle-checked").json(&json!({"path":"/Files/recycle-keep.txt","revision":""})).send().await.unwrap();
        assert_eq!(response.status(),400);assert!(file.exists());
    }
}

#[cfg(windows)]
fn owned_recycle_entry(original: &std::path::Path, restore: bool) -> usize {
    // Only enumerate/restore the generated fixture, never empty the user's bin.
    let script = r#"
$ErrorActionPreference='Stop'
$shell=New-Object -ComObject Shell.Application
$bin=$shell.Namespace(10)
$owned=@($bin.Items() | Where-Object {
    $folder=[string]$_.ExtendedProperty('System.Recycle.DeletedFrom')
    $name=[string]$_.ExtendedProperty('System.FileName')
    $folder -and $name -and [IO.Path]::Combine($folder,$name) -eq $env:RHFILES_RECYCLE_QA_PATH
})
if ($env:RHFILES_RECYCLE_QA_RESTORE -eq '1') {
    foreach ($item in $owned) { $item.InvokeVerb('undelete') }
    $deadline=[DateTime]::UtcNow.AddSeconds(10)
    while ($owned.Count -gt 0 -and -not [IO.File]::Exists($env:RHFILES_RECYCLE_QA_PATH) -and -not [IO.Directory]::Exists($env:RHFILES_RECYCLE_QA_PATH)) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Owned fixture restore timed out' }
        Start-Sleep -Milliseconds 50
    }
}
[Console]::Write($owned.Count)
"#;
    let path=original.to_str().unwrap().trim_start_matches("\\\\?\\");
    let result=std::process::Command::new("powershell.exe").args(["-NoLogo","-NoProfile","-NonInteractive","-Command",script])
        .env("RHFILES_RECYCLE_QA_PATH",path).env("RHFILES_RECYCLE_QA_RESTORE",if restore{"1"}else{"0"}).output().unwrap();
    assert!(result.status.success(),"{}",String::from_utf8_lossy(&result.stderr));
    String::from_utf8(result.stdout).unwrap().trim().parse().unwrap()
}

#[cfg(windows)]
#[tokio::test]
async fn recycle_undo_uses_receipts_and_never_overwrites_a_new_occupant() {
    let f=Fixture::new(true,true).await;
    let file=f.share.join("undo.txt");
    std::fs::write(&file,b"original undo content").unwrap();
    let entry:Value=f.request("GET","/api/v1/stat").query(&[("path","/Files/undo.txt")]).send().await.unwrap().json().await.unwrap();
    let deleted:Value=f.request("POST","/api/v1/recycle-checked").json(&json!({"path":"/Files/undo.txt","revision":entry["revision"]})).send().await.unwrap().json().await.unwrap();
    let receipt=deleted["receipt"].as_str().unwrap();assert_eq!(receipt.len(),43);
    std::fs::write(&file,b"new occupant").unwrap();
    assert_eq!(f.request("POST","/api/v1/recycle-restore").json(&json!({"receipt":receipt})).send().await.unwrap().status(),409);
    assert_eq!(std::fs::read(&file).unwrap(),b"new occupant");
    std::fs::remove_file(&file).unwrap();
    let restored=f.request("POST","/api/v1/recycle-restore").json(&json!({"receipt":receipt})).send().await.unwrap();
    let status=restored.status();let text=restored.text().await.unwrap();
    if !status.is_success(){owned_recycle_entry(&file,true);}
    assert_eq!(status,200,"{text}");
    assert_eq!(std::fs::read(&file).unwrap(),b"original undo content");
    let entry:Value=serde_json::from_str(&text).unwrap();
    let second:Value=f.request("POST","/api/v1/recycle-checked").json(&json!({"path":"/Files/undo.txt","revision":entry["revision"]})).send().await.unwrap().json().await.unwrap();
    assert_ne!(second["receipt"],deleted["receipt"]);
    assert!(!f.request("POST","/api/v1/recycle-restore").json(&json!({"receipt":receipt})).send().await.unwrap().status().is_success());
    assert!(!file.exists());
    let restored=f.request("POST","/api/v1/recycle-restore").json(&json!({"receipt":second["receipt"]})).send().await.unwrap();
    assert_eq!(restored.status(),200,"{}",restored.text().await.unwrap());
    assert_eq!(std::fs::read(&file).unwrap(),b"original undo content");
    assert_eq!(owned_recycle_entry(&file,false),0);
}

#[cfg(windows)]
#[tokio::test]
async fn recycle_undo_restores_a_complete_folder_and_rejects_another_device() {
    let f=Fixture::new(true,true).await;
    let folder=f.share.join("Undo folder");std::fs::create_dir(&folder).unwrap();
    std::fs::create_dir(folder.join("nested")).unwrap();std::fs::write(folder.join("nested/内容.txt"),b"nested undo content").unwrap();
    let entry:Value=f.request("GET","/api/v1/stat").query(&[("path","/Files/Undo folder")]).send().await.unwrap().json().await.unwrap();
    let deleted:Value=f.request("POST","/api/v1/recycle-checked").json(&json!({"path":"/Files/Undo folder","revision":entry["revision"]})).send().await.unwrap().json().await.unwrap();
    let other_data=tempfile::tempdir().unwrap();
    let other_groups=rhfiles_service::groups::Groups::open(other_data.path()).unwrap();
    let request=other_groups.request("Other device").unwrap();
    let packet=f.service.groups().approve(&f.group,&request,false).unwrap();
    other_groups.join(packet,Permissions{write:true,delete:true}).unwrap();
    let other=group_session_from(&f.service,&f.group,&other_groups).await;
    let rejected=f.client.post(format!("{}/api/v1/recycle-restore",f.base)).basic_auth(other["username"].as_str().unwrap(),Some(other["password"].as_str().unwrap())).json(&json!({"receipt":deleted["receipt"]})).send().await.unwrap();
    assert!(!rejected.status().is_success());assert!(!folder.exists());
    let restored=f.request("POST","/api/v1/recycle-restore").json(&json!({"receipt":deleted["receipt"]})).send().await.unwrap();
    let status=restored.status();let text=restored.text().await.unwrap();
    if !status.is_success(){owned_recycle_entry(&folder,true);}
    assert_eq!(status,200,"{text}");
    assert_eq!(std::fs::read(folder.join("nested/内容.txt")).unwrap(),b"nested undo content");
    assert_eq!(owned_recycle_entry(&folder,false),0);
}

#[cfg(windows)]
#[tokio::test]
async fn recycle_keeps_original_names_and_nonempty_folders_restorable_while_permanent_delete_bypasses_bin() {
    let f=Fixture::new(false,true).await;
    let file=f.share.join("回收 % #.txt");
    let folder=f.share.join("完整文件夹");
    std::fs::write(&file,b"recover file").unwrap();std::fs::create_dir(&folder).unwrap();
    std::fs::create_dir(folder.join("nested")).unwrap();std::fs::write(folder.join("nested/keep.txt"),b"recover nested content").unwrap();
    for (original,path) in [(&file,"/Files/回收 % #.txt"),(&folder,"/Files/完整文件夹")] {
        let entry:Value=f.request("GET","/api/v1/stat").query(&[("path",path)]).send().await.unwrap().json().await.unwrap();
        let response=f.request("POST","/api/v1/recycle-checked").json(&json!({"path":path,"revision":entry["revision"]})).send().await.unwrap();
        let status=response.status();let body=response.text().await.unwrap();
        // Restore even when an assertion fails, preserving a clean test bin.
        let removed=!original.exists();let recycled=owned_recycle_entry(original,true);
        assert_eq!(status,200,"{body}");assert!(removed);assert_eq!(recycled,1);assert!(original.exists());
    }
    assert_eq!(std::fs::read(&file).unwrap(),b"recover file");
    assert_eq!(std::fs::read(folder.join("nested/keep.txt")).unwrap(),b"recover nested content");
    let entry:Value=f.request("GET","/api/v1/stat").query(&[("path","/Files/回收 % #.txt")]).send().await.unwrap().json().await.unwrap();
    let response=f.request("POST","/api/v1/delete-checked").json(&json!({"path":"/Files/回收 % #.txt","revision":entry["revision"]})).send().await.unwrap();
    assert_eq!(response.status(),204);assert!(!file.exists());assert_eq!(owned_recycle_entry(&file,false),0);
}
#[tokio::test]
async fn upload_commit_proof_identifies_the_published_file_not_a_later_same_named_file(){
    let f=Fixture::new(true,true).await;let location=f.upload("/Files/proof.bin",3).await;
    let response=f.request("PATCH",&location).header("Tus-Resumable","1.0.0").header("Upload-Offset","0").header("Content-Type","application/offset+octet-stream").body("old").send().await.unwrap();assert!(response.status().is_success());let revision=response.headers()["Upload-Revision"].to_str().unwrap().to_string();
    let stat:Value=f.request("GET","/api/v1/stat?path=/Files/proof.bin").send().await.unwrap().json().await.unwrap();assert_eq!(revision,stat["revision"]);
    std::fs::rename(f.share.join("proof.bin"),f.share.join("original.bin")).unwrap();std::fs::write(f.share.join("proof.bin"),b"new").unwrap();
    let current:Value=f.request("GET","/api/v1/stat?path=/Files/proof.bin").send().await.unwrap().json().await.unwrap();assert_ne!(revision,current["revision"]);assert_eq!(std::fs::read(f.share.join("proof.bin")).unwrap(),b"new");
    let response=f.request("POST","/api/v1/uploads").header("Tus-Resumable","1.0.0").header("Upload-Length","0").header("Upload-Metadata",format!("path {}",base64::engine::general_purpose::STANDARD.encode("/Files/empty-proof"))).send().await.unwrap();assert_eq!(response.status(),201);assert!(!response.headers()["Upload-Revision"].is_empty());
}
#[tokio::test]
async fn webdav_existing_file_edits_require_a_strong_version_and_preserve_newer_data(){
    let f=Fixture::new(true,false).await;std::fs::write(f.share.join("edit.txt"),b"old").unwrap();
    let url="/dav/Files/edit.txt";
    let response=f.request("GET",url).send().await.unwrap();let etag=response.headers()["etag"].to_str().unwrap().to_string();
    assert_eq!(f.request("PUT",url).body("unsafe").send().await.unwrap().status(),428);
    assert_eq!(std::fs::read(f.share.join("edit.txt")).unwrap(),b"old");
    assert_eq!(f.request("PUT",url).header("If-Match",format!("W/{etag}")).body("weak").send().await.unwrap().status(),412);
    let response=f.request("PUT",url).header("If-Match",&etag).body("safe edit").send().await.unwrap();assert!(response.status().is_success(),"{}",response.status());
    assert_eq!(std::fs::read(f.share.join("edit.txt")).unwrap(),b"safe edit");
    assert_eq!(f.request("PUT",url).header("If-Match",&etag).body("stale").send().await.unwrap().status(),412);
    assert_eq!(std::fs::read(f.share.join("edit.txt")).unwrap(),b"safe edit");
}
#[tokio::test]
async fn windows_webdav_lock_saves_are_bound_to_the_original_revision_and_owner(){
    let f=Fixture::new(true,true).await;std::fs::write(f.share.join("locked.txt"),b"old").unwrap();let url="/dav/Files/locked.txt";
    let lock=||f.request("LOCK",url).header("Depth","0").header("Content-Type","application/xml").body("<D:lockinfo xmlns:D=\"DAV:\"><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockinfo>");
    let response=lock().send().await.unwrap();assert!(response.status().is_success());let token=response.headers()["lock-token"].to_str().unwrap().to_string();
    let response=f.request("PUT",url).header("If",format!("({token})")).body("locked edit").send().await.unwrap();assert!(response.status().is_success(),"{}",response.status());assert_eq!(std::fs::read(f.share.join("locked.txt")).unwrap(),b"locked edit");
    let response=f.request("PUT",url).header("If",format!("({token})")).body("second locked edit").send().await.unwrap();assert!(response.status().is_success(),"{}",response.status());assert_eq!(std::fs::read(f.share.join("locked.txt")).unwrap(),b"second locked edit");
    assert!(f.request("UNLOCK",url).header("Lock-Token",&token).send().await.unwrap().status().is_success());
    let response=lock().send().await.unwrap();let token=response.headers()["lock-token"].to_str().unwrap().to_string();
    std::fs::rename(f.share.join("locked.txt"),f.share.join("original.txt")).unwrap();std::fs::write(f.share.join("locked.txt"),b"external occupant").unwrap();
    assert_eq!(f.request("PUT",url).header("If",format!("({token})")).body("must not replace").send().await.unwrap().status(),412);
    assert_eq!(std::fs::read(f.share.join("locked.txt")).unwrap(),b"external occupant");
    assert_eq!(f.request("PUT",url).header("If",format!("(Not {token})")).body("negated token").send().await.unwrap().status(),412);
}
#[test]
fn explicit_public_bind_is_rejected_before_creating_any_state() {
    let temp = tempfile::tempdir().unwrap();
    let data = temp.path().join("not-created");
    let error = Service::start(&data, vec![], "8.8.8.8:39128".parse().unwrap())
        .err()
        .unwrap();
    assert_eq!(error.code, "invalid_bind");
    assert!(!data.exists());
}
#[tokio::test]
async fn live_permission_edits_apply_to_json_webdav_and_uploads_without_repairing() {
    let f = Fixture::new(false, false).await;
    assert_eq!(
        f.request("PUT", "/dav/Files/new.txt")
            .body("hello")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    f.service
        .groups().configure(
            &f.group, true,
            Permissions {
                write: true,
                delete: false,
            },
        )
        .unwrap();
    assert_eq!(
        f.request("PUT", "/dav/Files/new.txt")
            .body("hello")
            .send()
            .await
            .unwrap()
            .status(),
        201
    );
    assert_eq!(
        f.request("POST", "/api/v1/mkdir")
            .json(&json!({"path":"/Files/new-dir"}))
            .send()
            .await
            .unwrap()
            .status(),
        204
    );
    assert_eq!(
        f.request("DELETE", "/dav/Files/new.txt")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    let location = f.upload("/Files/pending.bin", 3).await;
    f.service
        .groups().configure(&f.group, true, Permissions::default())
        .unwrap();
    assert_eq!(
        f.request("PATCH", &location)
            .header("Tus-Resumable", "1.0.0")
            .header("Upload-Offset", 0)
            .header("Content-Type", "application/offset+octet-stream")
            .body("abc")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        f.request("POST", "/api/v1/mkdir")
            .json(&json!({"path":"/Files/blocked"}))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert!(!f.share.join("blocked").exists());
    assert!(!f.share.join("pending.bin").exists());
    f.service
        .groups().configure(
            &f.group, true,
            Permissions {
                write: false,
                delete: true,
            },
        )
        .unwrap();
    assert_eq!(
        f.request("DELETE", "/dav/Files/new.txt")
            .send()
            .await
            .unwrap()
            .status(),
        204
    );
    assert_eq!(
        f.request("PUT", "/dav/Files/blocked.txt")
            .body("bad")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        f.request("POST", "/api/v1/permissions")
            .json(&json!({"write":true}))
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
}

#[tokio::test]
async fn broad_roots_exclude_private_profiles_and_protect_their_ancestors() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let profile = root.join("Users").join("RHFiles");
    let data = profile.join("lan-service-v1");
    std::fs::create_dir_all(&data).unwrap();
    std::fs::write(profile.join("secret.txt"), "must never leave host").unwrap();
    std::fs::write(root.join("normal.txt"), "normal").unwrap();
    let service = Service::start_protected(
        &data,
        vec![ShareConfig {
            name: "Disk".into(),
            path: root,
        }],
        "127.0.0.1:0".parse().unwrap(),
        &[profile],
    )
    .unwrap();
    let status = service.status();
    let cert = reqwest::Certificate::from_pem(status.certificate_pem.as_bytes()).unwrap();
    let client = Client::builder()
        .add_root_certificate(cert)
        .build()
        .unwrap();
    let group=service.groups().create("Protected roots", "Host", Permissions {write:true,delete:true}).unwrap();
    let cred=group_session(&service,&group).await;
    let request = |method: &str, path: &str| {
        client
            .request(
                Method::from_bytes(method.as_bytes()).unwrap(),
                format!("{}{path}", status.endpoints[0]),
            )
            .basic_auth(cred["username"].as_str().unwrap(), cred["password"].as_str())
    };
    let listing: Value = request("GET", "/api/v1/list?path=/Disk/Users")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(listing["entries"].as_array().unwrap().len(), 0);
    for path in [
        "/Disk/Users/RHFiles/secret.txt",
        "/Disk/Users/RHFiles/lan-service-v1/identity.json",
    ] {
        assert_eq!(
            request("GET", "/api/v1/content")
                .query(&[("path", path)])
                .send()
                .await
                .unwrap()
                .status(),
            403
        );
    }
    assert_eq!(
        request("GET", "/dav/Disk/Users/RHFiles/secret.txt")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    let dav = request("PROPFIND", "/dav/Disk/Users/")
        .header("Depth", "1")
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert!(!dav.contains("RHFiles"));
    assert_eq!(
        request("POST", "/api/v1/rename")
            .json(&json!({"path":"/Disk/Users","destination":"/Disk/escaped"}))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        request("MOVE", "/dav/Disk/Users/")
            .header(
                "Destination",
                format!("{}/dav/Disk/escaped/", status.endpoints[0])
            )
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        request("PUT", "/dav/Disk/writable.txt")
            .body("allowed")
            .send()
            .await
            .unwrap()
            .status(),
        201
    );
    assert_eq!(
        request("GET", "/dav/Disk/normal.txt")
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap(),
        "normal"
    );
    #[cfg(windows)]
    assert_eq!(
        request("GET", "/dav/Disk/users/rhfiles/secret.txt")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
}
#[tokio::test]
async fn webdav_put_copy_and_conditional_download() {
    let f = Fixture::new(true, true).await;
    assert_eq!(
        f.request("PUT", "/dav/Files/new.txt")
            .body("new data")
            .send()
            .await
            .unwrap()
            .status(),
        201
    );
    let response = f
        .request("COPY", "/dav/Files/new.txt")
        .header("Destination", format!("{}/dav/Files/copy.txt", f.base))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 201, "{}", response.text().await.unwrap());
    let response = f
        .request("GET", "/dav/Files/copy.txt")
        .send()
        .await
        .unwrap();
    let etag = response.headers()["etag"].to_str().unwrap().to_owned();
    assert_eq!(response.text().await.unwrap(), "new data");
    assert_eq!(
        f.request("GET", "/dav/Files/copy.txt")
            .header("If-None-Match", etag)
            .send()
            .await
            .unwrap()
            .status(),
        304
    );
    assert_eq!(
        f.request("COPY", "/dav/Files/new.txt")
            .header("Destination", format!("{}/dav/Files/copy.txt", f.base))
            .header("Overwrite", "T")
            .send()
            .await
            .unwrap()
            .status(),
        412
    );
}
#[tokio::test]
async fn tus_offsets_and_credentials_survive_server_restart() {
    let f = Fixture::new(true, false).await;
    let location = f.upload("/Files/restart.bin", 6).await;
    assert_eq!(
        f.request("PATCH", &location)
            .header("Tus-Resumable", "1.0.0")
            .header("Upload-Offset", 0)
            .header("Content-Type", "application/offset+octet-stream")
            .body("abc")
            .send()
            .await
            .unwrap()
            .status(),
        204
    );
    let old_fingerprint = f.service.status().fingerprint;
    f.service.stop();
    // Model an unacknowledged tail written just before process death. A new
    // server must resume the fsynced/journaled offset, not the allocated length.
    let record = f
        .data
        .join("uploads")
        .join(format!("{}.json", location.rsplit('/').next().unwrap()));
    let record: Value = serde_json::from_slice(&std::fs::read(record).unwrap()).unwrap();
    use std::io::Write;
    let mut partial = std::fs::OpenOptions::new()
        .append(true)
        .open(
            f.share
                .join(".rhfiles-service-staging")
                .join(record["staging"].as_str().unwrap()),
        )
        .unwrap();
    partial.write_all(b"bad").unwrap();
    drop(partial);
    let restarted = Service::start(
        &f.data,
        vec![ShareConfig {
            name: "Files".into(),
            path: f.share.clone(),
        }],
        "127.0.0.1:0".parse().unwrap(),
    )
    .unwrap();
    assert_eq!(restarted.status().fingerprint, old_fingerprint);
    let renewed=group_session(&restarted,&f.group).await;
    let url = format!("{}{}", restarted.status().endpoints[0], location);
    let response = f
        .client
        .head(&url)
        .basic_auth(renewed["username"].as_str().unwrap(), renewed["password"].as_str())
        .header("Tus-Resumable", "1.0.0")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["upload-offset"], "3");
    assert_eq!(
        f.client
            .patch(&url)
            .basic_auth(renewed["username"].as_str().unwrap(), renewed["password"].as_str())
            .header("Tus-Resumable", "1.0.0")
            .header("Upload-Offset", 3)
            .header("Content-Type", "application/offset+octet-stream")
            .body("def")
            .send()
            .await
            .unwrap()
            .status(),
        204
    );
    assert_eq!(
        std::fs::read(f.share.join("restart.bin")).unwrap(),
        b"abcdef"
    );
    let database = std::fs::read_to_string(f.data.join("devices.json")).unwrap_or_default();
    assert!(!database.contains(&f.password));
}
#[tokio::test]
async fn upload_owner_isolation_cancellation_and_no_implicit_delete_grant() {
    let f = Fixture::new(true, false).await;
    let path = f.upload("/Files/cancel.bin", 5).await;
    let other_group=f.service.groups().create("Other", "Host", Permissions {write:true,delete:false}).unwrap();
    let other=group_session(&f.service,&other_group).await;
    assert_eq!(
        f.client
            .head(format!("{}{path}", f.base))
            .basic_auth(other["username"].as_str().unwrap(), other["password"].as_str())
            .header("Tus-Resumable", "1.0.0")
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        f.request("DELETE", &path)
            .header("Tus-Resumable", "1.0.0")
            .send()
            .await
            .unwrap()
            .status(),
        204
    );
    assert!(!f.share.join("cancel.bin").exists());
    assert_eq!(f.service.status().active_uploads, 0);
    assert_eq!(
        f.request("DELETE", "/dav/Files/folder")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
}
#[tokio::test]
async fn retired_pairing_endpoint_is_unavailable_and_request_limits_still_apply() {
    let f=Fixture::new(false,false).await;
    for auth in [false,true] {
        let mut request=f.client.post(format!("{}/api/v1/pair",f.base));
        if auth { request=request.basic_auth(&f.user,Some(&f.password)); }
        assert_eq!(request.json(&json!({"code":"0123456789","name":"phone"})).send().await.unwrap().status(),404);
    }
    assert_eq!(f.request("POST","/api/v1/mkdir").body("a".repeat(17000)).send().await.unwrap().status(),400);
    assert_eq!(
        f.request("PROPFIND", "/dav/Files")
            .header("Depth", "infinity")
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
}
#[tokio::test]
async fn image_thumbnail_has_bounds_and_is_not_an_original_file_download() {
    let f = Fixture::new(false, false).await;
    image::RgbImage::new(2000, 1000)
        .save(f.share.join("picture.png"))
        .unwrap();
    let response = f
        .request("GET", "/api/v1/thumbnail?path=/Files/picture.png")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["content-type"], "image/png");
    let image = image::load_from_memory(&response.bytes().await.unwrap()).unwrap();
    assert_eq!((image.width(), image.height()), (320, 160));
}
#[tokio::test]
async fn reject_unsafe_share_roots_and_preserve_corrupt_identity() {
    let f = Fixture::new(false, false).await;
    assert!(
        Service::start(
            &f.data,
            vec![ShareConfig {
                name: "Secrets".into(),
                path: f.data.clone()
            }],
            "127.0.0.1:0".parse().unwrap()
        )
        .is_err()
    );
    let bad = f._temp.path().join("bad-state");
    std::fs::create_dir(&bad).unwrap();
    std::fs::write(bad.join("identity.json"), "corrupt").unwrap();
    assert!(
        Service::start(
            &bad,
            vec![ShareConfig {
                name: "Files".into(),
                path: f.share.clone()
            }],
            "127.0.0.1:0".parse().unwrap()
        )
        .is_err()
    );
    assert_eq!(
        std::fs::read_to_string(bad.join("identity.json")).unwrap(),
        "corrupt"
    );
}
impl Fixture {
    async fn new(write: bool, delete: bool) -> Self {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("state");
        let share = temp.path().join("files");
        std::fs::create_dir(&share).unwrap();
        // macOS TMPDIR commonly starts with the OS /var -> /private/var
        // alias. Fixtures must pass real local roots to the strict service.
        let share = share.canonicalize().unwrap();
        std::fs::write(share.join("中文 file.txt"), b"0123456789").unwrap();
        std::fs::create_dir(share.join("folder")).unwrap();
        let service = Service::start(
            &data,
            vec![ShareConfig {
                name: "Files".into(),
                path: share.clone(),
            }],
            "127.0.0.1:0".parse().unwrap(),
        )
        .unwrap();
        let group=service.groups().create("Protocol fixture","Host",Permissions {write,delete}).unwrap();
        let credential=group_session(&service,&group).await;
        let identity: Value =
            serde_json::from_slice(&std::fs::read(data.join("identity.json")).unwrap()).unwrap();
        let der: Vec<u8> = serde_json::from_value(identity["certificate"].clone()).unwrap();
        let client = Client::builder()
            .no_proxy()
            .add_root_certificate(reqwest::Certificate::from_der(&der).unwrap())
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .unwrap();
        let base = service.status().endpoints[0].clone();
        Self {
            _temp: temp,
            data,
            share,
            service,
            client,
            base,
            group,
            user: credential["username"].as_str().unwrap().into(),
            password: credential["password"].as_str().unwrap().into(),
        }
    }
    fn request(&self, method: &str, path: &str) -> reqwest::RequestBuilder {
        self.client
            .request(
                Method::from_bytes(method.as_bytes()).unwrap(),
                format!("{}{path}", self.base),
            )
            .basic_auth(&self.user, Some(&self.password))
    }
    async fn upload(&self, path: &str, size: u64) -> String {
        let response = self
            .request("POST", "/api/v1/uploads")
            .header("Tus-Resumable", "1.0.0")
            .header("Upload-Length", size)
            .header(
                "Upload-Metadata",
                format!(
                    "path {}",
                    base64::engine::general_purpose::STANDARD.encode(path)
                ),
            )
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 201, "{}", response.text().await.unwrap());
        response.headers()["location"].to_str().unwrap().into()
    }
}
#[tokio::test]
async fn api_webdav_unicode_and_range_share_the_same_content() {
    let f = Fixture::new(false, false).await;
    assert_eq!(
        f.client
            .get(format!("{}/api/v1/list", f.base))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let root: Value = f
        .request("GET", "/api/v1/list")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(root["entries"][0]["name"], "Files");
    assert!(
        !root
            .to_string()
            .contains(&f.share.to_string_lossy().to_string())
    );
    let list: Value = f
        .request("GET", "/api/v1/list?path=/Files&limit=1")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(list["total"], 2);
    assert_eq!(list["entries"][0]["name"], "folder");
    let response = f
        .request("PROPFIND", "/dav/Files/")
        .header("Depth", "1")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 207);
    assert!(response.text().await.unwrap().contains("file.txt"));
    let response = f
        .request("GET", "/api/v1/content")
        .query(&[("path", "/Files/中文 file.txt")])
        .header("Range", "bytes=2-5")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 206);
    assert_eq!(response.headers()["content-range"], "bytes 2-5/10");
    assert_eq!(response.text().await.unwrap(), "2345");
}
#[tokio::test]
async fn readonly_and_revocation_are_enforced_in_both_protocols() {
    let f = Fixture::new(false, false).await;
    for (method, path) in [
        ("PUT", "/dav/Files/new"),
        ("DELETE", "/dav/Files/folder"),
        ("MKCOL", "/dav/Files/newdir"),
        ("MOVE", "/dav/Files/folder"),
    ] {
        assert_eq!(
            f.request(method, path).send().await.unwrap().status(),
            403,
            "{method}"
        );
    }
    assert_eq!(
        f.request("POST", "/api/v1/mkdir")
            .json(&json!({"path":"/Files/new"}))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    f.service.groups().remove(&f.group,&f.service.groups().device_id()).unwrap();
    assert_eq!(
        f.request("GET", "/api/v1/list")
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    assert!(!f.share.join("new").exists());
}
#[tokio::test]
async fn tus_partial_resume_and_publish_without_overwrite() {
    let f = Fixture::new(true, false).await;
    let path = f.upload("/Files/resume.bin", 6).await;
    for (offset, body) in [(0, "abc"), (3, "def")] {
        let response = f
            .request("PATCH", &path)
            .header("Tus-Resumable", "1.0.0")
            .header("Upload-Offset", offset)
            .header("Content-Type", "application/offset+octet-stream")
            .body(body)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 204, "{}", response.text().await.unwrap());
        if offset == 0 {
            assert!(!f.share.join("resume.bin").exists());
            let head = f
                .request("HEAD", &path)
                .header("Tus-Resumable", "1.0.0")
                .send()
                .await
                .unwrap();
            assert_eq!(head.headers()["upload-offset"], "3");
            assert_eq!(
                f.request("PATCH", &path)
                    .header("Tus-Resumable", "1.0.0")
                    .header("Upload-Offset", 0)
                    .header("Content-Type", "application/offset+octet-stream")
                    .body("zzz")
                    .send()
                    .await
                    .unwrap()
                    .status(),
                409
            );
        }
    }
    assert_eq!(
        std::fs::read(f.share.join("resume.bin")).unwrap(),
        b"abcdef"
    );
    assert_eq!(
        f.request("PUT", "/dav/Files/resume.bin")
            .body("replace")
            .send()
            .await
            .unwrap()
            .status(),
        428
    );
    assert_eq!(
        std::fs::read(f.share.join("resume.bin")).unwrap(),
        b"abcdef"
    );
}
#[tokio::test]
async fn concurrent_destination_creation_is_not_overwritten() {
    let f = Fixture::new(true, true).await;
    let path = f.upload("/Files/racing", 3).await;
    std::fs::write(f.share.join("racing"), "original").unwrap();
    assert_eq!(
        f.request("PATCH", &path)
            .header("Tus-Resumable", "1.0.0")
            .header("Upload-Offset", 0)
            .header("Content-Type", "application/offset+octet-stream")
            .body("new")
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    assert_eq!(
        std::fs::read_to_string(f.share.join("racing")).unwrap(),
        "original"
    );
    // A complete *staging* file is not a completed published upload. A client
    // recovering a 409 must not mistake HEAD's offset for successful commit.
    assert_eq!(
        f.request("HEAD", &path)
            .header("Tus-Resumable", "1.0.0")
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
}
#[tokio::test]
async fn rename_directory_and_dav_move_never_replace_target() {
    let f = Fixture::new(true, true).await;
    std::fs::write(f.share.join("folder/a"), "a").unwrap();
    let response = f
        .request("POST", "/api/v1/rename")
        .json(&json!({"path":"/Files/folder","destination":"/Files/renamed"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 204, "{}", response.text().await.unwrap());
    assert!(f.share.join("renamed/a").exists());
    std::fs::create_dir(f.share.join("target")).unwrap();
    std::fs::write(f.share.join("target/keep"), "keep").unwrap();
    let response = f
        .request("MOVE", "/dav/Files/renamed")
        .header("Destination", format!("{}/dav/Files/target", f.base))
        .header("Overwrite", "T")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 412);
    assert!(f.share.join("target/keep").exists());
    assert!(f.share.join("renamed/a").exists());
}
#[tokio::test]
async fn native_mutations_respect_webdav_locks() {
    let f = Fixture::new(true, true).await;
    let response=f.request("LOCK","/dav/Files/folder/").header("Content-Type","application/xml").body("<D:lockinfo xmlns:D=\"DAV:\"><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockinfo>").send().await.unwrap();
    assert!(
        response.status().is_success(),
        "{}",
        response.text().await.unwrap()
    );
    let response = f
        .request("POST", "/api/v1/rename")
        .json(&json!({"path":"/Files/folder","destination":"/Files/other"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 423, "{}", response.text().await.unwrap());
    assert!(f.share.join("folder").exists());
    let response = f
        .request("POST", "/api/v1/rename")
        .json(&json!({"path":"/Files/FOLDER","destination":"/Files/other"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 423, "{}", response.text().await.unwrap());
}
#[tokio::test]
async fn device_group_requests_reject_cross_origin_access() {
    let f=Fixture::new(false,false).await;
    assert_eq!(f.request("POST","/api/v1/groups/challenge").header("Origin","https://evil.example").json(&json!({"groupId":f.group,"deviceId":f.service.groups().device_id()})).send().await.unwrap().status(),403);
}
#[tokio::test]
async fn traversal_private_names_and_root_changes_are_denied() {
    let f = Fixture::new(true, true).await;
    for path in [
        "/Files/../state/identity.json",
        "/Files/.rhfiles-service-staging/x",
        "/Files/C:/x",
        "/Files/a\\b",
    ] {
        let r = f
            .request("GET", "/api/v1/stat")
            .query(&[("path", path)])
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 403, "{path}");
    }
    for path in ["/Files", "/"] {
        assert_eq!(
            f.request("POST", "/api/v1/delete")
                .json(&json!({"path":path}))
                .send()
                .await
                .unwrap()
                .status(),
            403
        );
        let response = f
            .request("DELETE", &format!("/dav{path}"))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 403);
    }
    assert!(f.data.join("identity.json").exists());
    assert!(f.share.join("中文 file.txt").exists());
    assert!(f.share.join("folder").exists());
}
#[tokio::test]
async fn webdav_copy_move_cannot_recurse_into_the_source_or_move_a_share_root() {
    let f = Fixture::new(true, true).await;
    std::fs::write(f.share.join("folder/keep"), "keep").unwrap();
    for method in ["COPY", "MOVE"] {
        for destination in ["FOLDER/child", "folder//child", "folder%2fchild"] {
            let response = f
                .request(method, "/dav/Files/folder")
                .header("Destination", format!("{}/dav/Files/{destination}", f.base))
                .send()
                .await
                .unwrap();
            assert_eq!(response.status(), 403, "{}", response.text().await.unwrap());
        }
    }
    assert_eq!(
        f.request("MOVE", "/dav/Files/")
            .header("Destination", format!("{}/dav/Files/moved", f.base))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        std::fs::read_to_string(f.share.join("folder/keep")).unwrap(),
        "keep"
    );
    assert!(!f.share.join("folder/child").exists());
}

async fn group_session(service:&Service,id:&str)->Value {
    let groups=service.groups();
    group_session_from(service,id,&groups).await
}
async fn group_session_from(service:&Service,id:&str,groups:&rhfiles_service::groups::Groups)->Value {
    let client=Client::builder().no_proxy().add_root_certificate(reqwest::Certificate::from_pem(service.status().certificate_pem.as_bytes()).unwrap()).timeout(std::time::Duration::from_secs(10)).build().unwrap();
    let url=format!("https://127.0.0.1:{}",service.status().port);
    let challenge:Value=client.post(format!("{url}/api/v1/groups/challenge")).json(&json!({"groupId":id,"deviceId":groups.device_id()})).send().await.unwrap().json().await.unwrap();
    let nonce=challenge["nonce"].as_str().unwrap();
    let response=client.post(format!("{url}/api/v1/groups/session")).json(&json!({"groupId":id,"nonce":nonce,"packet":groups.packet(id).unwrap(),"proof":groups.proof(id,nonce,&service.status().fingerprint).unwrap()})).send().await.unwrap();
    assert_eq!(response.status(),200);response.json::<Value>().await.unwrap()["credential"].clone()
}
