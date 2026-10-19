(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.mobileMedia=model;})(globalThis,()=>{
  function playback(entry,entries=[]){
    const seen=new Set(),all=entries.filter(e=>!e.isDir&&e.kind===entry.kind&&typeof e.path==='string'&&!seen.has(e.path)&&seen.add(e.path));
    if(!all.some(e=>e.path===entry.path))all.push(entry);
    const selected=all.findIndex(e=>e.path===entry.path);let start=Math.max(0,Math.min(selected-499,all.length-1000)),end=Math.min(all.length,start+1000);
    let queue=all.slice(start,end).map(e=>({path:e.path,name:e.name}));
    const encoder=new TextEncoder(),costs=queue.map(item=>encoder.encode(JSON.stringify(item)).length);let bytes=2+Math.max(0,queue.length-1)+costs.reduce((a,b)=>a+b,0);
    while(bytes>240*1024&&queue.length>1){
      if(selected-start>end-1-selected){start++;queue.shift();bytes-=costs.shift()+1;}else{end--;queue.pop();bytes-=costs.pop()+1;}
    }
    return {path:entry.path,name:entry.name,kind:entry.kind,queue,queueTruncated:queue.length<all.length};
  }
  function swipe(dx,dy,width,velocity){return Math.abs(dx)>Math.abs(dy)*1.25&&(Math.abs(dx)>=width*.2||(Math.abs(dx)>20&&Math.abs(velocity)>.45))?(dx<0?1:-1):0;}
  return {playback,swipe};
});
