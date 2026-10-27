//! RHVideo client, not a bundled server or a direct database connection.
//! Passwords are used once; bearer tokens stay in native process memory.
use axum::{
    body::Body,
    extract::Path,
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest,Sha256};
use std::{
    collections::{HashMap,HashSet},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, Emitter};
use url::Url;
#[path = "rhvideo_contract.rs"]
mod contract;

const JSON_LIMIT: usize = 32 * 1024 * 1024;
static GENERATION: AtomicU64 = AtomicU64::new(0);
static SESSION: Mutex<Option<Arc<Session>>> = Mutex::new(None);
static BROKER: tokio::sync::OnceCell<u16> = tokio::sync::OnceCell::const_new();
static CAPACITY: OnceLock<Arc<tokio::sync::Semaphore>> = OnceLock::new();
static IMAGE_CAPACITY: OnceLock<Arc<tokio::sync::Semaphore>> = OnceLock::new();
static MEDIA_WAITERS: OnceLock<Arc<tokio::sync::Semaphore>> = OnceLock::new();
static CATALOG_CAPACITY: OnceLock<Arc<tokio::sync::Semaphore>> = OnceLock::new();
static PLAYBACK: Mutex<Option<Playback>> = Mutex::new(None);
static PLAY_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static PREPARED: Mutex<Vec<PreparedPlaylist>> = Mutex::new(Vec::new());
static GRID_QUEUE: Mutex<Option<GridQueue>> = Mutex::new(None);
static GRID_LOAD: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static PREFERENCES_LOCK: Mutex<()> = Mutex::new(());
static RESUME: Mutex<Option<(Value, Instant)>> = Mutex::new(None);
static PLAYBACK_REVISION: AtomicU64 = AtomicU64::new(1);
static PLAY_MONITOR: OnceLock<Result<std::thread::Thread,String>> = OnceLock::new();
static PLAY_MONITOR_ERROR: Mutex<Option<Value>> = Mutex::new(None);
static PLAY_MONITOR_TICKS:AtomicU64=AtomicU64::new(0);
static QUEUE_STATE_LOCK: Mutex<()> = Mutex::new(());
static PREVIEW_RUN: AtomicU64 = AtomicU64::new(1);

fn failed_media(state:&Value)->bool{
    // libVLC can report HTTP 404 as Ended, not Error. An input that ends
    // without any duration or displayed frame is not a successful segment.
    state["state"]==7||(state["state"]==6&&state["durationMs"].as_i64().unwrap_or(0)<=0&&state["renderedFrames"].as_u64().unwrap_or(0)==0)
}

// Native playback progression cannot depend on a WebView timer: Chromium may
// throttle an occluded/unfocused controls window. One worker sleeps while idle
// or paused; reads state only while active, and uses revision-guarded actions.
#[cfg(windows)]
fn wake_playback_monitor(app:&AppHandle){
    let monitor=PLAY_MONITOR.get_or_init(||{
        let app=app.clone();
        std::thread::Builder::new().name("rhvideo-playback".into()).spawn(move||{
            let mut handled=None;
            loop {
                PLAY_MONITOR_TICKS.fetch_add(1,Ordering::Relaxed);
                let independent_active=crate::rhvideo_player::maintain_independent_outputs();
                let wait_for_activity=||if independent_active {std::thread::park_timeout(Duration::from_millis(100));}else{std::thread::park();};
                let snapshot=PLAYBACK.lock().ok().and_then(|slot|slot.as_ref().map(|q|(
                    q.generation,q.revision,q.items[q.index].0.clone(),(q.bounds().0*1000.) as i64,
                    q.bounds().1.map(|seconds|(seconds*1000.) as i64),
                    q.options["loop"]==true,q.index+1<q.items.len(),q.options["closeAtEnd"]==true
                )));
                let Some((generation,revision,id,start,segment,repeating,has_next,close_at_end))=snapshot else {wait_for_activity();continue};
                if !current().is_ok_and(|s|s.generation==generation){wait_for_activity();continue;}
                let Ok(state)=crate::rhvideo_player::command("player.state",&json!({})) else {wait_for_activity();continue};
                if state["opened"]!=true {wait_for_activity();continue;}
                if state["state"]==5&&state["seekError"].is_string(){wait_for_activity();continue;}
                let failed=failed_media(&state);
                if failed&&!close_at_end {wait_for_activity();continue;}
                if state["state"]==4 {std::thread::park_timeout(if independent_active{Duration::from_millis(100)}else{Duration::from_secs(1)});continue;}
                let duration=state["durationMs"].as_i64().unwrap_or(0);
                let end=segment.map(|length|(start+length).min(duration)).unwrap_or(duration);
                let lead=((end-start)/4).clamp(1,200);
                let position=state["decoderPositionMs"].as_i64().unwrap_or(0);
                let ending=failed||state["state"]==6 || (end>0&&state["renderedFrames"].as_u64().unwrap_or(0)>0&&position>=end-lead&&(repeating||segment.is_some()));
                if !ending {
                    if end>0&&position<end-lead {handled=None;}
                    std::thread::park_timeout(Duration::from_millis(100));continue;
                }
                if handled==Some(revision){if failed||state["state"]==6 {wait_for_activity();}else{std::thread::park_timeout(Duration::from_millis(100));}continue;}
                let action=if failed {if has_next{"player.next"}else{"player.finishQueue"}}else if repeating {"player.repeatCurrent"}else if has_next {"player.next"}else if close_at_end {"player.finishQueue"}else if segment.is_some(){"player.finishSegment"}else{wait_for_activity();continue};
                handled=Some(revision);
                if failed{let _=app.emit_to("window-rhvideo","rhvideo-playback-error",json!({"generation":generation,"id":id,"message":format!("视频加载失败，{}：{}",if has_next{"已跳过"}else{"连播已结束"},state["title"].as_str().unwrap_or(&id))}));}
                let result=tauri::async_runtime::block_on(rhvideo_request(app.clone(),action.into(),json!({"expectedId":id,"expectedRevision":revision,"automatic":true,"failed":failed})));
                if PLAYBACK.lock().ok().is_some_and(|q|q.as_ref().is_some_and(|q|q.generation==generation&&q.revision==revision)) {
                    if let Ok(mut error)=PLAY_MONITOR_ERROR.lock(){*error=result.err().map(|message|json!({"revision":revision,"message":message}));}
                }
            }
        }).map(|handle|handle.thread().clone()).map_err(|_|"无法启动原生播放控制器".to_string())
    });
    match monitor {
        Ok(thread)=>thread.unpark(),
        Err(message)=>if let Ok(mut error)=PLAY_MONITOR_ERROR.lock(){*error=Some(json!({"message":message}));},
    }
}
#[cfg(not(windows))]
fn wake_playback_monitor(_app:&AppHandle){}
#[cfg(windows)]
pub(crate) async fn player_window_destroyed(app:AppHandle,lease:u64){
    let _play=PLAY_LOCK.lock().await;
    let context=PLAYBACK.lock().ok().and_then(|q|q.as_ref().map(|q|(q.generation,q.options.clone())));
    if crate::rhvideo_player::retire_window(lease){
        flush_playback();
        if let Ok(mut queue)=PLAYBACK.lock(){*queue=None;}
        if let Some((generation,options))=context {
            emit_parent_preview(&app,generation,&options,0,true);
            if let Ok(session)=current(){let _=start_preview_commit(app,session);}
        }
    }
}
#[cfg(windows)]
pub(crate) async fn grid_window_destroyed(app:AppHandle,lease:u64){
    let _loading=GRID_LOAD.lock().await;
    let matches=GRID_QUEUE.lock().ok().is_some_and(|q|q.as_ref().is_some_and(|q|q.window_lease==lease));
    if !matches||!crate::rhvideo_player::retire_grid_window(lease){return;}
    let generation=GRID_QUEUE.lock().ok().and_then(|mut q|q.take().map(|q|q.generation));
    if let Ok(session)=current(){if Some(session.generation)==generation{let _=start_preview_commit(app,session);}}
}
struct PreparedPlaylist {
    ticket: String,
    generation: u64,
    items: Vec<(String, String)>,
    durations: Vec<f64>,
    portraits: Vec<bool>,
    grid_cells:Vec<Option<[f64;4]>>,
    grid_ends:Vec<bool>,
    segments: Vec<Option<(f64,f64)>>,
    prefix: Vec<f64>,
    options: Value,
    touched: std::time::Instant,
}
fn prepare_playlist(drafts:&mut Vec<PreparedPlaylist>,generation:u64,args:&Value)->Result<Value,String>{
    drafts.retain(|q|q.touched.elapsed()<Duration::from_secs(300));
    let ticket=identifier(text(args,"ticket",128)?)?.to_owned();
    let items=args["items"].as_array().filter(|a|!a.is_empty()&&a.len()<=200).ok_or("播放列表分片无效")?;
    let index=drafts.iter().position(|q|q.ticket==ticket&&q.generation==generation);
    let reset=args["reset"]==true;
    let options=if reset{
        validate_reference_options(&args["options"])?;
        if serde_json::to_vec(&args["options"]).map_err(|_|"播放设置无效")?.len()>256*1024{return Err("播放设置过大".into());}
        if index.is_none()&&drafts.len()>=8{return Err("准备中的播放队列过多，请先释放不用的票据".into());}
        &args["options"]
    }else{&drafts.get(index.ok_or("播放列表准备已失效")?).ok_or("播放列表准备已失效")?.options};
    let existing:usize=drafts.iter().enumerate().filter(|(at,_)|!reset||Some(*at)!=index).map(|(_,q)|q.items.len()).sum();
    if existing+items.len()>100000{return Err("准备中的播放列表合计超出 10 万项".into());}
    let mut validated=Vec::with_capacity(items.len());
    for item in items{
        let identity=(identifier(text(item,"id",128)?)?.to_owned(),text(item,"title",1024)?.to_owned());
        let duration=item["duration"].as_f64().unwrap_or(0.).clamp(0.,604800.);
        let segment=if options["reference"]==true{
            let start=item["segmentStart"].as_f64().filter(|n|n.is_finite()&&(0.0..=604800.).contains(n)).ok_or("分段起点无效")?;
            let length=item["segmentLength"].as_f64().filter(|n|n.is_finite()&&(0.1..=604800.).contains(n)).ok_or("分段长度无效")?;
            if duration>0.&&start+length>duration+0.2{return Err("分段超出视频时长".into());}Some((start,length))
        }else{None};
        if item.get("portrait").is_some_and(|value|!value.is_boolean()){return Err("竖屏元数据无效".into());}
        let rect=if options["grid"]==true{
            let parts=item["gridRect"].as_array().filter(|r|r.len()==4).ok_or("同屏布局无效")?;
            let values=parts.iter().map(|v|v.as_f64().filter(|n|n.is_finite()&&*n>=0.)).collect::<Option<Vec<_>>>().ok_or("同屏布局无效")?;
            if values[2]<=0.||values[3]<=0.||values[0]+values[2]>1.002||values[1]+values[3]>1.002||!item["gridEnd"].is_boolean(){return Err("同屏布局超出范围".into());}Some([values[0],values[1],values[2],values[3]])
        }else{None};
        validated.push((identity,duration,segment,item["portrait"]==true,rect,item["gridEnd"]==true));
    }
    // Validate the entire chunk before replacing a valid draft or appending.
    // Different tickets coexist; their aggregate memory remains bounded.
    let index=if reset{
        let q=PreparedPlaylist{ticket,generation,items:Vec::new(),durations:Vec::new(),portraits:Vec::new(),grid_cells:Vec::new(),grid_ends:Vec::new(),segments:Vec::new(),prefix:vec![0.],options:options.clone(),touched:std::time::Instant::now()};
        if let Some(index)=index{drafts[index]=q;index}else{drafts.push(q);drafts.len()-1}
    }else{index.ok_or("播放列表准备已失效")?};
    let q=&mut drafts[index];
    q.touched=std::time::Instant::now();
    for(identity,duration,segment,portrait,rect,end)in validated{
        q.items.push(identity);q.durations.push(duration);q.segments.push(segment);q.portraits.push(portrait);q.grid_cells.push(rect);q.grid_ends.push(end);
        q.prefix.push(q.prefix.last().copied().unwrap_or(0.)+segment.map(|s|s.1).unwrap_or(duration));
    }
    Ok(json!({"count":q.items.len()}))
}
#[derive(Clone)]
struct PlaylistPool {
    items: Vec<(String,String)>,
    durations: Vec<f64>,
    portraits: Vec<bool>,
    segments: Vec<Option<(f64,f64)>>,
}
#[derive(Clone)]
struct Playback {
    generation: u64,
    revision: u64,
    // Stable across Next/Previous; changes when the ordered/time-weighted plan
    // changes or a viewer is reopened, so an old total-progress drag is safe.
    plan_revision: u64,
    items: Vec<(String, String)>,
    index: usize,
    durations: Vec<f64>,
    segments: Vec<Option<(f64,f64)>>,
    prefix: Vec<f64>,
    options: Value,
    start_seconds: f64,
    // The immutable source order survives live filtering. Never reconstruct
    // it from the already-filtered queue or a later, changed library page.
    pool: Option<Arc<PlaylistPool>>,
}
impl Playback {
    fn bounds(&self)->(f64,Option<f64>){
        self.segments.get(self.index).copied().flatten().map(|(start,length)|(start,Some(length))).unwrap_or_else(||if self.options["fullLength"]==false{(self.start_seconds,Some(self.options["segment"].as_f64().unwrap_or(15.)))}else{(0.,None)})
    }
    fn start(&self,index:usize)->f64{
        self.segments.get(index).copied().flatten().map(|s|s.0).unwrap_or_else(||segment_start(self.durations.get(index).copied().unwrap_or(0.),&self.options))
    }
    fn project_portrait(&mut self,enabled:bool,reset_full_length:bool)->Result<(),String>{
        let pool=self.pool.as_ref().ok_or("当前不是可筛选的连播队列")?;
        let indices=(0..pool.items.len()).filter(|i|!enabled||pool.portraits.get(*i)==Some(&true)).collect::<Vec<_>>();
        if indices.len()<if enabled{2}else{1}{return Err("竖屏视频不足 2 个，当前播放保持不变".into());}
        let same=indices.len()==self.items.len()&&indices.iter().zip(&self.items).all(|(i,item)|pool.items[*i].0==item.0);
        let items=indices.iter().map(|i|pool.items[*i].clone()).collect::<Vec<_>>();
        let durations=indices.iter().map(|i|pool.durations.get(*i).copied().unwrap_or(0.)).collect::<Vec<_>>();
        let signature=format!("{:x}",Sha256::digest(serde_json::to_vec(&items.iter().map(|item|&item.0).collect::<Vec<_>>()).map_err(|_|"播放顺序无效")?));
        let mut options=self.options.clone();options["portraitOnly"]=json!(enabled);if reset_full_length{options["fullLength"]=json!(enabled);}options["signature"]=json!(signature);
        let mut prefix=vec![0.];
        let segments=durations.iter().enumerate().map(|(index,duration)|{
            let original=if reset_full_length{None}else{pool.segments.get(indices[index]).copied().flatten()};
            let (start,length)=original.unwrap_or_else(||(segment_start(*duration,&options),reference_segment_length(*duration,&options)));
            prefix.push(prefix.last().copied().unwrap_or(0.)+length);Some((start,length))
        }).collect();
        // All validation/calculation above precedes mutation. A rejected toggle
        // cannot discard the old pool, cursor, segment plan or decoder input.
        self.items=items;self.durations=durations;self.segments=segments;self.prefix=prefix;self.options=options;
        if !same{self.index=0;}
        self.start_seconds=self.bounds().0;
        Ok(())
    }
}
fn expected_playback(
    q: &Playback,
    generation: u64,
    id: Option<&str>,
    revision: Option<u64>,
) -> bool {
    q.generation == generation
        && id.is_none_or(|id| q.items[q.index].0 == id)
        && revision.is_none_or(|revision| q.revision == revision)
}
fn expected_plan(q:&Playback,generation:u64,revision:u64)->bool{
    q.generation==generation&&q.plan_revision==revision
}
fn queue_seek(prefix:&[f64],ratio:f64)->Result<(usize,f64),String>{
    if prefix.len()<2||!ratio.is_finite()||!(0.0..=1.).contains(&ratio){return Err("队列位置无效".into());}
    let count=prefix.len()-1;let total=*prefix.last().unwrap();
    if total<=0.{return Err("队列缺少时长，无法定位".into());}
    if ratio==1.{return Ok((count-1,0.));}
    let target=ratio*total;
    let index=prefix.partition_point(|value|*value<=target).saturating_sub(1).min(count-1);
    Ok((index,(target-prefix[index]).max(0.)))
}
#[derive(Clone)]
struct GridQueue {
    generation: u64,
    items: Arc<Vec<(String, String)>>,
    ends:Arc<Vec<usize>>,
    rects:Arc<Vec<Option<[f64;4]>>>,
    states:Arc<std::sync::Mutex<HashMap<String,Value>>>,
    offset: usize,
    low_bandwidth: bool,
    window_lease:u64,
}
impl GridQueue {
    fn new(generation:u64,items:Vec<(String,String)>,count:usize,rects:Vec<Option<[f64;4]>>,flags:Vec<bool>,low_bandwidth:bool)->Result<Self,String>{
        if items.is_empty()||!(1..=9).contains(&count)||(!rects.is_empty()&&rects.len()!=items.len()){return Err("同屏队列无效".into());}
        let ends=if flags.is_empty(){(count..items.len()).step_by(count).chain(std::iter::once(items.len())).collect::<Vec<_>>()}else{
            if flags.len()!=items.len()||rects.len()!=items.len()||!flags.last().copied().unwrap_or(false)||rects.iter().any(Option::is_none){return Err("同屏分组计划不完整".into());}
            let mut previous=0;let mut ends=Vec::new();for(i,end)in flags.iter().enumerate(){if *end{if i+1-previous>9{return Err("单组视频不能超过 9 项".into());}ends.push(i+1);previous=i+1;}}ends
        };
        let rects=if rects.is_empty(){vec![None;items.len()]}else{rects};
        Ok(Self{generation,items:Arc::new(items),ends:Arc::new(ends),rects:Arc::new(rects),states:Arc::new(std::sync::Mutex::new(HashMap::new())),offset:0,low_bandwidth,window_lease:0})
    }
    fn group_index(&self)->usize{self.ends.partition_point(|end|*end<=self.offset)}
    fn count(&self)->usize{self.ends[self.group_index()]-self.offset}
    fn select(&mut self,index:usize){let index=index.min(self.ends.len()-1);self.offset=if index==0{0}else{self.ends[index-1]};}
    fn ids(&self)->Vec<String>{self.items.iter().skip(self.offset).take(self.count()).map(|item|item.0.clone()).collect()}
    fn restore_group(&mut self,ids:&Value){if let Some(ids)=ids.as_array(){for i in 0..self.ends.len(){let start=if i==0{0}else{self.ends[i-1]};let items=&self.items[start..self.ends[i]];if items.len()==ids.len()&&items.iter().zip(ids).all(|(item,id)|id.as_str()==Some(item.0.as_str())){self.select(i);return;}}}}
    fn page(&mut self, direction: i64) {
        self.select((self.group_index() as i64+direction).clamp(0,self.ends.len() as i64-1) as usize);
    }
    fn seek_group(&mut self,ratio:f64)->Result<(),String>{
        if !ratio.is_finite()||!(0.0..=1.).contains(&ratio){return Err("同屏分组位置无效".into());}
        self.select((ratio*(self.ends.len()-1) as f64).round() as usize);Ok(())
    }
    fn annotate(&self, mut value: Value) -> Value {
        value["offset"] = json!(self.offset);
        value["total"] = json!(self.items.len());
        value["count"] = json!(self.count());
        value["groupIndex"]=json!(self.group_index());value["groupTotal"]=json!(self.ends.len());
        value["generation"]=json!(self.generation);value["windowLease"]=json!(self.window_lease);
        value["monitorTicks"]=json!(PLAY_MONITOR_TICKS.load(Ordering::Relaxed));
        value["hasPrevious"] = json!(self.offset > 0);
        value["hasNext"] = json!(self.group_index()+1<self.ends.len());
        value
    }
    fn view(&self,session:&Session,value:Value)->Result<Value,String>{
        let mut value=self.annotate(value);
        let favorites=session.favorites.lock().map_err(|_|"收藏状态不可用")?;
        let preview=session.preview.lock().map_err(|_|"暂存标记不可用")?;
        if let Some(cells)=value["cells"].as_array_mut(){for cell in cells{if let Some(id)=cell["id"].as_str(){let key=format!("video:{id}");let favorite=favorites.contains(&key);let marked=preview.pending.contains_key(&key);cell["favorite"]=json!(favorite);cell["marked"]=json!(marked);}}}
        Ok(value)
    }
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Config {
    server: String,
    username: String,
}
struct Asset {
    path: String,
    image: bool,
}
struct Session {
    base: Url,
    username: String,
    token: Mutex<String>,
    refresh_at: AtomicU64,
    refresh_lock: tokio::sync::Mutex<()>,
    capability: String,
    port: u16,
    generation: u64,
    client: reqwest::Client,
    assets: Mutex<HashMap<String, Asset>>,
    next_asset: AtomicU64,
    asset_revision: AtomicU64,
    videos: tokio::sync::Mutex<Option<VideoCatalog>>,
    favorites: Mutex<HashSet<String>>,
    preview: Mutex<PreviewState>,
    single_controls: Mutex<SingleControls>,
}
#[derive(Clone,Copy)]
struct SingleControls { looping:bool, rate:f64 }
impl Default for SingleControls {fn default()->Self{Self{looping:false,rate:1.}}}
impl SingleControls {
    fn apply(&self,options:&mut Value){if options.get("loop").is_none(){options["loop"]=json!(self.looping);}if options.get("rate").is_none(){options["rate"]=json!(self.rate);}}
}
#[derive(Default)]
struct PreviewState{pending:HashMap<String,Value>,next:u64,running:bool,result:Value}
fn emit_parent_preview(app:&AppHandle,generation:u64,options:&Value,direction:i64,close:bool){
    if options["origin"]=="frame" {let mut event=json!({"generation":generation,"parentKey":options["parentKey"],"parentPreview":options["parentPreview"],"direction":direction,"close":close});if let Some(id)=options.get("parentPlayback"){event["parentPlayback"]=id.clone();}let _=app.emit_to("window-rhvideo","rhvideo-parent-preview",event);}
}
async fn update_favorite(app:&AppHandle,session:&Session,kind:&str,id:&str,enabled:bool)->Result<Value,String>{
    let result=session.request(if enabled{reqwest::Method::PUT}else{reqwest::Method::DELETE},&format!("api/v1/favorites/{kind}/{id}"),&[],None).await?;
    if let Ok(mut cache)=session.favorites.lock(){if enabled{cache.insert(format!("{kind}:{id}"));}else{cache.remove(&format!("{kind}:{id}"));}}
    let _=app.emit_to("window-rhvideo","rhvideo-favorite",json!({"generation":session.generation,"kind":kind,"id":id,"enabled":enabled}));
    Ok(result)
}
fn preview_mark(session:&Session,media_kind:&str,id:&str,title:&str,enabled:Option<bool>)->Result<Value,String>{
    let key=format!("{media_kind}:{id}");let mut marks=session.preview.lock().map_err(|_|"标记不可用")?;
    let enabled=enabled.unwrap_or(!marks.pending.contains_key(&key));
    if enabled {if marks.pending.len()>=1000&&!marks.pending.contains_key(&key){return Err("本次预览暂存标记最多 1000 项".into());}let order=marks.pending.get(&key).and_then(|v|v["order"].as_u64()).unwrap_or_else(||{let order=marks.next;marks.next=marks.next.saturating_add(1);order});marks.pending.insert(key,json!({"kind":media_kind,"id":id,"title":title,"order":order}));}else{marks.pending.remove(&key);}
    Ok(json!({"kind":media_kind,"id":id,"enabled":enabled,"pending":marks.pending.len()}))
}
fn start_preview_commit(app:AppHandle,session:Arc<Session>)->Result<Value,String>{
    let run=PREVIEW_RUN.fetch_add(1,Ordering::SeqCst);
    let targets={
        let mut state=session.preview.lock().map_err(|_|"暂存标记不可用")?;
        if state.running||state.pending.is_empty(){return Ok(state.result.clone());}
        // Consume the explicit marks once, BEFORE any network write. Failed or
        // late requests never re-enter this map when another preview closes.
        let mut targets=std::mem::take(&mut state.pending).into_values().collect::<Vec<_>>();
        targets.sort_by_key(|item|item["order"].as_u64().unwrap_or(0));
        state.running=true;state.result=json!({"run":run,"running":true,"total":targets.len(),"completed":0,"items":[]});targets
    };
    let initial=json!({"run":run,"running":true,"total":targets.len(),"completed":0,"items":[]});
    let _=app.emit_to("window-rhvideo","rhvideo-preview-result",json!({"generation":session.generation,"result":initial}));
    tauri::async_runtime::spawn(async move{
        let mut items=Vec::new();let total=targets.len();let mut published=Instant::now();
        for target in targets {
            let result=if !current().is_ok_and(|s|s.generation==session.generation){Err("媒体账户已更改；此项未提交，不会自动恢复".to_string())}
            else{session.request(reqwest::Method::POST,&format!("api/v1/trash/{}/{}",target["kind"].as_str().unwrap_or(""),target["id"].as_str().unwrap_or("")),&[],None).await};
            let mut item=target;item["success"]=json!(result.is_ok());if let Err(error)=result{item["error"]=json!(error);}items.push(item);
            if items.len()==total||published.elapsed()>=Duration::from_millis(250){
                let value=json!({"run":run,"running":items.len()<total,"total":total,"completed":items.len(),"items":items});
                if let Ok(mut state)=session.preview.lock(){state.result=value.clone();if items.len()==total{state.running=false;}}
                let _=app.emit_to("window-rhvideo","rhvideo-preview-result",json!({"generation":session.generation,"result":value}));
                published=Instant::now();
            }
        }
    });
    Ok(initial)
}
struct VideoCatalog {
    checked: Instant,
    etag: Option<String>,
    rows: Arc<Value>,
}
fn current() -> Result<Arc<Session>, String> {
    SESSION
        .lock()
        .map_err(|_| "媒体库状态不可用")?
        .clone()
        .filter(|s| s.generation == GENERATION.load(Ordering::SeqCst))
        .ok_or_else(|| "请先连接并登录 RHVideo".into())
}
fn config_path() -> Result<std::path::PathBuf, String> {
    Ok(crate::profile::data_dir()?.join("rhvideo-client.json"))
}
fn read_config() -> Config {
    config_path()
        .ok()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}
fn playback_history(
    session: &Session,
    id: Option<&str>,
    update: Option<Value>,
    force: bool,
) -> Result<Value, String> {
    let mut slot = RESUME.lock().map_err(|_| "播放记录不可用")?;
    let path = config_path()?.with_file_name("rhvideo-playback.json");
    let (data, last) = slot.get_or_insert_with(|| {
        (
            std::fs::read(&path)
                .ok()
                .and_then(|v| serde_json::from_slice(&v).ok())
                .filter(Value::is_object)
                .unwrap_or(json!({})),
            Instant::now() - Duration::from_secs(10),
        )
    });
    let account = format!("{}\n{}", session.base, session.username);
    if !data.get(&account).is_some_and(Value::is_object) {
        data[&account] = json!({});
    }
    if let Some(update) = update {
        if let Some(id) = id {
            identifier(id)?;
            data[&account][id] = update;
        } else {
            data[&account] = json!({});
        }
        if let Some(values) = data[&account].as_object_mut() {
            while values.len() > 1000 {
                let oldest = values
                    .iter()
                    .min_by_key(|(_, v)| v["savedAt"].as_u64().unwrap_or(0))
                    .map(|(k, _)| k.clone())
                    .unwrap();
                values.remove(&oldest);
            }
        }
    }
    if force || last.elapsed() >= Duration::from_secs(5) {
        let temp = path.with_extension("tmp");
        std::fs::write(&temp, serde_json::to_vec(data).map_err(|_| "播放记录无效")?)
            .map_err(|_| "无法写入播放记录")?;
        std::fs::rename(temp, path).map_err(|_| "无法保存播放记录")?;
        *last = Instant::now();
    }
    Ok(if let Some(id) = id {
        data[&account].get(id).cloned().unwrap_or(Value::Null)
    } else {
        data[&account].clone()
    })
}
pub(crate) fn flush_playback() {
    if let Ok(session) = current() {
        let _ = save_queue_state(&session);
        let _ = playback_history(&session, None, None, true);
    }
}
fn queue_state(session:&Session,mode:&str,update:Option<Value>)->Result<Value,String>{
    if !["segments","sequential","sequential-super","grid"].contains(&mode){return Err("连播模式无效".into());}
    let _lock=QUEUE_STATE_LOCK.lock().map_err(|_|"连播记录不可用")?;
    let path=config_path()?.with_file_name("rhvideo-queues.json");
    let mut data=std::fs::metadata(&path).ok().filter(|m|m.len()<=1024*1024).and_then(|_|std::fs::read(&path).ok()).and_then(|b|serde_json::from_slice::<Value>(&b).ok()).filter(Value::is_object).unwrap_or(json!({}));
    let account=format!("{}\n{}",session.base,session.username);
    if !data[&account].is_object(){data[&account]=json!({});}
    if let Some(update)=update {
        if !data[&account][mode].is_object(){data[&account][mode]=json!({});}
        for(key,value)in update.as_object().ok_or("连播设置无效")?{data[&account][mode][key]=value.clone();}
        if data.as_object().is_some_and(|o|o.len()>128){return Err("连播账户记录超出上限".into());}
        let temp=path.with_extension("tmp");
        std::fs::write(&temp,serde_json::to_vec(&data).map_err(|_|"连播记录无效")?).map_err(|_|"无法保存连播记录")?;
        std::fs::rename(&temp,&path).map_err(|_|"无法提交连播记录")?;
    }
    Ok(data[&account][mode].clone())
}
fn save_queue_state(session:&Session)->Result<(),String>{
    let snapshot=PLAYBACK.lock().map_err(|_|"播放队列不可用")?.as_ref().filter(|q|q.generation==session.generation&&q.options["reference"]==true).map(|q|(q.options["mode"].as_str().unwrap_or("").to_owned(),json!({"signature":q.options["signature"],"index":q.index,"id":q.items[q.index].0,"loop":q.options["loop"],"fullLength":q.options["fullLength"],"portraitOnly":q.options["portraitOnly"]==true,"segment":q.options["segment"],"rate":q.options["rate"].as_f64().unwrap_or(1.)})));
    if let Some((mode,value))=snapshot {queue_state(session,&mode,Some(value))?;}
    Ok(())
}
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .read_timeout(Duration::from_secs(20))
        .no_proxy()
        .user_agent("RHFiles/RHVideo-client")
        .build()
        .map_err(|_| "无法初始化媒体库连接".into())
}
fn base_url(input: &str) -> Result<Url, String> {
    let mut url =
        Url::parse(input.trim()).map_err(|_| "请填写完整的 http:// 或 https:// 服务器地址")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("服务器地址不能包含账号、密码、查询参数或片段".into());
    }
    let path = url.path().trim_end_matches('/').to_owned();
    let path = path
        .strip_suffix("/static/index.html")
        .or_else(|| path.strip_suffix("/api/v1"))
        .unwrap_or(&path);
    let path = format!("{}/", path.trim_end_matches('/'));
    url.set_path(&path);
    Ok(url)
}
fn identifier(value: &str) -> Result<&str, String> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
    {
        return Err("媒体 ID 无效".into());
    }
    Ok(value)
}
fn text<'a>(args: &'a Value, key: &str, max: usize) -> Result<&'a str, String> {
    let value = args
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("缺少参数：{key}"))?;
    if value.len() > max || value.chars().any(|c| c == '\0') {
        return Err(format!("参数过长或无效：{key}"));
    }
    Ok(value)
}
fn number(args: &Value, key: &str, default: u64, max: u64) -> Result<u64, String> {
    match args.get(key) {
        None => Ok(default),
        Some(v) => v
            .as_u64()
            .filter(|v| *v <= max)
            .ok_or_else(|| format!("参数超出范围：{key}")),
    }
}
fn kind(args: &Value) -> Result<&str, String> {
    let value = text(args, "kind", 16)?;
    if !matches!(value, "video" | "picture" | "novel" | "favorite") {
        return Err("未知媒体类型".into());
    }
    Ok(value)
}
fn safe_image_path(path: &str) -> Result<String, String> {
    let api=path.trim_start_matches('/');
    if api.starts_with("api/") {
        let id=api.strip_prefix("api/v1/videos/").and_then(|p|p.strip_suffix("/thumbnail")).ok_or("不支持的缩略图接口")?;
        return Ok(format!("api/v1/videos/{}/thumbnail",identifier(id)?));
    }
    safe_storage_path(path)
}
fn safe_storage_path(path: &str) -> Result<String, String> {
    let decoded = percent_encoding::percent_decode_str(path)
        .decode_utf8()
        .map_err(|_| "媒体路径编码无效")?;
    let decoded = decoded.strip_prefix('/').unwrap_or(&decoded);
    if !decoded.starts_with("storage/")
        || decoded.len() > 4096
        || decoded
            .chars()
            .any(|c| c.is_control() || "\\?#%".contains(c))
        || decoded
            .split('/')
            .any(|p| p.is_empty() || p == "." || p == "..")
    {
        return Err("服务器返回了不安全的媒体路径".into());
    }
    // Encode each segment, including literal spaces/#/? in legitimate filenames.
    let mut url = Url::parse("http://local/").unwrap();
    {
        let mut segments = url.path_segments_mut().unwrap();
        segments.clear();
        for part in decoded.split('/') {
            segments.push(part);
        }
    }
    Ok(url.path().trim_start_matches('/').to_owned())
}
fn upstream_error(status: reqwest::StatusCode, body: &[u8]) -> String {
    let detail = serde_json::from_slice::<Value>(body)
        .ok()
        .and_then(|v| v.get("detail").and_then(Value::as_str).map(str::to_owned));
    match status.as_u16() {
        401 | 403 => format!(
            "登录已失效或没有权限，请重新登录（HTTP {}）",
            status.as_u16()
        ),
        300..=399 => {
            "服务器返回了重定向；请直接填写最终的 RHVideo 地址，未向新地址转发登录信息".into()
        }
        _ => format!(
            "RHVideo 请求失败（HTTP {}）{}",
            status.as_u16(),
            detail
                .map(|s| format!("：{}", s.chars().take(300).collect::<String>()))
                .unwrap_or_default()
        ),
    }
}
fn network_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "RHVideo 响应超时，请检查地址和网络".into()
    } else if error.is_connect() {
        "无法连接 RHVideo，请检查服务器是否运行、地址与端口是否正确".into()
    } else {
        "RHVideo 网络请求失败；连接或响应数据不完整".into()
    }
}
async fn json_response(mut response: reqwest::Response) -> Result<Value, String> {
    let status = response.status();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        if bytes.len() + chunk.len() > JSON_LIMIT {
            return Err("媒体库响应超过 32 MB，请缩小服务器媒体范围".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if !status.is_success() {
        return Err(upstream_error(status, &bytes));
    }
    serde_json::from_slice(&bytes)
        .map_err(|_| "RHVideo 没有返回有效 JSON；请检查地址是否指向 RHVideo 服务".into())
}
impl Session {
    async fn access_token(&self) -> Result<String, String> {
        if self.generation != GENERATION.load(Ordering::SeqCst) {
            return Err("媒体账户已改变，操作未执行".into());
        }
        let _refresh = self.refresh_lock.lock().await;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let token = self.token.lock().map_err(|_| "登录状态不可用")?.clone();
        if now < self.refresh_at.load(Ordering::Relaxed) {
            return Ok(token);
        }
        let response = self
            .client
            .post(self.endpoint("api/v1/auth/refresh")?)
            .bearer_auth(&token)
            .timeout(Duration::from_secs(20))
            .send()
            .await
            .map_err(network_error)?;
        let value = json_response(response).await?;
        let next = value["access_token"]
            .as_str()
            .filter(|s| !s.is_empty() && s.len() < 32768 && !s.chars().any(char::is_control))
            .ok_or("刷新登录令牌失败")?
            .to_owned();
        *self.token.lock().map_err(|_| "登录状态不可用")? = next.clone();
        self.refresh_at.store(
            now + value["expires_in"]
                .as_u64()
                .unwrap_or(1800)
                .saturating_sub(60)
                .max(1),
            Ordering::Relaxed,
        );
        Ok(next)
    }
    async fn video_catalog(&self, refresh: bool) -> Result<Arc<Value>, String> {
        // Coalesce concurrent paging/search requests. Only the returned page is
        // copied, never a whole library for each keystroke.
        let started = Instant::now();
        let mut cache = self.videos.lock().await;
        if GENERATION.load(Ordering::SeqCst) != self.generation {
            return Err("媒体库连接已失效".into());
        }
        if let Some(value) = cache.as_ref().filter(|c| {
            c.checked >= started || !refresh && c.checked.elapsed() < Duration::from_secs(30)
        }) {
            return Ok(value.rows.clone());
        }
        let mut request = self
            .client
            .get(self.endpoint("api/v1/videos")?)
            .bearer_auth(self.access_token().await?)
            .query(&[("summary", "true")])
            .timeout(Duration::from_secs(25));
        if let Some(etag) = cache.as_ref().and_then(|c| c.etag.as_deref()) {
            request = request.header(reqwest::header::IF_NONE_MATCH, etag);
        }
        let response = request.send().await.map_err(network_error)?;
        let etag = response
            .headers()
            .get(reqwest::header::ETAG)
            .and_then(|v| v.to_str().ok())
            .filter(|v| v.len() <= 1024)
            .map(str::to_owned);
        let unchanged = response.status() == reqwest::StatusCode::NOT_MODIFIED;
        let rows = if unchanged {
            cache
                .as_ref()
                .ok_or("服务器返回 304，但本机没有可用清单")?
                .rows
                .clone()
        } else {
            if response.status() == reqwest::StatusCode::UNAUTHORIZED {
                let mut active = SESSION.lock().map_err(|_| "媒体库状态不可用")?;
                if active
                    .as_ref()
                    .is_some_and(|s| s.generation == self.generation)
                {
                    active.take();
                }
            }
            let value = json_response(response).await?;
            if !value.is_array() {
                return Err("RHVideo 视频列表格式不兼容".into());
            }
            Arc::new(value)
        };
        if GENERATION.load(Ordering::SeqCst) != self.generation {
            return Err("连接已更改，已丢弃旧媒体清单".into());
        }
        let etag = if unchanged {
            etag.or_else(|| cache.as_ref().and_then(|c| c.etag.clone()))
        } else {
            etag
        };
        *cache = Some(VideoCatalog {
            checked: Instant::now(),
            etag,
            rows: rows.clone(),
        });
        Ok(rows)
    }
    fn endpoint(&self, path: &str) -> Result<Url, String> {
        self.base
            .join(path.trim_start_matches('/'))
            .map_err(|_| "接口路径无效".into())
    }
    async fn request(
        &self,
        method: reqwest::Method,
        path: &str,
        query: &[(&str, String)],
        body: Option<Value>,
    ) -> Result<Value, String> {
        let mut request = self
            .client
            .request(method, self.endpoint(path)?)
            .bearer_auth(self.access_token().await?)
            .query(query)
            .timeout(Duration::from_secs(25));
        if let Some(body) = body {
            request = request.json(&body);
        }
        let response = request.send().await.map_err(network_error)?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            let mut slot = SESSION.lock().map_err(|_| "媒体库状态不可用")?;
            if slot
                .as_ref()
                .is_some_and(|s| s.generation == self.generation)
            {
                slot.take();
            }
        }
        let value = json_response(response).await?;
        if GENERATION.load(Ordering::SeqCst) != self.generation {
            return Err("连接已更改；原请求可能已完成，请在原服务器核对，不会自动重复执行".into());
        }
        Ok(value)
    }
    fn asset(&self, path: String, image: bool) -> Result<String, String> {
        let mut assets = self.assets.lock().map_err(|_| "媒体缓存状态不可用")?;
        if let Some((id, _)) = assets
            .iter()
            .find(|(_, a)| a.path == path && a.image == image)
        {
            return Ok(format!(
                "http://127.0.0.1:{}/{}/{}",
                self.port, self.capability, id
            ));
        }
        if assets.len() >= 4096 {
            // Old pages are no longer mounted. Keep a bounded recent-link cache
            // instead of forcing a fresh login after browsing a large library.
            let oldest = assets
                .iter()
                .filter(|(_, a)| a.image)
                .min_by_key(|(id, _)| id.parse::<u64>().unwrap_or(0))
                .map(|(id, _)| id.clone())
                .or_else(|| {
                    assets
                        .keys()
                        .min_by_key(|id| id.parse::<u64>().unwrap_or(0))
                        .cloned()
                });
            if let Some(id) = oldest {
                assets.remove(&id);
                self.asset_revision.fetch_add(1, Ordering::Relaxed);
            } else {
                return Err("本机媒体通道繁忙，请稍后重试".into());
            }
        }
        let id = self.next_asset.fetch_add(1, Ordering::Relaxed).to_string();
        assets.insert(id.clone(), Asset { path, image });
        Ok(format!(
            "http://127.0.0.1:{}/{}/{}",
            self.port, self.capability, id
        ))
    }
    fn media(&self, raw: &Value, fallback: &str) -> Result<Value, String> {
        let media_kind = raw.get("type").and_then(Value::as_str).unwrap_or(fallback);
        if !matches!(media_kind, "video" | "picture" | "novel") {
            return Err("服务器返回未知媒体类型".into());
        }
        let id = identifier(raw.get("id").and_then(Value::as_str).ok_or("媒体缺少 ID")?)?;
        let cover = match media_kind {
            "video" => Some(self.asset(format!("api/v1/videos/{id}/thumbnail"), true)?),
            "picture" => raw
                .get("webp_path")
                .or_else(|| raw.get("thumbnail_url"))
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(|p| {
                    let p = if p.trim_start_matches('/').starts_with("storage/") {
                        p.to_owned()
                    } else {
                        format!("storage/{p}")
                    };
                    self.asset(safe_storage_path(&p)?, true)
                })
                .transpose()?,
            _ => None,
        };
        Ok(json!({
            "id":id,"kind":media_kind,
            "title":raw.get("title").or_else(||raw.get("original_filename")).or_else(||raw.get("filename")).and_then(Value::as_str).unwrap_or(id),
            "folder":raw.get("folder_label").and_then(Value::as_str).unwrap_or(""),
            "cover":cover,"duration":raw.get("duration_seconds").or_else(||raw.get("original_duration")),
            "resolution":raw.get("resolution").or_else(||raw.get("original_resolution")),
            "status":raw.get("status"),"progress":raw.get("progress"),
            "wordCount":raw.get("word_count"),"chapters":raw.get("chapter_count")
        }))
    }
}
async fn broker() -> Result<u16, String> {
    BROKER
        .get_or_try_init(|| async {
            let listener = crate::browser_loopback::bind()
                .await
                .map_err(|_| "无法启动本机媒体通道")?;
            let port = listener
                .local_addr()
                .map_err(|_| "无法读取本机媒体端口")?
                .port();
            tauri::async_runtime::spawn(async move {
                let _ = axum::serve(
                    listener,
                    Router::new().route("/{cap}/{id}", get(stream_asset)),
                )
                .await;
            });
            Ok(port)
        })
        .await
        .copied()
}
fn raster_mime(bytes:&[u8])->Option<&'static str>{
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n"){Some("image/png")}
    else if bytes.starts_with(b"\xff\xd8\xff"){Some("image/jpeg")}
    else if bytes.len()>=12&&&bytes[..4]==b"RIFF"&&&bytes[8..12]==b"WEBP"{Some("image/webp")}
    else if bytes.starts_with(b"GIF87a")||bytes.starts_with(b"GIF89a"){Some("image/gif")}
    else if bytes.starts_with(b"BM"){Some("image/bmp")}
    else if bytes.starts_with(b"\0\0\x01\0"){Some("image/x-icon")}
    else if bytes.starts_with(b"II*\0")||bytes.starts_with(b"MM\0*"){Some("image/tiff")}
    else if bytes.len()>=12&&&bytes[4..8]==b"ftyp"&&bytes[8..].chunks_exact(4).any(|b|b==b"avif"||b==b"avis"){Some("image/avif")}
    else{None}
}
fn svg_prefix(bytes:&[u8])->bool{
    // A byte-limited probe may end halfway through a UTF-8 character. Only
    // inspect the ASCII XML/SVG opening, not UTF-8 validity of the whole prefix.
    let bytes=bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes).trim_ascii_start();
    bytes.starts_with(b"<svg")||bytes.starts_with(b"<?xml")
}
async fn stream_asset(Path((cap, id)): Path<(String, String)>, headers: HeaderMap) -> Response {
    let failure = |status| {
        Response::builder()
            .status(status)
            .body(Body::empty())
            .unwrap()
    };
    let Ok(session) = current() else {
        return failure(StatusCode::UNAUTHORIZED);
    };
    if cap.len() != session.capability.len()
        || cap
            .bytes()
            .zip(session.capability.bytes())
            .fold(0u8, |a, (b, c)| a | (b ^ c))
            != 0
    {
        return failure(StatusCode::UNAUTHORIZED);
    }
    if headers.get("host").and_then(|h| h.to_str().ok())
        != Some(format!("127.0.0.1:{}", session.port).as_str())
    {
        return failure(StatusCode::FORBIDDEN);
    }
    let Some((path, image)) = session
        .assets
        .lock()
        .ok()
        .and_then(|a| a.get(&id).map(|a| (a.path.clone(), a.image)))
    else {
        return failure(StatusCode::NOT_FOUND);
    };
    // Long native video streams must not starve covers (or metadata). A full
    // local budget is backpressure, not an immediate permanent broken image.
    let semaphore = if path.starts_with("@catalog:") {
        CATALOG_CAPACITY.get_or_init(|| Arc::new(tokio::sync::Semaphore::new(3)))
    } else if image {
        IMAGE_CAPACITY.get_or_init(|| Arc::new(tokio::sync::Semaphore::new(12)))
    } else {
        CAPACITY.get_or_init(|| Arc::new(tokio::sync::Semaphore::new(12)))
    };
    let permit = match semaphore.clone().try_acquire_owned() {
        Ok(permit) => permit,
        Err(_) => {
            // Bound both the number of queued requests and their wait. This
            // never retries an upstream request or buffers an entire movie.
            let Ok(_waiting) = MEDIA_WAITERS
                .get_or_init(|| Arc::new(tokio::sync::Semaphore::new(64)))
                .clone().try_acquire_owned() else {
                    return failure(StatusCode::TOO_MANY_REQUESTS);
                };
            match tokio::time::timeout(Duration::from_secs(10),semaphore.clone().acquire_owned()).await {
                Ok(Ok(permit)) => permit,
                _ => return failure(StatusCode::SERVICE_UNAVAILABLE),
            }
        }
    };
    if !current().is_ok_and(|active| active.generation == session.generation) {
        return failure(StatusCode::UNAUTHORIZED);
    }
    // Catalogs go straight to the worker over an opaque, session-revoked
    // capability. Do not serialize 50k rows through the UI's IPC/DOM thread.
    if let Some(spec) = path.strip_prefix("@catalog:") {
        let result = match spec {
            "video" | "video:refresh" => session
                .video_catalog(spec.ends_with(":refresh"))
                .await
                .map(|rows| rows),
            "picture" => session
                .request(reqwest::Method::GET, "api/v1/pictures/catalog", &[], None)
                .await
                .map(Arc::new),
            "novel" => session
                .request(
                    reqwest::Method::GET,
                    "api/v1/novels",
                    &[("summary", "true".into())],
                    None,
                )
                .await
                .map(Arc::new),
            _ => return failure(StatusCode::BAD_REQUEST),
        };
        let (status, bytes) = match result {
            Ok(value) if GENERATION.load(Ordering::SeqCst) == session.generation => (
                StatusCode::OK,
                serde_json::to_vec(value.as_ref()).unwrap_or_default(),
            ),
            Ok(_) => (
                StatusCode::UNAUTHORIZED,
                r#"{"error":"媒体账户已更改"}"#.as_bytes().to_vec(),
            ),
            Err(error) => (
                StatusCode::BAD_GATEWAY,
                serde_json::to_vec(&json!({"error":error})).unwrap_or_default(),
            ),
        };
        drop(permit);
        return Response::builder()
            .status(status)
            .header("content-type", "application/json; charset=utf-8")
            .header("cache-control", "no-store")
            .header("access-control-allow-origin", "*")
            .header("x-content-type-options", "nosniff")
            .body(Body::from(bytes))
            .unwrap();
    }
    let Ok(url) = session.endpoint(&path) else {
        return failure(StatusCode::BAD_REQUEST);
    };
    let Ok(token) = session.access_token().await else {
        return failure(StatusCode::UNAUTHORIZED);
    };
    let mut request = session.client.get(url).bearer_auth(token);
    if let Some(range) = headers.get("range") {
        let valid = range.to_str().ok().is_some_and(|s| {
            s.len() < 80
                && s.starts_with("bytes=")
                && s[6..].bytes().all(|b| b.is_ascii_digit() || b == b'-')
                && s[6..].bytes().filter(|b| *b == b'-').count() == 1
        });
        if !valid {
            return failure(StatusCode::RANGE_NOT_SATISFIABLE);
        }
        request = request.header("range", range);
    }
    let Ok(mut response) = request.send().await else {
        return failure(StatusCode::BAD_GATEWAY);
    };
    if !response.status().is_success() {
        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            if let Ok(mut slot) = SESSION.lock() {
                if slot
                    .as_ref()
                    .is_some_and(|s| s.generation == session.generation)
                {
                    slot.take();
                }
            }
        }
        return failure(
            StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
        );
    }
    let claimed_type = response
        .headers()
        .get("content-type")
        .and_then(|s| s.to_str().ok())
        .unwrap_or("application/octet-stream").to_owned();
    // Windows/Python's extension MIME registry can serve valid WebP as an
    // octet-stream. Inspect only a small prefix and replay every consumed byte;
    // never download the whole image first or trust an HTML error's MIME label.
    let mut first_chunks=Vec::new();let mut prefix=Vec::with_capacity(64);
    let content_type=if image {
        let sniff_deadline=tokio::time::Instant::now()+Duration::from_secs(5);
        while prefix.len()<64 {
            match tokio::time::timeout_at(sniff_deadline,response.chunk()).await {
                Ok(Ok(Some(chunk)))=>{
                    if chunk.is_empty(){continue;}
                    let remaining=64-prefix.len();prefix.extend_from_slice(&chunk[..remaining.min(chunk.len())]);first_chunks.push(chunk);
                    if raster_mime(&prefix).is_some(){break;}
                }
                Ok(Ok(None))=>break,
                Ok(Err(_))=>return failure(StatusCode::BAD_GATEWAY),
                Err(_)=>return failure(StatusCode::GATEWAY_TIMEOUT),
            }
        }
        if let Some(detected)=raster_mime(&prefix){detected.to_owned()}
        else if claimed_type.split(';').next().is_some_and(|t|t.trim().eq_ignore_ascii_case("image/svg+xml"))&&svg_prefix(&prefix){"image/svg+xml".to_owned()}
        else{return failure(StatusCode::UNSUPPORTED_MEDIA_TYPE)}
    }else{claimed_type};
    let mut output = Response::builder()
        .status(response.status())
        .header("x-content-type-options", "nosniff")
        .header("content-type",content_type)
        .header("cache-control", "private, no-store");
    if image {output=output.header("content-security-policy","sandbox; default-src 'none'; style-src 'unsafe-inline'");}
    for name in [
        "content-length",
        "content-range",
        "accept-ranges",
    ] {
        if let Some(value) = response.headers().get(name) {
            output = output.header(name, value);
        }
    }
    // The permit lives as long as the stream, with no buffering of the whole movie.
    use futures_util::StreamExt;
    let stream = futures_util::stream::iter(first_chunks.into_iter().map(Ok::<_,reqwest::Error>)).chain(response.bytes_stream()).map(move |chunk| {
        let _keep_permit = &permit;
        let live = SESSION.lock().ok().is_some_and(|s| {
            s.as_ref()
                .is_some_and(|s| s.generation == session.generation)
        });
        if live {
            chunk.map_err(std::io::Error::other)
        } else {
            Err(std::io::Error::other("RHVideo session ended"))
        }
    });
    output.body(Body::from_stream(stream)).unwrap()
}
fn state() -> Value {
    let session = current().ok();
    let config = if session.is_some() {
        Config::default()
    } else {
        read_config()
    };
    json!({"server":session.as_ref().map(|s|s.base.as_str()).unwrap_or(&config.server),
        "username":session.as_ref().map(|s|s.username.as_str()).unwrap_or(&config.username),
        "connected":session.is_some(),"nativePlayback":native_available(),"credentialsPersisted":false,
        "generation":session.as_ref().map(|s|s.generation),"assetRevision":session.as_ref().map(|s|s.asset_revision.load(Ordering::Relaxed))})
}
fn native_available() -> bool {
    #[cfg(windows)]
    {
        crate::rhvideo_player::available()
    }
    #[cfg(not(windows))]
    {
        false
    }
}
#[cfg(windows)]
fn export_dialog(text: &str) -> Result<Value, String> {
    use windows::{
        core::PCWSTR,
        Win32::{System::Com::*, UI::Shell::*},
    };
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            .ok()
            .map_err(|e| e.to_string())?;
        struct Com;
        impl Drop for Com {
            fn drop(&mut self) {
                unsafe { CoUninitialize() }
            }
        }
        let _com = Com;
        let dialog: IFileSaveDialog = CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER)
            .map_err(|e| e.to_string())?;
        let name: Vec<u16> = "RHVideo-selection.json\0".encode_utf16().collect();
        dialog
            .SetFileName(PCWSTR(name.as_ptr()))
            .map_err(|e| e.to_string())?;
        dialog
            .SetOptions(
                dialog.GetOptions().map_err(|e| e.to_string())?
                    | FOS_FORCEFILESYSTEM
                    | FOS_OVERWRITEPROMPT,
            )
            .map_err(|e| e.to_string())?;
        if let Err(e) = dialog.Show(None) {
            if e.code().0 as u32 == 0x800704c7 {
                return Ok(json!({"saved":false}));
            }
            return Err(e.to_string());
        }
        let item = dialog.GetResult().map_err(|e| e.to_string())?;
        let p = item
            .GetDisplayName(SIGDN_FILESYSPATH)
            .map_err(|e| e.to_string())?;
        let path = p.to_string().map_err(|e| e.to_string());
        CoTaskMemFree(Some(p.0.cast()));
        let path = path?;
        std::fs::write(&path, text.as_bytes()).map_err(|e| format!("导出失败：{e}"))?;
        Ok(json!({"saved":true,"path":path}))
    }
}
pub(crate) async fn client_window(
    app: AppHandle,
    label: &'static str,
    url: &'static str,
    title: &'static str,
    size: (f64, f64),
    minimum: (f64, f64),
) -> Result<tauri::WebviewWindow, String> {
    #[cfg(windows)]
    {
        // Reuse the actual controller environment, not merely a nominal data
        // directory. Otherwise WebView2 can spawn a second browser process for
        // a dynamic window, breaking profile isolation and CLI target discovery.
        let main = app.get_webview_window("main").ok_or("主窗口不可用")?;
        let (tx, rx) = tokio::sync::oneshot::channel();
        main.with_webview(move |platform| {
            let result = crate::window::with_browser_args(
                tauri::WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::App(url.into()))
                    .title(title)
                    .inner_size(size.0, size.1)
                    .min_inner_size(minimum.0, minimum.1)
                    .with_environment(platform.environment()),
            )
            .build()
            .map_err(|e| e.to_string());
            let _ = tx.send(result);
        })
        .map_err(|e| e.to_string())?;
        rx.await.map_err(|_| "创建媒体库窗口失败".to_owned())?
    }
    #[cfg(not(windows))]
    {
        crate::window::with_browser_args(
            tauri::WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::App(url.into()))
                .title(title)
                .inner_size(size.0, size.1)
                .min_inner_size(minimum.0, minimum.1),
        )
        .build()
        .map_err(|e| e.to_string())
    }
}
fn queue_info() -> Value {
    PLAYBACK.lock().ok().and_then(|slot|slot.as_ref().map(|q|{
        let parent=q.options["origin"]=="frame"&&q.options["parentTotal"].as_u64().unwrap_or(0)>0;
        json!({"id":q.items[q.index].0,"revision":q.revision,"planRevision":q.plan_revision,"index":q.index,"total":q.items.len(),
            "sourceTotal":q.pool.as_ref().map(|p|p.items.len()),"portraitTotal":q.pool.as_ref().map(|p|p.portraits.iter().filter(|v|**v).count()),
            "hasPrevious":parent||if q.options["reference"]==true{q.items.len()>1}else{q.index>0},
            "hasNext":parent||if q.options["reference"]==true{q.items.len()>1}else{q.index+1<q.items.len()},
            "options":q.options,"segmentDuration":q.durations.get(q.index),"segmentStartMs":(q.bounds().0*1000.) as i64,
            "segmentLengthMs":q.bounds().1.map(|s|(s*1000.) as i64),"elapsedBeforeMs":(q.prefix.get(q.index).copied().unwrap_or(0.)*1000.) as i64,
            "totalMs":(q.prefix.last().copied().unwrap_or(0.)*1000.) as i64})
    })).unwrap_or(Value::Null)
}
fn segment_start(duration: f64, options: &Value) -> f64 {
    if options["fullLength"] != false {
        return 0.;
    }
    let segment = options["segment"].as_f64().unwrap_or(3.).clamp(0.1, 3600.);
    let mut random = [0u8; 4];
    let _ = getrandom::fill(&mut random);
    reference_segment_start(duration, segment, u32::from_le_bytes(random) as f64 / (u32::MAX as f64 + 1.))
}
fn reference_segment_start(duration:f64,segment:f64,random:f64)->f64{
    let maximum=duration-segment-1.;
    if maximum>1.{((1.+random.clamp(0.,1.)*(maximum-1.))*10.).round()/10.}else{0.}
}
fn reference_segment_length(duration:f64,options:&Value)->f64{
    let segment=options["segment"].as_f64().unwrap_or(3.).clamp(1.,300.);
    if duration>0.{((if options["fullLength"]!=false{duration}else{segment.min(duration)})*10.).round().max(1.)/10.}else if options["fullLength"]!=false{86400.}else{segment}
}
fn validate_reference_options(options:&Value)->Result<(),String>{
    if !options.is_object(){return Err("播放设置必须是对象".into());}
    if options.get("loop").is_some_and(|value|!value.is_boolean())||options.get("rate").is_some_and(|value|!value.as_f64().is_some_and(|rate|rate.is_finite()&&(0.25..=4.).contains(&rate))){return Err("播放循环或速度设置无效".into());}
    if options["reference"]!=true{return Ok(());}
    if options.get("portraitOnly").is_some_and(|value|!value.is_boolean()){return Err("竖屏选项必须是布尔值".into());}
    if !options["mode"].as_str().is_some_and(|s|["segments","sequential","sequential-super"].contains(&s))
        || !options["signature"].as_str().is_some_and(|s|s.len()==64&&s.bytes().all(|b|b.is_ascii_hexdigit()))
        || !options["fullLength"].is_boolean()
        || !options["loop"].is_boolean()
        || !options["segment"].as_f64().is_some_and(|n|n.is_finite()&&(1.0..=300.).contains(&n))
        || !options["rate"].as_f64().is_some_and(|n|n.is_finite()&&(0.25..=4.).contains(&n)){
        return Err("连播配置无效；尚未更改播放队列".into());
    }
    Ok(())
}
fn schedule_preload(app: AppHandle, session: Arc<Session>) -> Result<Value, String> {
    #[cfg(windows)]
    {
        let next = PLAYBACK
            .lock()
            .map_err(|_| "播放队列不可用")?
            .as_ref()
            .filter(|q| q.generation == session.generation && q.options["loop"] != true)
            .and_then(|q| {
                q.items
                    .get(q.index + 1)
                    .map(|(id, title)| (id.clone(), title.clone(), q.options["super"] == true))
            });
        if let Some((id, title, low)) = next {
            let url = session.asset(
                format!(
                    "api/v1/videos/{id}/play{}",
                    if low { "?super=true" } else { "" }
                ),
                false,
            )?;
            tauri::async_runtime::spawn(async move {
                if GENERATION.load(Ordering::SeqCst) == session.generation {
                    let _ = crate::rhvideo_player::preload(app, url, title).await;
                }
            });
            return Ok(json!({"scheduled":true}));
        }
        crate::rhvideo_player::clear_preload();
    }
    #[cfg(not(windows))]
    {
        let _ = (app, session);
    }
    Ok(json!({"scheduled":false}))
}
async fn native_play(
    app: AppHandle,
    session: &Session,
    id: &str,
    title: String,
    seconds: f64,
    low_bandwidth: bool,
) -> Result<Value, String> {
    let path = format!(
        "api/v1/videos/{id}/play{}",
        if low_bandwidth { "?super=true" } else { "" }
    );
    let url = session.asset(path, false)?;
    #[cfg(windows)]
    {
        let result=crate::rhvideo_player::play(app, url, title, seconds).await?;
        if !current().is_ok_and(|s|s.generation==session.generation){crate::rhvideo_player::stop_single();return Err("播放期间媒体账户已更改；旧播放已停止".into());}
        Ok(result)
    }
    #[cfg(not(windows))]
    {
        let _ = (app, url, title, seconds);
        Err("此体验版的原生 RHVideo 播放暂仅支持 Windows".into())
    }
}
#[tauri::command]
pub async fn rhvideo_open(app: AppHandle) -> Result<Value, String> {
    if let Some(window) = app.get_webview_window("window-rhvideo") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        client_window(
            app.clone(),
            "window-rhvideo",
            "rhvideo.html",
            "RHFiles · RHVideo",
            (1200., 820.),
            (800., 550.),
        )
        .await?;
    }
    // Focusing the Tauri Window does not focus its WebView2 controller. Without
    // both, the preview can visibly own the active window while keyboard input
    // is still routed to the former native video surface/main WebView.
    focus_library(&app);
    Ok(json!({"opened":true}))
}
fn focus_library(app:&AppHandle){
    if let Some(window)=app.get_webview_window("window-rhvideo"){let _=window.unminimize();let _=window.show();let _=window.set_focus();let webview:&tauri::Webview=window.as_ref();let _=webview.set_focus();}
}
#[tauri::command]
pub async fn rhvideo_request(
    app: AppHandle,
    action: String,
    mut args: Value,
) -> Result<Value, String> {
    let expected = args
        .as_object_mut()
        .and_then(|a| a.remove("_sessionGeneration"))
        .map(|v| v.as_u64().ok_or("媒体会话参数无效"))
        .transpose()?;
    if let Some(generation) = expected {
        if action != "logout" && current()?.generation != generation {
            return Err("媒体账户已改变，操作未执行，请刷新后重新操作".into());
        }
    }
    if !args.is_object() {
        return Err("参数必须是 JSON 对象".into());
    }
    match action.as_str() {
        "page.volume" => {
            current()?;
            let value=args["value"].as_u64().filter(|v|*v<=100).ok_or("页面音量范围是 0–100")? as u32;
            #[cfg(windows)] { return crate::rhvideo_player::page_volume(value); }
            #[cfg(not(windows))] { let _=value;return Err("此平台尚未接入原生音量".into()); }
        }
        "player.close" | "player.back" => {
            let _play=PLAY_LOCK.lock().await;
            #[cfg(windows)]crate::rhvideo_player::check_input(&args)?;
            let context=PLAYBACK.lock().ok().and_then(|q|q.as_ref().map(|q|(q.generation,q.options.clone())));
            flush_playback();
            *PLAYBACK.lock().map_err(|_|"播放队列状态不可用")?=None;
            #[cfg(windows)] { crate::rhvideo_player::stop_single(); }
            if let Some(window)=app.get_webview_window("window-rhvideo-player") { let _=window.close(); }
            focus_library(&app);
            if let Some((generation,options))=context {
                emit_parent_preview(&app,generation,&options,0,action=="player.close");
                if action=="player.close"||options["deferPreviewCommit"]!=true {if let Ok(session)=current(){let _=start_preview_commit(app,session);}}
            }
            return Ok(json!({"closed":true}));
        }
        "player.preloadState" => {
            current()?;
            #[cfg(windows)]
            {
                return Ok(crate::rhvideo_player::preload_state());
            }
            #[cfg(not(windows))]
            {
                return Ok(json!({"state":"unsupported"}));
            }
        }
        "player.preload" => {
            return schedule_preload(app, current()?);
        }
        "presentation.open" => {
            let session = current()?;
            let id = identifier(text(&args, "id", 128)?)?;
            let title = text(&args, "title", 1024)?.to_owned();
            let seconds = args["seconds"].as_f64().unwrap_or(0.0);
            if !seconds.is_finite() || !(0.0..=604800.0).contains(&seconds) {
                return Err("播放位置无效".into());
            }
            let url = session.asset(
                format!(
                    "api/v1/videos/{id}/play{}",
                    if args["super"] == true {
                        "?super=true"
                    } else {
                        ""
                    }
                ),
                false,
            )?;
            #[cfg(windows)]
            {
                let result=crate::rhvideo_player::presentation_open(app.clone(), url, title, seconds).await;
                wake_playback_monitor(&app);return result;
            }
            #[cfg(not(windows))]
            {
                let _ = (url, title, seconds);
                return Err("此平台尚未接入原生放映".into());
            }
        }
        "presentation.close" => {
            #[cfg(windows)]
            {
                crate::rhvideo_player::stop_presentation();
            }
            return Ok(json!({"closed":true}));
        }
        "presentation.bounds" => {
            current()?;
            #[cfg(windows)]
            {
                return crate::rhvideo_player::presentation_bounds(app, args).await;
            }
            #[cfg(not(windows))]
            {
                return Err("此平台尚未接入原生放映".into());
            }
        }
        "presentation.state" | "presentation.control" => {
            current()?;
            #[cfg(windows)]
            {
                let result=crate::rhvideo_player::presentation_command(&action, &args);
                if action=="presentation.control" {wake_playback_monitor(&app);}
                return result;
            }
            #[cfg(not(windows))]
            {
                return Err("此平台尚未接入原生放映".into());
            }
        }
        "grid.open" | "grid.page" | "grid.seekGroup" => {
            let _loading = GRID_LOAD.lock().await;
            #[cfg(windows)]crate::rhvideo_player::check_grid_input(&args)?;
            let session = current()?;
            if expected.is_some_and(|g|g!=session.generation){return Err("媒体账户已改变，同屏操作未执行".into());}
            let mut queue = if action != "grid.open" {
                let mut queue = GRID_QUEUE
                    .lock()
                    .map_err(|_| "网格队列不可用")?
                    .clone()
                    .filter(|q| q.generation == session.generation)
                    .ok_or("网格队列已失效")?;
                let previous=queue.offset;
                if action=="grid.seekGroup"{
                    queue.seek_group(args["ratio"].as_f64().ok_or("同屏分组位置无效")?)?;
                }else{
                    let direction=args["direction"].as_i64().filter(|d|[-1,1].contains(d)).ok_or("翻页方向无效")?;queue.page(direction);
                }
                if queue.offset==previous{
                    #[cfg(windows)]return queue.view(&session,crate::rhvideo_player::grid_command("grid.state",&json!({}))?);
                }
                queue
            } else if let Some(ticket) = args["playlist"].as_str() {
                let count = args["count"]
                    .as_u64()
                    .filter(|n| (1..=9).contains(n))
                    .ok_or("同屏数量无效")? as usize;
                let mut prepared = PREPARED.lock().map_err(|_| "队列不可用")?;
                let at = prepared
                    .iter().position(|q| {
                        q.ticket == ticket
                            && q.generation == session.generation
                            && q.touched.elapsed()<Duration::from_secs(300)
                            && !q.items.is_empty()
                    })
                    .ok_or("播放列表已失效")?;
                let q=&prepared[at];
                let queue=GridQueue::new(session.generation,q.items.clone(),count,if q.options["grid"]==true{q.grid_cells.clone()}else{Vec::new()},if q.options["grid"]==true{q.grid_ends.clone()}else{Vec::new()},args["super"]==true)?;
                prepared.remove(at);queue
            } else {
                let items = args["items"]
                    .as_array()
                    .filter(|a| !a.is_empty() && a.len() <= 9)
                    .ok_or("同屏播放需要 1–9 个视频")?;
                let items = items
                    .iter()
                    .map(|v| {
                        Ok((
                            identifier(text(v, "id", 128)?)?.to_owned(),
                            text(v, "title", 1024)?.to_owned(),
                        ))
                    })
                    .collect::<Result<Vec<_>, String>>()?;
                GridQueue::new(session.generation,items.clone(),items.len(),Vec::new(),Vec::new(),args["super"]==true)?
            };
            if action=="grid.open"{queue.restore_group(&queue_state(&session,"grid",None)?["groupIds"]);}
            #[cfg(windows)]if action!="grid.open"{queue.states.lock().map_err(|_|"同屏状态不可用")?.extend(crate::rhvideo_player::grid_snapshot());}
            let sources = {let snapshots=queue.states.lock().map_err(|_|"同屏状态不可用")?;queue
                .items
                .iter()
                .skip(queue.offset)
                .take(queue.count()).enumerate()
                .map(|(i,(id, title))| {
                    Ok((
                        id.clone(),
                        session.asset(
                            format!(
                                "api/v1/videos/{id}/play{}",
                                if queue.low_bandwidth {
                                    "?super=true"
                                } else {
                                    ""
                                }
                            ),
                            false,
                        )?,
                        title.clone(),
                        queue.rects.get(queue.offset+i).copied().flatten(),snapshots.get(id).cloned().unwrap_or(Value::Null),
                    ))
                })
                .collect::<Result<Vec<_>, String>>()?};
            #[cfg(windows)]
            {
                let mut result = crate::rhvideo_player::grid_open(app.clone(), sources).await?;
                wake_playback_monitor(&app);
                if current()?.generation != session.generation {
                    crate::rhvideo_player::stop_grid();
                    return Err("媒体账户已更改".into());
                }
                queue.window_lease=result["windowLease"].as_u64().unwrap_or(0);
                if let Err(error)=queue_state(&session,"grid",Some(json!({"groupIds":queue.ids()}))){result["clientWarning"]=json!(format!("同屏已打开，但无法保存分组位置：{error}"));}
                let result = queue.view(&session,result)?;
                *GRID_QUEUE.lock().map_err(|_| "网格队列不可用")? = Some(queue);
                let _=app.emit_to("window-rhvideo-grid","rhvideo-grid-session",json!({"generation":session.generation}));
                return Ok(result);
            }
            #[cfg(not(windows))]
            {
                let _ = sources;
                return Err("此平台尚未接入原生多视频".into());
            }
        }
        "grid.state" | "grid.control" | "grid.expand" => {
            let _loading=GRID_LOAD.lock().await;
            #[cfg(windows)]crate::rhvideo_player::check_grid_input(&args)?;
            let _session = current()?;
            if expected.is_some_and(|g|g!=_session.generation){return Err("媒体账户已改变，同屏操作未执行".into());}
            #[cfg(windows)]
            {
                let value = crate::rhvideo_player::grid_command(&action, &args)?;
                if action=="grid.control" {wake_playback_monitor(&app);}
                if action == "grid.expand" {
                    crate::rhvideo_player::grid_relayout(&app)?;
                }
                return GRID_QUEUE
                    .lock()
                    .map_err(|_| "网格队列不可用")?
                    .as_ref()
                    .filter(|q| q.generation == _session.generation)
                    .map(|q| q.view(&_session,value.clone()))
                    .unwrap_or(Ok(value));
            }
            #[cfg(not(windows))]
            {
                return Err("此平台尚未接入原生多视频".into());
            }
        }
        "grid.favorite"|"grid.mark"=>{
            let _loading=GRID_LOAD.lock().await;
            #[cfg(windows)]crate::rhvideo_player::check_grid_input(&args)?;
            let session=current()?;if expected.is_some_and(|g|g!=session.generation){return Err("媒体账户已改变，同屏操作未执行".into());}
            let(id,title)={let slot=GRID_QUEUE.lock().map_err(|_|"网格队列不可用")?;let q=slot.as_ref().filter(|q|q.generation==session.generation).ok_or("网格队列已失效")?;let index=args["target"].as_u64().filter(|i|*i<(q.count() as u64)).ok_or("请选择单个视频")? as usize;q.items[q.offset+index].clone()};
            if action=="grid.mark"{return preview_mark(&session,"video",&id,&title,args["enabled"].as_bool());}
            let enabled=!session.favorites.lock().map_err(|_|"收藏不可用")?.contains(&format!("video:{id}"));
            update_favorite(&app,&session,"video",&id,enabled).await?;return Ok(json!({"id":id,"favorite":enabled}));
        }
        "state" => return Ok(state()),
        "grid.close" => {
            let _loading=GRID_LOAD.lock().await;
            #[cfg(windows)]crate::rhvideo_player::check_grid_input(&args)?;
            let session=current()?;if expected.is_some_and(|g|g!=session.generation){return Err("媒体账户已改变，同屏操作未执行".into());}
            *GRID_QUEUE.lock().map_err(|_| "网格队列不可用")? = None;
            #[cfg(windows)]
            {
                crate::rhvideo_player::stop_grid();
                if let Some(w) = app.get_webview_window("window-rhvideo-grid") {
                    let _ = w.close();
                }
            }
            start_preview_commit(app,session)?;
            return Ok(json!({"closed":true}));
        }
        "player.fullscreen" => {
            let _play=PLAY_LOCK.lock().await;
            #[cfg(windows)]crate::rhvideo_player::check_input(&args)?;
            let window = app
                .get_webview_window("window-rhvideo-player")
                .ok_or("播放器尚未打开")?;
            let fullscreen = !window.is_fullscreen().map_err(|e| e.to_string())?;
            window
                .set_fullscreen(fullscreen)
                .map_err(|e| e.to_string())?;
            return Ok(json!({"fullscreen":fullscreen}));
        }
        "logout" => {
            flush_playback();
            let mut slot = SESSION.lock().map_err(|_| "媒体库状态不可用")?;
            if expected.is_some_and(|g| g != GENERATION.load(Ordering::SeqCst)) {
                let active = slot
                    .as_ref()
                    .is_some_and(|s| s.generation == GENERATION.load(Ordering::SeqCst));
                drop(slot);
                return if active {
                    Err("媒体账户已改变，退出操作未执行".into())
                } else {
                    Ok(state())
                };
            }
            GENERATION.fetch_add(1, Ordering::SeqCst);
            slot.take();
            drop(slot);
            PLAYBACK.lock().map_err(|_| "播放队列状态不可用")?.take();
            PREPARED.lock().map_err(|_| "播放队列状态不可用")?.clear();
            #[cfg(windows)]
            crate::rhvideo_player::stop();
            return Ok(state());
        }
        "connect" | "register" => {
            flush_playback();
            let generation = {
                let mut slot = SESSION.lock().map_err(|_| "媒体库状态不可用")?;
                let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
                slot.take();
                generation
            };
            PREPARED.lock().map_err(|_| "播放队列状态不可用")?.clear();
            PLAYBACK.lock().map_err(|_| "播放队列状态不可用")?.take();
            #[cfg(windows)]
            crate::rhvideo_player::stop();
            let base = base_url(text(&args, "server", 4096)?)?;
            let username = text(&args, "username", 256)?.trim().to_owned();
            let password = text(&args, "password", 4096)?;
            if username.is_empty() || password.is_empty() {
                return Err("请填写 RHVideo 用户名和密码".into());
            }
            let client = client()?;
            if action == "register" {
                let email = text(&args, "email", 320)?;
                json_response(
                    client
                        .post(
                            base.join("api/v1/auth/register")
                                .map_err(|_| "服务器地址无效")?,
                        )
                        .json(&json!({"username":username,"password":password,"email":email}))
                        .timeout(Duration::from_secs(20))
                        .send()
                        .await
                        .map_err(network_error)?,
                )
                .await?;
            }
            let response = client
                .post(
                    base.join("api/v1/auth/login")
                        .map_err(|_| "服务器地址无效")?,
                )
                .json(&json!({"username":username,"password":password}))
                .timeout(Duration::from_secs(20))
                .send()
                .await
                .map_err(network_error)?;
            if response.status() == reqwest::StatusCode::UNAUTHORIZED {
                return Err("RHVideo 用户名或密码错误（HTTP 401）".into());
            }
            let login = json_response(response).await?;
            let token = login
                .get("access_token")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty() && s.len() < 32768)
                .ok_or("服务器未返回有效登录令牌")?
                .to_owned();
            let mut bytes = [0u8; 32];
            getrandom::fill(&mut bytes).map_err(|_| "无法生成安全的本机媒体通道")?;
            let session = Arc::new(Session {
                base,
                username: username.clone(),
                token: Mutex::new(token),
                refresh_at: AtomicU64::new(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs()
                        + login["expires_in"]
                            .as_u64()
                            .unwrap_or(1800)
                            .saturating_sub(60)
                            .max(1),
                ),
                refresh_lock: tokio::sync::Mutex::new(()),
                capability: bytes.iter().map(|b| format!("{b:02x}")).collect(),
                port: broker().await?,
                generation,
                client,
                assets: Mutex::new(HashMap::new()),
                next_asset: AtomicU64::new(1),
                asset_revision: AtomicU64::new(0),
                videos: tokio::sync::Mutex::new(None),
                favorites: Mutex::new(HashSet::new()),
                preview: Mutex::new(PreviewState::default()),
                single_controls: Mutex::new(SingleControls::default()),
            });
            session
                .request(reqwest::Method::GET, "api/v1/auth/me", &[], None)
                .await?;
            if GENERATION.load(Ordering::SeqCst) != generation {
                return Err("此登录请求已被新的操作取消".into());
            }
            let config = Config {
                server: session.base.to_string(),
                username,
            };
            let path = config_path()?;
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|_| "无法保存媒体库地址")?;
            }
            std::fs::write(&path, serde_json::to_vec(&config).map_err(|_| "配置无效")?)
                .map_err(|_| "无法保存媒体库地址")?;
            #[cfg(windows)]
            crate::rhvideo_player::stop();
            PLAYBACK.lock().map_err(|_| "播放队列状态不可用")?.take();
            {
                let mut slot = SESSION.lock().map_err(|_| "媒体库状态不可用")?;
                if generation != GENERATION.load(Ordering::SeqCst) {
                    return Err("连接已取消，未切换媒体账户".into());
                }
                *slot = Some(session);
            }
            return Ok(state());
        }
        _ => {}
    }
    let session = current()?;
    if expected.is_some_and(|g| g != session.generation) {
        return Err("媒体账户已改变，操作未执行，请刷新后重新操作".into());
    }
    match action.as_str() {
        "catalog.resource" => {
            let kind = kind(&args)?;
            if kind == "favorite" {
                return Err("收藏需要分页读取".into());
            }
            let path = format!(
                "@catalog:{kind}{}",
                if kind == "video" && args["refresh"] == true {
                    ":refresh"
                } else {
                    ""
                }
            );
            Ok(json!({"url":session.asset(path, false)?, "generation":session.generation}))
        }
        "operation" => {
            let r = contract::request(&args)?;
            if args["name"] == "index.video" {
                return Ok((*session
                    .video_catalog(args["query"]["refresh"] == true)
                    .await?)
                    .clone());
            }
            let query: Vec<_> = r
                .query
                .iter()
                .map(|(k, v)| (k.as_str(), v.clone()))
                .collect();
            let value = session.request(r.method, &r.path, &query, r.body).await?;
            if r.invalidates_catalog {
                *session.videos.lock().await = None;
            }
            Ok(value)
        }
        "resolve" => {
            let rows = args["items"]
                .as_array()
                .filter(|a| a.len() <= 100)
                .ok_or("每次最多解析 100 个媒体")?;
            let items = rows
                .iter()
                .map(|v| session.media(v, v["kind"].as_str().unwrap_or("video")))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(json!({"items":items,"generation":session.generation}))
        }
        "images" => {
            let paths = args["paths"]
                .as_array()
                .filter(|a| a.len() <= 100)
                .ok_or("每次最多解析 100 张图片")?;
            let urls = paths
                .iter()
                .map(|p| session.asset(safe_image_path(p.as_str().ok_or("图片路径无效")?)?, true))
                .collect::<Result<Vec<_>, String>>()?;
            Ok(json!(urls))
        }
        "preferences" => {
            let _guard = PREFERENCES_LOCK.lock().map_err(|_| "偏好状态不可用")?;
            let account = format!("{}\n{}", session.base, session.username);
            let path = config_path()?.with_file_name("rhvideo-preferences.json");
            let mut accounts: Value = std::fs::read(&path)
                .ok()
                .and_then(|b| serde_json::from_slice(&b).ok())
                .filter(Value::is_object)
                .unwrap_or(json!({}));
            if let Some(value) = args.get("value") {
                let bytes = serde_json::to_vec(value).map_err(|_| "偏好无效")?;
                if !value.is_object() || bytes.len() > 256 * 1024 {
                    return Err("偏好数据过大".into());
                }
                accounts[&account] = value.clone();
                let temp = path.with_extension("tmp");
                std::fs::write(
                    &temp,
                    serde_json::to_vec(&accounts).map_err(|_| "无法保存偏好")?,
                )
                .map_err(|_| "无法保存偏好")?;
                std::fs::rename(temp, &path).map_err(|_| "无法保存偏好")?;
                Ok(json!({"saved":true}))
            } else {
                Ok(accounts.get(&account).cloned().unwrap_or(json!({})))
            }
        }
        "playback.history" => playback_history(&session, None, None, false),
        "playlist.state"=>queue_state(&session,text(&args,"mode",32)?,None),
        "playlist.settings"=>{
            let options=args["options"].as_object().ok_or("连播设置无效")?;
            for(key,value)in options{if key=="segment"{if !value.as_f64().is_some_and(|n|n.is_finite()&&(1.0..=300.).contains(&n)){return Err("分段长度无效".into());}}else if !["loop","fullLength","portraitOnly"].contains(&key.as_str())||!value.is_boolean(){return Err("连播设置无效".into());}}
            queue_state(&session,text(&args,"mode",32)?,Some(args["options"].clone()))
        }
        "playback.clear" => playback_history(&session, None, Some(json!({})), true),
        "playlist.prepare" => {
            let mut drafts=PREPARED.lock().map_err(|_| "队列不可用")?;
            prepare_playlist(&mut drafts,session.generation,&args)
        }
        "playlist.discard" => {
            let ticket=identifier(text(&args,"ticket",128)?)?;
            let mut drafts=PREPARED.lock().map_err(|_|"队列不可用")?;let before=drafts.len();
            drafts.retain(|q|q.ticket!=ticket||q.generation!=session.generation);
            Ok(json!({"removed":before!=drafts.len()}))
        }
        "export" => {
            let text = text(&args, "text", 32 * 1024 * 1024)?.to_owned();
            #[cfg(windows)]
            {
                return tauri::async_runtime::spawn_blocking(move || export_dialog(&text))
                    .await
                    .map_err(|_| "导出任务结束".to_owned())?;
            }
            #[cfg(not(windows))]
            {
                let _ = text;
                Err("此平台的原生导出尚未接入".into())
            }
        }
        "catalog" => {
            let kind = kind(&args)?;
            let offset = number(&args, "offset", 0, 1_000_000)?;
            let limit = number(&args, "limit", 36, 72)?.max(1);
            let search = args
                .get("search")
                .map(|_| text(&args, "search", 256))
                .transpose()?
                .unwrap_or("");
            let folder = args
                .get("folder")
                .map(|_| text(&args, "folder", 1024))
                .transpose()?
                .unwrap_or("");
            let (rows, total) = if kind == "video" {
                let value = session
                    .video_catalog(args.get("refresh").and_then(Value::as_bool) == Some(true))
                    .await?;
                let rows = value.as_array().ok_or("RHVideo 视频列表格式不兼容")?;
                let search = search.to_lowercase();
                let rows: Vec<_> = rows
                    .iter()
                    .filter(|v| {
                        let label = v.get("folder_label").and_then(Value::as_str).unwrap_or("");
                        let title = v
                            .get("original_filename")
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        (folder.is_empty() || label.split(',').any(|s| s.trim() == folder))
                            && (search.is_empty()
                                || format!("{title} {label}").to_lowercase().contains(&search))
                    })
                    .collect();
                (
                    rows.iter()
                        .skip(offset as usize)
                        .take(limit as usize)
                        .map(|v| (*v).clone())
                        .collect::<Vec<_>>(),
                    rows.len() as u64,
                )
            } else {
                let path = match kind {
                    "picture" => "api/v1/pictures",
                    "novel" => "api/v1/novels",
                    _ => "api/v1/favorites",
                };
                let mut query = vec![("skip", offset.to_string()), ("limit", limit.to_string())];
                if !search.is_empty() {
                    query.push(("search", search.into()));
                }
                if !folder.is_empty() && kind != "favorite" {
                    query.push(("folder", folder.into()));
                }
                let value = session
                    .request(reqwest::Method::GET, path, &query, None)
                    .await?;
                (
                    value
                        .get("items")
                        .and_then(Value::as_array)
                        .ok_or("RHVideo 媒体列表格式不兼容")?
                        .clone(),
                    value
                        .get("total")
                        .and_then(Value::as_u64)
                        .ok_or("媒体列表缺少总数")?,
                )
            };
            let items = rows
                .iter()
                .map(|v| session.media(v, kind))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(
                json!({"items":items,"total":total,"offset":offset,"limit":limit,"generation":session.generation}),
            )
        }
        "folders" => {
            let path = match kind(&args)? {
                "video" => "api/v1/videos/folders",
                "picture" => "api/v1/pictures/folders",
                "novel" => "api/v1/novels/folders",
                _ => return Ok(json!([])),
            };
            session.request(reqwest::Method::GET, path, &[], None).await
        }
        "favorites" => {
            let value=session
                .request(reqwest::Method::GET, "api/v1/favorites/ids", &[], None)
                .await?;
            let mut cache=HashSet::new();for kind in ["video","picture","novel"]{if let Some(ids)=value[format!("{kind}_ids")].as_array(){for id in ids.iter().filter_map(Value::as_str){if identifier(id).is_ok(){cache.insert(format!("{kind}:{id}"));}}}}
            *session.favorites.lock().map_err(|_|"收藏状态不可用")?=cache;
            Ok(value)
        }
        "favorite" => {
            let kind = kind(&args)?;
            if kind == "favorite" {
                return Err("收藏类型无效".into());
            }
            let id = identifier(text(&args, "id", 128)?)?;
            let enabled = args
                .get("enabled")
                .and_then(Value::as_bool)
                .ok_or("缺少收藏状态")?;
            update_favorite(&app,&session,kind,id,enabled).await
        }
        "player.favorite"=>{
            let id=identifier(text(&args,"id",128)?)?;
            let revision=number(&args,"revision",0,u64::MAX)?;
            if !PLAYBACK.lock().ok().is_some_and(|q|q.as_ref().is_some_and(|q|expected_playback(q,session.generation,Some(id),Some(revision)))){return Err("播放目标已更改，收藏操作未执行".into());}
            let enabled=!session.favorites.lock().map_err(|_|"收藏不可用")?.contains(&format!("video:{id}"));
            update_favorite(&app,&session,"video",id,enabled).await?;
            Ok(json!({"id":id,"favorite":enabled}))
        }
        "preview.mark"=>{
            #[cfg(windows)]crate::rhvideo_player::check_input(&args)?;
            let media_kind=kind(&args)?;if media_kind=="favorite"{return Err("标记类型无效".into());}
            let id=identifier(text(&args,"id",128)?)?;let title=text(&args,"title",1024)?;
            preview_mark(&session,media_kind,id,title,args["enabled"].as_bool())
        }
        "preview.pending"=>{let marks=session.preview.lock().map_err(|_|"标记不可用")?;let mut items=marks.pending.values().collect::<Vec<_>>();items.sort_by_key(|item|item["order"].as_u64().unwrap_or(0));Ok(json!({"items":items,"running":marks.running}))}
        "preview.result"=>Ok(session.preview.lock().map_err(|_|"暂存结果不可用")?.result.clone()),
        "preview.commit"=>start_preview_commit(app,session),
        "novel" | "chapter" | "progress" => {
            let id = identifier(text(&args, "id", 128)?)?;
            let path = format!("api/v1/novels/{id}");
            if action == "novel" {
                session
                    .request(reqwest::Method::GET, &path, &[], None)
                    .await
            } else {
                let chapter = number(&args, "chapter", 0, 100000)?;
                if action == "chapter" {
                    session
                        .request(
                            reqwest::Method::GET,
                            &format!("{path}/chapters/{chapter}"),
                            &[],
                            None,
                        )
                        .await
                } else {
                    let ratio = args
                        .get("ratio")
                        .and_then(Value::as_f64)
                        .filter(|v| v.is_finite() && (0.0..=1.0).contains(v))
                        .ok_or("阅读进度无效")?;
                    session
                        .request(
                            reqwest::Method::PUT,
                            &format!("{path}/progress"),
                            &[],
                            Some(json!({"chapter_index":chapter,"scroll_ratio":ratio})),
                        )
                        .await
                }
            }
        }
        "frames" => {
            let id = identifier(text(&args, "id", 128)?)?;
            let value = session
                .request(
                    reqwest::Method::GET,
                    &format!("api/v1/screenshots/video/{id}"),
                    &[("per_video", "40".into())],
                    None,
                )
                .await?;
            let mut frames = Vec::new();
            for frame in value
                .get("screenshots")
                .and_then(Value::as_array)
                .ok_or("时间轴数据格式不兼容")?
                .iter()
                .take(100)
            {
                let path = safe_storage_path(
                    frame
                        .get("url")
                        .and_then(Value::as_str)
                        .ok_or("关键帧缺少路径")?,
                )?;
                frames.push(json!({"url":session.asset(path,true)?,"seconds":frame.get("time_seconds").and_then(Value::as_f64).unwrap_or(0.0)}));
            }
            Ok(json!({"frames":frames}))
        }
        "play" => {
            let _play = PLAY_LOCK.lock().await;
            let id = identifier(text(&args, "id", 128)?)?;
            let title = text(&args, "title", 1024)?.to_owned();
            let mut seconds = args.get("seconds").and_then(Value::as_f64).unwrap_or(0.0);
            if !seconds.is_finite() || !(0.0..=604800.0).contains(&seconds) {
                return Err("播放位置无效".into());
            }
            let prepared = if let Some(ticket) = args.get("playlist").and_then(Value::as_str) {
                let mut slot = PREPARED.lock().map_err(|_| "播放队列不可用")?;
                let at=slot.iter().position(|q|q.ticket==ticket&&q.generation==session.generation&&q.touched.elapsed()<Duration::from_secs(300)).ok_or("播放列表准备已失效")?;
                Some(slot.remove(at))
            } else {
                None
            };
            let durations = prepared
                .as_ref()
                .map(|q| q.durations.clone())
                .unwrap_or_default();
            let segments=prepared.as_ref().map(|q|q.segments.clone()).unwrap_or_default();
            let prefix=prepared.as_ref().map(|q|q.prefix.clone()).unwrap_or_default();
            let pool=prepared.as_ref().filter(|q|q.options["reference"]==true).map(|q|Arc::new(PlaylistPool{items:q.items.clone(),durations:q.durations.clone(),portraits:q.portraits.clone(),segments:q.segments.clone()}));
            let mut options = prepared
                .as_ref()
                .map(|q| q.options.clone())
                .unwrap_or(json!({}));
            let items = if let Some(prepared) = prepared {
                prepared.items
            } else if let Some(queue) = args.get("queue") {
                let queue = queue
                    .as_array()
                    .filter(|q| !q.is_empty() && q.len() <= 500)
                    .ok_or("播放队列必须包含 1–500 项")?;
                queue
                    .iter()
                    .map(|item| {
                        Ok((
                            identifier(text(item, "id", 128)?)?.to_owned(),
                            text(item, "title", 1024)?.to_owned(),
                        ))
                    })
                    .collect::<Result<Vec<_>, String>>()?
            } else {
                vec![(id.to_owned(), title.clone())]
            };
            let index = items
                .iter()
                .position(|(item, _)| item == id)
                .ok_or("当前视频不在播放队列中")?;
            if options["reference"]!=true{session.single_controls.lock().map_err(|_|"单视频设置不可用")?.apply(&mut options);}
            let revision=PLAYBACK_REVISION.fetch_add(1,Ordering::SeqCst);
            let mut playback=Playback{generation:session.generation,revision,plan_revision:revision,items,index,durations,segments,prefix,options,start_seconds:seconds,pool};
            if playback.options["portraitOnly"]==true{
                playback.project_portrait(true,false)?;
                playback.index=playback.items.iter().position(|item|item.0==id).ok_or("当前视频不在竖屏队列中")?;
            }
            if args.get("seconds").is_none() {
                seconds = playback.start(playback.index);
                if args["resume"] == true && playback.options["fullLength"] != false {
                    seconds = playback_history(&session, Some(id), None, false)?["seconds"]
                        .as_f64()
                        .filter(|n| n.is_finite() && (0.0..=604800.).contains(n))
                        .unwrap_or(0.);
                }
            }
            let result = native_play(
                app.clone(),
                &session,
                id,
                title,
                seconds,
                args.get("super").and_then(Value::as_bool) == Some(true),
            )
            .await?;
            #[cfg(windows)]
            {
                if let Some(rate)=playback.options["rate"].as_f64().filter(|r|(0.25..=4.).contains(r)){crate::rhvideo_player::command("player.control",&json!({"command":"rate","value":rate}))?;}
                let rotation = playback.options["rotation"].as_i64().unwrap_or(0);
                let actual = crate::rhvideo_player::command("player.state", &json!({}))?;
                if actual["rotation"].as_i64() != Some(rotation) {
                    crate::rhvideo_player::command(
                        "player.control",
                        &json!({"command":"rotate","value":rotation}),
                    )?;
                }
            }
            playback.start_seconds=seconds;
            if playback.options["reference"]!=true{*session.single_controls.lock().map_err(|_|"单视频设置不可用")?=SingleControls{looping:playback.options["loop"]==true,rate:playback.options["rate"].as_f64().unwrap_or(1.)};}
            *PLAYBACK.lock().map_err(|_| "播放队列状态不可用")? = Some(playback);
            let _=app.emit_to("window-rhvideo-player","rhvideo-player-session",json!({"generation":session.generation}));
            if let Ok(mut error)=PLAY_MONITOR_ERROR.lock(){*error=None;}
            save_queue_state(&session)?;
            schedule_preload(app.clone(), session.clone())?;
            wake_playback_monitor(&app);
            Ok(result)
        }
        "player.repeatCurrent" | "player.finishSegment" | "player.finishQueue" => {
            let _play=PLAY_LOCK.lock().await;
            let expected_id=identifier(text(&args,"expectedId",128)?)?;
            let expected_revision=number(&args,"expectedRevision",0,u64::MAX)?;
            let (start,segment,enabled,close_at_end)={
                let queue=PLAYBACK.lock().map_err(|_|"播放队列不可用")?;
                let queue=queue.as_ref().filter(|q|expected_playback(q,session.generation,Some(expected_id),Some(expected_revision)));
                queue.map(|q|((q.bounds().0*1000.) as i64,q.bounds().1.map(|s|(s*1000.) as i64),q.options["loop"]==true,q.options["closeAtEnd"]==true&&q.index+1==q.items.len())).unwrap_or((0,None,false,false))
            };
            #[cfg(windows)] {
                let mut value=crate::rhvideo_player::command("player.state",&json!({}))?;
                let duration=value["durationMs"].as_i64().unwrap_or(0);
                let end=segment.map(|length|(start+length).min(duration)).unwrap_or(duration);
                let lead=((end-start)/4).clamp(1,200);
                let failed=args["failed"]==true&&failed_media(&value)&&action=="player.finishQueue"&&close_at_end;
                let valid=if action=="player.repeatCurrent" {enabled}else if action=="player.finishQueue"{(!enabled||failed)&&close_at_end}else{!enabled&&segment.is_some()};
                if !valid || (!failed&&value["state"]!=6&&(end<=0||value["decoderPositionMs"].as_i64().unwrap_or(0)<end-lead)) {
                    value["stale"]=json!(true);
                } else if action=="player.finishQueue" {
                    flush_playback();
                    *PLAYBACK.lock().map_err(|_|"播放队列不可用")?=None;
                    crate::rhvideo_player::stop_single();
                    if let Some(w)=app.get_webview_window("window-rhvideo-player"){let _=w.close();}
                    focus_library(&app);
                    let _=start_preview_commit(app,session.clone());
                    return Ok(json!({"closed":true,"finished":true}));
                } else if action=="player.finishSegment" {
                    value=crate::rhvideo_player::command("player.control",&json!({"command":"pause"}))?;
                } else {
                    value=crate::rhvideo_player::repeat_from(start)?;
                }
                value["queue"]=queue_info();return Ok(value);
            }
            #[cfg(not(windows))] {let _=(start,segment,enabled,close_at_end);return Err("此平台暂未接入原生播放器".into());}
        }
        "player.next" | "player.previous" | "player.seekQueue" => {
            let _play = PLAY_LOCK.lock().await;
            #[cfg(windows)]crate::rhvideo_player::check_input(&args)?;
            if let Some(value)=args.get("expectedPlanRevision"){
                let revision=value.as_u64().filter(|n|*n>0).ok_or("播放队列版本无效")?;
                let matches=PLAYBACK.lock().map_err(|_|"播放队列不可用")?.as_ref().is_some_and(|q|expected_plan(q,session.generation,revision));
                if !matches{return Err("播放队列已改变，拖动未执行".into());}
            }
            if args.get("expectedId").is_some() || args.get("expectedRevision").is_some() {
                let expected_id = args
                    .get("expectedId")
                    .map(|v| {
                        v.as_str()
                            .ok_or_else(|| "播放编号无效".to_string())
                            .and_then(identifier)
                    })
                    .transpose()?;
                let expected_revision = args
                    .get("expectedRevision")
                    .map(|v| v.as_u64().ok_or("播放版本无效"))
                    .transpose()?;
                let matches = PLAYBACK
                    .lock()
                    .map_err(|_| "播放队列不可用")?
                    .as_ref()
                    .is_some_and(|q| {
                        expected_playback(q, session.generation, expected_id, expected_revision)
                    });
                if !matches {
                    #[cfg(windows)]
                    {
                        let mut value = crate::rhvideo_player::command("player.state", &json!({}))?;
                        value["queue"] = queue_info();
                        value["stale"] = json!(true);
                        return Ok(value);
                    }
                    #[cfg(not(windows))]
                    {
                        return Err("播放队列已更改".into());
                    }
                }
            }
            if args["failed"]==true{
                #[cfg(windows)]{
                    let value=crate::rhvideo_player::command("player.state",&json!({}))?;
                    if !failed_media(&value)||args.get("expectedId").is_none()||args.get("expectedRevision").is_none()||action!="player.next"{return Err("失败视频的队列位置已更改".into());}
                }
            }
            let parent=PLAYBACK.lock().ok().and_then(|q|q.as_ref().filter(|q|q.options["origin"]=="frame"&&action!="player.seekQueue").map(|q|q.options.clone()));
            if let Some(options)=parent{
                flush_playback();*PLAYBACK.lock().map_err(|_|"播放队列不可用")?=None;
                #[cfg(windows)]crate::rhvideo_player::stop_single();
                if let Some(w)=app.get_webview_window("window-rhvideo-player"){let _=w.close();}
                emit_parent_preview(&app,session.generation,&options,if action=="player.next"{1}else{-1},false);
                focus_library(&app);
                return Ok(json!({"closed":true,"returned":true}));
            }
            let (id, title, index) = {
                let queue = PLAYBACK.lock().map_err(|_| "播放队列状态不可用")?;
                let queue = queue
                    .as_ref()
                    .filter(|q| q.generation == session.generation)
                    .ok_or("播放队列已失效")?;
                let index = if action=="player.seekQueue" {
                    queue_seek(&queue.prefix,args["ratio"].as_f64().ok_or("缺少队列位置")?)?.0
                }else if queue.options["reference"]==true && args["automatic"]!=true {
                    if action=="player.next"{(queue.index+1)%queue.items.len()}else{(queue.index+queue.items.len()-1)%queue.items.len()}
                }else if action == "player.next" {
                    queue
                        .index
                        .checked_add(1)
                        .filter(|v| *v < queue.items.len()).ok_or("已经到达播放队列边界")?
                } else {
                    queue.index.checked_sub(1).ok_or("已经到达播放队列边界")?
                };
                (
                    queue.items[index].0.clone(),
                    queue.items[index].1.clone(),
                    index,
                )
            };
            let (low, start,rate) = PLAYBACK
                .lock()
                .ok()
                .and_then(|q| {
                    q.as_ref().map(|q| {
                        (
                            q.options["super"] == true,
                            q.start(index)+if action=="player.seekQueue"{queue_seek(&q.prefix,args["ratio"].as_f64().unwrap_or(0.)).map(|s|s.1).unwrap_or(0.)}else{0.},
                            q.options["rate"].as_f64().unwrap_or(1.),
                        )
                    })
                })
                .unwrap_or((false, 0.,1.));
            let mut result = native_play(app.clone(), &session, &id, title, start, low).await?;
            #[cfg(windows)]{crate::rhvideo_player::command("player.control",&json!({"command":"rate","value":rate}))?;}
            #[cfg(not(windows))]let _=rate;
            if let Some(queue) = PLAYBACK.lock().map_err(|_| "播放队列状态不可用")?.as_mut()
            {
                if queue.generation == session.generation {
                    queue.index = index;
                    queue.start_seconds = queue.segments.get(index).copied().flatten().map(|s|s.0).unwrap_or(start);
                    queue.revision = PLAYBACK_REVISION.fetch_add(1, Ordering::SeqCst);
                }
            }
            if let Ok(mut error)=PLAY_MONITOR_ERROR.lock(){*error=None;}
            save_queue_state(&session)?;
            schedule_preload(app, session.clone())?;
            result["queue"] = queue_info();
            result["generation"]=json!(session.generation);
            Ok(result)
        }
        "player.options" => {
            let _play=PLAY_LOCK.lock().await;
            let (replacement,reposition,repeating)={
            let mut slot = PLAYBACK.lock().map_err(|_| "播放队列不可用")?;
            let q = slot
                .as_mut()
                .filter(|q| q.generation == session.generation)
                .ok_or("播放队列已失效")?;
            let options = args["options"].as_object().ok_or("选项无效")?;
            if args.get("expectedId").is_some()||args.get("expectedRevision").is_some(){
                let id=text(&args,"expectedId",128)?;let revision=number(&args,"expectedRevision",0,u64::MAX)?;
                if !expected_playback(q,session.generation,Some(id),Some(revision)){return Err("播放目标已改变，设置未应用".into());}
            }
            for (k, v) in options {
                if !["loop", "fullLength", "super", "segment","portraitOnly"].contains(&k.as_str()) {
                    return Err("选项无效".into());
                }
                if k == "segment" {
                    if !v
                        .as_f64()
                        .is_some_and(|n| n.is_finite() && if q.options["reference"]==true{(1.0..=300.).contains(&n)}else{(0.1..=3600.).contains(&n)})
                    {
                        return Err("分段时长无效".into());
                    }
                } else if !v.is_boolean() {
                    return Err("选项无效".into());
                }
            }
            if options.contains_key("portraitOnly")&&q.options["reference"]!=true{return Err("仅竖屏只适用于连播队列".into());}
            if let Some(enabled)=options.get("portraitOnly").and_then(Value::as_bool).filter(|enabled|*enabled!=(q.options["portraitOnly"]==true)){
                if options.get("fullLength").and_then(Value::as_bool).is_some_and(|full|full!=enabled){return Err("切换仅竖屏时会同时切换完整播放，请分别调整".into());}
                let mut replacement=q.clone();
                for(key,value)in options{replacement.options[key]=value.clone();}
                replacement.project_portrait(enabled,true)?;
                replacement.revision=PLAYBACK_REVISION.fetch_add(1,Ordering::SeqCst);
                replacement.plan_revision=replacement.revision;
                let repeating=replacement.options["loop"]==true;
                (Some(replacement),None,repeating)
            }else{
            for(k,v)in options{q.options[k]=v.clone();}
            let mut reposition=None;
            if q.options["reference"]==true&&(options.contains_key("fullLength")||options.contains_key("segment")) {
                q.prefix=vec![0.];
                let full=q.options["fullLength"]!=false;let length=q.options["segment"].as_f64().unwrap_or(3.).clamp(1.,300.);
                for(index,duration)in q.durations.iter().enumerate(){
                    let current=q.segments.get(index).copied().flatten();
                    let start=if full{0.}else{current.filter(|s|s.0>0.&&s.0+length<=*duration).map(|s|s.0).unwrap_or_else(||segment_start(*duration,&q.options))};
                    let actual=reference_segment_length(*duration,&q.options);
                    q.segments[index]=Some((start,actual));
                    q.prefix.push(q.prefix.last().copied().unwrap_or(0.)+actual);
                }
                q.start_seconds=q.bounds().0;reposition=q.segments[q.index];
            }
            q.revision = PLAYBACK_REVISION.fetch_add(1, Ordering::SeqCst);
            if options.contains_key("fullLength")||options.contains_key("segment"){
                q.plan_revision=q.revision;
            }
            (None,reposition,q.options["loop"]==true)
            }
            };
            if let Some(replacement)=replacement{
                let (id,title)=replacement.items[replacement.index].clone();let start=replacement.bounds().0;
                flush_playback();
                native_play(app.clone(),&session,&id,title,start,replacement.options["super"]==true).await?;
                #[cfg(windows)]{crate::rhvideo_player::command("player.control",&json!({"command":"rate","value":replacement.options["rate"].as_f64().unwrap_or(1.)}))?;}
                *PLAYBACK.lock().map_err(|_|"播放队列不可用")?=Some(replacement);
                save_queue_state(&session)?;schedule_preload(app.clone(),session.clone())?;wake_playback_monitor(&app);
                return Ok(queue_info());
            }
            #[cfg(windows)] if let Some((start,length))=reposition{
                let state=crate::rhvideo_player::command("player.state",&json!({}))?;
                let position=state["decoderPositionMs"].as_f64().unwrap_or(0.)/1000.;
                if position<start-0.5||position>start+length {crate::rhvideo_player::command("player.control",&json!({"command":"seek","value":(start*1000.) as i64}))?;}
            }
            #[cfg(not(windows))]let _=reposition;
            save_queue_state(&session)?;
            if let Ok(slot)=PLAYBACK.lock(){if let Some(q)=slot.as_ref().filter(|q|q.generation==session.generation&&q.options["reference"]!=true){session.single_controls.lock().map_err(|_|"单视频设置不可用")?.looping=q.options["loop"]==true;}}
            #[cfg(windows)] if repeating {crate::rhvideo_player::clear_preload();}
            wake_playback_monitor(&app);
            Ok(queue_info())
        }
        "player.state" | "player.control" => {
            #[cfg(windows)]
            {
                // Publish engine state and queue identity from the same
                // transaction as play/options/close, not two different inputs.
                let _play=PLAY_LOCK.lock().await;
                let mut value = crate::rhvideo_player::command(&action, &args)?;
                value["queue"] = queue_info();
                value["automationError"]=PLAY_MONITOR_ERROR.lock().ok().and_then(|e|e.clone()).unwrap_or(Value::Null);
                value["generation"]=json!(session.generation);
                if let Some(id)=value["queue"]["id"].as_str().map(str::to_owned){
                    value["favorite"]=json!(session.favorites.lock().ok().is_some_and(|s|s.contains(&format!("video:{id}"))));
                    value["marked"]=json!(session.preview.lock().ok().is_some_and(|s|s.pending.contains_key(&format!("video:{id}"))));
                }
                if action=="player.control" {wake_playback_monitor(&app);}
                if action=="player.control"&&args["command"]=="rate" {
                    if let Ok(mut slot)=PLAYBACK.lock(){if let Some(q)=slot.as_mut(){q.options["rate"]=value["rate"].clone();if q.generation==session.generation&&q.options["reference"]!=true{session.single_controls.lock().map_err(|_|"单视频设置不可用")?.rate=value["rate"].as_f64().unwrap_or(1.);}}}
                    save_queue_state(&session)?;
                    value["queue"]=queue_info();
                }
                if action=="player.control"&&args["command"]=="seek" {
                    if let Ok(mut slot)=PLAYBACK.lock(){if let Some(q)=slot.as_mut(){
                        if q.options["reference"]==true&&q.options["loop"]==true {
                            let (start,length)=q.bounds();let position=args["value"].as_f64().unwrap_or(0.)/1000.;
                            if position<start-0.5||length.is_some_and(|length|position>start+length+1.){q.options["loop"]=json!(false);q.revision=PLAYBACK_REVISION.fetch_add(1,Ordering::SeqCst);}
                        }
                    }}
                    value["queue"]=queue_info();
                }
                if let Some(id) = value["queue"]["id"].as_str() {
                    let pos = value["positionMs"].as_f64().unwrap_or(0.) / 1000.;
                    let duration = value["durationMs"].as_f64().unwrap_or(0.) / 1000.;
                    if value["opened"] == true && duration > 0. {
                        let seconds = if pos >= duration - 1. { 0. } else { pos };
                        let stamp = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64;
                        playback_history(
                            &session,
                            Some(id),
                            Some(json!({"seconds":seconds,"title":value["title"],"savedAt":stamp})),
                            action == "player.control",
                        )?;
                    }
                }
                Ok(value)
            }
            #[cfg(not(windows))]
            {
                Err("此平台暂未接入原生播放器".into())
            }
        }
        _ => Err(format!("不支持的 RHVideo 操作：{action}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn image_content_detection_does_not_depend_on_a_windows_mime_registry(){
        assert_eq!(raster_mime(b"RIFF\x10\0\0\0WEBPVP8 "),Some("image/webp"));
        assert_eq!(raster_mime(b"\x89PNG\r\n\x1a\nrest"),Some("image/png"));
        assert_eq!(raster_mime(b"\xff\xd8\xff\xe0JPEG"),Some("image/jpeg"));
        assert_eq!(raster_mime(b"GIF89a"),Some("image/gif"));
        assert!(svg_prefix(b"\xef\xbb\xbf <svg><title>\xe4\xb8"));
        assert!(!svg_prefix(b"<html>sign in</html>"));
        for error in [b"<html>login required</html>".as_slice(),b"{\"detail\":\"not found\"}",b"not an image",b"RIFFshort"]{assert_eq!(raster_mime(error),None);}
    }
    #[test]
    fn task_image_paths_whitelist_only_native_thumbnail_gets_and_storage() {
        assert_eq!(safe_image_path("/api/v1/videos/video_123/thumbnail").unwrap(),"api/v1/videos/video_123/thumbnail");
        for bad in ["/api/v1/auth/login","/api/v1/videos/../thumbnail","/api/v1/videos/a/thumbnail?x=1","/api/v1/videos/a%2fb/thumbnail","https://evil.invalid/a","/storage/../secret"] {
            assert!(safe_image_path(bad).is_err(),"{bad}");
        }
    }
    #[tokio::test]
    async fn unchanged_video_catalog_reuses_the_same_allocation_and_conditional_request() {
        let seen = Arc::new(Mutex::new(Vec::<HeaderMap>::new()));
        let inspect = seen.clone();
        let router = Router::new().route(
            "/api/v1/videos",
            get(move |headers: HeaderMap| {
                let inspect = inspect.clone();
                async move {
                    let unchanged = headers
                        .get(reqwest::header::IF_NONE_MATCH)
                        .is_some_and(|v| v == "\"catalog-v1\"");
                    inspect.lock().unwrap().push(headers);
                    Response::builder()
                        .status(if unchanged {
                            StatusCode::NOT_MODIFIED
                        } else {
                            StatusCode::OK
                        })
                        .header(reqwest::header::ETAG, "\"catalog-v1\"")
                        .body(if unchanged {
                            Body::empty()
                        } else {
                            Body::from(r#"[{"id":"one","original_filename":"movie.mp4"}]"#)
                        })
                        .unwrap()
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let worker = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        let session = Session {
            base: Url::parse(&format!("http://{address}/")).unwrap(),
            username: "test".into(),
            token: Mutex::new("test-only".into()),
            refresh_at: AtomicU64::new(u64::MAX),
            refresh_lock: tokio::sync::Mutex::new(()),
            capability: "unused".into(),
            port: 0,
            generation: GENERATION.load(Ordering::SeqCst),
            client: client().unwrap(),
            assets: Mutex::new(HashMap::new()),
            next_asset: AtomicU64::new(1),
            asset_revision: AtomicU64::new(0),
            videos: tokio::sync::Mutex::new(None),
            favorites: Mutex::new(HashSet::new()),
            preview: Mutex::new(PreviewState::default()),
            single_controls: Mutex::new(SingleControls::default()),
        };
        let first = session.video_catalog(false).await.unwrap();
        let warm = session.video_catalog(false).await.unwrap();
        assert!(Arc::ptr_eq(&first, &warm));
        assert_eq!(seen.lock().unwrap().len(), 1);
        let checked = session.video_catalog(true).await.unwrap();
        assert!(Arc::ptr_eq(&first, &checked));
        let requests = seen.lock().unwrap();
        assert_eq!(requests.len(), 2);
        assert_eq!(
            requests[1].get(reqwest::header::IF_NONE_MATCH).unwrap(),
            "\"catalog-v1\""
        );
        assert_eq!(
            requests[1].get(reqwest::header::AUTHORIZATION).unwrap(),
            "Bearer test-only"
        );
        worker.abort();
    }
    #[test]
    fn base_address_is_not_a_credential_or_arbitrary_protocol() {
        for bad in [
            "file:///C:/data",
            "ftp://server/",
            "http://u:p@server/",
            "https://server/?token=abc",
            "https://server/#x",
        ] {
            assert!(base_url(bad).is_err(), "{bad}");
        }
        assert_eq!(
            base_url("http://server:8000/static/index.html")
                .unwrap()
                .as_str(),
            "http://server:8000/"
        );
        assert_eq!(
            base_url("https://server/prefix/").unwrap().as_str(),
            "https://server/prefix/"
        );
    }
    #[test]
    fn media_paths_cannot_escape_the_storage_provider() {
        for bad in [
            "/api/v1/auth/me",
            "https://evil/image.jpg",
            "//evil/image",
            "/storage/../.env",
            "/storage/%2e%2e/.env",
            "/storage/%2F..%2F.env",
            "/storage/a\\x",
            "/storage/a%00.jpg",
        ] {
            assert!(safe_storage_path(bad).is_err(), "{bad}");
        }
        assert_eq!(
            safe_storage_path("/storage/pictures/中文 图.webp").unwrap(),
            "storage/pictures/%E4%B8%AD%E6%96%87%20%E5%9B%BE.webp"
        );
    }
    #[test]
    fn identifiers_never_become_paths_or_queries() {
        for bad in ["../config", "id?super=true", "a/b", "", "a%2fb", "中文"] {
            assert!(identifier(bad).is_err());
        }
        assert!(identifier("e3fa-123_a").is_ok());
    }
    #[test]
    fn limits_and_boolean_values_are_strict() {
        assert!(number(&json!({"limit":73}), "limit", 36, 72).is_err());
        assert!(number(&json!({"offset":-1}), "offset", 0, 1_000_000).is_err());
        assert!(number(&json!({"limit":"48"}), "limit", 36, 72).is_err());
        assert!(kind(&json!({"kind":"../../auth"})).is_err());
    }
    #[test]
    fn delayed_automatic_next_cannot_replay_after_manual_next_or_an_aba_roundtrip() {
        let mut q = Playback {
            generation: 4,
            revision: 10,
            plan_revision: 10,
            items: vec![("A".into(), "A".into()), ("B".into(), "B".into())],
            index: 0,
            durations: vec![20.0, 20.0],
            segments: vec![None,None],
            prefix: vec![0.,20.,40.],
            options: json!({}),
            start_seconds: 0.0,
            pool: None,
        };
        assert!(expected_playback(&q, 4, Some("A"), Some(10)));
        q.index = 1;
        q.revision = 11;
        assert!(!expected_playback(&q, 4, Some("A"), Some(10)));
        q.index = 0;
        q.revision = 12;
        assert!(!expected_playback(&q, 4, Some("A"), Some(10)));
        assert!(!expected_playback(&q, 5, Some("A"), Some(12)));
        assert!(expected_playback(&q, 4, Some("A"), Some(12)));
    }
    #[test]
    fn grid_group_navigation_never_duplicates_or_exceeds_the_last_partial_group() {
        let mut q=GridQueue::new(1,(0..10).map(|i|(i.to_string(),i.to_string())).collect(),4,Vec::new(),Vec::new(),false).unwrap();
        q.page(-1);
        assert_eq!(q.offset, 0);
        q.page(1);
        assert_eq!(q.offset, 4);
        q.page(1);
        assert_eq!(q.offset, 8);
        q.page(1);
        assert_eq!(q.offset, 8);
        assert_eq!(q.annotate(json!({}))["hasNext"], false);
        q.page(-1);
        assert_eq!(q.offset, 4);
        q.seek_group(1.).unwrap();assert_eq!(q.offset,8);
        q.seek_group(0.25).unwrap();assert_eq!(q.offset,4);
        q.seek_group(0.).unwrap();assert_eq!(q.offset,0);
        assert!(q.seek_group(f64::NAN).is_err());assert!(q.seek_group(1.1).is_err());
    }
    #[test]
    fn aspect_grid_groups_seek_by_group_and_restore_exact_ids_not_offsets(){
        let items=(0..7).map(|i|(i.to_string(),i.to_string())).collect::<Vec<_>>();
        let mut q=GridQueue::new(9,items.clone(),4,vec![Some([0.,0.,0.5,1.]);7],vec![false,true,false,false,true,false,true],false).unwrap();
        assert_eq!(q.count(),2);assert_eq!(q.ends.as_ref(),&[2,5,7]);
        q.page(1);assert_eq!(q.ids(),vec!["2","3","4"]);assert_eq!(q.count(),3);assert_eq!(q.group_index(),1);
        q.seek_group(1.).unwrap();assert_eq!(q.offset,5);assert_eq!(q.count(),2);
        q.restore_group(&json!(["2","3","4"]));assert_eq!(q.offset,2);
        let mut fresh=GridQueue::new(9,items,4,Vec::new(),Vec::new(),false).unwrap();
        fresh.restore_group(&json!(["2","3","4"]));assert_eq!(fresh.offset,0,"changed group boundaries must not accidentally restore an old offset");
        fresh.restore_group(&json!(["6","5","4"]));assert_eq!(fresh.offset,0,"matching membership is not matching order");
        q.states.lock().unwrap().insert("2".into(),json!({"volume":20}));
        assert!(fresh.states.lock().unwrap().is_empty(),"cell playback state belongs only to one open grid session");
    }
    #[test]
    fn incomplete_grid_plans_are_rejected_before_opening_any_decoder(){
        let items=vec![("a".into(),"A".into()),("b".into(),"B".into())];
        for(rects,flags)in [(vec![Some([0.,0.,1.,1.])],vec![]),(vec![None,None],vec![false,true]),(vec![Some([0.,0.,1.,1.]);2],vec![true,false])]{
            assert!(GridQueue::new(1,items.clone(),2,rects,flags,false).is_err());
        }
        assert!(GridQueue::new(1,items,0,Vec::new(),Vec::new(),false).is_err());
    }
    #[test]
    fn reference_queue_scrubber_uses_segment_lengths_and_end_selects_last_entry_start(){
        let prefix=[0.,3.,6.];
        assert_eq!(queue_seek(&prefix,0.).unwrap(),(0,0.));
        assert_eq!(queue_seek(&prefix,0.5).unwrap(),(1,0.));
        assert_eq!(queue_seek(&prefix,0.75).unwrap(),(1,1.5));
        assert_eq!(queue_seek(&prefix,1.).unwrap(),(1,0.));
        assert!(queue_seek(&prefix,f64::NAN).is_err());
        assert!(queue_seek(&[0.],0.5).is_err());
    }
    #[test]
    fn native_segment_replanning_matches_reference_rounding_and_short_video_bounds(){
        assert_eq!(reference_segment_start(40.,3.,0.5),18.5);
        assert_eq!(reference_segment_start(7.,3.,0.5),2.);
        assert_eq!(reference_segment_start(5.,3.,0.5),0.);
        assert_eq!(reference_segment_start(2.,3.,0.5),0.);
        assert_eq!(reference_segment_length(0.,&json!({"fullLength":true,"segment":3})),86400.);
        assert_eq!(reference_segment_length(0.,&json!({"fullLength":false,"segment":3})),3.);
        assert_eq!(reference_segment_length(14.,&json!({"fullLength":true,"segment":3})),14.);
        let valid=json!({"reference":true,"mode":"segments","signature":"a".repeat(64),"fullLength":false,"loop":false,"segment":3,"rate":1});
        assert!(validate_reference_options(&valid).is_ok());
        for(key,value)in [("mode",json!("unknown")),("signature",json!("short")),("rate",json!(0)),("segment",json!(301)),("loop",json!("false"))]{let mut bad=valid.clone();bad[key]=value;assert!(validate_reference_options(&bad).is_err());}
    }
    #[test]
    fn prepared_tickets_are_independent_and_invalid_resets_are_atomic(){
        let mut drafts=Vec::new();
        let chunk=|ticket:&str,reset:bool,id:&str|json!({"ticket":ticket,"reset":reset,"items":[{"id":id,"title":id,"duration":20}],"options":{"fullLength":true}});
        prepare_playlist(&mut drafts,1,&chunk("a",true,"one")).unwrap();prepare_playlist(&mut drafts,1,&chunk("b",true,"two")).unwrap();
        assert_eq!(prepare_playlist(&mut drafts,1,&chunk("a",false,"three")).unwrap()["count"],2);
        assert_eq!(drafts[1].items[0].0,"two");
        assert!(prepare_playlist(&mut drafts,1,&chunk("a",true,"bad/id")).is_err());assert_eq!(drafts[0].items.len(),2);
        assert!(prepare_playlist(&mut drafts,2,&chunk("a",false,"four")).is_err());assert_eq!(drafts[0].items.len(),2);
    }
    #[test]
    fn prepared_ticket_and_aggregate_budgets_do_not_discard_other_valid_drafts(){
        let mut drafts=Vec::new();
        let chunk=|ticket:String|json!({"ticket":ticket,"reset":true,"items":[{"id":"one","title":"one"}],"options":{}});
        for n in 0..8{prepare_playlist(&mut drafts,1,&chunk(format!("draft-{n}"))).unwrap();}
        assert!(prepare_playlist(&mut drafts,1,&chunk("overflow".into())).is_err());assert_eq!(drafts.len(),8);
        prepare_playlist(&mut drafts,1,&chunk("draft-0".into())).unwrap();assert_eq!(drafts.len(),8);
        drafts.truncate(1);drafts[0].items.resize(100000,("one".into(),"one".into()));
        assert!(prepare_playlist(&mut drafts,1,&chunk("another".into())).is_err());assert_eq!(drafts.len(),1);
        prepare_playlist(&mut drafts,1,&chunk("draft-0".into())).unwrap();assert_eq!(drafts[0].items.len(),1);
        drafts[0].touched=std::time::Instant::now()-Duration::from_secs(301);
        prepare_playlist(&mut drafts,1,&chunk("fresh".into())).unwrap();assert_eq!(drafts.len(),1);assert_eq!(drafts[0].ticket,"fresh");
    }
    #[test]
    fn ordinary_media_control_defaults_do_not_overwrite_explicit_options(){
        let controls=SingleControls{looping:true,rate:1.5};let mut empty=json!({});controls.apply(&mut empty);assert_eq!(empty,json!({"loop":true,"rate":1.5}));
        let mut explicit=json!({"loop":false,"rate":2});controls.apply(&mut explicit);assert_eq!(explicit,json!({"loop":false,"rate":2}));
        for invalid in [json!(null),json!([]),json!({"loop":"true"}),json!({"rate":0}),json!({"rate":true})]{assert!(validate_reference_options(&invalid).is_err());}
    }
    #[test]
    fn empty_ended_http_input_is_a_failure_not_a_repeatable_finished_segment(){
        assert!(failed_media(&json!({"state":7})));
        assert!(failed_media(&json!({"state":6,"durationMs":0,"renderedFrames":0})));
        assert!(!failed_media(&json!({"state":6,"durationMs":6000,"renderedFrames":144})));
        assert!(!failed_media(&json!({"state":1,"durationMs":0,"renderedFrames":0})));
    }
    fn portrait_queue(flags:Vec<bool>)->Playback{
        let items=vec![("a".into(),"A".into()),("b".into(),"B".into()),("c".into(),"C".into())];
        let durations=vec![40.,7.,2.];
        let segments=vec![Some((3.,3.)),Some((1.,3.)),Some((0.,2.))];
        Playback{generation:1,revision:1,plan_revision:1,items:items.clone(),index:2,durations:durations.clone(),segments:segments.clone(),prefix:vec![0.,3.,6.,8.],options:json!({"reference":true,"mode":"segments","segment":3,"fullLength":false,"loop":true,"rate":1.5}),start_seconds:0.,pool:Some(Arc::new(PlaylistPool{items,durations,portraits:flags,segments}))}
    }
    #[test]
    fn total_progress_gesture_accepts_navigation_but_not_a_replaced_time_plan(){
        let mut q=portrait_queue(vec![true,false,true]);
        assert!(expected_plan(&q,1,1));
        q.index=0;q.revision=2;
        assert!(expected_plan(&q,1,1),"Next/Previous must not invalidate a whole-queue gesture");
        q.plan_revision=3;
        assert!(!expected_plan(&q,1,1),"new timing/order, even with the same IDs, is a different target");
        assert!(!expected_plan(&q,2,3));
        assert!(expected_plan(&q,1,3));
    }
    #[test]
    fn live_portrait_filter_keeps_the_full_source_pool_and_rebuilds_bounded_segment_progress(){
        let mut q=portrait_queue(vec![true,false,true]);
        q.project_portrait(true,true).unwrap();
        assert_eq!(q.items.iter().map(|i|i.0.as_str()).collect::<Vec<_>>(),["a","c"]);
        assert_eq!(q.index,0);assert_eq!(q.prefix,[0.,40.,42.]);assert_eq!(q.options["fullLength"],true);assert_eq!(q.options["loop"],true);assert_eq!(q.options["rate"],1.5);
        assert_eq!(q.pool.as_ref().unwrap().items.len(),3);
        let expected=format!("{:x}",Sha256::digest(br#"["a","c"]"#));assert_eq!(q.options["signature"],expected);
        q.project_portrait(false,true).unwrap();
        assert_eq!(q.items.iter().map(|i|i.0.as_str()).collect::<Vec<_>>(),["a","b","c"]);
        assert_eq!(q.prefix,[0.,3.,6.,8.]);assert_eq!(q.options["fullLength"],false);assert_eq!(q.options["portraitOnly"],false);
        for(i,segment)in q.segments.iter().enumerate(){let(start,length)=segment.unwrap();assert!(start>=0.&&start+length<=q.durations[i]);}
        let mut initial=portrait_queue(vec![true,false,true]);initial.project_portrait(true,false).unwrap();assert_eq!(initial.segments,[Some((3.,3.)),Some((0.,2.))],"initial projection must preserve the frontend's explicit segment plan, not randomize it again");
    }
    #[test]
    fn rejected_portrait_filter_preserves_every_visible_playback_field(){
        let mut q=portrait_queue(vec![true,false,false]);let before=q.clone();
        assert!(q.project_portrait(true,true).is_err());
        assert_eq!(q.items,before.items);assert_eq!(q.index,before.index);assert_eq!(q.options,before.options);assert_eq!(q.segments,before.segments);assert_eq!(q.prefix,before.prefix);assert_eq!(q.revision,before.revision);
        let mut all=portrait_queue(vec![true,true,true]);all.project_portrait(true,true).unwrap();assert_eq!(all.index,2,"unchanged ordered IDs retain the cursor, as in the reference resume rule");
        all.options["fullLength"]=json!(false);all.project_portrait(true,false).unwrap();assert_eq!(all.options["fullLength"],false,"restoring the portrait pool must retain a separately saved segment choice");assert_eq!(all.prefix,[0.,3.,6.,8.]);
    }
    #[test]
    fn network_errors_do_not_disclose_tokens_or_html() {
        let body = br#"{"detail":"token=private"}"#;
        assert!(!upstream_error(reqwest::StatusCode::UNAUTHORIZED, body).contains("private"));
        assert!(!upstream_error(reqwest::StatusCode::FOUND, body).contains("private"));
        assert!(!upstream_error(
            reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            b"<html>secret</html>"
        )
        .contains("secret"));
        let config = serde_json::to_string(&Config {
            server: "http://local/".into(),
            username: "name".into(),
        })
        .unwrap();
        assert!(!config.contains("token") && !config.contains("password"));
    }
}
