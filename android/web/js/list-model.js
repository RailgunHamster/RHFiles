/* Shared, testable list geometry, album grouping and bounded thumbnail work. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.mobileList=value;})(globalThis,()=>{
  function range(scroll,viewport,height,columns,count){return {first:Math.max(0,Math.floor(scroll/height)-3)*columns,last:Math.min(count,(Math.ceil((scroll+viewport)/height)+3)*columns)};}
  function directoryFor(route){return route?.screen==='folder'?route.path:route?.screen==='library'?route.folder:null;}
  function categoryFiles(entries,category){return entries.filter(e=>!e.isDir&&(category==='recent'||e.kind===category||category==='document'&&e.kind==='code'));}
  function capturePosition(entries,scroll,viewport,height,columns,exclude=[]){
    const ignored=new Set(exclude),first=Math.floor(scroll/height)*columns,visibleEnd=Math.ceil((scroll+viewport)/height)*columns,anchors=[];
    function add(i){const entry=entries[i];if(!entry||ignored.has(entry.path))return;const top=i>=first&&i<visibleEnd?Math.floor(i/columns)*height-scroll:-(scroll%height);anchors.push({path:entry.path,top});}
    for(let i=first;i<entries.length&&anchors.length<16;i++)add(i);
    for(let i=Math.min(first-1,entries.length-1);i>=0&&anchors.length<16;i--)add(i);
    return {scroll,anchors};
  }
  function restorePosition(entries,position,height,columns){
    const indexes=new Map(entries.map((e,i)=>[e.path,i]));
    for(const a of position?.anchors||[]){const i=indexes.get(a.path);if(i!==undefined)return Math.max(0,Math.floor(i/columns)*height-a.top);}
    return Math.max(0,position?.scroll||0);
  }
  function albums(entries,parentOf,baseName){
    const groups=new Map();
    for(const entry of entries){if(entry.isDir)continue;const path=entry.parentPath||parentOf(entry.path);let album=groups.get(path);
      if(!album){album={path,name:baseName(path)||path,isDir:true,kind:'folder',libraryAlbum:true,count:0,size:0,modifiedMs:0,cover:entry};groups.set(path,album);}
      album.count++;album.size+=entry.size||0;if((entry.modifiedMs||0)>(album.cover.modifiedMs||0)||((entry.modifiedMs||0)===(album.cover.modifiedMs||0)&&entry.path<album.cover.path))album.cover=entry;album.modifiedMs=Math.max(album.modifiedMs,entry.modifiedMs||0);
    }return [...groups.values()];
  }
  function reconcile(container,entries,build,key=e=>e.path){
    const old=new Map([...container.children].map(node=>[node.dataset.path,node]));
    const keep=new Set(entries.map(key));for(const [path,node] of old)if(!keep.has(path))node.remove();
    entries.forEach((entry,index)=>{const node=old.get(key(entry))||build(entry);if(container.children[index]!==node)container.insertBefore(node,container.children[index]||null);});
  }
  function thumbnailLoader(read,{limit=2,capacity=256,now=Date.now}={}){
    const cache=new Map(),pending=new Map();let active=0,generation=0;const queue=[];
    function remember(key,value){cache.delete(key);cache.set(key,{value,at:now()});while(cache.size>capacity)cache.delete(cache.keys().next().value);}
    function pump(){while(active<limit&&queue.length){const job=queue.shift();job.targets=job.targets.filter(t=>t.alive());if(!job.targets.length){pending.delete(job.key);continue;}active++;
      Promise.resolve().then(()=>read(job.entry)).then(result=>{if(job.generation!==generation)return;const value=typeof result==='string'?result:result?.dataUrl;remember(job.key,value||'');for(const target of job.targets)if(target.alive()&&value)target.apply(value);},()=>{if(job.generation===generation)remember(job.key,'');}).finally(()=>{if(pending.get(job.key)===job)pending.delete(job.key);active--;pump();});
    }}
    function request(entry,apply,alive){const key=[entry.path,entry.modifiedMs,entry.size].join(':');const hit=cache.get(key);
      if(hit&&(hit.value||now()-hit.at<60000)){cache.delete(key);cache.set(key,hit);if(hit.value)apply(hit.value);return;}
      const target={apply,alive};const existing=pending.get(key);if(existing){existing.targets.push(target);return;}
      const job={key,entry,targets:[target],generation};pending.set(key,job);queue.push(job);queueMicrotask(pump);
    }
    function prune(){for(let i=queue.length-1;i>=0;i--){queue[i].targets=queue[i].targets.filter(t=>t.alive());if(!queue[i].targets.length){pending.delete(queue[i].key);queue.splice(i,1);}}}
    function clear(){generation++;cache.clear();pending.clear();queue.length=0;}
    return {request,prune,clear};
  }
  function layout(width,height,hinge){
    let left=0,top=0,right=width,bottom=height,rail=width>=840?232:0;
    if(hinge?.separating){const b=hinge.bounds;
      if(hinge.orientation==='vertical'&&b.left>=180&&width-b.right>=320){rail=Math.floor(b.left);left=Math.ceil(b.right);}
      else if(hinge.orientation==='horizontal'){if(b.top>=height-b.bottom&&b.top>=240)bottom=Math.floor(b.top);else if(height-b.bottom>=240)top=Math.ceil(b.bottom);rail=width>=840?232:0;}
    }
    return {left:Math.max(left,rail),top,width:Math.max(1,right-Math.max(left,rail)),height:Math.max(1,bottom-top),rail,railWidth:rail?Math.min(280,rail):0};
  }
  return {range,directoryFor,categoryFiles,capturePosition,restorePosition,albums,reconcile,thumbnailLoader,layout};
});
