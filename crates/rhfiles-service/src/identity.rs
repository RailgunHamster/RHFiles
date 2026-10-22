use crate::model::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{path::Path, sync::Arc};
#[derive(Serialize, Deserialize)]
struct Identity {
    certificate: Vec<u8>,
    key: Vec<u8>,
}
pub fn load(directory: &Path) -> Result<(String, Arc<rustls::ServerConfig>)> {
    let path = directory.join("identity.json");
    let identity = if path.exists() {
        let b = std::fs::read(&path)?;
        if b.len() > 32768 {
            return Err(Error::new("invalid_config", "设备证书文件过大"));
        }
        serde_json::from_slice::<Identity>(&b).map_err(|_| {
            Error::new(
                "invalid_config",
                "设备证书损坏；不会自动换成不受信任的新证书",
            )
        })?
    } else {
        let mut names = vec![
            "rhfiles.local".into(),
            "localhost".into(),
            "127.0.0.1".into(),
        ];
        names.extend(
            if_addrs::get_if_addrs()?
                .into_iter()
                .map(|a| a.ip().to_string()),
        );
        names.sort();
        names.dedup();
        let cert = rcgen::generate_simple_self_signed(names)
            .map_err(|_| Error::new("tls", "无法生成设备证书"))?;
        let identity = Identity {
            certificate: cert.cert.der().to_vec(),
            key: cert.signing_key.serialize_der(),
        };
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        use std::io::Write;
        let mut f = options.open(&path)?;
        f.write_all(
            &serde_json::to_vec(&identity).map_err(|_| Error::new("tls", "无法保存证书"))?,
        )?;
        f.sync_all()?;
        identity
    };
    let fingerprint = format!("{:x}", Sha256::digest(&identity.certificate));
    let mut config = rustls::ServerConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .map_err(|_| Error::new("tls", "TLS 配置不可用"))?
    .with_no_client_auth()
    .with_single_cert(
        vec![rustls::pki_types::CertificateDer::from(
            identity.certificate,
        )],
        rustls::pki_types::PrivatePkcs8KeyDer::from(identity.key).into(),
    )
    .map_err(|_| Error::new("tls", "设备证书无效"))?;
    config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
    Ok((fingerprint, Arc::new(config)))
}
/// Public certificate only. The private key is never returned by any IPC/API.
pub fn certificate(directory: &Path) -> Result<String> {
    use base64::Engine;
    let identity: Identity =
        serde_json::from_slice(&std::fs::read(directory.join("identity.json"))?)
            .map_err(|_| Error::new("tls", "设备证书损坏"))?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(identity.certificate);
    Ok(format!(
        "-----BEGIN CERTIFICATE-----\n{}\n-----END CERTIFICATE-----\n",
        encoded
            .as_bytes()
            .chunks(64)
            .map(|s| std::str::from_utf8(s).unwrap())
            .collect::<Vec<_>>()
            .join("\n")
    ))
}
