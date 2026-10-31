//! A window's cancellation survives asynchronous decoder construction. Closing
//! an older window cannot revoke a later window which reuses its Tauri label.
use std::sync::atomic::{AtomicU64, Ordering};

pub(crate) const CLOSED: &str = "播放器窗口已关闭，未继续准备旧视频";
pub(crate) struct WindowLifecycle(AtomicU64);
impl WindowLifecycle {
    pub(crate) const fn new() -> Self { Self(AtomicU64::new(0)) }
    pub(crate) fn begin(&self) -> u64 {
        let previous = self.0.fetch_update(Ordering::SeqCst, Ordering::SeqCst,
            |state| (state | 1).checked_add(1)).expect("Window identity exhausted");
        (previous | 1) + 1
    }
    pub(crate) fn current(&self) -> u64 { self.0.load(Ordering::SeqCst) & !1 }
    pub(crate) fn is_current(&self, lease: u64) -> bool { lease > 0 && lease & 1 == 0 && self.current() == lease }
    pub(crate) fn ensure_open(&self, lease: u64) -> Result<(), String> {
        if lease > 0 && lease & 1 == 0 && self.0.load(Ordering::SeqCst) == lease { Ok(()) } else { Err(CLOSED.into()) }
    }
    pub(crate) fn close(&self, lease: u64) -> bool {
        lease > 0 && lease & 1 == 0 && self.0.compare_exchange(lease, lease | 1, Ordering::SeqCst, Ordering::SeqCst).is_ok()
    }
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn close_invalidates_preparation_but_keeps_its_cleanup_identity() {
        let life=WindowLifecycle::new();assert!(life.ensure_open(0).is_err());let lease=life.begin();
        assert!(life.ensure_open(lease).is_ok());assert!(life.close(lease));assert!(!life.close(lease));
        assert_eq!(life.ensure_open(lease).unwrap_err(),CLOSED);assert!(life.is_current(lease));
    }
    #[test] fn an_old_destroy_event_cannot_cancel_or_retire_a_reopened_window() {
        let life=WindowLifecycle::new();let old=life.begin();life.close(old);let new=life.begin();
        assert!(new>old);assert!(!life.close(old));assert!(!life.is_current(old));assert!(life.is_current(new));
        assert!(life.ensure_open(old).is_err());assert!(life.ensure_open(new).is_ok());
        for invalid in [0,new|1,u64::MAX]{assert!(!life.close(invalid));assert!(!life.is_current(invalid));assert!(life.ensure_open(invalid).is_err());}
    }
    #[test] fn preparation_checks_the_same_lease_after_a_blocking_constructor_returns() {
        use std::sync::{Arc,Barrier,atomic::AtomicBool};
        let life=Arc::new(WindowLifecycle::new());let lease=life.begin();let entered=Arc::new(Barrier::new(2));let resume=Arc::new(Barrier::new(2));let started=Arc::new(AtomicBool::new(false));
        let job={let life=life.clone();let entered=entered.clone();let resume=resume.clone();let started=started.clone();std::thread::spawn(move||{life.ensure_open(lease)?;entered.wait();resume.wait();life.ensure_open(lease)?;started.store(true,Ordering::SeqCst);Ok::<_,String>(())})};
        entered.wait();assert!(life.close(lease));resume.wait();assert_eq!(job.join().unwrap().unwrap_err(),CLOSED);assert!(!started.load(Ordering::SeqCst));
    }
}
