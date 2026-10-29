//! Bounded, opt-in producer timestamps. Debug Windows builds only. Never
//! format VLC's va_list: URLs, credentials and decoded log arguments stay out.
use libloading::Library;
use serde_json::{json,Value};
use std::{ffi::{c_char,c_void},sync::{Mutex,LazyLock,OnceLock},time::{Duration,Instant}};

type Context=unsafe extern "C" fn(*const c_void,*mut *const c_char,*mut *const c_char,*mut u32);
// This module is Windows-only; Win64 va_list is a pointer. It is intentionally
// opaque and is never dereferenced, copied or passed to a different CRT.
type Callback=unsafe extern "C" fn(*mut c_void,i32,*const c_void,*const c_char,*mut c_void);
type Unset=unsafe extern "C" fn(*mut c_void);
const LIMIT:usize=96;
const WINDOW:Duration=Duration::from_secs(12);
#[derive(Clone,serde::Serialize)]
struct HostStage { at_ms:f64,elapsed_ms:f64,family:String,stage:String }
static HOST_ORIGIN:OnceLock<Instant>=OnceLock::new();
static HOST_STAGES:LazyLock<Mutex<Vec<HostStage>>>=LazyLock::new(||Mutex::new(Vec::new()));
fn owned()->bool{
    std::env::var("RHFILES_NATIVE_PLAYER_QA").as_deref()==Ok("1")&&
    std::env::var_os("RHFILES_TEST_PROFILE_ROOT").is_some()&&
    std::env::var("RHFILES_QA_READBACK_NONCE").is_ok_and(|v|v.len()==32&&v.bytes().all(|c|c.is_ascii_hexdigit()&&!c.is_ascii_uppercase()))
}
pub(crate) fn stage(family:&str,origin:Instant,stage:&str){
    if !(enabled()||(owned()&&std::env::var("RHFILES_PLAY_NATIVE_TRACE").as_deref()==Ok("1"))){return;}
    let now=Instant::now();let epoch=*HOST_ORIGIN.get_or_init(||origin);
    if let Ok(mut stages)=HOST_STAGES.lock(){if stages.len()<128{stages.push(HostStage{at_ms:now.saturating_duration_since(epoch).as_secs_f64()*1000.,elapsed_ms:now.saturating_duration_since(origin).as_secs_f64()*1000.,family:family.into(),stage:stage.into()});}}
}
pub(crate) fn host_snapshot()->Result<Value,String>{
    if !owned(){return Err("Owned startup trace is not enabled".into());}
    let stages=HOST_STAGES.lock().map_err(|_|"Owned startup trace unavailable")?;
    Ok(json!({"hostStages":*stages,"hostStageLimit":128}))
}
#[derive(Clone,serde::Serialize)]
struct Event { at_ms:f64,module:String,template:String }
struct State { origin:Instant,input:u64,events:Vec<Event>,dropped:usize }
impl State {
    fn new()->Self{Self{origin:Instant::now(),input:0,events:Vec::with_capacity(LIMIT),dropped:0}}
    fn reset(&mut self,input:u64,origin:Instant){self.input=input;self.origin=origin;self.events.clear();self.dropped=0;}
    fn push(&mut self,at:Instant,module:String,template:String){
        let elapsed=at.saturating_duration_since(self.origin);
        if elapsed>WINDOW{return;}
        if self.events.len()>=LIMIT{self.dropped+=1;return;}
        self.events.push(Event{at_ms:elapsed.as_secs_f64()*1000.,module,template});
    }
    fn snapshot(&self)->Value{
        let mut events=self.events.clone();let mut omitted=0;
        loop{
            let value=json!({"inputId":self.input,"clock":"producer-monotonic","scope":"instance-startup-templates","windowMs":WINDOW.as_millis(),"maxEvents":LIMIT,"dropped":self.dropped+omitted,"events":events});
            // Stay below the parent's 64 KiB line ceiling even if a module
            // supplies control characters which JSON expands sixfold.
            if serde_json::to_vec(&value).is_ok_and(|v|v.len()<=32_000)||events.is_empty(){return value;}
            events.pop();omitted+=1;
        }
    }
}
struct Trace { context:Context,state:Mutex<State> }
pub(crate) struct Binding { instance:usize,unset:Unset,trace:Box<Trace> }
pub(crate) fn enabled()->bool{
    std::env::var("RHFILES_VLC_NATIVE_TRACE").as_deref()==Ok("1")&&owned()
}
// Bound both pointer walking and allocations, even for an unexpectedly long
// diagnostic template. libVLC owns these nul-terminated strings for this call.
unsafe fn text(pointer:*const c_char,max:usize)->String{
    if pointer.is_null(){return String::new();}
    let mut bytes=Vec::with_capacity(max);
    for i in 0..max{let byte=unsafe{*pointer.add(i)} as u8;if byte==0{break;}bytes.push(byte);}
    String::from_utf8_lossy(&bytes).into_owned()
}
fn selected(module:&str,template:&str)->bool{
    if !matches!(module,"main"|"avcodec"|"direct3d11"|"d3d11va"|"directsound"|"faad"|"mp4"){return false;}
    // Only startup-stage templates, not request/header/path values, module
    // capability dumps or per-frame picture/display messages.
    ["creating audio output","looking for ","using ","allowing ","codec (",
     "Buffering ","Stream buffering done","Decoder wait done","Received first picture",
     "creating Vout ","Win32VoutCreateWindow","created video sub-window","Vout EventThread running",
     "Created the D3D11 device","Direct3D11 resources created","Direct3D11 device adapter",
     "Direct3D11 Open ","D3D11 pool ","Reusing Direct3D11 device","CreateDevice ",
     "DxCreateVideoDecoder","Using D3D11VA","Using DXVA2","Using pixel format",
     "Obtained IDirectXVideoDecoderService","Output max luminance","Detected size change",
     "first PCR","PCR reset","audio output is too slow","playback too late"]
     .iter().any(|prefix|template.starts_with(prefix))
}
unsafe extern "C" fn callback(data:*mut c_void,_level:i32,ctx:*const c_void,format:*const c_char,_args:*mut c_void){
    if data.is_null()||ctx.is_null(){return;}
    let at=Instant::now();
    let trace=unsafe{&*data.cast::<Trace>()};
    let mut module=std::ptr::null();
    unsafe{(trace.context)(ctx,&mut module,std::ptr::null_mut(),std::ptr::null_mut());}
    let module=unsafe{text(module,24)};let template=unsafe{text(format,160)};
    if !selected(&module,&template){return;}
    if let Ok(mut state)=trace.state.lock(){state.push(at,module,template);}
}
impl Binding {
    pub(crate) unsafe fn install(library:&Library,instance:usize)->Result<Option<Self>,String>{
        if !enabled(){return Ok(None);}
        let (set,unset,context)=unsafe{
            (*library.get::<unsafe extern "C" fn(*mut c_void,Callback,*mut c_void)>(b"libvlc_log_set\0").map_err(|_|"VLC QA log_set unavailable")?,
             *library.get::<Unset>(b"libvlc_log_unset\0").map_err(|_|"VLC QA log_unset unavailable")?,
             *library.get::<Context>(b"libvlc_log_get_context\0").map_err(|_|"VLC QA log context unavailable")?)
        };
        let mut result=Self{instance,unset,trace:Box::new(Trace{context,state:Mutex::new(State::new())})};
        unsafe{set(instance as *mut c_void,callback,(&mut *result.trace as *mut Trace).cast());}
        Ok(Some(result))
    }
    pub(crate) fn reset(&self,input:u64,origin:Instant){if let Ok(mut state)=self.trace.state.lock(){state.reset(input,origin);}}
    pub(crate) fn snapshot(&self)->Result<Value,String>{
        let state=self.trace.state.lock().map_err(|_|"VLC startup trace unavailable")?;
        Ok(state.snapshot())
    }
}
impl Drop for Binding {
    fn drop(&mut self){
        // VLC waits for in-flight callbacks here. Never hold Trace::state or
        // call back into the player while removing the handler.
        unsafe{(self.unset)(self.instance as *mut c_void);}
    }
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn startup_trace_is_bounded_and_clears_on_new_input(){
        let mut state=State::new();let origin=state.origin;
        for _ in 0..LIMIT+3{state.push(origin,"direct3d11".into(),"Direct3D11 Open Succeeded".into());}
        assert_eq!(state.events.len(),LIMIT);assert_eq!(state.dropped,3);
        state.reset(9,origin);state.push(origin+WINDOW+Duration::from_millis(1),"main".into(),"late".into());
        assert_eq!(state.input,9);assert!(state.events.is_empty());assert_eq!(state.dropped,0);
    }
    #[test]fn startup_trace_excludes_headers_urls_capability_and_frame_dumps(){
        for(module,template)in[("http","using proxy %s"),("main","http://private/%s"),("main","incoming request %s"),("d3d11va","- '%s' is supported"),("direct3d11","picture displayed %p")]{assert!(!selected(module,template));}
        for(module,template)in[("direct3d11","D3D11 pool succeed with %d surfaces (%dx%d) context %p"),("main","Stream buffering done (%d ms in %lld ms)"),("avcodec","using frame thread mode with %d threads")]{assert!(selected(module,template));}
    }
    #[test]fn startup_trace_copies_only_bounded_callback_text(){
        let text_value=std::ffi::CString::new("画面🙂-more").unwrap();
        assert_eq!(unsafe{text(text_value.as_ptr(),1024)},"画面🙂-more");
        assert!(unsafe{text(text_value.as_ptr(),4)}.len()<=6);
        assert_eq!(unsafe{text(std::ptr::null(),32)},"");
    }
    #[test]fn startup_trace_reply_stays_under_the_transport_limit(){
        let mut state=State::new();let at=state.origin;
        for _ in 0..LIMIT{state.push(at,"\u{1}".repeat(24),"\u{2}".repeat(160));}
        let value=state.snapshot();assert!(serde_json::to_vec(&value).unwrap().len()<=32_000);
        assert!(value["events"].as_array().unwrap().len()<LIMIT);assert!(value["dropped"].as_u64().unwrap()>0);
    }
}
