//! Lazy, identity-bound group connections. No background probing, public relay,
//! recursive peer search, unbounded retries or replay of file mutations.
use crate::{
    groups::{Groups, Packet, Server, Signed, key_id},
    model::now_ms,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

pub const TOTAL: Duration = Duration::from_secs(15);
pub const MAX_ATTEMPTS: usize = 6;
const COOLDOWN: Duration = Duration::from_secs(15);

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Step {
    pub method: String,
    pub endpoint: Option<String>,
    pub outcome: String,
    pub code: String,
    pub duration_ms: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub group: String,
    pub peer: String,
    pub trigger: String,
    pub started_at: u64,
    pub duration_ms: u64,
    pub outcome: String,
    pub certainty: String,
    pub endpoint: Option<String>,
    pub steps: Vec<Step>,
}
impl Report {
    fn step(
        &mut self,
        method: &str,
        endpoint: Option<&str>,
        outcome: &str,
        code: &str,
        start: Instant,
    ) {
        if self.steps.len() < 40 {
            self.steps.push(Step {
                method: method.into(),
                endpoint: endpoint.map(str::to_owned),
                outcome: outcome.into(),
                code: code.into(),
                duration_ms: start.elapsed().as_millis() as u64,
            });
        }
    }
}
/// A monotonically bounded budget. A network change never renews it.
pub struct Budget {
    start: Instant,
    seen: HashSet<String>,
    attempts: usize,
}
impl Default for Budget {
    fn default() -> Self {
        Self {
            start: Instant::now(),
            seen: HashSet::new(),
            attempts: 0,
        }
    }
}
impl Budget {
    pub fn remaining(&self) -> Duration {
        TOTAL.saturating_sub(self.start.elapsed())
    }
    pub fn admit(&mut self, endpoint: &str) -> bool {
        if self.remaining().is_zero()
            || self.attempts >= MAX_ATTEMPTS
            || !self.seen.insert(endpoint.trim_end_matches('/').into())
        {
            return false;
        }
        self.attempts += 1;
        true
    }
}
#[derive(Clone)]
struct Route {
    endpoint: String,
    fingerprint: String,
    client: reqwest::Client,
    username: String,
    password: String,
    network: Vec<String>,
    verified: Instant,
}
pub struct Connector {
    groups: Arc<Groups>,
    routes: Mutex<HashMap<String, Route>>,
    reports: Mutex<VecDeque<Report>>,
    failures: Mutex<HashMap<String, (Instant, Vec<String>)>>,
    locks: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    active: Mutex<HashMap<String, Arc<tokio::sync::Notify>>>,
}
fn network() -> Vec<String> {
    let mut values = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|a| a.ip().is_ipv4() && !a.ip().is_loopback())
        .map(|a| format!("{}:{:?}", a.name, a.addr))
        .collect::<Vec<_>>();
    values.sort();
    values
}
fn member(groups: &Groups, group: &str, peer: &str) -> Result<Server, String> {
    groups
        .access(group, peer, false)
        .map_err(|e| e.to_string())?;
    groups
        .access(group, &groups.device_id(), false)
        .map_err(|e| e.to_string())?;
    let state = groups.state().map_err(|e| e.to_string())?;
    let g = state["groups"]
        .as_array()
        .and_then(|a| a.iter().find(|g| g["id"] == group))
        .ok_or("Group unavailable")?;
    let m = g["members"]
        .as_array()
        .and_then(|a| a.iter().find(|m| m["id"] == peer && m["blocked"] == false))
        .ok_or("Peer unavailable")?;
    serde_json::from_value(m["server"].clone())
        .map_err(|_| "Peer has not advertised a file service".into())
}
#[derive(Debug)]
struct Pin(String);
impl rustls::client::danger::ServerCertVerifier for Pin {
    fn verify_server_cert(
        &self,
        cert: &rustls::pki_types::CertificateDer<'_>,
        _: &[rustls::pki_types::CertificateDer<'_>],
        _: &rustls::pki_types::ServerName<'_>,
        _: &[u8],
        _: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        if format!("{:x}", Sha256::digest(cert.as_ref())) != self.0 {
            return Err(rustls::Error::General("identity_mismatch".into()));
        }
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }
    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        d: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls12_signature(
            message,
            cert,
            d,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }
    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &rustls::pki_types::CertificateDer<'_>,
        d: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(
            message,
            cert,
            d,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }
    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}
fn client(pin: &str) -> Result<reqwest::Client, String> {
    let tls = rustls::ClientConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .map_err(|_| "tls_unavailable")?
    .dangerous()
    .with_custom_certificate_verifier(Arc::new(Pin(pin.into())))
    .with_no_client_auth();
    reqwest::Client::builder()
        .use_preconfigured_tls(tls)
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_millis(1800))
        .timeout(Duration::from_secs(4))
        .build()
        .map_err(|_| "tls_unavailable".into())
}
async fn reply(request: reqwest::RequestBuilder) -> Result<Value, String> {
    let mut response = request.send().await.map_err(|e| {
        if e.is_timeout() {
            "timeout"
        } else if format!("{e:?}").contains("identity_mismatch") {
            "identity_mismatch"
        } else {
            "transport_error"
        }
        .to_string()
    })?;
    if !response.status().is_success() {
        return Err(format!("http_{}", response.status().as_u16()));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "response_interrupted")? {
        if bytes.len() + chunk.len() > 280000 {
            return Err("response_too_large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "invalid_response".into())
}
async fn phase(
    request: reqwest::RequestBuilder,
    report: &mut Report,
    method: &str,
    endpoint: &str,
) -> Result<Value, String> {
    let start = Instant::now();
    let result = reply(request).await;
    report.step(
        method,
        Some(endpoint),
        if result.is_ok() {
            "succeeded"
        } else {
            "failed"
        },
        result
            .as_ref()
            .err()
            .map(String::as_str)
            .unwrap_or("response_received"),
        start,
    );
    result
}
fn verify(proof: Signed, group: &str, nonce: &str, fp: &str, peer: &str) -> Result<(), String> {
    let c = proof.read().map_err(|_| "invalid_identity_proof")?;
    if c.kind != "server-auth"
        || c.group != group
        || c.nonce != nonce
        || c.label != fp
        || key_id(&c.key) != peer
        || c.key != c.issuer
        || c.server.is_some()
        || !c.name.is_empty()
        || c.invite
        || c.seq != 0
    {
        return Err("identity_mismatch".into());
    }
    Ok(())
}
pub fn terminal(code: &str) -> bool {
    matches!(
        code,
        "http_401" | "http_403" | "invalid_identity_proof" | "authorization_revoked"
    )
}
impl Connector {
    pub fn new(groups: Arc<Groups>) -> Self {
        Self {
            groups,
            routes: Mutex::new(HashMap::new()),
            reports: Mutex::new(VecDeque::new()),
            failures: Mutex::new(HashMap::new()),
            locks: Mutex::new(HashMap::new()),
            active: Mutex::new(HashMap::new()),
        }
    }
    pub fn diagnostics(&self) -> Vec<Report> {
        self.reports.lock().unwrap().iter().rev().cloned().collect()
    }
    pub fn invalidate(&self) {
        self.routes.lock().unwrap().clear();
        self.failures.lock().unwrap().clear();
        for n in self.active.lock().unwrap().values() {
            n.notify_one();
        }
    }
    pub fn cancel(&self, group: &str, peer: &str) -> bool {
        if let Some(n) = self.active.lock().unwrap().get(&format!("{group}:{peer}")) {
            n.notify_one();
            true
        } else {
            false
        }
    }
    fn record(&self, report: Report) {
        let mut h = self.reports.lock().unwrap();
        if h.len() >= 20 {
            h.pop_front();
        }
        h.push_back(report);
    }
    async fn handshake(
        &self,
        group: &str,
        peer: &str,
        server: &Server,
        endpoint: &str,
        report: &mut Report,
    ) -> Result<Route, String> {
        Server {
            fingerprint: server.fingerprint.clone(),
            endpoints: vec![endpoint.into()],
        }
        .validate()
        .map_err(|_| "invalid_endpoint")?;
        member(&self.groups, group, peer)?;
        let client = client(&server.fingerprint)?;
        let challenge = phase(
            client
                .post(format!("{endpoint}/api/v1/groups/challenge"))
                .json(&json!({"groupId":group,"deviceId":self.groups.device_id()})),
            report,
            "challenge",
            endpoint,
        )
        .await?;
        let nonce = challenge["nonce"].as_str().ok_or("invalid_challenge")?;
        let result = phase(client.post(format!("{endpoint}/api/v1/groups/session")).json(&json!({"groupId":group,"nonce":nonce,
            "packet":self.groups.packet(group).map_err(|_| "authorization_revoked")?,
            "proof":self.groups.proof(group, nonce, &server.fingerprint).map_err(|_| "authorization_revoked")?})),report,"session",endpoint).await?;
        verify(
            serde_json::from_value(result["serverProof"].clone())
                .map_err(|_| "invalid_identity_proof")?,
            group,
            nonce,
            &server.fingerprint,
            peer,
        )?;
        let packet: Packet =
            serde_json::from_value(result["packet"].clone()).map_err(|_| "invalid_response")?;
        self.groups
            .merge(group, &packet)
            .map_err(|_| "invalid_identity_proof")?;
        let advertised = member(&self.groups, group, peer)?;
        if !advertised.endpoints.contains(&endpoint.to_string())
            || advertised.fingerprint != server.fingerprint
        {
            return Err("endpoint_not_signed".into());
        }
        let username = result["credential"]["username"]
            .as_str()
            .ok_or("invalid_response")?
            .to_string();
        let password = result["credential"]["password"]
            .as_str()
            .ok_or("invalid_response")?
            .to_string();
        phase(
            client
                .get(format!("{endpoint}/api/v1/capabilities"))
                .basic_auth(&username, Some(&password)),
            report,
            "capabilities",
            endpoint,
        )
        .await?;
        Ok(Route {
            endpoint: endpoint.into(),
            fingerprint: server.fingerprint.clone(),
            client,
            username,
            password,
            network: network(),
            verified: Instant::now(),
        })
    }
    /// Manual connect and file-read callers use the same bounded resolver. An
    /// optional manual private address is a hint, never new trust.
    pub async fn connect(
        &self,
        group: &str,
        peer: &str,
        manual: Option<String>,
        trigger: &str,
    ) -> Report {
        let key = format!("{group}:{peer}");
        let lock = {
            let mut locks = self.locks.lock().unwrap();
            if locks.len() >= 128 {
                locks.retain(|_, v| Arc::strong_count(v) > 1);
            }
            locks
                .entry(key.clone())
                .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
                .clone()
        };
        let started = Instant::now();
        let mut report = Report {
            group: group.into(),
            peer: peer.into(),
            trigger: trigger.chars().take(40).collect(),
            started_at: now_ms(),
            duration_ms: 0,
            outcome: "unreachable".into(),
            certainty: "unknown".into(),
            endpoint: None,
            steps: vec![],
        };
        let (guard, waited) = match lock.try_lock() {
            Ok(v) => (v, false),
            Err(_) => match tokio::time::timeout(TOTAL, lock.lock()).await {
                Ok(v) => (v, true),
                Err(_) => {
                    report.step("coalesce", None, "failed", "busy", started);
                    self.record(report.clone());
                    return report;
                }
            },
        };
        let mut budget = Budget::default();
        // Waiting for a coalesced request counts against the same whole run.
        budget.start = started;
        let initial_network = network();
        if waited && manual.is_none() {
            let cached = self.routes.lock().unwrap().get(&key).cloned();
            if let Some(route) = cached.filter(|v| {
                v.network == initial_network && v.verified.elapsed() < Duration::from_secs(5)
            }) {
                if member(&self.groups, group, peer).is_ok_and(|s| {
                    s.fingerprint == route.fingerprint && s.endpoints.contains(&route.endpoint)
                }) {
                    report.outcome = "connected".into();
                    report.certainty = "confirmed".into();
                    report.endpoint = Some(route.endpoint.clone());
                    report.duration_ms = started.elapsed().as_millis() as u64;
                    report.step(
                        "coalesce",
                        Some(&route.endpoint),
                        "succeeded",
                        "reused_verified_route",
                        started,
                    );
                    self.record(report.clone());
                    drop(guard);
                    return report;
                }
            }
        }
        let cancel = Arc::new(tokio::sync::Notify::new());
        self.active
            .lock()
            .unwrap()
            .insert(key.clone(), cancel.clone());
        let remaining = budget.remaining();
        let result = tokio::select! {
            result=self.resolve(group,peer,&key,manual,&initial_network,&mut budget,&mut report)=>result,
            _=cancel.notified()=>{report.outcome="cancelled".into();report.certainty="confirmed".into();report.step("budget",None,"cancelled","cancelled",Instant::now());None},
            _=tokio::time::sleep(remaining)=>{report.step("budget",None,"failed","budget_exhausted",Instant::now());None},
        };
        self.active.lock().unwrap().remove(&key);
        if let Some(route) = result {
            report.outcome = "connected".into();
            report.certainty = "confirmed".into();
            report.endpoint = Some(route.endpoint.clone());
            let mut routes = self.routes.lock().unwrap();
            if routes.len() >= 128 {
                routes.clear();
            }
            routes.insert(key.clone(), route);
            self.failures.lock().unwrap().remove(&key);
        } else if report.outcome == "unreachable" {
            let mut failures = self.failures.lock().unwrap();
            if failures.len() >= 128 {
                failures.clear();
            }
            failures.insert(key, (Instant::now(), initial_network));
        }
        report.duration_ms = started.elapsed().as_millis() as u64;
        drop(guard);
        self.record(report.clone());
        report
    }
    async fn resolve(
        &self,
        group: &str,
        peer: &str,
        key: &str,
        manual: Option<String>,
        initial: &[String],
        budget: &mut Budget,
        r: &mut Report,
    ) -> Option<Route> {
        let server = match member(&self.groups, group, peer) {
            Ok(v) => v,
            Err(_) => {
                r.outcome = "authorization_revoked".into();
                r.certainty = "confirmed".into();
                r.step(
                    "authorization",
                    None,
                    "failed",
                    "authorization_revoked",
                    Instant::now(),
                );
                return None;
            }
        };
        if self
            .failures
            .lock()
            .unwrap()
            .get(key)
            .is_some_and(|(time, n)| time.elapsed() < COOLDOWN && n == initial)
        {
            r.outcome = "cooldown".into();
            r.step("budget", None, "skipped", "cooldown", Instant::now());
            return None;
        }
        let cached = self.routes.lock().unwrap().get(key).cloned();
        let mut candidates = VecDeque::new();
        if let Some(url) = manual {
            if (Server {
                fingerprint: server.fingerprint.clone(),
                endpoints: vec![url.clone()],
            })
            .validate()
            .is_err()
            {
                r.outcome = "invalid_endpoint".into();
                r.certainty = "confirmed".into();
                r.step("manual", None, "failed", "invalid_endpoint", Instant::now());
                return None;
            }
            candidates.push_back(("manual", url.trim_end_matches('/').into()));
        }
        if let Some(route) = &cached {
            candidates.push_back(("last_success", route.endpoint.clone()));
        }
        let mut signed = server.endpoints.clone();
        signed.sort_by_key(|url| endpoint_rank(url, initial));
        candidates.extend(signed.into_iter().map(|v| ("known_address", v)));
        let mut discovered = false;
        let mut peers_queried = false;
        let mut current_network = initial.to_vec();
        let mut network_waited = false;
        loop {
            // Reserve space/time for discovery instead of spending the entire
            // budget knocking on up to sixteen obsolete addresses.
            if !peers_queried && (budget.attempts >= 3 || candidates.is_empty()) {
                peers_queried = true;
                let online = self
                    .routes
                    .lock()
                    .unwrap()
                    .iter()
                    .filter(|(k, v)| {
                        k.starts_with(&format!("{group}:"))
                            && k.as_str() != key
                            && v.verified.elapsed() < Duration::from_secs(300)
                            && v.network == initial
                    })
                    .take(2)
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect::<Vec<_>>();
                if online.is_empty() {
                    r.step(
                        "trusted_peers",
                        None,
                        "skipped",
                        "no_online_peer",
                        Instant::now(),
                    );
                }
                for (other_key, route) in online {
                    if budget.remaining().is_zero() || budget.attempts >= MAX_ATTEMPTS {
                        break;
                    }
                    let start = Instant::now();
                    let other = other_key.split(':').nth(1).unwrap_or("");
                    if member(&self.groups, group, other).is_err() {
                        continue;
                    }
                    budget.attempts += 1;
                    match tokio::time::timeout(
                        budget.remaining().min(Duration::from_secs(1)),
                        reply(
                            route
                                .client
                                .get(format!("{}/api/v1/groups/state", route.endpoint))
                                .basic_auth(&route.username, Some(&route.password)),
                        ),
                    )
                    .await
                    {
                        Ok(Ok(v)) => {
                            let merged = serde_json::from_value::<Packet>(v)
                                .ok()
                                .is_some_and(|p| self.groups.merge(group, &p).is_ok());
                            r.step(
                                "trusted_peers",
                                Some(&route.endpoint),
                                if merged { "succeeded" } else { "failed" },
                                if merged {
                                    "signed_packet_received"
                                } else {
                                    "invalid_identity_proof"
                                },
                                start,
                            );
                            if let Ok(s) = member(&self.groups, group, peer) {
                                for url in s.endpoints {
                                    if !budget.seen.contains(&url) {
                                        candidates.push_front(("trusted_peers", url));
                                    }
                                }
                            }
                        }
                        _ => r.step(
                            "trusted_peers",
                            Some(&route.endpoint),
                            "failed",
                            "peer_unresponsive",
                            start,
                        ),
                    }
                }
            }
            if !discovered && (budget.attempts >= 3 || candidates.is_empty()) {
                discovered = true;
                let start = Instant::now();
                if budget.remaining() > Duration::from_millis(100) && budget.attempts < MAX_ATTEMPTS
                {
                    let fp = server.fingerprint.clone();
                    let duration = budget.remaining().min(Duration::from_secs(2));
                    match tokio::task::spawn_blocking(move || crate::discovery::find(&fp, duration))
                        .await
                    {
                        Ok(Ok(found)) => {
                            r.step(
                                "mdns",
                                None,
                                if found.is_empty() {
                                    "inconclusive"
                                } else {
                                    "succeeded"
                                },
                                if found.is_empty() {
                                    "no_matching_announcement"
                                } else {
                                    "untrusted_hints_received"
                                },
                                start,
                            );
                            for url in found.into_iter().rev() {
                                candidates.push_front(("mdns", url));
                            }
                        }
                        _ => r.step("mdns", None, "failed", "discovery_unavailable", start),
                    }
                } else {
                    r.step("mdns", None, "skipped", "budget_exhausted", start);
                }
            }
            let Some((method, url)) = candidates.pop_front() else {
                break;
            };
            if !budget.admit(&url) {
                r.step(
                    method,
                    Some(&url),
                    "skipped",
                    if budget.seen.contains(&url) {
                        "duplicate"
                    } else {
                        "budget_exhausted"
                    },
                    Instant::now(),
                );
                if budget.remaining().is_zero() || budget.attempts >= MAX_ATTEMPTS {
                    break;
                }
                continue;
            }
            let start = Instant::now();
            let outcome = tokio::time::timeout(
                budget.remaining().min(Duration::from_secs(3)),
                self.handshake(group, peer, &server, &url, r),
            )
            .await
            .unwrap_or_else(|_| Err("timeout".into()));
            if network() != current_network {
                r.step(
                    method,
                    Some(&url),
                    "cancelled",
                    "local_network_changed",
                    start,
                );
                if !network_waited && budget.remaining() > Duration::from_millis(300) {
                    network_waited = true;
                    r.step(
                        "network",
                        None,
                        "waiting",
                        "waiting_network",
                        Instant::now(),
                    );
                    tokio::time::sleep(Duration::from_millis(250)).await;
                    current_network = network();
                    // Same URL on a new link is a different route attempt; the
                    // attempt counter and total deadline are NOT reset.
                    budget.seen.clear();
                    candidates.push_front((method, url));
                    continue;
                }
                r.outcome = "network_changed".into();
                r.certainty = "confirmed".into();
                break;
            }
            match outcome {
                Ok(route) => {
                    let changed = cached.as_ref().is_some_and(|c| c.endpoint != url)
                        || !server.endpoints.contains(&url);
                    r.step(
                        method,
                        Some(&url),
                        "succeeded",
                        if changed {
                            "address_changed_verified"
                        } else {
                            "identity_verified"
                        },
                        start,
                    );
                    for skipped in ["trusted_peers", "mdns", "udp", "manual_help"] {
                        if !r.steps.iter().any(|s| s.method == skipped) {
                            r.step(
                                skipped,
                                None,
                                "skipped",
                                "already_connected",
                                Instant::now(),
                            );
                        }
                    }
                    return Some(route);
                }
                Err(code) => {
                    r.step(method, Some(&url), "failed", &code, start);
                    if terminal(&code) {
                        r.outcome = "authorization_rejected".into();
                        r.certainty = "confirmed".into();
                        return None;
                    }
                }
            }
        }
        r.step("udp", None, "skipped", "not_enabled", Instant::now());
        r.step(
            "manual_help",
            None,
            "available",
            "enter_private_address_or_exchange_group_data",
            Instant::now(),
        );
        None
    }
}
fn endpoint_rank(url: &str, local: &[String]) -> u8 {
    let address = url
        .strip_prefix("https://")
        .and_then(|s| s.parse::<std::net::SocketAddr>().ok())
        .map(|a| a.ip());
    match address {
        Some(std::net::IpAddr::V4(ip)) if ip.is_loopback() => 3,
        Some(std::net::IpAddr::V4(ip))
            if if_addrs::get_if_addrs()
                .unwrap_or_default()
                .iter()
                .any(|a| match &a.addr {
                    if_addrs::IfAddr::V4(v) if !v.ip.is_loopback() => {
                        (u32::from(v.ip) & u32::from(v.netmask))
                            == (u32::from(ip) & u32::from(v.netmask))
                    }
                    _ => false,
                }) =>
        {
            0
        }
        Some(std::net::IpAddr::V4(ip))
            if ip.octets()[0] == 100 && (64..=127).contains(&ip.octets()[1]) =>
        {
            if local.iter().any(|s| s.contains("ip: 100.")) {
                1
            } else {
                3
            }
        }
        _ => 2,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn budget_deduplicates_and_stops_after_six_attempts() {
        let mut b = Budget::default();
        assert!(b.admit("https://192.168.1.1:1"));
        assert!(!b.admit("https://192.168.1.1:1/"));
        for i in 2..=6 {
            assert!(b.admit(&format!("https://192.168.1.{i}:1")));
        }
        assert!(!b.admit("https://192.168.1.7:1"));
    }
    #[test]
    fn expired_budget_is_not_renewed_by_a_new_address() {
        let mut b = Budget::default();
        b.start = Instant::now() - TOTAL;
        assert!(!b.admit("https://192.168.1.2:1"));
    }
    #[test]
    fn authorization_failures_never_trigger_alternate_routes() {
        assert!(terminal("http_403"));
        assert!(terminal("http_401"));
        assert!(!terminal("timeout"));
        assert!(!terminal("identity_mismatch"));
    }
    #[test]
    fn diagnostics_are_bounded_and_do_not_serialize_credentials() {
        let mut r = Report {
            group: "g".into(),
            peer: "p".into(),
            trigger: "open".into(),
            started_at: 0,
            duration_ms: 0,
            outcome: "unreachable".into(),
            certainty: "unknown".into(),
            endpoint: None,
            steps: vec![],
        };
        for _ in 0..100 {
            r.step(
                "mdns",
                None,
                "inconclusive",
                "no_matching_announcement",
                Instant::now(),
            );
        }
        assert_eq!(r.steps.len(), 40);
        assert!(!serde_json::to_string(&r).unwrap().contains("password"));
    }
}
