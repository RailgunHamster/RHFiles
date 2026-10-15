use crate::{failure, Result};
use rustls::{
    client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier},
    pki_types::{CertificateDer, PrivatePkcs8KeyDer, ServerName, UnixTime},
    DigitallySignedStruct, SignatureScheme,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::Path,
    sync::{Arc, Mutex},
    time::Duration,
};
#[derive(Deserialize, Serialize)]
struct Identity {
    certificate: Vec<u8>,
    key: Vec<u8>,
}
pub(crate) fn fingerprint(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub(crate) fn identity(directory: &Path) -> Result<(String, Arc<rustls::ServerConfig>)> {
    fs::create_dir_all(directory).map_err(failure)?;
    let path = directory.join("identity.json");
    let identity: Identity = if path.exists() {
        let bytes = fs::read(&path).map_err(failure)?;
        if bytes.len() > 32 * 1024 {
            return Err("互传设备身份文件异常".into());
        }
        serde_json::from_slice(&bytes).map_err(failure)?
    } else {
        let generated =
            rcgen::generate_simple_self_signed(vec!["rhfiles.local".into()]).map_err(failure)?;
        let identity = Identity {
            certificate: generated.cert.der().to_vec(),
            key: generated.signing_key.serialize_der(),
        };
        let mut options = fs::OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&path).map_err(failure)?;
        file.write_all(&serde_json::to_vec(&identity).map_err(failure)?)
            .map_err(failure)?;
        file.sync_all().map_err(failure)?;
        identity
    };
    let id = fingerprint(&identity.certificate);
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = rustls::ServerConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(failure)?
        .with_no_client_auth()
        .with_single_cert(
            vec![CertificateDer::from(identity.certificate)],
            PrivatePkcs8KeyDer::from(identity.key).into(),
        )
        .map_err(failure)?;
    Ok((id, Arc::new(config)))
}
#[derive(Debug)]
struct Pin {
    expected: Option<String>,
    seen: Arc<Mutex<Option<String>>>,
}
impl ServerCertVerifier for Pin {
    fn verify_server_cert(
        &self,
        cert: &CertificateDer<'_>,
        _: &[CertificateDer<'_>],
        _: &ServerName<'_>,
        _: &[u8],
        _: UnixTime,
    ) -> std::result::Result<ServerCertVerified, rustls::Error> {
        let id = fingerprint(cert.as_ref());
        if self
            .expected
            .as_ref()
            .is_some_and(|expected| expected != &id)
        {
            return Err(rustls::Error::General("设备证书已变化；未发送文件".into()));
        }
        *self.seen.lock().unwrap() = Some(id);
        Ok(ServerCertVerified::assertion())
    }
    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> std::result::Result<HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls12_signature(
            message,
            cert,
            signature,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }
    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> std::result::Result<HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(
            message,
            cert,
            signature,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }
    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}
pub(crate) fn socket(address: SocketAddr) -> Result<TcpStream> {
    if !crate::lan_address(address.ip()) {
        return Err("互传仅连接局域网、链路本地或回环地址".into());
    }
    let socket = TcpStream::connect_timeout(&address, Duration::from_secs(5)).map_err(failure)?;
    socket.set_nodelay(true).map_err(failure)?;
    socket
        .set_read_timeout(Some(Duration::from_secs(10)))
        .map_err(failure)?;
    socket
        .set_write_timeout(Some(Duration::from_secs(10)))
        .map_err(failure)?;
    Ok(socket)
}
pub(crate) fn client(
    address: SocketAddr,
    pin: Option<String>,
) -> Result<(
    rustls::StreamOwned<rustls::ClientConnection, TcpStream>,
    String,
)> {
    let socket = socket(address)?;
    let seen = Arc::new(Mutex::new(None));
    let verifier = Arc::new(Pin {
        expected: pin,
        seen: seen.clone(),
    });
    let config = rustls::ClientConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .map_err(failure)?
    .dangerous()
    .with_custom_certificate_verifier(verifier)
    .with_no_client_auth();
    let connection = rustls::ClientConnection::new(
        Arc::new(config),
        ServerName::try_from("rhfiles.local").unwrap(),
    )
    .map_err(failure)?;
    let mut stream = rustls::StreamOwned::new(connection, socket);
    while stream.conn.is_handshaking() {
        stream.conn.complete_io(&mut stream.sock).map_err(failure)?;
    }
    let id = seen.lock().unwrap().clone().ok_or("对端未提供设备证书")?;
    Ok((stream, id))
}
pub(crate) fn write_json(output: &mut impl Write, value: &impl Serialize) -> Result<()> {
    let bytes = serde_json::to_vec(value).map_err(failure)?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err("互传消息过大".into());
    }
    output
        .write_all(&(bytes.len() as u32).to_be_bytes())
        .map_err(failure)?;
    output.write_all(&bytes).map_err(failure)?;
    output.flush().map_err(failure)
}
pub(crate) fn read_json<T: serde::de::DeserializeOwned>(input: &mut impl Read) -> Result<T> {
    let mut header = [0u8; 4];
    input.read_exact(&mut header).map_err(failure)?;
    let length = u32::from_be_bytes(header) as usize;
    if length == 0 || length > 4 * 1024 * 1024 {
        return Err("互传消息大小无效".into());
    }
    let mut bytes = vec![0; length];
    input.read_exact(&mut bytes).map_err(failure)?;
    serde_json::from_slice(&bytes).map_err(failure)
}
