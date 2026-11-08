(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.androidHistoryModel=model;})(globalThis,()=>{
  const limit=200,categories=new Set(['image','video','audio','document','archive','apk','recent']);
  function path(value){
    if(typeof value!=='string'||!value||value.length>8192||/[\u0000-\u001f]/.test(value))return false;
    if(value.startsWith('/'))return true;
    try{const url=new URL(value);return ['content:','remote:','rh:','rhfiles-device:'].includes(url.protocol)&&!!url.host&&!url.username&&!url.password;}catch{return false;}
  }
  function route(value){
    if(!value||typeof value!=='object')return null;
    let result;
    if(value.screen==='folder'&&path(value.path))result={screen:'folder',path:value.path};
    else if(value.screen==='library'&&categories.has(value.category)&&path(value.folder))result={screen:'library',category:value.category,folder:value.folder};
    else return null;
    if(typeof value.label==='string')result.label=value.label.slice(0,200);
    if(path(value.boundary)&&((result.path||result.folder)===value.boundary||(result.path||result.folder).startsWith(value.boundary+'/'))){result.boundary=value.boundary;if(typeof value.boundaryLabel==='string')result.boundaryLabel=value.boundaryLabel.slice(0,200);}
    return result;
  }
  const key=value=>JSON.stringify([value.screen,value.category||'',value.path||value.folder]);
  function clean(entries){
    const seen=new Set(),result=[];
    for(const entry of Array.isArray(entries)?entries:[]){
      const location=route(entry?.route);if(!location||!Number.isSafeInteger(entry.visitedAt)||entry.visitedAt<=0||entry.visitedAt>8640000000000000)continue;
      const id=key(location);if(seen.has(id))continue;seen.add(id);
      result.push({id,path:location.path||location.folder,route:location,label:typeof entry.label==='string'?entry.label.slice(0,200):'',displayPath:typeof entry.displayPath==='string'?entry.displayPath.slice(0,8192):location.path||location.folder,visitedAt:entry.visitedAt});
      if(result.length===limit)break;
    }
    return result;
  }
  function visit(entries,location,label,displayPath,now=Date.now()){
    const target=route(location),existing=clean(entries);if(!target)return existing;
    return clean([{route:target,label,displayPath,visitedAt:now},...existing.filter(entry=>entry.id!==key(target))]);
  }
  return {limit,clean,visit};
});
