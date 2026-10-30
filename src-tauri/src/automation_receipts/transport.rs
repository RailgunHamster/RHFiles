//! A single-request read-only transport which never calls a WebView. The pipe
//! rejects remote clients; a fresh per-process secret authorizes local reads.
use super::{Query, read_receipt};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    sync::{Arc, OnceLock},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::windows::named_pipe::{NamedPipeServer, ServerOptions},
    sync::{Mutex, Semaphore},
};

const REQUEST_LIMIT: usize = 4096;
const RESPONSE_LIMIT: usize = 1024 * 1024;
const CONNECTIONS: usize = 16;
#[derive(Clone, Serialize)]
struct Endpoint {
    #[serde(rename = "type")]
    kind: &'static str,
    path: String,
    secret: String,
}
static ENDPOINT: OnceLock<Endpoint> = OnceLock::new();
static INITIALIZING: Mutex<()> = Mutex::const_new(());
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    secret: String,
    query: Query,
}

fn random_hex(length: usize) -> Result<String, String> {
    let mut bytes = vec![0; length];
    getrandom::fill(&mut bytes).map_err(|_| "Unable to initialize local receipt access")?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}
fn server(path: &str, first: bool) -> std::io::Result<NamedPipeServer> {
    ServerOptions::new()
        .first_pipe_instance(first)
        .reject_remote_clients(true)
        .max_instances(CONNECTIONS)
        .create(path)
}
pub(super) async fn descriptor() -> Result<Value, String> {
    let _initializing = INITIALIZING.lock().await;
    if let Some(endpoint) = ENDPOINT.get() {
        return Ok(json!(endpoint));
    }
    let endpoint = Endpoint {
        kind: "windows-pipe",
        path: format!(r"\\.\pipe\RHFiles.receipts.{}", random_hex(16)?),
        secret: random_hex(32)?,
    };
    let listener =
        server(&endpoint.path, true).map_err(|_| "Unable to create local receipt access")?;
    ENDPOINT
        .set(endpoint.clone())
        .map_err(|_| "Local receipt access is already initialized")?;
    tauri::async_runtime::spawn(serve(endpoint.clone(), listener));
    Ok(json!(endpoint))
}
async fn serve(endpoint: Endpoint, mut listener: NamedPipeServer) {
    // Reserve one of the OS instances for the next listener. Slow clients have
    // a bounded read deadline and cannot create unlimited detached tasks.
    let permits = Arc::new(Semaphore::new(CONNECTIONS - 1));
    loop {
        let Ok(permit) = permits.clone().acquire_owned().await else {
            break;
        };
        if listener.connect().await.is_err() {
            break;
        }
        let Ok(next) = server(&endpoint.path, false) else {
            break;
        };
        let connected = std::mem::replace(&mut listener, next);
        let secret = endpoint.secret.clone();
        tauri::async_runtime::spawn(async move {
            let _permit = permit;
            handle(connected, &secret).await;
        });
    }
}
async fn frame(pipe: &mut NamedPipeServer) -> Result<Vec<u8>, ()> {
    let mut bytes = Vec::new();
    loop {
        let mut chunk = [0; 256];
        let count = pipe.read(&mut chunk).await.map_err(|_| ())?;
        if count == 0 || bytes.len() + count > REQUEST_LIMIT {
            return Err(());
        }
        bytes.extend_from_slice(&chunk[..count]);
        if let Some(end) = bytes.iter().position(|byte| *byte == b'\n') {
            if end + 1 != bytes.len() {
                return Err(());
            }
            bytes.pop();
            return Ok(bytes);
        }
    }
}
fn authorized(actual: &str, expected: &str) -> bool {
    actual.len() == expected.len()
        && actual
            .bytes()
            .zip(expected.bytes())
            .fold(0, |diff, (a, b)| diff | (a ^ b))
            == 0
}
async fn handle(mut pipe: NamedPipeServer, secret: &str) {
    let Ok(Ok(frame)) = tokio::time::timeout(Duration::from_secs(1), frame(&mut pipe)).await else {
        return;
    };
    let response = match serde_json::from_slice::<Request>(&frame) {
        Ok(request) if authorized(&request.secret, secret) => {
            // The action's JS receipt may precede native admission by a few ms.
            // Wait for that original receipt, never submit/repeat its action.
            // A completed primary UI reply closes its competing pipe read.
            // Release that slot immediately, rather than retaining a missing
            // native receipt for the rest of the 30-second read deadline.
            let mut extra = [0; 1];
            let result = tokio::select! {
                result = read_receipt(request.query, None, true) => result,
                _ = pipe.read(&mut extra) => return,
            };
            match result {
                Ok(value) => json!({"result":value}),
                Err(error) => json!({"error":error}),
            }
        }
        Ok(_) => json!({"error":{"code":"UNAUTHORIZED","message":"Local receipt access denied"}}),
        Err(_) => {
            json!({"error":{"code":"INVALID_PARAMS","message":"Invalid local receipt query"}})
        }
    };
    let Ok(mut bytes) = serde_json::to_vec(&response) else {
        return;
    };
    if bytes.len() > RESPONSE_LIMIT {
        return;
    }
    bytes.push(b'\n');
    let _ = tokio::time::timeout(Duration::from_secs(1), async {
        pipe.write_all(&bytes).await?;
        pipe.shutdown().await
    })
    .await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::windows::named_pipe::ClientOptions;

    fn test_endpoint() -> Endpoint {
        Endpoint {
            kind: "windows-pipe",
            path: format!(r"\\.\pipe\RHFiles.receipts.{}", random_hex(16).unwrap()),
            secret: random_hex(32).unwrap(),
        }
    }
    async fn exchange(endpoint: &Endpoint, value: Value) -> Value {
        let mut client = ClientOptions::new().open(&endpoint.path).unwrap();
        let mut bytes = serde_json::to_vec(&value).unwrap();
        bytes.push(b'\n');
        client.write_all(&bytes).await.unwrap();
        tokio::time::timeout(Duration::from_secs(2), async {
            let mut reply = Vec::new();
            loop {
                let byte = client.read_u8().await.unwrap();
                if byte == b'\n' {
                    break;
                }
                reply.push(byte);
                assert!(reply.len() <= RESPONSE_LIMIT);
            }
            serde_json::from_slice(&reply).unwrap()
        })
        .await
        .unwrap()
    }
    #[test]
    fn authentication_and_wire_queries_do_not_accept_commands_or_extra_fields() {
        assert!(authorized("correct", "correct"));
        for wrong in ["", "correc", "incorrect", "correcT"] {
            assert!(!authorized(wrong, "correct"));
        }
        assert!(
            serde_json::from_value::<Request>(
                json!({"secret":"s","query":{"runId":"r","timeoutMs":20}})
            )
            .is_ok()
        );
        for value in [
            json!({"secret":"s","query":{"runId":"r"},"action":"delete"}),
            json!({"secret":"s","query":{"runId":"r","action":"delete"}}),
        ] {
            assert!(serde_json::from_value::<Request>(value).is_err());
        }
    }

    #[test]
    fn real_pipe_authenticates_one_read_and_rejects_mutation_fields() {
        tauri::async_runtime::block_on(async {
            let endpoint = test_endpoint();
            let task = tokio::spawn(serve(
                endpoint.clone(),
                server(&endpoint.path, true).unwrap(),
            ));
            let denied = exchange(
                &endpoint,
                json!({"secret":"wrong","query":{"runId":"absent"}}),
            )
            .await;
            assert_eq!(denied["error"]["code"], "UNAUTHORIZED");
            let invalid = exchange(
                &endpoint,
                json!({"secret":endpoint.secret,"query":{"runId":"absent","action":"delete"}}),
            )
            .await;
            assert_eq!(invalid["error"]["code"], "INVALID_PARAMS");
            let invalid = exchange(
                &endpoint,
                json!({"secret":endpoint.secret,"query":{"runId":"absent","key":"also"}}),
            )
            .await;
            assert_eq!(invalid["error"]["code"], "INVALID_PARAMS");
            let missing = exchange(
                &endpoint,
                json!({"secret":endpoint.secret,"query":{"runId":"absent"}}),
            )
            .await;
            assert_eq!(missing, json!({"result":null}));
            task.abort();
            let _ = task.await;
        });
    }

    #[test]
    fn real_pipe_waits_for_original_native_admission_then_reads_its_completion() {
        tauri::async_runtime::block_on(async {
            let endpoint = test_endpoint();
            let task = tokio::spawn(serve(
                endpoint.clone(),
                server(&endpoint.path, true).unwrap(),
            ));
            let id = format!("pipe-test:{}", random_hex(8).unwrap());
            let key = format!("key:{id}");
            let (late_id, late_key) = (id.clone(), key.clone());
            let admission = tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(30)).await;
                assert!(super::super::begin(json!({"id":late_id,"action":"rhvideo.player.close","key":late_key,"fingerprint":"close:{}","startedAt":1}),"player.close").unwrap().is_none());
                tokio::time::sleep(Duration::from_millis(30)).await;
                super::super::finish(&late_id, &Ok(json!({"closed":true})));
            });
            let reply = exchange(
                &endpoint,
                json!({"secret":endpoint.secret,"query":{"key":key,"timeoutMs":1000}}),
            )
            .await;
            admission.await.unwrap();
            assert_eq!(reply["result"]["id"], id);
            assert_eq!(reply["result"]["state"], "succeeded");
            assert_eq!(reply["result"]["result"]["closed"], true);
            task.abort();
            let _ = task.await;
        });
    }

    #[test]
    fn disconnect_ends_only_the_receipt_read_and_releases_its_connection_slot() {
        tauri::async_runtime::block_on(async {
            let endpoint = test_endpoint();
            let listener = server(&endpoint.path, true).unwrap();
            let secret = endpoint.secret.clone();
            let mut handling = tokio::spawn(async move {
                listener.connect().await.unwrap();
                handle(listener, &secret).await;
            });
            let mut client = ClientOptions::new().open(&endpoint.path).unwrap();
            let mut bytes = serde_json::to_vec(&json!({"secret":endpoint.secret,"query":{"runId":"never-admitted","timeoutMs":30000}})).unwrap();
            bytes.push(b'\n');
            client.write_all(&bytes).await.unwrap();
            // Let the server enter the actual pending ledger read, then close
            // the caller. No cancellation command is sent to any action.
            tokio::time::sleep(Duration::from_millis(30)).await;
            drop(client);
            let ended = tokio::time::timeout(Duration::from_secs(1), &mut handling).await;
            if ended.is_err() {
                handling.abort();
                let _ = handling.await;
            }
            assert!(
                ended.is_ok(),
                "An abandoned read must not hold a slot for 30 seconds"
            );
        });
    }
}
