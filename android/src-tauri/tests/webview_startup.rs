//! Uses the exact vendored reply helper, not a reimplementation of its policy.
#[path = "../../../vendor/wry-0.55.1/src/android/info_reply.rs"]
mod info_reply;
use crossbeam_channel::{bounded,RecvTimeoutError};
use std::time::Duration;

#[test]
fn a_late_informational_reply_does_not_panic_or_repeat_the_request() {
    let (tx,rx)=bounded(1);
    assert_eq!(rx.recv_timeout(Duration::from_millis(1)),Err(RecvTimeoutError::Timeout));
    drop(rx);
    info_reply::send(tx,String::from("late version"));
}
#[test]
fn successful_replies_are_unchanged_and_real_errors_still_fail() {
    let (tx,rx)=bounded(1);info_reply::send(tx,42);assert_eq!(rx.recv().unwrap(),42);
    assert_eq!(info_reply::version::<RecvTimeoutError>(Ok(Ok("113.0".into()))),Ok("113.0".into()));
    assert_eq!(info_reply::version::<RecvTimeoutError>(Ok(Err(RecvTimeoutError::Disconnected))),Err(RecvTimeoutError::Disconnected));
    assert_eq!(info_reply::version::<RecvTimeoutError>(Err(RecvTimeoutError::Disconnected)),Err(RecvTimeoutError::Disconnected));
}
#[test]
fn a_slow_version_query_is_unknown_not_a_missing_runtime() {
    assert_eq!(info_reply::version::<RecvTimeoutError>(Err(RecvTimeoutError::Timeout)),Ok(String::new()));
}
