//! Opt-in readback for debug or explicit host-trace builds and their QA parent. No socket,
//! remote commands, external HWNDs, activation or playback mutations.
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use tauri::{AppHandle, Manager};

const MAX_LINE:usize=4096;
const MAX_REQUESTS:usize=512;
#[derive(Debug,Clone,Copy,PartialEq,Eq)]
enum Command { Ping, PlayerState, PlayerFrame(Option<u64>), PlayerTrace(Option<u64>), PlayerWindow, MainFrame }
#[derive(Debug,PartialEq,Eq)]
struct Request { id:String, command:Result<Command,String> }
fn valid_nonce(value:&str)->bool { value.len()==32&&value.bytes().all(|c|c.is_ascii_hexdigit()&&!c.is_ascii_uppercase()) }
fn parse(line:&[u8],nonce:&str)->Result<Request,String>{
    if line.len()>MAX_LINE{return Err("QA request exceeds its size limit".into());}
    let value:Value=serde_json::from_slice(line).map_err(|_|"Invalid QA JSON")?;
    let object=value.as_object().ok_or("QA request must be an object")?;
    if !valid_nonce(nonce)||value["nonce"].as_str()!=Some(nonce){return Err("Invalid QA nonce".into());}
    let id=value["id"].as_str().filter(|s|!s.is_empty()&&s.len()<=40&&s.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'-')).ok_or("Invalid QA request identity")?.to_owned();
    let command=(||{
        if object.keys().any(|k|!matches!(k.as_str(),"nonce"|"id"|"action"|"args")){return Err("Unknown QA request field".into());}
        let args=value.get("args").cloned().unwrap_or_else(||json!({}));
        let args=args.as_object().ok_or("QA arguments must be an object")?;
        match value["action"].as_str(){
            Some(action @ ("player.frame"|"player.trace"))=>{
                if args.keys().any(|k|k!="expectedInput"){return Err("Unknown QA frame argument".into());}
                let input=args.get("expectedInput").map(|v|v.as_u64().filter(|n|*n>0).ok_or("Invalid QA input identity")).transpose()?;
                Ok(if action=="player.frame"{Command::PlayerFrame(input)}else{Command::PlayerTrace(input)})
            }
            Some(action @ ("ping"|"player.state"|"player.window"|"main.frame")) if args.is_empty()=>Ok(match action{"ping"=>Command::Ping,"player.state"=>Command::PlayerState,"player.window"=>Command::PlayerWindow,_=>Command::MainFrame}),
            _=>Err("Only fixed read-only QA operations are allowed".into())
        }
    })();
    Ok(Request{id,command})
}
fn execute(app:&AppHandle,command:Command)->Result<Value,String>{
    if matches!(command,Command::PlayerFrame(_)|Command::MainFrame){
        // PrintWindow can synchronously send UI messages. Do not hold the
        // player lock on a worker while the UI thread is waiting for it during
        // layout/close. The readback runs in the owning GUI transaction.
        let owner=app.clone();let(tx,rx)=std::sync::mpsc::sync_channel(1);
        app.run_on_main_thread(move||{let _=tx.send(execute_inner(&owner,command));}).map_err(|e|e.to_string())?;
        return rx.recv_timeout(std::time::Duration::from_secs(4)).map_err(|_|"Owned GUI readback did not complete".to_owned())?;
    }
    execute_inner(app,command)
}
fn execute_inner(app:&AppHandle,command:Command)->Result<Value,String>{
    match command{
        Command::Ping=>Ok(json!({"protocol":1,"scope":"self-windows","maxRequests":MAX_REQUESTS})),
        Command::PlayerState=>crate::rhvideo_player::command("player.state",&json!({})),
        Command::PlayerFrame(input)=>crate::rhvideo_player::diagnostic_frame(&input.map(|id|json!({"expectedInput":id})).unwrap_or_else(||json!({}))),
        Command::PlayerTrace(input)=>crate::rhvideo_player::diagnostic_trace(&input.map(|id|json!({"expectedInput":id})).unwrap_or_else(||json!({}))),
        Command::PlayerWindow=>{
            use windows::Win32::{Foundation::HWND,UI::WindowsAndMessaging::{IsWindowVisible,IsIconic}};
            let Some(window)=app.get_webview_window("window-rhvideo-player") else{return Ok(json!({"visible":false,"minimized":false}));};
            let hwnd=HWND(window.hwnd().map_err(|e|e.to_string())?.0);
            Ok(unsafe{json!({"visible":IsWindowVisible(hwnd).as_bool(),"minimized":IsIconic(hwnd).as_bool()})})
        }
        Command::MainFrame=>{
            #[cfg(not(debug_assertions))]
            {Err("Frame readback is disabled in host-only builds".into())}
            #[cfg(debug_assertions)]
            {
            let main=app.get_webview_window("main").ok_or("QA main window is unavailable")?;
            let hwnd=main.hwnd().map_err(|e|e.to_string())?;
            let mut random=[0u8;16];getrandom::fill(&mut random).map_err(|_|"Cannot create owned QA filename")?;
            let name=random.iter().map(|v|format!("{v:02x}")).collect::<String>();
            let path=std::env::current_dir().map_err(|e|e.to_string())?.join(format!("rhvideo-main-{name}.bmp"));
            let(width,height)=crate::rhvideo_frame::diagnostic_capture(hwnd.0 as usize,&path,false)?;
            Ok(json!({"path":path,"width":width,"height":height,"scope":"main","canvas":"client"}))
            }
        }
    }
}
pub(crate) fn install(app:AppHandle){
    if std::env::var("RHFILES_NATIVE_PLAYER_QA").as_deref()!=Ok("1")||std::env::var_os("RHFILES_TEST_PROFILE_ROOT").is_none(){return;}
    let Ok(nonce)=std::env::var("RHFILES_QA_READBACK_NONCE") else{return;};
    if !valid_nonce(&nonce){return;}
    let _=std::thread::Builder::new().name("RHVideo-owned-QA-readback".into()).spawn(move||{
        let stdin=std::io::stdin();let mut input=stdin.lock();
        for _ in 0..MAX_REQUESTS{
            let mut line=Vec::new();
            // Bound allocation even if a broken parent never writes a newline.
            let read=std::io::Read::take(&mut input,(MAX_LINE+1) as u64).read_until(b'\n',&mut line);
            if !matches!(read,Ok(n) if n>0)||line.len()>MAX_LINE{break;}
            let Ok(request)=parse(&line,&nonce) else{continue;};
            let result=request.command.and_then(|command|execute(&app,command));
            let reply=match result{Ok(value)=>json!({"nonce":nonce,"id":request.id,"result":value}),Err(error)=>json!({"nonce":nonce,"id":request.id,"error":error})};
            let stdout=std::io::stdout();let mut output=stdout.lock();
            if writeln!(output,"RHFILES_NATIVE_QA {reply}").and_then(|_|output.flush()).is_err(){break;}
        }
    });
}

#[cfg(test)]
mod tests{
    use super::*;
    const NONCE:&str="0123456789abcdef0123456789abcdef";
    fn request(action:&str,args:Value)->Vec<u8>{json!({"nonce":NONCE,"id":"1","action":action,"args":args}).to_string().into_bytes()}
    #[test]fn qa_protocol_accepts_only_fixed_readback_operations(){
        for(action,command)in[("ping",Command::Ping),("player.state",Command::PlayerState),("player.window",Command::PlayerWindow),("main.frame",Command::MainFrame),("player.frame",Command::PlayerFrame(None)),("player.trace",Command::PlayerTrace(None))]{assert_eq!(parse(&request(action,json!({})),NONCE).unwrap().command,Ok(command));}
        assert_eq!(parse(&request("player.frame",json!({"expectedInput":7})),NONCE).unwrap().command,Ok(Command::PlayerFrame(Some(7))));
        for(action,args)in[("player.control",json!({"command":"play"})),("main.frame",json!({"hwnd":123})),("player.frame",json!({"path":"C:/outside.bmp"})),("player.frame",json!({"expectedInput":0})),("player.frame",json!({"expectedInput":"7"})),("ping",json!([]))]{assert!(parse(&request(action,args),NONCE).unwrap().command.is_err());}
    }
    #[test]fn malformed_or_unowned_qa_requests_cannot_reach_readback(){
        for line in [vec![b'x';MAX_LINE+1],b"not json".to_vec(),b"[]".to_vec(),json!({"id":"1","action":"ping"}).to_string().into_bytes(),json!({"nonce":NONCE,"id":"../path","action":"ping"}).to_string().into_bytes()]{assert!(parse(&line,NONCE).is_err());}
        assert!(parse(&request("ping",json!({})),"ffffffffffffffffffffffffffffffff").is_err());
        assert!(!valid_nonce("0123456789ABCDEF0123456789ABCDEF"));
        assert!(!valid_nonce("short"));
    }
}
