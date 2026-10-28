(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.RHVideoModel=model;})(globalThis,()=>{
  'use strict';
  const kinds=['video','picture','novel','favorite'];
  function clock(seconds){seconds=Math.max(0,Math.floor(Number(seconds)||0));return (seconds>=3600?Math.floor(seconds/3600)+':':'')+String(Math.floor(seconds/60)%60).padStart(seconds>=3600?2:1,'0')+':'+String(seconds%60).padStart(2,'0');}
  function page(total,offset,limit){if(!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>72)throw Error('Invalid pagination');return {number:Math.floor(offset/limit)+1,pages:Math.max(1,Math.ceil(total/limit)),previous:offset>0,next:offset+limit<total};}
  function itemKey(item){return item.kind+':'+item.id;}
  function favoriteSet(value){const set=new Set();for(const kind of ['video','picture','novel'])for(const id of value[kind+'_ids']||[])set.add(kind+':'+id);return set;}
  function validateCatalog(value){if(!value||!Array.isArray(value.items)||!Number.isSafeInteger(value.total)||value.total<0)throw Error('服务器媒体清单无效');for(const item of value.items){if(!['video','picture','novel'].includes(item.kind)||typeof item.id!=='string'||typeof item.title!=='string')throw Error('媒体项目格式无效');}return value;}
  function imageIndex(items,id,delta=0){const images=items.filter(item=>item.kind==='picture'&&item.cover);const index=images.findIndex(item=>item.id===id);if(index<0)throw Error('图片不在当前列表中');return {images,index:((index+delta)%images.length+images.length)%images.length};}
  // RHVideo's three playback pools are intentionally distinct. These rules
  // come from collectListOrderVideoIds / collectPlaylistVideoIds /
  // buildPlaylistEntries, not from the shape of the RHFiles toolbar.
  const playback={
    initial(mode,saved={},defaults={}){saved=saved||{};const sequential=mode!=='segments';return {portraitOnly:!sequential&&!!(saved.portraitOnly??defaults.portraitOnly),fullLength:sequential||!!(saved.fullLength??defaults.fullLength),segment:sequential?300:Math.max(1,Math.min(300,saved.segment??defaults.segment??3)),loop:!!(saved.loop??(sequential?false:defaults.loop)),rate:saved.rate??1};},
    portrait(resolution){const [w,h]=String(resolution||'').split(/[x×X]/).map(Number);return w>0&&h>w*1.1;},
    listIds(videos){return videos.filter(v=>v&&['ready','processing'].includes(v.status)&&v.id!=null).map(v=>String(v.id));},
    galleryIds(frames,start=0){
      const seen=new Set(),ids=[];start=Math.max(0,Math.min(frames.length,Math.trunc(start)||0));
      for(let offset=0;offset<frames.length;offset++){const item=frames[(start+offset)%frames.length],id=item.videoId??item.video_id;if(id!=null&&!seen.has(String(id))){seen.add(String(id));ids.push(String(id));}}
      return ids;
    },
    entries(ids,videos,{segment=3,fullLength=false,super:low=false,random=Math.random}={}){
      const byId=new Map(videos.map(v=>[String(v.id),v]));
      return ids.map(id=>{const v=byId.get(String(id))||{},duration=Number(v.duration_seconds||v.original_duration||v.duration||0),maxStart=duration-segment-1;
        const start=fullLength?0:maxStart>1?1+random()*(maxStart-1):0;
        return {id:String(id),title:(v.folder_label?'['+v.folder_label+'] ':'')+(v.original_filename||v.title||String(id))+(low?' (超压)':''),duration,portrait:['ready','processing'].includes(v.status)&&playback.portrait(v.original_resolution||v.resolution),segmentStart:Math.round(start*10)/10,segmentLength:fullLength?(duration>0?Math.round(duration*10)/10:86400):duration>0?Math.round(Math.min(segment,duration)*10)/10:segment};});
    },
    step(index,direction,count){if(!Number.isSafeInteger(count)||count<1)throw Error('播放队列为空');return ((index+direction)%count+count)%count;},
    imageSeek(count,ratio){if(!Number.isSafeInteger(count)||count<1||!Number.isFinite(ratio)||ratio<0||ratio>1)throw Error('图片集合位置无效');return Math.round(ratio*(count-1));},
    seek(entries,ratio){
      const total=entries.reduce((sum,e)=>sum+e.segmentLength,0),target=Math.max(0,Math.min(1,ratio))*total;
      let index=entries.length-1,before=0;for(let i=0;i<entries.length;i++){if(target<before+entries[i].segmentLength){index=i;break;}before+=entries[i].segmentLength;}
      return {index,offset:Math.max(0,target-before),total};
    },
  };
  const grid={
    entries(frames,videos){const byId=new Map(videos.map(v=>[String(v.id),v]));return playback.galleryIds(frames).filter(id=>byId.has(id)).map(id=>{const v=byId.get(id),[w,h]=String(v.original_resolution||v.resolution||'').split(/[x×X]/).map(Number);return {id,title:(v.folder_label?'['+v.folder_label+'] ':'')+(v.original_filename||v.title||id),duration:Number(v.duration_seconds||v.original_duration||v.duration||0),aspectRatio:w>0&&h>0?w/h:16/9};});},
    score(ars){const screen=16/9,n=ars.length,fit=a=>a>screen?screen/a:a/screen,sum=ars.reduce((a,b)=>a+b,0);if(n===2)return fit(sum);if(n===3){if(Math.min(...ars)/sum<.30){const pairs=[[0,1,2],[0,2,1],[1,2,0]].sort((a,b)=>Math.abs(ars[a[0]]-ars[a[1]])-Math.abs(ars[b[0]]-ars[b[1]]));const a=pairs[0];return(fit(ars[a[0]]+ars[a[1]])+.6*fit(ars[a[2]]))/1.6;}return fit(sum);}if(n===4){const cell=screen/2;return ars.reduce((s,a)=>s+(a>cell?cell/a:a/cell),0)/4*.95;}return 0;},
    groups(entries,count=0){const groups=[];for(let i=0;i<entries.length;){let size=count;if(!size){const remaining=entries.length-i;if(remaining===1){if(groups.length)groups.at(-1).push(entries[i]);else groups.push([entries[i]]);break;}const sizes=[2,3,4].filter(n=>i+n<=entries.length&&i+n!==entries.length-1);size=sizes[0]||remaining;for(const n of sizes)if(grid.score(entries.slice(i,i+n).map(v=>v.aspectRatio))>grid.score(entries.slice(i,i+size).map(v=>v.aspectRatio)))size=n;}groups.push(entries.slice(i,i+size));i+=size;}return groups;},
    rects(ars){const n=ars.length,total=ars.reduce((a,b)=>a+b,0),pct=v=>Math.round(v*1000)/1000;if(n===1)return [[0,0,1,1]];if(n===2||n===3){if(n===3&&Math.min(...ars)/total<.30){const pair=[[0,1,2],[0,2,1],[1,2,0]].sort((a,b)=>Math.abs(ars[a[0]]-ars[a[1]])-Math.abs(ars[b[0]]-ars[b[1]]))[0],w=pct(ars[pair[0]]/(ars[pair[0]]+ars[pair[1]])),r=[];r[pair[0]]=[0,0,w,.5];r[pair[1]]=[w,0,1-w,.5];r[pair[2]]=[0,.5,1,.5];return r;}let x=0;return ars.map(a=>{const width=pct(a/total),r=[x,0,width,1];x+=width;return r;});}const cols=Math.ceil(Math.sqrt(n)),rows=Math.ceil(n/cols);return ars.map((_,i)=>[(i%cols)/cols,Math.floor(i/cols)/rows,1/cols,1/rows]);},
    plan(entries,count=0){return grid.groups(entries,count).flatMap(group=>{const rects=grid.rects(group.map(v=>v.aspectRatio));return group.map((v,i)=>({...v,gridRect:rects[i],gridEnd:i===group.length-1}));});},
  };
  function rotation(width,height,containerWidth,containerHeight,enabled=false){
    if(!(width>0&&height>0&&containerWidth>0&&containerHeight>0))return {angle:0,available:true};
    const vr=width/height,cr=containerWidth/containerHeight,normal=Math.min(cr/vr,vr/cr),rotated=Math.min(cr*vr,1/(cr*vr));
    return {angle:enabled&&rotated>normal*1.05?90:0,available:!!enabled||(!(vr>.9&&vr<1.1)&&Math.abs(normal-rotated)>=.05)};
  }
  return {kinds,clock,page,itemKey,favoriteSet,validateCatalog,imageIndex,playback,grid,rotation};
});
