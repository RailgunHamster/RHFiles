// Isolated server contract fixture. Never touches a real RHVideo database.
import http from 'node:http';
import fs from 'node:fs';
import {once} from 'node:events';
export async function rhvideoFixture({videoFile=null}={}){
  const favorites=new Set(),progress=[],requests=[];
  const folders=['山野与旅途','日常片段','城市观察','慢生活'];
  const names=['沿着山脊，看见清晨','海边的蓝色时刻','森林里的一场小雨','城市醒来之前','周末，留一点空白','穿过落日的列车','湖面与风的形状','路过人间烟火','一个很慢的下午','远山，云与自由','星空下的营地','把日子过成风景'];
  const videos=Array.from({length:52},(_,i)=>({id:'video-'+i,original_filename:names[i%names.length]+(i>11?' · '+(i+1):'')+'.mp4',duration_seconds:126+i*31,original_resolution:i%3?'1920×1080':'3840×2160',folder_label:folders[i%folders.length],status:'completed'}));
  const pictures=Array.from({length:8},(_,i)=>({id:'picture-'+i,original_filename:['山间留白','远行手记','夏日的海','微光森林'][i%4]+'.webp',webp_path:'pictures/'+i+'.svg',folder_label:folders[i%4],original_resolution:'2560×1600',status:'active'}));
  const novels=[{id:'novel-0',title:'沿途的风景',folder_label:'旅行与散文',word_count:216000,chapter_count:3,status:'active',progress:null},{id:'novel-1',title:'城市以外',folder_label:'小说书架',word_count:128000,chapter_count:3,status:'active',progress:{chapter_index:1,scroll_ratio:.2,percent:40}}];
  const svg=(index)=>{
    const palettes=[['#94b6bf','#e9d8c3','#477881'],['#bbc3dc','#f2d8d4','#606e99'],['#9dbbb2','#e3e8d0','#538478'],['#b6c8dd','#f0e1ce','#718fa5']];
    const [sky,light,dark]=palettes[index%4];
    return '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><defs><linearGradient id="s" x2="0" y2="1"><stop stop-color="'+sky+'"/><stop offset="1" stop-color="'+light+'"/></linearGradient><linearGradient id="m" x2="0" y2="1"><stop stop-color="'+dark+'"/><stop offset="1" stop-color="'+sky+'"/></linearGradient></defs><rect width="800" height="500" fill="url(#s)"/><circle cx="'+(570-index%3*90)+'" cy="130" r="43" fill="#fff4df" opacity=".8"/><path d="M0 330 145 190 280 300 440 145 650 310 800 215v285H0z" fill="'+dark+'" opacity=".35"/><path d="M0 370 185 280 330 390 520 260 800 380v120H0z" fill="url(#m)" opacity=".75"/><path d="M0 435q220-100 450-25t350-30v120H0z" fill="'+dark+'" opacity=".55"/></svg>';
  };
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://fixture'),path=url.pathname;requests.push({path,authorization:req.headers.authorization,range:req.headers.range,method:req.method});
    const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
    const body=async()=>{const chunks=[];for await(const part of req)chunks.push(part);return JSON.parse(Buffer.concat(chunks).toString()||'{}');};
    if(path==='/api/v1/auth/login'){
      const value=await body();return value.username==='preview'&&value.password==='fixture-only'?send(200,{access_token:'fixture-bearer-do-not-persist',token_type:'bearer'}):send(401,{detail:'Wrong credentials'});
    }
    if(req.headers.authorization!=='Bearer fixture-bearer-do-not-persist')return send(401,{detail:'Unauthorized'});
    if(path==='/api/v1/auth/me')return send(200,{username:'preview',user_id:'fixture-user'});
    if(path==='/api/v1/videos')return send(200,videos);
    if(/^\/api\/v1\/(videos|pictures|novels)\/folders$/.test(path))return send(200,folders);
    const paginate=items=>{
      const search=(url.searchParams.get('search')||'').toLowerCase(),folder=url.searchParams.get('folder')||'';
      const all=items.filter(item=>(!search||(item.title||item.original_filename).toLowerCase().includes(search))&&(!folder||item.folder_label.includes(folder)));
      return {items:all.slice(Number(url.searchParams.get('skip')||0),Number(url.searchParams.get('skip')||0)+Number(url.searchParams.get('limit')||36)),total:all.length};
    };
    if(path==='/api/v1/pictures')return send(200,paginate(pictures));
    if(path==='/api/v1/novels')return send(200,paginate(novels));
    if(path==='/api/v1/favorites/ids')return send(200,{video_ids:[...favorites].filter(k=>k.startsWith('video:')).map(k=>k.slice(6)),picture_ids:[...favorites].filter(k=>k.startsWith('picture:')).map(k=>k.slice(8)),novel_ids:[]});
    if(path==='/api/v1/favorites'){
      const all=[...videos.map(v=>({...v,type:'video'})),...pictures.map(p=>({...p,type:'picture'})),...novels.map(n=>({...n,type:'novel'}))].filter(v=>favorites.has(v.type+':'+v.id));return send(200,paginate(all));
    }
    const favorite=path.match(/^\/api\/v1\/favorites\/(video|picture|novel)\/([^/]+)$/);
    if(favorite){const key=favorite[1]+':'+favorite[2];if(req.method==='PUT')favorites.add(key);else if(req.method==='DELETE')favorites.delete(key);else return send(405,{detail:'Use PUT or DELETE'});return send(200,{ok:true});}
    const novel=path.match(/^\/api\/v1\/novels\/(novel-\d+)$/);
    if(novel)return send(200,{...novels.find(n=>n.id===novel[1]),chapters:Array.from({length:3},(_,i)=>({index:i,title:'第'+(i+1)+'章 '+['清晨出发','山间来信','回到日常'][i],word_count:1500}))});
    if(path.endsWith('/progress')){progress.push({path,...await body()});return send(200,{saved:true});}
    const chapter=path.match(/\/chapters\/(\d+)$/);
    if(chapter){const index=Number(chapter[1]);return send(200,{index,title:'第'+(index+1)+'章 山间来信',text:('清晨的光越过山脊，落在还未醒来的小路上。\n\n我们把行程放慢，让风景自己走近。远处的云在缓缓移动，像是一封尚未写完的信。\n\n').repeat(30),has_prev:index>0,has_next:index<2,total_chapters:3});}
    if(path.startsWith('/api/v1/screenshots/video/'))return send(200,{screenshots:Array.from({length:8},(_,i)=>({url:'/storage/pictures/'+i+'.svg',time_seconds:i*2}))});
    if(path.endsWith('/thumbnail')||path.startsWith('/storage/pictures/')){res.writeHead(200,{'content-type':'image/svg+xml'});return res.end(svg(Number(path.match(/\d+/g)?.at(-1))||0));}
    if(path.endsWith('/play')&&videoFile){
      const size=fs.statSync(videoFile).size,range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),size-1):size-1;
      if(start>=size){res.writeHead(416,{'content-range':'bytes */'+size});return res.end();}
      res.writeHead(range?206:200,{'content-type':'video/mp4','accept-ranges':'bytes','content-length':end-start+1,...(range?{'content-range':'bytes '+start+'-'+end+'/'+size}:{})});
      return fs.createReadStream(videoFile,{start,end}).pipe(res);
    }
    send(404,{detail:'Fixture route not found'});
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  return {server,url:'http://127.0.0.1:'+server.address().port,favorites,progress,requests,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
