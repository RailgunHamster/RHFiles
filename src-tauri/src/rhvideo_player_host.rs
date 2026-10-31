//! Logical host requests never accept a caller's HWND or arbitrary window label.
use serde_json::Value;
pub(crate) const MAX_JS_ID:u64=9_007_199_254_740_991;
// Lifetime of the actual canvas, not of its decoder. Rebuilding a decoder on
// an existing HWND must not certify that its old pixels have disappeared.
#[derive(Clone,Copy,Default)]
pub(crate) struct SurfaceHistory{used:bool,fresh_input:bool}
impl SurfaceHistory{
    pub(crate) fn begin_input(&mut self){self.fresh_input=!self.used;self.used=true;}
    pub(crate) fn fresh_input(&self)->bool{self.fresh_input}
}
#[derive(Clone,Debug,PartialEq)]
pub(crate) enum Target { Popup, Current, Library{window:u64,panel:String,owner:u64,bounds:[f64;4]} }
#[derive(Clone,Debug,PartialEq)]
pub(crate) struct Reservation{pub window:u64,pub panel:String,pub owner:u64,pub generation:u64}
pub(crate) struct Reservations{sequence:u64,current:Option<Reservation>}
impl Reservations{
    pub(crate) const fn new()->Self{Self{sequence:0,current:None}}
    pub(crate) fn prepare(&mut self,window:u64,panel:String,generation:u64)->Result<Reservation,String>{
        if let Some(current)=self.current.as_ref().filter(|current|current.window==window&&current.panel==panel&&current.generation==generation){return Ok(current.clone());}
        self.sequence=self.sequence.checked_add(1).filter(|value|*value<=MAX_JS_ID).ok_or("播放面板身份已耗尽")?;
        let reservation=Reservation{window,panel,owner:self.sequence,generation};self.current=Some(reservation.clone());Ok(reservation)
    }
    pub(crate) fn matches(&self,window:u64,panel:&str,owner:u64,generation:u64)->bool{self.current.as_ref().is_some_and(|current|current.window==window&&current.panel==panel&&current.owner==owner&&current.generation==generation)}
    pub(crate) fn retire(&mut self,owner:u64)->bool{if self.current.as_ref().is_some_and(|current|current.owner==owner){self.current=None;true}else{false}}
    pub(crate) fn has_current(&self,generation:u64)->bool{self.current.as_ref().is_some_and(|current|current.generation==generation)}
}
pub(crate) fn identity(value:&Value)->Result<(u64,String),String>{
    let window=value["window"].as_u64().filter(|id|*id>0&&*id<=MAX_JS_ID&&*id&1==0).ok_or("媒体库窗口身份无效")?;
    let panel=value["panel"].as_str().filter(|id|!id.is_empty()&&id.len()<=128&&id.bytes().all(|v|v.is_ascii_alphanumeric()||v==b'-'||v==b'_')).ok_or("播放面板身份无效")?.to_owned();Ok((window,panel))
}
pub(crate) fn bounds(args:&Value)->Result<[f64;4],String>{
    let mut result=[0.;4];
    for (index,key) in ["x","y","width","height"].into_iter().enumerate(){
        result[index]=args[key].as_f64().filter(|value|value.is_finite()&&(0.0..=100000.).contains(value)&&(index<2||*value>=1.)).ok_or("播放器区域无效")?;
    }Ok(result)
}
impl Target {
    pub(crate) fn parse(value:Option<&Value>)->Result<Self,String>{
        let Some(value)=value else{return Ok(Self::Popup);};
        let object=value.as_object().ok_or("播放器宿主无效")?;
        if value["kind"]=="popup"&&object.len()==1{return Ok(Self::Popup);}
        if value["kind"]!="library"||object.keys().any(|key|!["kind","window","panel","owner","bounds"].contains(&key.as_str())){return Err("播放器宿主无效".into());}
        let (window,panel)=identity(value)?;let owner=value["owner"].as_u64().filter(|value|*value>0&&*value<=MAX_JS_ID).ok_or("播放面板预约无效")?;
        Ok(Self::Library{window,panel,owner,bounds:bounds(&value["bounds"])?})
    }
}
#[cfg(test)]mod tests{
    use super::*;use serde_json::json;
    #[test]fn only_the_first_input_of_an_unused_surface_is_certified_fresh(){let mut history=SurfaceHistory::default();assert!(!history.fresh_input());history.begin_input();assert!(history.fresh_input());history.begin_input();assert!(!history.fresh_input());history.begin_input();assert!(!history.fresh_input());}
    #[test]fn replacing_a_renderer_preserves_surface_use_even_after_an_open_failure(){let mut original=SurfaceHistory::default();original.begin_input();let mut rebuilt=original;rebuilt.begin_input();assert!(!rebuilt.fresh_input());let mut failed=SurfaceHistory::default();failed.begin_input();failed.begin_input();assert!(!failed.fresh_input());}
    #[test]fn popup_compatibility_is_explicit_and_current_is_never_a_caller_window_selector(){assert_eq!(Target::parse(None).unwrap(),Target::Popup);assert_eq!(Target::parse(Some(&json!({"kind":"popup"}))).unwrap(),Target::Popup);for value in [json!({"kind":"current"}),json!({"kind":"popup","hwnd":1}),json!({"kind":"other"}),Value::Null]{assert!(Target::parse(Some(&value)).is_err());}}
    #[test]fn library_host_requires_an_exact_safe_window_and_panel_identity(){let valid=json!({"kind":"library","window":2,"panel":"generated-a","owner":1,"bounds":{"x":12,"y":20,"width":640,"height":360}});assert!(matches!(Target::parse(Some(&valid)).unwrap(),Target::Library{window:2,..}));for window in [0,1,3,MAX_JS_ID+1]{let mut value=valid.clone();value["window"]=json!(window);assert!(Target::parse(Some(&value)).is_err());}for panel in ["","a/b","../window","a\0b"]{let mut value=valid.clone();value["panel"]=json!(panel);assert!(Target::parse(Some(&value)).is_err());}let mut extra=valid;extra["label"]=json!("main");assert!(Target::parse(Some(&extra)).is_err());}
    #[test]fn closing_a_pending_panel_cannot_revive_it_or_revoke_its_successor(){let mut leases=Reservations::new();let a=leases.prepare(2,"a".into(),1).unwrap();assert!(leases.retire(a.owner));let b=leases.prepare(2,"a".into(),1).unwrap();assert_ne!(a.owner,b.owner);assert!(!leases.retire(a.owner));assert!(!leases.matches(2,"a",a.owner,1));assert!(leases.matches(2,"a",b.owner,1));}
    #[test]fn reservations_are_scoped_to_window_panel_and_account_and_do_not_accumulate(){let mut leases=Reservations::new();let first=leases.prepare(2,"a".into(),1).unwrap();assert_eq!(leases.prepare(2,"a".into(),1).unwrap(),first);let next=leases.prepare(4,"a".into(),2).unwrap();assert!(!leases.matches(2,"a",first.owner,1));assert!(!leases.matches(4,"a",next.owner,1));assert!(!leases.matches(4,"b",next.owner,2));assert!(leases.matches(4,"a",next.owner,2));}
    #[test]fn host_geometry_is_positive_finite_and_bounded(){for (key,number)in[("x",-1.),("y",100001.),("width",0.),("height",0.5)]{let mut value=json!({"x":0,"y":0,"width":640,"height":360});value[key]=json!(number);assert!(bounds(&value).is_err());}assert!(bounds(&json!({"x":0,"y":0,"width":640})).is_err());}
}
