// Isolated server contract fixture. Never touches a real RHVideo database.
import http from 'node:http';
import fs from 'node:fs';
import {listenBrowserLoopback} from './browser-loopback.mjs';
import pathModule from 'node:path';
export async function rhvideoFixture({videoFile=null,videoFiles={},videoResolutions=[],videoDuration=null,galleryVideoCount=4,galleryFrameCount=8,failTrashIds=[],failFavoriteIds=[],pictureCount=8,videoCount=52,chapterCount=3,beforeCatalog=null,beforeGallery=null,beforeLogin=null,beforeTrash=null,beforeMedia=null,taskState=null,referenceStatic=null,authState=null,loginUsers=['preview']}={}){
  const favorites=new Set(),progress=[],requests=[];
  const watch=[{id:'watch-0',path:'D:\\FixtureMedia',enabled:true,last_scan_result:{videos:3,pictures:2}}],trash=[],batches=[];
  const folders=['山野与旅途','日常片段','城市观察','慢生活'];
  const names=['沿着山脊，看见清晨','海边的蓝色时刻','森林里的一场小雨','城市醒来之前','周末，留一点空白','穿过落日的列车','湖面与风的形状','路过人间烟火','一个很慢的下午','远山，云与自由','星空下的营地','把日子过成风景'];
  const videos=Array.from({length:videoCount},(_,i)=>({id:'video-'+i,original_filename:names[i%names.length]+(i>11?' · '+(i+1):'')+'.mp4',duration_seconds:videoDuration??126+i*31,original_resolution:videoResolutions[i]||(i%3?'1920×1080':'3840×2160'),folder_label:folders[i%folders.length],status:'ready'}));
  const pictures=Array.from({length:pictureCount},(_,i)=>({id:'picture-'+i,original_filename:['山间留白','远行手记','夏日的海','微光森林'][i%4]+'.webp',webp_path:'pictures/'+i+'.svg',folder_label:folders[i%4],original_resolution:'2560×1600',status:'active'}));
  const novels=[{id:'novel-0',title:'沿途的风景',folder_label:'旅行与散文',word_count:216000,chapter_count:chapterCount,status:'active',progress:null},{id:'novel-1',title:'城市以外',folder_label:'小说书架',word_count:128000,chapter_count:chapterCount,status:'active',progress:{chapter_index:1,scroll_ratio:.2,percent:40}}];
  const svg=(index)=>{
    const palettes=[['#94b6bf','#e9d8c3','#477881'],['#bbc3dc','#f2d8d4','#606e99'],['#9dbbb2','#e3e8d0','#538478'],['#b6c8dd','#f0e1ce','#718fa5']];
    const [sky,light,dark]=palettes[index%4];
    return '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><defs><linearGradient id="s" x2="0" y2="1"><stop stop-color="'+sky+'"/><stop offset="1" stop-color="'+light+'"/></linearGradient><linearGradient id="m" x2="0" y2="1"><stop stop-color="'+dark+'"/><stop offset="1" stop-color="'+sky+'"/></linearGradient></defs><rect width="800" height="500" fill="url(#s)"/><circle cx="'+(570-index%3*90)+'" cy="130" r="43" fill="#fff4df" opacity=".8"/><path d="M0 330 145 190 280 300 440 145 650 310 800 215v285H0z" fill="'+dark+'" opacity=".35"/><path d="M0 370 185 280 330 390 520 260 800 380v120H0z" fill="url(#m)" opacity=".75"/><path d="M0 435q220-100 450-25t350-30v120H0z" fill="'+dark+'" opacity=".55"/></svg>';
  };
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://fixture'),path=url.pathname;requests.push({path,query:url.search,authorization:req.headers.authorization,range:req.headers.range,method:req.method});
    const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
    if(referenceStatic&&(path==='/'||path.startsWith('/static/'))){
      const relative=path==='/'?'index.html':decodeURIComponent(path.slice(8)),file=pathModule.resolve(referenceStatic,relative);
      const safe=pathModule.relative(pathModule.resolve(referenceStatic),file);
      if(safe.startsWith('..')||pathModule.isAbsolute(safe)||!['.html','.js','.css','.json'].includes(pathModule.extname(file)))return send(404,{});
      if(!fs.existsSync(file)||!fs.statSync(file).isFile())return send(404,{});
      res.writeHead(200,{'content-type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json'}[pathModule.extname(file)]});
      return fs.createReadStream(file).pipe(res);
    }
    const body=async()=>{const chunks=[];for await(const part of req)chunks.push(part);return JSON.parse(Buffer.concat(chunks).toString()||'{}');};
    if(path==='/api/v1/auth/login'){
      const value=await body();await beforeLogin?.(value);return loginUsers.includes(value.username)&&value.password==='fixture-only'?send(200,{access_token:'fixture-bearer-do-not-persist',token_type:'bearer'}):send(401,{detail:'Wrong credentials'});
    }
    if(authState?.active===false||req.headers.authorization!=='Bearer fixture-bearer-do-not-persist')return send(401,{detail:'Unauthorized'});
    if(path==='/api/v1/auth/me')return send(200,{username:'preview',user_id:'fixture-user'});
    if(path==='/api/v1/watch-folders'){
      if(req.method==='POST'){const v=await body();const folder={id:'watch-'+watch.length,path:v.path,enabled:true};watch.push(folder);return send(200,{folder,scan_started:true});}return send(200,{folders:watch,queue_size:0});
    }
    const watcher=path.match(/^\/api\/v1\/watch-folders\/([^/]+)(\/scan)?$/);
    if(watcher){const w=watch.find(v=>v.id===watcher[1]);if(!w)return send(404,{detail:'Missing watch folder'});if(watcher[2])return send(200,{scanned:5,added:0});if(req.method==='PATCH')Object.assign(w,await body());if(req.method==='DELETE')watch.splice(watch.indexOf(w),1);return send(200,w);}
    if(path==='/api/v1/processing-tasks')return send(200,taskState?.list || {items:[{id:'video:video-0',filename:'处理样本.mp4',status:'failed',message:'源文件离线'}],counts:{running:0,queued:0,failed:1,history:1},total:1,page:1,pages:1,limit:25});
    if(path.startsWith('/api/v1/processing-tasks/'))return send(200,taskState?.detail || {id:'video:video-0',filename:'处理样本.mp4',status:'failed',message:'源文件离线',steps:[{key:'compress',label:'压缩',status:'failed',metrics:[]}],progress:null});
    if(path==='/api/v1/replace-batches'){if(req.method==='POST'){const v=await body(),batch={id:'batch-'+batches.length,status:'pending',...v};batches.push(batch);return send(202,batch);}return send(200,batches);}
    if(path.startsWith('/api/v1/replace-batches/')){const b=batches.find(v=>v.id===path.split('/')[4]);return send(200,b||{id:'batch-0',status:'cancelled',items:[]});}
    if(path==='/api/v1/trash')return send(200,{items:trash,retention_days:30});
    const staged=path.match(/^\/api\/v1\/trash\/(video|picture|novel)\/([^/]+)(\/restore)?$/);
    if(staged){if(beforeTrash)await beforeTrash({kind:staged[1],id:staged[2],restore:!!staged[3]});if(failTrashIds.includes(staged[1]+':'+staged[2]))return send(403,{detail:'Fixture source is read-only'});if(staged[3]){const index=trash.findIndex(v=>v.id===staged[2]&&v.media_type===staged[1]);if(index>=0)trash.splice(index,1);}else trash.push({id:staged[2],media_type:staged[1],filename:'测试暂存',expires_at:'2026-12-31T00:00:00Z'});return send(200,{ok:true});}
    if(path==='/api/v1/trash/purge-expired')return send(200,{purged:0});
    if(path==='/api/v1/system/cleanup-missing/preview')return send(200,{pictures:{count:0,items:[]},videos:{count:0,items:[]},novels:{count:0,items:[]},skipped_processing:0});
    if(path==='/api/v1/system/cleanup-missing')return send(200,{deleted_pictures:0,deleted_videos:0,deleted_novels:0});
    if(path==='/api/v1/system/restart')return send(200,{can_manage:false,status:'idle'});
    if(path==='/api/v1/system/storage-usage')return send(200,{status:'ready',scanning:false,total_bytes:123456,total_files:52,categories:[]});
    if(path==='/api/v1/system/watch-folder-usage')return send(200,{items:watch.map(w=>({...w,status:'ready',total_bytes:1000})),total_bytes:1000});
    if(path==='/api/v1/system/replacement-savings')return send(200,{saved_bytes:500});
    if(path==='/api/v1/system/health')return send(200,{status:'healthy'});
    if(path==='/api/v1/system/config')return send(200,{app_name:'RHVideo fixture'});
    if(path==='/api/v1/screenshots/grid'){
      const failure=await beforeGallery?.({query:url.searchParams,response:res});if(failure?.status)return send(failure.status,failure);
      if(Array.isArray(failure?.data))return send(200,failure.data);
      return send(200,videos.slice(0,galleryVideoCount).map(v=>({video_id:v.id,filename:v.original_filename,folder:v.folder_label,resolution:v.original_resolution,duration:v.duration_seconds,screenshots:Array.from({length:galleryFrameCount},(_,i)=>({url:'/storage/pictures/'+i+'.svg',time_seconds:i*2}))})));
    }
    const preview=path.match(/^\/api\/v1\/novels\/(novel-\d+)\/previews$/);
    if(preview){const skip=Number(url.searchParams.get('skip')||0),limit=Number(url.searchParams.get('limit')||40);return send(200,{title:'章节速览',total:chapterCount,items:Array.from({length:Math.max(0,Math.min(limit,chapterCount-skip))},(_,j)=>{const i=j+skip;return {index:i,title:'第'+(i+1)+'章 速览',preview:'真实 API 形状的章节摘录 duanluo'+i,word_count:1000};})});}
    if(path.match(/^\/api\/v1\/videos\/[^/]+\/replace-source\/estimate$/))return send(200,{before_size:10000,estimated_size:5000,saved_bytes:5000});
    if(path.match(/^\/api\/v1\/videos\/[^/]+$/)&&path!=='/api/v1/videos/folders')return send(200,{...videos.find(v=>v.id===path.split('/')[4]),source_path:'D:\\FixtureMedia\\sample.mp4'});
    const active=(kind,items)=>items.filter(item=>!trash.some(t=>t.media_type===kind&&t.id===item.id));
    if(path==='/api/v1/videos'){const rows=active('video',videos),failure=await beforeCatalog?.('video',rows);return failure?send(failure.status,failure):send(200,rows);}
    if(/^\/api\/v1\/(videos|pictures|novels)\/folders$/.test(path))return send(200,folders);
    const paginate=items=>{
      const search=(url.searchParams.get('search')||'').toLowerCase(),folder=url.searchParams.get('folder')||'';
      const all=items.filter(item=>(!search||(item.title||item.original_filename).toLowerCase().includes(search))&&(!folder||item.folder_label.includes(folder)));
      return {items:all.slice(Number(url.searchParams.get('skip')||0),Number(url.searchParams.get('skip')||0)+Number(url.searchParams.get('limit')||36)),total:all.length};
    };
    if(path==='/api/v1/pictures/catalog'){const rows=active('picture',pictures),failure=await beforeCatalog?.('picture',rows);return failure?send(failure.status,failure):send(200,{items:rows,total:rows.length});}
    if(path==='/api/v1/pictures')return send(200,paginate(pictures));
    if(path==='/api/v1/novels')return send(200,url.searchParams.get('summary')==='true'?{items:novels,total:novels.length}:paginate(novels));
    if(path==='/api/v1/favorites/ids')return send(200,{video_ids:[...favorites].filter(k=>k.startsWith('video:')).map(k=>k.slice(6)),picture_ids:[...favorites].filter(k=>k.startsWith('picture:')).map(k=>k.slice(8)),novel_ids:[]});
    if(path==='/api/v1/favorites'){
      const all=[...videos.map(v=>({...v,type:'video'})),...pictures.map(p=>({...p,type:'picture'})),...novels.map(n=>({...n,type:'novel'}))].filter(v=>favorites.has(v.type+':'+v.id));return send(200,paginate(all));
    }
    const favorite=path.match(/^\/api\/v1\/favorites\/(video|picture|novel)\/([^/]+)$/);
    if(favorite){const key=favorite[1]+':'+favorite[2];if(failFavoriteIds.includes(key))return send(503,{detail:'Owned favorite failure'});if(req.method==='PUT')favorites.add(key);else if(req.method==='DELETE')favorites.delete(key);else return send(405,{detail:'Use PUT or DELETE'});return send(200,{ok:true});}
    const novel=path.match(/^\/api\/v1\/novels\/(novel-\d+)$/);
    if(novel)return send(200,{...novels.find(n=>n.id===novel[1]),chapters:Array.from({length:chapterCount},(_,i)=>({index:i,title:'第'+(i+1)+'章 '+['清晨出发','山间来信','回到日常'][i%3],word_count:1500}))});
    if(path.endsWith('/progress')){progress.push({path,...await body()});return send(200,{saved:true});}
    const chapter=path.match(/\/chapters\/(\d+)$/);
    if(chapter){const index=Number(chapter[1]);return send(200,{index,title:'第'+(index+1)+'章 山间来信',text:('清晨的光越过山脊，落在还未醒来的小路上。\n\n我们把行程放慢，让风景自己走近。远处的云在缓缓移动，像是一封尚未写完的信。\n\n').repeat(30),has_prev:index>0,has_next:index<chapterCount-1,total_chapters:chapterCount});}
    if(path.startsWith('/api/v1/screenshots/video/'))return send(200,{screenshots:Array.from({length:8},(_,i)=>({url:'/storage/pictures/'+i+'.svg',time_seconds:i*2}))});
    if(path.endsWith('/thumbnail')||path.startsWith('/storage/pictures/')){
      const override=await beforeMedia?.({path,range:req.headers.range,image:true});
      if(override?.status)return send(override.status,{detail:override.detail||'Fixture image failure'});
      if(override?.body){
        res.writeHead(200,{'content-type':override.contentType||'application/octet-stream','content-length':override.body.length});
        if(override.splitAt){res.write(override.body.subarray(0,override.splitAt));await new Promise(resolve=>setTimeout(resolve,20));res.end(override.body.subarray(override.splitAt));}
        else res.end(override.body);
        return;
      }
      res.writeHead(200,{'content-type':'image/svg+xml'});return res.end(svg(Number(path.match(/\d+/g)?.at(-1))||0));
    }
    if(path.endsWith('/play')&&videoFile){
      const override=await beforeMedia?.({path,range:req.headers.range,image:false});
      if(override?.status)return send(override.status,{detail:override.detail||'Fixture video failure'});
      const source=videoFiles[path.split('/').at(-2)]||videoFile;
      const size=fs.statSync(source).size,range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),size-1):size-1;
      if(start>=size){res.writeHead(416,{'content-range':'bytes */'+size});return res.end();}
      res.writeHead(range?206:200,{'content-type':'video/mp4','accept-ranges':'bytes','content-length':end-start+1,...(range?{'content-range':'bytes '+start+'-'+end+'/'+size}:{})});
      return fs.createReadStream(source,{start,end}).pipe(res);
    }
    send(404,{detail:'Fixture route not found'});
  });
  await listenBrowserLoopback(server);
  return {server,url:'http://127.0.0.1:'+server.address().port,videos,pictures,favorites,progress,requests,watch,trash,batches,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
