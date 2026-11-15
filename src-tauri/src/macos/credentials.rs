//! Passwords and host-key pins remain encrypted outside the sync document.
use base64::{Engine, engine::general_purpose::STANDARD};
use ring::aead::{AES_256_GCM, Aad, LessSafeKey, NONCE_LEN, Nonce, UnboundKey};
use sha2::{Digest, Sha256};

const VERSION: u8 = 1;
const INVALID_RECORD: &str = "本机凭据无效或已损坏 / Invalid or damaged local credential record";

pub(crate) fn crypt(bytes: &[u8], scope: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    let account = format!("{:x}", Sha256::digest(scope));
    let key = rhfiles_core::macos::request(serde_json::json!({
        "action": "credential-key",
        "account": account,
        "create": encrypt,
    }))
    .map_err(|error| format!("无法访问 macOS 钥匙串 / Cannot access macOS Keychain ({error})"))?;
    let key = STANDARD
        .decode(key.as_str().ok_or(INVALID_RECORD)?)
        .map_err(|_| INVALID_RECORD)?;
    if encrypt {
        seal(bytes, scope, &key)
    } else {
        open(bytes, scope, &key)
    }
}

fn cipher(key: &[u8]) -> Result<LessSafeKey, String> {
    UnboundKey::new(&AES_256_GCM, key)
        .map(LessSafeKey::new)
        .map_err(|_| INVALID_RECORD.into())
}

fn seal(bytes: &[u8], scope: &[u8], key: &[u8]) -> Result<Vec<u8>, String> {
    let mut nonce = [0; NONCE_LEN];
    getrandom::fill(&mut nonce).map_err(|_| "Cannot generate local credential nonce")?;
    let mut data = bytes.to_vec();
    cipher(key)?
        .seal_in_place_append_tag(Nonce::assume_unique_for_key(nonce), Aad::from(scope), &mut data)
        .map_err(|_| INVALID_RECORD)?;
    let mut record = Vec::with_capacity(1 + NONCE_LEN + data.len());
    record.push(VERSION);
    record.extend_from_slice(&nonce);
    record.extend_from_slice(&data);
    Ok(record)
}

fn open(record: &[u8], scope: &[u8], key: &[u8]) -> Result<Vec<u8>, String> {
    if record.first() != Some(&VERSION) || record.len() < 1 + NONCE_LEN + AES_256_GCM.tag_len() {
        return Err(INVALID_RECORD.into());
    }
    let nonce = Nonce::try_assume_unique_for_key(&record[1..1 + NONCE_LEN])
        .map_err(|_| INVALID_RECORD)?;
    let mut data = record[1 + NONCE_LEN..].to_vec();
    let plain = cipher(key)?
        .open_in_place(nonce, Aad::from(scope), &mut data)
        .map_err(|_| INVALID_RECORD)?;
    Ok(plain.to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_record_rejects_profile_swaps_and_modification() {
        let key = [5; 32];
        let mut record = seal(b"fixture password", b"profile a", &key).unwrap();
        assert_eq!(open(&record, b"profile a", &key).unwrap(), b"fixture password");
        assert_ne!(seal(b"fixture password", b"profile a", &key).unwrap(), record);
        assert!(open(&record, b"profile b", &key).is_err());
        assert!(open(&record, b"profile a", &[6; 32]).is_err());
        *record.last_mut().unwrap() ^= 1;
        assert!(open(&record, b"profile a", &key).is_err());
        assert!(open(&[VERSION], b"profile a", &key).is_err());
    }
}
