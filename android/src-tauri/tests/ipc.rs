//! End-to-end command tests over Tauri's IPC bridge.
//!
//! These drive the production `invoke_handler` registration — the same table the
//! app ships — through `MockRuntime`, and assert on the JSON that reaches the
//! frontend. They catch what unit tests cannot: a command that cannot decode its
//! arguments, a `State` extractor that panics, a payload whose field names the
//! JavaScript would not recognise.
//!
//! Everything runs on the host; no device or emulator is required.

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use tauri::test::{get_ipc_response, mock_context, noop_assets};
use tauri::webview::InvokeRequest;
use tauri::{App, Manager, WebviewUrl, WebviewWindowBuilder};

type MockRuntime = tauri::test::MockRuntime;

/// A Tauri application may only be built once per process, so every test shares
/// one instance and serialises on the lock.
///
/// `mock_context` deliberately ignores `tauri.conf.json` (so the tests do not
/// depend on the frontend assets), which also means it declares no windows — the
/// main webview is created explicitly here.
fn shared_app() -> &'static Mutex<App<MockRuntime>> {
    static APP: OnceLock<Mutex<App<MockRuntime>>> = OnceLock::new();
    APP.get_or_init(|| {
        let app = rhfiles_android_lib::build_app_generic::<MockRuntime>()
            .build(mock_context(noop_assets()))
            .expect("the mock application should build with the production command table");
        let _ = WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
            .build()
            .expect("the main webview should build");
        Mutex::new(app)
    })
}

fn invoke(
    cmd: &str,
    body: serde_json::Value,
) -> Result<serde_json::Value, serde_json::Value> {
    // The invoke key is generated per application, so it has to be read from the
    // live app rather than from a constant.
    let guard = shared_app()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let webview = guard
        .get_webview_window("main")
        .expect("the shared application has a main webview");
    let request = InvokeRequest {
        cmd: cmd.into(),
        callback: tauri::ipc::CallbackFn(0),
        error: tauri::ipc::CallbackFn(1),
        url: "http://tauri.localhost".parse().unwrap(),
        body: tauri::ipc::InvokeBody::Json(body),
        headers: Default::default(),
        invoke_key: guard.invoke_key().to_string(),
    };
    get_ipc_response(&webview, request)
        .map(|value| value.deserialize::<serde_json::Value>().unwrap())
}

/// One scratch tree: a nested folder, two files and a hidden file.
fn fixture(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("rhfiles-ipc-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(root.join("DCIM/Camera")).unwrap();
    std::fs::write(root.join("notes.txt"), b"hello rhfiles").unwrap();
    std::fs::write(root.join("DCIM/Camera/photo.jpg"), vec![7u8; 2048]).unwrap();
    std::fs::write(root.join(".secret"), b"hidden").unwrap();
    root
}

#[test]
fn list_dir_returns_a_payload_the_frontend_can_use() {
    let root = fixture("list");
    let value = invoke(
        "list_dir",
        serde_json::json!({ "path": root.to_string_lossy() }),
    )
    .expect("list_dir should succeed");

    // The field names are what android/web/js/app.js reads; serde's camelCase
    // conversion is part of the contract, so assert on the wire shape.
    assert_eq!(value["dirCount"], serde_json::json!(1));
    assert_eq!(value["fileCount"], serde_json::json!(2));
    assert_eq!(value["truncated"], serde_json::json!(false));
    assert!(value["elapsedMs"].is_number());

    // The fixture has exactly one folder and two files at the root; the files
    // nested under DCIM/Camera must not appear in a single-level listing.
    let entries = value["entries"].as_array().expect("entries array");
    assert_eq!(entries.len(), 3, "unexpected entries: {entries:?}");

    let dcim = entries.iter().find(|entry| entry["name"] == "DCIM").expect("DCIM");
    assert_eq!(dcim["isDir"], serde_json::json!(true));
    assert_eq!(dcim["kind"], serde_json::json!("folder"));
    assert_eq!(dcim["size"], serde_json::json!(0));

    let notes = entries.iter().find(|entry| entry["name"] == "notes.txt").expect("notes.txt");
    assert_eq!(notes["kind"], serde_json::json!("document"));
    assert_eq!(notes["size"], serde_json::json!(13));
    assert_eq!(notes["hidden"], serde_json::json!(false));

    let hidden = entries.iter().find(|entry| entry["name"] == ".secret").expect(".secret");
    assert_eq!(hidden["hidden"], serde_json::json!(true));

    assert!(entries.iter().all(|entry| entry["path"] != serde_json::json!(root.join("DCIM/Camera/photo.jpg").to_string_lossy())));

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn list_dir_errors_are_strings() {
    let error = invoke(
        "list_dir",
        serde_json::json!({ "path": "/definitely/not/a/real/directory" }),
    )
    .expect_err("a missing directory must fail");
    assert!(error.is_string(), "the frontend expects a string error, got {error}");
}

#[test]
fn library_command_validates_category_and_serializes_bounded_page() {
    let page = invoke("browse_library", serde_json::json!({
        "category": "image", "root": "/rhfiles-ipc-nonexistent-root", "limit": 5, "showHidden": false
    })).expect("library command registered");
    assert_eq!(page["entries"], serde_json::json!([]));
    assert_eq!(page["total"], 0);
    assert_eq!(page["totalBytes"], 0);
    assert_eq!(page["truncated"], false);
    assert!(invoke("browse_library", serde_json::json!({
        "category": "unrecognized", "root": "/s"
    })).is_err());
}

#[test]
fn file_operations_round_trip_through_ipc() {
    let root = fixture("ops");
    let root_text = root.to_string_lossy().to_string();

    let folder = invoke(
        "create_directory",
        serde_json::json!({ "parent": root_text, "name": "Backup" }),
    )
    .expect("create_directory");
    let folder_path = folder.as_str().unwrap().to_string();
    assert!(PathBuf::from(&folder_path).is_dir());

    let file = invoke(
        "create_file",
        serde_json::json!({ "parent": folder_path, "name": "log.txt" }),
    )
    .expect("create_file");
    let file_path = file.as_str().unwrap().to_string();

    let renamed = invoke(
        "rename_entry",
        serde_json::json!({ "path": file_path, "newName": "session.txt" }),
    )
    .expect("rename_entry");
    let renamed_path = renamed.as_str().unwrap().to_string();
    assert!(renamed_path.ends_with("session.txt"));
    assert!(!PathBuf::from(&file_path).exists());

    let copied = invoke(
        "copy_entries",
        serde_json::json!({
            "sources": [root.join("DCIM").to_string_lossy()],
            "destination": folder_path,
        }),
    )
    .expect("copy_entries");
    assert_eq!(copied["failures"].as_array().unwrap().len(), 0);
    assert_eq!(copied["moved"].as_array().unwrap().len(), 1);
    assert_eq!(copied["bytes"], serde_json::json!(2048));
    assert!(PathBuf::from(&folder_path).join("DCIM/Camera/photo.jpg").is_file());

    let moved = invoke(
        "move_entries",
        serde_json::json!({
            "sources": [root.join("notes.txt").to_string_lossy()],
            "destination": folder_path,
        }),
    )
    .expect("move_entries");
    assert_eq!(moved["failures"].as_array().unwrap().len(), 0);
    assert!(!root.join("notes.txt").exists());
    let moved_notes = PathBuf::from(&folder_path).join("notes.txt");
    assert!(moved_notes.is_file());

    let preview = invoke(
        "read_text_preview",
        serde_json::json!({ "path": moved_notes.to_string_lossy() }),
    )
    .expect("read_text_preview");
    assert_eq!(preview["text"], serde_json::json!("hello rhfiles"));
    assert_eq!(preview["truncated"], serde_json::json!(false));

    let binary = invoke(
        "read_text_preview",
        serde_json::json!({ "path": PathBuf::from(&folder_path).join("DCIM/Camera/photo.jpg").to_string_lossy() }),
    )
    .expect_err("a JPEG is not text");
    assert_eq!(binary, serde_json::json!("binary file"));

    let hash = invoke(
        "file_hash",
        serde_json::json!({ "path": moved_notes.to_string_lossy() }),
    )
    .expect("file_hash");
    assert!(hash.as_str().unwrap().starts_with("fnv1a64:"));

    assert_eq!(
        invoke("entry_exists", serde_json::json!({ "path": moved_notes.to_string_lossy() })).unwrap(),
        serde_json::json!(true)
    );
    assert_eq!(
        invoke("entry_exists", serde_json::json!({ "path": root.join("nope").to_string_lossy() })).unwrap(),
        serde_json::json!(false)
    );

    let deleted = invoke(
        "delete_entries",
        serde_json::json!({
            "paths": [
                PathBuf::from(&folder_path).join("DCIM").to_string_lossy(),
                root.join("missing").to_string_lossy(),
            ],
            "permanent": true,
        }),
    )
    .expect("delete_entries");
    assert_eq!(deleted["deleted"].as_array().unwrap().len(), 1);
    assert_eq!(deleted["failures"].as_array().unwrap().len(), 1);
    assert!(!PathBuf::from(&folder_path).join("DCIM").exists());

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn device_commands_answer_without_a_device() {
    let permissions = invoke("get_permission_status", serde_json::json!({}))
        .expect("get_permission_status must not panic off-device");
    assert!(permissions["manageExternalStorage"].is_boolean());
    assert!(permissions["notes"].is_array());
    assert!(permissions["appDataDir"].is_string());

    let server = invoke("get_reverse_server_status", serde_json::json!({}))
        .expect("get_reverse_server_status");
    assert_eq!(server["running"], serde_json::json!(false));
    assert_eq!(server["enabled"], serde_json::json!(false));
    assert_eq!(server["port"], serde_json::json!(0));

    // Storage discovery is filesystem-based; off-device it may legitimately find
    // nothing, but it must return a list rather than an error.
    let roots = invoke("get_storage_roots", serde_json::json!({})).expect("get_storage_roots");
    assert!(roots.is_array());

    let scan = invoke(
        "scan_storage_sizes",
        serde_json::json!({ "root": "/definitely/not/a/directory" }),
    )
    .expect_err("scanning a missing root must fail");
    assert!(scan.is_string());
}

#[test]
fn index_build_then_search_over_ipc() {
    let root = fixture("index");
    let status = invoke(
        "index_start",
        serde_json::json!({ "roots": [root.to_string_lossy()] }),
    )
    .expect("index_start");
    assert!(status["indexing"].is_boolean());

    let mut current = status;
    for _ in 0..200 {
        if current["indexing"] == serde_json::json!(false) {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
        current = invoke("index_status", serde_json::json!({})).expect("index_status");
    }
    assert_eq!(
        current["indexing"],
        serde_json::json!(false),
        "the background walk did not finish: {current}"
    );
    assert!(
        current["entryCount"].as_u64().unwrap() >= 4,
        "the fixture should be indexed: {current}"
    );
    assert!(current["durationMs"].as_u64().is_some());

    let hits = invoke("search_files", serde_json::json!({ "query": "photo", "limit": 10 }))
        .expect("search_files");
    let hits = hits.as_array().unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0]["name"], serde_json::json!("photo.jpg"));
    assert_eq!(hits[0]["isDir"], serde_json::json!(false));
    assert_eq!(hits[0]["size"], serde_json::json!(2048));
    assert!(hits[0]["path"].as_str().unwrap().ends_with("photo.jpg"));
    assert!(hits[0]["parent"].as_str().unwrap().ends_with("Camera"));

    // Every token must match, and directories-only must filter files out.
    assert_eq!(
        invoke("search_files", serde_json::json!({ "query": "camera photo" }))
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        invoke("search_files", serde_json::json!({ "query": "camera photo video" }))
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        0
    );
    let directories = invoke(
        "search_files",
        serde_json::json!({ "query": "camera", "directoriesOnly": true }),
    )
    .unwrap();
    let directories = directories.as_array().unwrap();
    assert!(!directories.is_empty());
    assert!(directories.iter().all(|hit| hit["isDir"] == serde_json::json!(true)));

    let stopped = invoke("index_stop", serde_json::json!({})).expect("index_stop");
    assert_eq!(stopped["indexing"], serde_json::json!(false));
    let cleared = invoke("index_clear", serde_json::json!({})).expect("index_clear");
    assert_eq!(cleared["entryCount"], serde_json::json!(0));

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn diagnostics_log_is_readable_over_ipc() {
    // A listing failure must leave a trace the user can copy out of the app.
    let _ = invoke(
        "list_dir",
        serde_json::json!({ "path": "/definitely/not/a/real/directory" }),
    )
    .expect_err("the listing must fail");

    let page = invoke("get_logs", serde_json::json!({ "limit": 200 })).expect("get_logs");
    assert!(page["capacity"].as_u64().unwrap() > 0);
    let entries = page["entries"].as_array().expect("entries array");
    assert!(!entries.is_empty(), "the failed listing should have been logged");

    let warned = entries.iter().any(|entry| {
        entry["scope"] == serde_json::json!("fs") && entry["level"] == serde_json::json!("warn")
    });
    assert!(warned, "expected a warn entry from the fs scope: {entries:?}");
    assert!(entries.iter().all(|entry| entry["atMs"].as_u64().unwrap() > 0));

    let cleared = invoke("clear_logs", serde_json::json!({})).expect("clear_logs");
    assert_eq!(cleared["total"], serde_json::json!(0));
    let empty = invoke("get_logs", serde_json::json!({})).expect("get_logs after clearing");
    assert_eq!(empty["total"], serde_json::json!(0));
    assert!(empty["entries"].as_array().unwrap().is_empty());
}

#[test]
fn unknown_commands_are_rejected() {
    let error = invoke("definitely_not_a_command", serde_json::json!({}))
        .expect_err("an unregistered command must not resolve");
    assert!(!error.is_null(), "expected an error payload, got {error}");
}
