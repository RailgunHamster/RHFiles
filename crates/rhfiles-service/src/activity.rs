//! Admission and lifetime of real HTTP work, including streaming response
//! bodies and detached mutation receipts. Idle upload records are not work.
use crate::{Error, Result};
use std::{sync::{Arc, Mutex}, time::{Duration, Instant}};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

const CAPACITY: u32 = 64;
pub(crate) struct Activity {
    slots: Arc<Semaphore>,
    last_transfer: Arc<Mutex<Option<Instant>>>,
}
impl Default for Activity {
    fn default() -> Self { Self { slots:Arc::new(Semaphore::new(CAPACITY as usize)), last_transfer:Default::default() } }
}
pub(crate) struct RequestActivity {
    _slot: OwnedSemaphorePermit,
    last_transfer: Arc<Mutex<Option<Instant>>>,
    transfer: bool,
}
impl Drop for RequestActivity {
    fn drop(&mut self) {
        if self.transfer { *self.last_transfer.lock().unwrap()=Some(Instant::now()); }
    }
}
/// Local administrator only. Dropping on apply failure immediately admits work
/// again. A successful updater retains this reservation until process exit.
pub struct UpdateReservation { _slots: OwnedSemaphorePermit }

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct UpdateActivity { pub active_requests:usize, pub quiet_remaining_ms:u64 }
impl Activity {
    pub fn begin(&self, transfer:bool)->Result<Arc<RequestActivity>> {
        let slot=self.slots.clone().try_acquire_owned().map_err(|_|Error::new("busy","连接过多或服务正在更新，请稍后连接"))?;
        Ok(Arc::new(RequestActivity{_slot:slot,last_transfer:self.last_transfer.clone(),transfer}))
    }
    pub fn status(&self,quiet:Duration)->UpdateActivity {
        let remaining=self.last_transfer.lock().unwrap().map(|at|quiet.saturating_sub(at.elapsed())).unwrap_or_default();
        UpdateActivity {active_requests:CAPACITY as usize-self.slots.available_permits(),quiet_remaining_ms:remaining.as_millis().max(u128::from(!remaining.is_zero())).min(u64::MAX as u128) as u64}
    }
    pub fn reserve(&self,quiet:Duration)->Result<UpdateReservation> {
        // Taking every slot is atomic with request admission: a transfer can
        // never start between a successful idle check and updater handoff.
        let slots=self.slots.clone().try_acquire_many_owned(CAPACITY).map_err(|_|Error::new("update_deferred","文件服务器仍在处理请求，更新已延后"))?;
        if self.status(quiet).quiet_remaining_ms>0 { return Err(Error::new("update_deferred","等待文件服务器传输结束后的空闲时间")); }
        Ok(UpdateReservation{_slots:slots})
    }
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn streams_and_detached_clones_block_updates_until_the_last_owner_finishes(){
        let activity=Activity::default();let request=activity.begin(true).unwrap();let worker=request.clone();
        assert_eq!(activity.status(Duration::ZERO).active_requests,1);drop(request);
        assert!(activity.reserve(Duration::ZERO).is_err());drop(worker);
        assert_eq!(activity.status(Duration::ZERO).active_requests,0);
        assert!(activity.reserve(Duration::from_secs(30)).is_err());
        *activity.last_transfer.lock().unwrap()=Some(Instant::now()-Duration::from_secs(31));
        let update=activity.reserve(Duration::from_secs(30)).unwrap();assert!(activity.begin(true).is_err());
        drop(update);assert!(activity.begin(true).is_ok());
    }
    #[test] fn metadata_does_not_extend_transfer_quiet_time(){
        let activity=Activity::default();drop(activity.begin(false).unwrap());
        assert!(activity.reserve(Duration::from_secs(30)).is_ok());
    }
}
