// RHFiles compatibility guard for a caller that has already timed out.
// Copyright 2026 RHFiles contributors. MIT OR Apache-2.0.
use crossbeam_channel::{RecvTimeoutError, Sender};

pub(crate) fn send<T>(sender: Sender<T>, value: T) {
  let _ = sender.send(value);
}

pub(crate) fn version<E: From<RecvTimeoutError>>(
  reply: Result<Result<String, E>, RecvTimeoutError>,
) -> Result<String, E> {
  match reply {
    Ok(value) => value,
    Err(RecvTimeoutError::Timeout) => Ok(String::new()),
    Err(error) => Err(error.into()),
  }
}
