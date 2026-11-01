//! Complete, decoder-scoped geometry for native cells in a library WebView.
use serde_json::Value;
#[derive(Clone,Debug)]
pub(crate) struct Cell {pub index:usize,pub input:u64,pub rect:[f64;4],pub visible:bool}
pub(crate) fn parse(args:&Value,inputs:&[u64])->Result<Vec<Cell>,String>{
    if args.get("expectedInputs").is_none(){return Err("同屏布局缺少完整输入组".into());}
    super::grid_input::check(args,inputs)?;
    let cells=args["cells"].as_array().filter(|rows|rows.len()==inputs.len()&&(1..=9).contains(&rows.len())).ok_or("同屏布局数量无效")?;
    let mut seen=std::collections::HashSet::new();
    cells.iter().map(|row|{
        if row.as_object().is_none_or(|row|row.keys().any(|key|!["index","inputId","x","y","width","height","visible"].contains(&key.as_str()))){return Err("同屏布局只接受位置、可见性和输入身份，显示阶段由原生管理".into());}
        let index=row["index"].as_u64().filter(|v|*v<inputs.len() as u64).ok_or("同屏布局目标无效")? as usize;
        if !seen.insert(index)||row["inputId"].as_u64()!=Some(inputs[index]){return Err("同屏布局输入已改变".into());}
        Ok(Cell{index,input:inputs[index],rect:super::player_host::bounds(row)?,visible:row["visible"].as_bool().ok_or("同屏布局可见性无效")?})
    }).collect()
}
#[cfg(test)]mod tests{
    use super::*;use serde_json::json;
    fn value()->Value{json!({"expectedInputs":[10,11],"cells":[{"index":0,"inputId":10,"x":0,"y":20,"width":640,"height":360,"visible":true},{"index":1,"inputId":11,"x":650,"y":20,"width":640,"height":360,"visible":false}]})}
    #[test]fn complete_layout_keeps_each_cell_identity_and_visibility(){let c=parse(&value(),&[10,11]).unwrap();assert_eq!(c[0].index,0);assert_eq!(c[0].input,10);assert_eq!(c[0].rect,[0.,20.,640.,360.]);assert!(c[0].visible);assert!(!c[1].visible);}
    #[test]fn old_partial_or_reordered_inputs_cannot_move_current_surfaces(){let v=value();for ids in [&[12,13][..],&[11,10],&[10],&[]]{assert!(parse(&v,ids).is_err());}let mut missing=v;missing.as_object_mut().unwrap().remove("expectedInputs");assert!(parse(&missing,&[10,11]).is_err());}
    #[test]fn duplicate_indices_and_mismatched_cells_are_rejected(){for (key,v)in[("index",json!(0)),("inputId",json!(10)),("visible",json!(null)),("width",json!(0)),("x",json!(-1)),("height",json!(100001))]{let mut a=value();a["cells"][1][key]=v;assert!(parse(&a,&[10,11]).is_err(),"{key}");}}
    #[test]fn late_frontend_phase_cannot_override_native_visibility(){for (key,v)in[("opacity",json!(0)),("opacity",json!(1)),("opacity",json!(null)),("restoringPausedFrame",json!(true)),("hwnd",json!(1))]{let mut a=value();a["cells"][0][key]=v;assert!(parse(&a,&[10,11]).is_err(),"{key}");}assert!(parse(&value(),&[10,11]).is_ok());}
}
