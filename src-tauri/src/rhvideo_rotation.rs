//! RHVideo shouldRotate/updateMediaRotBtn semantics, independent of decoders.
use serde_json::Value;

#[derive(Clone,Copy,Default)]
pub struct Policy {pub enabled:bool,pub source:(u32,u32)}
pub fn scores(source:(u32,u32),viewport:(u32,u32))->Option<(f64,f64)>{
    if source.0==0||source.1==0||viewport.0==0||viewport.1==0{return None;}
    let video=source.0 as f64/source.1 as f64;let container=viewport.0 as f64/viewport.1 as f64;
    Some(((container/video).min(video/container),(container*video).min(1./(container*video))))
}
pub fn angle(source:(u32,u32),viewport:(u32,u32),enabled:bool)->i32{
    if enabled&&scores(source,viewport).is_some_and(|(normal,rotated)|rotated>normal*1.05){90}else{0}
}
pub fn available(source:(u32,u32),viewport:(u32,u32),enabled:bool)->bool{
    if enabled{return true;}
    let Some((normal,rotated))=scores(source,viewport)else{return true;};
    let ratio=source.0 as f64/source.1 as f64;
    !(ratio>0.9&&ratio<1.1)&&(normal-rotated).abs()>=0.05
}
pub fn preference(value:&Value)->bool{
    value["autoRotate"].as_bool().unwrap_or_else(||value["rotation"].as_i64().is_some_and(|n|[90,180,270].contains(&n)))
}
pub fn source_size(resolution:&str)->(u32,u32){
    let mut parts=resolution.split(['x','X','×']);
    match(parts.next().and_then(|s|s.parse::<u32>().ok()),parts.next().and_then(|s|s.parse::<u32>().ok()),parts.next()){
        (Some(w),Some(h),None) if (1..=65535).contains(&w)&&(1..=65535).contains(&h)=>(w,h),_ =>(0,0),
    }
}
#[cfg(test)] mod tests{
    use super::*;use serde_json::json;
    #[test] fn matches_reference_five_percent_fit_rule_and_never_adds_a_half_turn(){
        for(source,viewport,wanted)in [((360,640),(1600,900),90),((640,360),(1600,900),0),((640,360),(900,1600),90),((360,640),(900,1600),0),((100,100),(1600,900),0),((0,0),(1600,900),0),((100,101),(101,100),0),((100,106),(106,100),90)]{
            assert_eq!(angle(source,viewport,true),wanted);assert_eq!(angle(source,viewport,false),0);
        }
        assert!(!available((100,100),(1600,900),false));assert!(available((100,100),(1600,900),true));assert!(available((0,0),(1600,900),false));
    }
    #[test] fn legacy_angle_migrates_but_explicit_switch_is_authoritative(){
        assert!(!preference(&json!({})));assert!(preference(&json!({"rotation":90})));assert!(!preference(&json!({"rotation":90,"autoRotate":false})));assert!(preference(&json!({"rotation":0,"autoRotate":true})));
        assert_eq!(source_size("1920x1080"),(1920,1080));assert_eq!(source_size("360×640"),(360,640));for bad in ["", "0x100", "100x0", "999999x2", "100x200x300"]{assert_eq!(source_size(bad),(0,0));}
    }
}
