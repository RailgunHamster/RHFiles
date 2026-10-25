//! A one-use group introduction, never a separate file-access credential.
use crate::{
    groups::{Groups, Signed},
    model::*,
};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};
#[derive(Default)]
pub(crate) struct Invitations(Mutex<HashMap<String, (Instant, String, bool, std::sync::Arc<()>)>>);
impl Invitations {
    pub fn clear(&self) {
        self.0.lock().unwrap().clear();
    }
    pub fn create(&self, groups: &Groups, group: &str, can_invite: bool) -> Result<(String, u64)> {
        groups.require_inviter(group)?;
        let mut all = self.0.lock().unwrap();
        all.retain(|_, v| v.0 > Instant::now());
        if all.len() >= 32 {
            return Err(Error::new("busy", "有效邀请过多，请稍后再试"));
        }
        let token = random()?;
        let epoch=groups.session_access(group,&groups.device_id(),false,None)?.1;
        all.insert(
            token.clone(),
            (
                Instant::now() + Duration::from_secs(120),
                group.into(),
                can_invite,
                epoch,
            ),
        );
        Ok((token, now_ms() + 120_000))
    }
    pub fn redeem(
        &self,
        groups: &Groups,
        token: &str,
        request: &Signed,
    ) -> Result<crate::groups::Packet> {
        let mut all = self.0.lock().unwrap();
        all.retain(|_, v| v.0 > Instant::now());
        let (_, group, invite, epoch) = all.get(token).ok_or_else(|| {
            Error::new("unauthorized", "设备组邀请已使用或过期，请在电脑重新生成")
        })?;
        groups.session_access(group,&groups.device_id(),false,Some(epoch))?;
        let packet = groups.approve(group, request, *invite)?;
        all.remove(token);
        Ok(packet)
    }
}
