//! Discovery advertises public identity only. It never grants trust or includes
//! pairing codes, credentials, share names, or local filesystem paths.
use mdns_sd::{IfKind, ServiceDaemon, ServiceInfo};
use std::{
    net::IpAddr,
    sync::atomic::{AtomicBool, Ordering},
};

pub const SERVICE_TYPE: &str = "_rhfiles._tcp.local.";

/// One short browse, never a persistent scanner. Records are untrusted hints;
/// the caller MUST pin TLS and verify the expected group's public key.
pub fn find(
    fingerprint: &str,
    duration: std::time::Duration,
) -> std::result::Result<Vec<String>, String> {
    let daemon = ServiceDaemon::new().map_err(|_| "mDNS unavailable".to_string())?;
    let result = (|| {
        daemon
            .disable_interface(IfKind::All)
            .map_err(|_| "mDNS interface selection failed".to_string())?;
        for ip in
            crate::private_interfaces().map_err(|_| "Local interfaces unavailable".to_string())?
        {
            daemon
                .enable_interface(IfKind::Addr(ip))
                .map_err(|_| "mDNS private interface unavailable".to_string())?;
        }
        let events = daemon
            .browse(SERVICE_TYPE)
            .map_err(|_| "mDNS browse failed".to_string())?;
        let end = std::time::Instant::now() + duration.min(std::time::Duration::from_secs(3));
        let mut found = Vec::new();
        while let Some(remaining) = end.checked_duration_since(std::time::Instant::now()) {
            match events.recv_timeout(remaining.min(std::time::Duration::from_millis(100))) {
                Ok(mdns_sd::ServiceEvent::ServiceResolved(info))
                    if info.get_property_val_str("fp") == Some(fingerprint) =>
                {
                    for ip in info.get_addresses() {
                        let ip = ip.to_ip_addr();
                        if ip.is_ipv4() && crate::network_scope::allowed(ip) && info.get_port() > 0
                        {
                            let url = format!(
                                "https://{}",
                                std::net::SocketAddr::new(ip, info.get_port())
                            );
                            if !found.contains(&url) && found.len() < 16 {
                                found.push(url);
                            }
                        }
                    }
                    if !found.is_empty() {
                        break;
                    }
                }
                _ => (),
            }
        }
        let _ = daemon.stop_browse(SERVICE_TYPE);
        Ok(found)
    })();
    let _ = daemon.shutdown();
    result
}

pub(crate) struct Advertisement {
    daemon: ServiceDaemon,
    fullname: String,
    stopped: AtomicBool,
}

pub(crate) fn info(
    addresses: &[IpAddr],
    port: u16,
    fingerprint: &str,
) -> mdns_sd::Result<ServiceInfo> {
    let name = crate::device_name::default_device_name();
    let label = name.chars().take(8).collect::<String>();
    let suffix = &fingerprint[..12];
    ServiceInfo::new(
        SERVICE_TYPE,
        &format!("RHFiles {label} {port}"),
        &format!("rhfiles-{suffix}-{port}.local."),
        addresses,
        port,
        &[("v", "1"), ("fp", fingerprint), ("name", name.as_str())][..],
    )
}

impl Advertisement {
    pub(crate) fn start(
        addresses: &[IpAddr],
        port: u16,
        fingerprint: &str,
    ) -> mdns_sd::Result<Self> {
        let service = info(addresses, port, fingerprint)?;
        let daemon = ServiceDaemon::new()?;
        // Only announce on the same explicit private IPv4 interfaces as HTTPS.
        let result = (|| {
            daemon.disable_interface(IfKind::All)?;
            for ip in addresses {
                daemon.enable_interface(IfKind::Addr(*ip))?;
            }
            daemon.register(service.clone())
        })();
        if let Err(error) = result {
            let _ = daemon.shutdown();
            return Err(error);
        }
        Ok(Self {
            daemon,
            fullname: service.get_fullname().to_string(),
            stopped: AtomicBool::new(false),
        })
    }
    pub(crate) fn stop(&self) {
        if !self.stopped.swap(true, Ordering::AcqRel) {
            let _ = self.daemon.unregister(&self.fullname);
            let _ = self.daemon.shutdown();
        }
    }
}
impl Drop for Advertisement {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn advertisement_contains_public_identity_only() {
        let fp = "a1".repeat(32);
        let value = info(&["192.168.1.2".parse().unwrap()], 39128, &fp).unwrap();
        assert_eq!(value.get_type(), SERVICE_TYPE);
        assert_eq!(value.get_port(), 39128);
        assert_eq!(value.get_property_val_str("v"), Some("1"));
        assert_eq!(value.get_property_val_str("fp"), Some(fp.as_str()));
        assert_eq!(
            value.get_property_val_str("name"),
            Some(crate::device_name::default_device_name().as_str())
        );
        assert_eq!(value.get_properties().len(), 3);
        assert!(value.get_hostname().ends_with(".local."));
    }
    #[test]
    #[ignore = "Requires a private LAN interface and multicast; run explicitly on release QA"]
    fn lan_advertisement_is_discoverable_and_withdrawn() {
        use mdns_sd::ServiceEvent;
        use std::time::{Duration, Instant};
        let ips: Vec<_> = if_addrs::get_if_addrs()
            .unwrap()
            .into_iter()
            .map(|a| a.ip())
            .filter(|ip| matches!(ip, IpAddr::V4(v) if v.is_private() && !v.is_loopback()))
            .collect();
        assert!(!ips.is_empty(), "A private LAN interface is required");
        let fp = "ba".repeat(32);
        let observer = ServiceDaemon::new().unwrap();
        let events = observer.browse(SERVICE_TYPE).unwrap();
        let advertisement = Advertisement::start(&ips, 49129, &fp).unwrap();
        let deadline = Instant::now() + Duration::from_secs(15);
        let name = loop {
            assert!(
                Instant::now() < deadline,
                "No multicast announcement received"
            );
            if let Ok(ServiceEvent::ServiceResolved(info)) =
                events.recv_timeout(Duration::from_millis(300))
            {
                if info.port == 49129 && info.get_property_val_str("fp") == Some(fp.as_str()) {
                    break info.fullname;
                }
            }
        };
        advertisement.stop();
        advertisement.stop(); // idempotent: stopping UI + dropping the owner.
        let deadline = Instant::now() + Duration::from_secs(8);
        loop {
            assert!(
                Instant::now() < deadline,
                "No multicast withdrawal received"
            );
            if let Ok(ServiceEvent::ServiceRemoved(_, removed)) =
                events.recv_timeout(Duration::from_millis(300))
            {
                if removed.eq_ignore_ascii_case(&name) {
                    break;
                }
            }
        }
        let _ = observer.shutdown();
    }
}
