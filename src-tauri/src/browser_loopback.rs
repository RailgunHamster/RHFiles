//! WebView/Fetch refuses a small set of ports even on localhost. Some Windows
//! installations allocate those as ephemeral ports; never disable browser
//! security or change the host's dynamic-port range to accommodate a broker.
//! Reference: Chromium net/base/port_util.cc, kRestrictedPorts (2026-10-27).
use std::{io,net::{Ipv4Addr,SocketAddr}};
fn usable(port:u16)->bool{
    port>=1024&&!matches!(port,1719|1720|1723|2049|3659|4045|5060|5061|6000|6566|6665..=6669|6697|10080)
}
pub async fn bind()->io::Result<tokio::net::TcpListener>{
    for _ in 0..16{
        let listener=tokio::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST,0))).await?;
        if usable(listener.local_addr()?.port()){return Ok(listener);}
        // Dropping this unexposed local listener releases it immediately.
    }
    Err(io::Error::new(io::ErrorKind::AddrNotAvailable,"No browser-compatible loopback port in the allocation budget"))
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn excludes_fetch_restricted_ports_without_excluding_ordinary_ports(){
        for port in [0,1,80,443,1023,1719,1720,1723,2049,3659,4045,5060,5061,6000,6566,6665,6666,6667,6668,6669,6697,10080]{assert!(!usable(port),"{port}");}
        for port in [1024,1718,1721,1722,1724,2050,3660,8080,9222,10081,39128,65535]{assert!(usable(port),"{port}");}
    }
    #[tokio::test]async fn allocates_only_a_browser_compatible_loopback_listener(){let listener=bind().await.unwrap();let address=listener.local_addr().unwrap();assert_eq!(address.ip(),Ipv4Addr::LOCALHOST);assert!(usable(address.port()));}
}
