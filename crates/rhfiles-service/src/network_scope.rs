//! Address scope is a transport boundary, never a replacement for device auth.
use std::net::IpAddr;

pub(crate) fn allowed(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let b = ip.octets();
            ip.is_loopback()
                || ip.is_private()
                || ip.is_link_local()
                || (b[0] == 100 && (64..=127).contains(&b[1]))
        }
        IpAddr::V6(ip) => match ip.to_ipv4_mapped() {
            Some(v4) => allowed(IpAddr::V4(v4)),
            None => ip.is_loopback() || ip.is_unique_local() || ip.is_unicast_link_local(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn localhost_lan_and_tailnet_only_including_exact_cgnat_boundaries() {
        for address in [
            "127.0.0.1",
            "127.255.255.254",
            "10.0.0.1",
            "172.16.0.1",
            "172.31.255.254",
            "192.168.0.1",
            "169.254.1.2",
            "100.64.0.0",
            "100.127.255.255",
            "::1",
            "fd7a:115c:a1e0::1",
            "fe80::1",
            "::ffff:100.64.0.1",
        ] {
            assert!(allowed(address.parse().unwrap()), "{address}");
        }
        for address in [
            "8.8.8.8",
            "1.1.1.1",
            "100.63.255.255",
            "100.128.0.0",
            "172.15.255.255",
            "172.32.0.0",
            "192.169.0.1",
            "0.0.0.0",
            "224.0.0.1",
            "255.255.255.255",
            "::",
            "2001:4860:4860::8888",
            "::ffff:8.8.8.8",
        ] {
            assert!(!allowed(address.parse().unwrap()), "{address}");
        }
    }
}
