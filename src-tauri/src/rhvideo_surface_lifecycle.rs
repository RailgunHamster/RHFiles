//! The receiver, not a racy IsWindow check on a worker, admits native cleanup.
//! HWND reuse must never give a retired surface ownership of a new surface.
use std::sync::atomic::{AtomicUsize, Ordering};

pub(super) struct Sequence(AtomicUsize);
impl Sequence {
    pub(super) const fn new() -> Self { Self(AtomicUsize::new(0)) }
    pub(super) fn next(&self) -> Result<usize, String> {
        self.0.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |id| id.checked_add(1))
            .map(|previous|previous+1).map_err(|_|"原生画布身份已耗尽".into())
    }
}
pub(super) fn admits(current: usize, requested: usize, own_process:usize, source_process:usize) -> bool {
    own_process!=0 && own_process==source_process && current != 0 && current == requested
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn old_cleanup_cannot_close_a_reused_handle() {
        let ids=Sequence::new();let old=ids.next().unwrap();let new=ids.next().unwrap();
        assert!(!admits(new,old,7,7));assert!(admits(new,new,7,7));assert!(!admits(0,old,7,7));
        assert!(!admits(0,0,7,7));assert!(!admits(new,0,7,7));
    }
    #[test] fn another_instance_cannot_close_the_same_generation_in_this_process(){
        assert!(!admits(1,1,7,8));assert!(!admits(1,1,0,0));assert!(!admits(1,1,7,0));assert!(admits(1,1,7,7));
    }
    #[test] fn exhausting_identity_fails_instead_of_wrapping_to_an_old_surface() {
        let ids=Sequence(AtomicUsize::new(usize::MAX-1));assert_eq!(ids.next().unwrap(),usize::MAX);
        assert!(ids.next().is_err());assert!(ids.next().is_err());assert_eq!(ids.0.load(Ordering::SeqCst),usize::MAX);
    }
    #[test] fn concurrent_constructors_receive_distinct_nonzero_identities() {
        let ids=std::sync::Arc::new(Sequence::new());
        let workers:Vec<_>=(0..4).map(|_|{let ids=ids.clone();std::thread::spawn(move||(0..100).map(|_|ids.next().unwrap()).collect::<Vec<_>>())}).collect();
        let values:std::collections::HashSet<_>=workers.into_iter().flat_map(|worker|worker.join().unwrap()).collect();
        assert_eq!(values.len(),400);assert!(!values.contains(&0));
    }
}
