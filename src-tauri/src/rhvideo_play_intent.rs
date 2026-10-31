//! Closing a player fences work submitted before that close, including work
//! still waiting for PLAY_LOCK. A subsequent explicit open gets a fresh fence.
//! This is cancellation, not a replay/retry token and not decoder ownership.
use std::sync::{Arc, atomic::{AtomicU64, Ordering}};

const CLOSED: &str = "播放器准备已被关闭操作终止，未继续打开旧视频";
#[derive(Default)]
pub(crate) struct Epoch(Arc<AtomicU64>);
#[derive(Clone)]
pub(crate) struct Preparation { epoch: Arc<AtomicU64>, revision: u64 }
impl Epoch {
    pub(crate) fn capture(&self) -> Preparation {
        Preparation { epoch: self.0.clone(), revision: self.0.load(Ordering::SeqCst) }
    }
    pub(crate) fn cancel(&self) {
        self.0.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |v| v.checked_add(1))
            .expect("Playback cancellation identity exhausted");
    }
}
impl Preparation {
    pub(crate) fn ensure_current(&self) -> Result<(), String> {
        if self.epoch.load(Ordering::SeqCst) == self.revision { Ok(()) } else { Err(CLOSED.into()) }
    }
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn close_retires_every_prior_queued_open_but_not_a_new_explicit_open() {
        let epoch=Epoch::default();let first=epoch.capture();let queued=epoch.capture();
        epoch.cancel();assert_eq!(first.ensure_current().unwrap_err(),CLOSED);
        assert!(queued.ensure_current().is_err());let new=epoch.capture();
        assert!(new.ensure_current().is_ok());assert!(first.ensure_current().is_err());
    }
    #[test] fn repeated_closes_do_not_revive_an_old_preparation() {
        let epoch=Epoch::default();let first=epoch.capture();epoch.cancel();
        let middle=epoch.capture();epoch.cancel();let last=epoch.capture();
        assert!(first.ensure_current().is_err());assert!(middle.ensure_current().is_err());
        assert!(last.ensure_current().is_ok());
    }
    #[test] fn accounts_do_not_cancel_one_another() {
        let one=Epoch::default();let two=Epoch::default();let other=two.capture();
        one.cancel();assert!(other.ensure_current().is_ok());
        two.cancel();assert!(other.ensure_current().is_err());
    }
    #[test] fn cancellation_is_seen_after_a_blocking_constructor_before_it_can_start_media() {
        use std::sync::{Barrier, atomic::AtomicBool};
        let epoch=Epoch::default();let ticket=epoch.capture();
        let entered=Arc::new(Barrier::new(2));let resume=Arc::new(Barrier::new(2));
        let started=Arc::new(AtomicBool::new(false));
        let job={let entered=entered.clone();let resume=resume.clone();let started=started.clone();
            std::thread::spawn(move||{ticket.ensure_current()?;entered.wait();resume.wait();
                ticket.ensure_current()?;started.store(true,Ordering::SeqCst);Ok::<_,String>(())})};
        entered.wait();epoch.cancel();resume.wait();
        assert_eq!(job.join().unwrap().unwrap_err(),CLOSED);assert!(!started.load(Ordering::SeqCst));
        assert!(epoch.capture().ensure_current().is_ok());
    }
    #[test] fn identity_never_wraps_into_an_old_request() {
        let epoch=Epoch(Arc::new(AtomicU64::new(u64::MAX)));let ticket=epoch.capture();
        assert!(std::panic::catch_unwind(||epoch.cancel()).is_err());
        assert_eq!(epoch.0.load(Ordering::SeqCst),u64::MAX);assert!(ticket.ensure_current().is_ok());
    }
}
