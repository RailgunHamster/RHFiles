//! Redeem a one-use introduction, never a separate file-access credential.
use super::{MAX_ATTEMPTS, TOTAL, client};
use crate::{
    Permissions,
    groups::{Groups, Packet, Server, Signed, key_id},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD as B64};
use serde::Deserialize;
use std::{
    collections::HashSet,
    time::{Duration, Instant},
};

pub const INVITATION_PREFIX: &str = "rhfiles-group-invite:v1:";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Invitation {
    version: u32,
    group_id: String,
    device_id: String,
    endpoints: Vec<String>,
    fingerprint: String,
    token: String,
}
fn hex_id(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}
fn parse(uri: &str) -> Result<Invitation, String> {
    if uri.len() > 360_000 {
        return Err("设备组邀请过大".into());
    }
    let bytes = B64
        .decode(
            uri.trim()
                .strip_prefix(INVITATION_PREFIX)
                .ok_or("请粘贴设备组邀请文本")?,
        )
        .map_err(|_| "设备组邀请编码无效")?;
    let invitation: Invitation =
        serde_json::from_slice(&bytes).map_err(|_| "设备组邀请结构无效")?;
    if invitation.version != 1
        || !hex_id(&invitation.group_id)
        || !hex_id(&invitation.device_id)
        || invitation.token.len() != 43
        || B64
            .decode(&invitation.token)
            .map_or(true, |v| v.len() != 32)
    {
        return Err("设备组邀请版本或身份无效".into());
    }
    Server {
        endpoints: invitation.endpoints.clone(),
        fingerprint: invitation.fingerprint.clone(),
    }
    .validate()
    .map_err(|e| e.to_string())?;
    Ok(invitation)
}
fn validate_packet(
    invitation: &Invitation,
    request: &Signed,
    packet: &Packet,
) -> Result<(), String> {
    if packet.group_id().map_err(|e| e.to_string())? != invitation.group_id {
        return Err("批准信息不属于邀请中的设备组".into());
    }
    let requested = request.read().map_err(|e| e.to_string())?;
    let matched = packet.members.iter().any(|signed| {
        signed.read().is_ok_and(|c| {
            c.kind == "member"
                && c.group == invitation.group_id
                && c.key == requested.key
                && c.nonce == requested.nonce
                && key_id(&c.issuer) == invitation.device_id
        })
    });
    if !matched {
        return Err("批准信息与本机请求或邀请设备身份不符".into());
    }
    Ok(())
}

/// Only pre-send connection failures may try another address. A timeout or
/// interrupted response may already have consumed the invitation: never replay.
pub async fn join_invitation(
    groups: &Groups,
    uri: &str,
    device_name: &str,
    confirmed: bool,
    permissions: Permissions,
) -> Result<String, String> {
    if !confirmed {
        return Err("请在本机确认信任入组证明的来源".into());
    }
    let invitation = parse(uri)?;
    let client = client(&invitation.fingerprint)?;
    let request = groups.request(device_name).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + TOTAL;
    let mut seen = HashSet::new();
    for endpoint in invitation
        .endpoints
        .iter()
        .filter(|e| seen.insert(e.as_str()))
        .take(MAX_ATTEMPTS)
    {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break;
        }
        let result = client
            .post(format!("{endpoint}/api/v1/groups/invitations/redeem"))
            .timeout(remaining.min(Duration::from_secs(6)))
            .json(&serde_json::json!({"token":invitation.token,"request":request}))
            .send()
            .await;
        let mut response = match result {
            Ok(response) => response,
            Err(error) => {
                // TLS identity errors must be terminal, even if reqwest labels
                // them connection errors. Never expose a request/token in errors.
                if format!("{error:?}").contains("identity_mismatch") {
                    return Err("邀请地址的设备证书身份不符，未发送入组请求".into());
                }
                // reqwest's connect flag includes a TCP/TLS-connect timeout;
                // no HTTP body was sent in that stage. Do not strand a LAN
                // invitation behind a currently unreachable Tailscale address.
                if error.is_connect() {
                    continue;
                }
                if error.is_timeout() {
                    return Err(
                        "入组请求超时，结果未确认，未自动重发；请检查成员列表，需要时重新生成邀请"
                            .into(),
                    );
                }
                return Err(
                    "入组响应中断，结果未确认，未自动重发；请检查成员列表，需要时重新生成邀请"
                        .into(),
                );
            }
        };
        let status = response.status().as_u16();
        if status == 401 {
            return Err("设备组邀请已使用或过期，请在邀请设备重新生成".into());
        }
        if !response.status().is_success() {
            return Err(format!("邀请设备拒绝入组：HTTP {status}，未自动重发"));
        }
        let mut bytes = Vec::new();
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            let chunk = tokio::time::timeout(remaining, response.chunk())
                .await
                .map_err(|_| "入组响应超时，结果未确认，未自动重发")?
                .map_err(|_| "入组响应中断，结果未确认，未自动重发")?;
            let Some(chunk) = chunk else {
                break;
            };
            if bytes.len() + chunk.len() > 280_000 {
                return Err("入组响应超过安全上限".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let packet: Packet =
            serde_json::from_slice(&bytes).map_err(|_| "邀请设备返回的批准信息无效")?;
        validate_packet(&invitation, &request, &packet)?;
        // The normal join path validates the complete signature chain, pending
        // local request and local refusals. Incoming invitations cannot clear them.
        return groups.join(packet, permissions).map_err(|e| e.to_string());
    }
    Err("无法连接邀请设备，已达到地址或时间上限；请确认文件服务、局域网或 Tailscale 连接".into())
}

#[cfg(test)]
mod tests;
