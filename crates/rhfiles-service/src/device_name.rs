//! Local display metadata only. Never resolve a host or use a name as identity.
pub fn clean_device_name(value: &str) -> Option<String> {
    let mut name = String::new();
    for ch in value.trim().chars().filter(|ch| !ch.is_control()) {
        if name.len() + ch.len_utf8() > 120 {
            break;
        }
        name.push(ch);
    }
    let name = name.trim();
    (!name.is_empty()).then(|| name.to_owned())
}

pub fn default_device_name() -> String {
    #[cfg(windows)]
    if let Some(name) = std::env::var("COMPUTERNAME")
        .ok()
        .and_then(|v| clean_device_name(&v))
    {
        return name;
    }
    #[cfg(unix)]
    {
        let mut bytes = [0u8; 256];
        if unsafe { libc::gethostname(bytes.as_mut_ptr().cast(), bytes.len()) } == 0 {
            let end = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
            if let Some(name) = clean_device_name(&String::from_utf8_lossy(&bytes[..end])) {
                return name;
            }
        }
    }
    std::env::var("HOSTNAME")
        .ok()
        .and_then(|v| clean_device_name(&v))
        .unwrap_or_else(|| "Computer".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_names_are_bounded_without_splitting_unicode() {
        assert_eq!(clean_device_name("  我的\n电脑  ").as_deref(), Some("我的电脑"));
        assert_eq!(clean_device_name(" \r\n\0 "), None);
        for value in ["a".repeat(200), "中".repeat(100), "🖥️".repeat(100)] {
            let name = clean_device_name(&value).unwrap();
            assert!(name.len() <= 120);
            assert!(!name.chars().any(char::is_control));
        }
    }
}
