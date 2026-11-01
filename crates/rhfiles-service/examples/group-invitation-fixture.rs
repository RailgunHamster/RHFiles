//! Isolated E2E peer. Generated identity/files only; binds loopback, never LAN.
use rhfiles_service::{Permissions, Service, ShareConfig, groups::Groups};
use std::{
    io::{BufRead, Write},
    sync::Arc,
};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = tempfile::tempdir()?;
    let groups = Arc::new(Groups::open(&root.path().join("groups"))?);
    let id = groups.create(
        "Invitation E2E fixture",
        "Generated peer",
        Permissions::default(),
    )?;
    let files = root.path().join("files");
    std::fs::create_dir(&files)?;
    std::fs::write(files.join("fixture.txt"), b"Generated E2E only")?;
    let service = Service::start_grouped(
        &root.path().join("service"),
        vec![ShareConfig {
            name: "Files".into(),
            path: files,
        }],
        "127.0.0.1:0".parse()?,
        &[],
        groups.clone(),
    )?;
    for line in std::io::stdin().lock().lines() {
        let response = match line?.as_str() {
            "invite" => service.group_invitation(&id, false)?,
            "state" => groups.state()?,
            "quit" => break,
            _ => return Err("Unknown fixture command".into()),
        };
        println!("{}", serde_json::to_string(&response)?);
        std::io::stdout().flush()?;
    }
    Ok(())
}
