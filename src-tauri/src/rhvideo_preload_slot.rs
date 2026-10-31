//! A queued preload receives its identity before the async worker can run.
//! Callers hold one mutex for admission, status and ready-decoder ownership.
//! Resource values always leave the slot before the caller destroys them.
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub(crate) struct Ticket(u64);
pub(crate) struct Slot<T,S>{revision:u64,admitted:bool,ready:Option<(u64,T)>,status:Option<S>}
impl<T,S> Slot<T,S>{
    pub(crate) const fn new()->Self{Self{revision:0,admitted:false,ready:None,status:None}}
    fn advance(&mut self,status:S)->Ticket{
        self.revision=self.revision.checked_add(1).expect("Preload identity exhausted");
        self.status=Some(status);Ticket(self.revision)
    }
    pub(crate) fn reserve(&mut self,status:S)->Ticket{
        let ticket=self.advance(status);self.admitted=false;ticket
    }
    pub(crate) fn current(&self,ticket:Ticket)->bool{ticket.0>0&&ticket.0==self.revision}
    // None: stale/already-admitted task. Some(None): admitted, no old decoder.
    pub(crate) fn admit(&mut self,ticket:Ticket)->Option<Option<T>>{
        if !self.current(ticket)||self.admitted{return None;}
        self.admitted=true;Some(self.ready.take().map(|(_,resource)|resource))
    }
    pub(crate) fn publish(&mut self,ticket:Ticket,status:S)->bool{
        if !self.current(ticket){return false;}self.status=Some(status);true
    }
    pub(crate) fn store(&mut self,ticket:Ticket,resource:T,status:S)->Result<(),T>{
        if !self.current(ticket)||!self.admitted||self.ready.is_some(){return Err(resource);}
        self.ready=Some((ticket.0,resource));self.status=Some(status);Ok(())
    }
    // Retiring also fences workers which have not started, not just ready work.
    // A ready decoder invalidated by a newer queued request must not be reused.
    pub(crate) fn retire(&mut self,status:S)->(Ticket,Option<(T,bool)>){
        let old=self.revision;let ticket=self.advance(status);self.admitted=true;
        (ticket,self.ready.take().map(|(owner,resource)|(resource,owner==old)))
    }
    pub(crate) fn status(&self)->Option<&S>{self.status.as_ref()}
    pub(crate) fn resource(&self)->Option<&T>{self.ready.as_ref().map(|(_,resource)|resource)}
}

#[cfg(test)]mod tests{
    use super::*;
    #[test]fn queued_work_cannot_reidentify_itself_after_close(){
        let mut slot=Slot::<&str,&str>::new();let old=slot.reserve("waiting");slot.retire("idle");
        assert!(slot.admit(old).is_none());assert!(!slot.publish(old,"loading"));
        assert_eq!(slot.store(old,"decoder","ready"),Err("decoder"));assert_eq!(slot.status(),Some(&"idle"));
    }
    #[test]fn an_old_task_cannot_clear_or_publish_over_a_successor(){
        let mut slot=Slot::new();let old=slot.reserve("old");assert_eq!(slot.admit(old),Some(None));
        let new=slot.reserve("new");assert_eq!(slot.admit(new),Some(None));assert_eq!(slot.store(new,"new-decoder","ready"),Ok(()));
        assert!(!slot.publish(old,"failed"));assert_eq!(slot.store(old,"old-decoder","ready"),Err("old-decoder"));
        let (_,ready)=slot.retire("consumed");assert_eq!(ready,Some(("new-decoder",true)));
    }
    #[test]fn a_queued_replacement_does_not_hide_the_old_resource_from_close(){
        let mut slot=Slot::new();let first=slot.reserve("one");slot.admit(first);slot.store(first,"old-decoder","ready").unwrap();
        let second=slot.reserve("two");let (_,ready)=slot.retire("idle");
        assert_eq!(ready,Some(("old-decoder",false)));assert!(slot.admit(second).is_none());
    }
    #[test]fn an_admitted_replacement_returns_the_retired_resource_once(){
        let mut slot=Slot::new();let first=slot.reserve("one");slot.admit(first);slot.store(first,"retired","ready").unwrap();
        let second=slot.reserve("two");assert_eq!(slot.admit(second),Some(Some("retired")));assert!(slot.admit(second).is_none());
        assert_eq!(slot.store(second,"next","ready"),Ok(()));assert_eq!(slot.store(second,"duplicate","ready"),Err("duplicate"));
    }
    #[test]fn ready_work_requires_admission_and_consumption_is_single_use(){
        let mut slot=Slot::new();let ticket=slot.reserve("queued");assert_eq!(slot.store(ticket,7,"ready"),Err(7));
        slot.admit(ticket);slot.store(ticket,8,"ready").unwrap();let (_,ready)=slot.retire("consumed");assert_eq!(ready,Some((8,true)));
        assert!(slot.retire("idle").1.is_none());assert!(!slot.publish(ticket,"loading"));
    }
    #[test]fn close_during_a_constructor_does_not_accept_its_late_decoder(){
        use std::sync::{Arc,Mutex,Barrier};let slot=Arc::new(Mutex::new(Slot::new()));
        let ticket=slot.lock().unwrap().reserve("queued");let entered=Arc::new(Barrier::new(2));let resume=Arc::new(Barrier::new(2));
        let worker={let slot=slot.clone();let entered=entered.clone();let resume=resume.clone();std::thread::spawn(move||{
            assert!(slot.lock().unwrap().admit(ticket).is_some());entered.wait();resume.wait();slot.lock().unwrap().store(ticket,"late-decoder","ready")
        })};entered.wait();slot.lock().unwrap().retire("idle");resume.wait();assert_eq!(worker.join().unwrap(),Err("late-decoder"));
        assert_eq!(slot.lock().unwrap().status(),Some(&"idle"));
    }
    #[test]fn resource_destruction_belongs_to_the_caller_not_the_slot_mutex(){
        use std::sync::{Arc,atomic::{AtomicUsize,Ordering}};struct Resource(Arc<AtomicUsize>);impl Drop for Resource{fn drop(&mut self){self.0.fetch_add(1,Ordering::SeqCst);}}
        let drops=Arc::new(AtomicUsize::new(0));let mut slot=Slot::new();let ticket=slot.reserve("queued");slot.admit(ticket);
        assert!(slot.store(ticket,Resource(drops.clone()),"ready").is_ok());slot.reserve("replacement");assert_eq!(drops.load(Ordering::SeqCst),0);
        let (_,ready)=slot.retire("idle");assert_eq!(drops.load(Ordering::SeqCst),0);drop(ready);assert_eq!(drops.load(Ordering::SeqCst),1);
    }
    #[test]fn identity_never_wraps_to_an_old_request(){
        let mut slot=Slot::<(),&str>::new();slot.revision=u64::MAX;
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(||slot.reserve("queued"))).is_err());assert_eq!(slot.revision,u64::MAX);
    }
}
