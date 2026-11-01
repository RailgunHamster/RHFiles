/* Android SharedConfig v1 wire compatibility. No credentials or device state. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.RHFilesSharedConfig=value;})(globalThis,()=>{
  const empty=()=>({schemaVersion:1,profiles:[],favorites:[]});
  const canonical=value=>JSON.stringify(value==null?null:Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);
  const same=(a,b)=>canonical(a)===canonical(b);
  const records=(doc,key,id)=>new Map(doc[key].map(item=>[item[id],item]));
  const paths=doc=>doc.favorites.map(item=>item.path);
  function withoutRhFiles(doc){
    const retired=new Set(doc.profiles.filter(p=>p.config.type==='rhfiles').map(p=>p.id));
    return {...doc,profiles:doc.profiles.filter(p=>!retired.has(p.id)),favorites:doc.favorites.filter(f=>!retired.has(new URL(f.path).host))};
  }
  function favoriteOrder(keys,base,local,remote,choice,conflicts){
    const orders=[paths(base),paths(local),paths(remote)],positions=orders.map(order=>new Map(order.map((key,index)=>[key,index])));
    const before=(p,x,y)=>p.has(x)&&p.has(y)?p.get(x)<p.get(y):null;
    const nodes=[...keys].sort(),edges=new Map(nodes.map(k=>[k,new Set()])),degree=new Map(nodes.map(k=>[k,0]));let ambiguous=false;
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const x=nodes[i],y=nodes[j],[b,l,r]=positions.map(p=>before(p,x,y));let selected;
      if(l===null)selected=r??b;else if(r===null)selected=l;else if(l===r)selected=l;else if(l===b)selected=r;else if(r===b)selected=l;else{ambiguous=true;selected=choice==='remote'?r:l;}
      if(selected!==null){const [from,to]=selected?[x,y]:[y,x];if(!edges.get(from).has(to)){edges.get(from).add(to);degree.set(to,degree.get(to)+1);}}
    }
    const ready=nodes.filter(k=>degree.get(k)===0),result=[];
    while(ready.length){ready.sort();const next=ready.shift();result.push(next);for(const to of edges.get(next)){degree.set(to,degree.get(to)-1);if(degree.get(to)===0)ready.push(to);}}
    if(!ambiguous&&result.length===keys.size)return result;
    conflicts.push({kind:'favoriteOrder',id:'favorites',local:orders[1],remote:orders[2]});
    return [...new Set([...(choice==='remote'?orders[2]:orders[1]),...(choice==='remote'?orders[1]:orders[2]),...orders[0],...nodes])].filter(k=>keys.has(k));
  }
  function merge(base,local,remote,choice=''){
    if(!['','local','remote'].includes(choice))throw Error('Invalid conflict choice');
    const document=empty(),conflicts=[];
    for(const [key,id]of [['profiles','id'],['favorites','path']]){
      const [b,l,r]=[base,local,remote].map(doc=>records(doc,key,id));
      for(const k of [...new Set([...b.keys(),...l.keys(),...r.keys()])].sort()){
        const [bv,lv,rv]=[b.get(k),l.get(k),r.get(k)];let selected;
        if(same(lv,rv))selected=lv;else if(same(lv,bv))selected=rv;else if(same(rv,bv))selected=lv;
        else{conflicts.push({kind:key,id:k,local:lv??null,remote:rv??null});selected=choice==='remote'?rv:lv;}
        if(selected!=null)document[key].push(selected);
      }
    }
    const [bv,lv,rv]=[base,local,remote].map(doc=>doc.rhvideo??null);let media;
    if(same(lv,rv))media=lv;else if(same(lv,bv))media=rv;else if(same(rv,bv))media=lv;
    else{conflicts.push({kind:'rhvideo',id:'rhvideo',local:lv,remote:rv});media=choice==='remote'?rv:lv;}
    if(media!=null){document.schemaVersion=2;document.rhvideo=media;}
    const ids=new Set(document.profiles.map(p=>p.id)),kept=[];
    for(const f of document.favorites){
      const id=new URL(f.path).host;
      if(ids.has(id)){kept.push(f);continue;}
      conflicts.push({kind:'favorites',id:f.path,local:records(local,'favorites','path').get(f.path)??null,remote:records(remote,'favorites','path').get(f.path)??null});
      if(choice){const selected=records(choice==='remote'?remote:local,'profiles','id').get(id);if(selected){if(!ids.has(id)){ids.add(id);document.profiles.push(selected);}kept.push(f);}}
    }
    document.favorites=kept;const favorites=records(document,'favorites','path');
    document.favorites=favoriteOrder(new Set(favorites.keys()),base,local,remote,choice,conflicts).map(key=>favorites.get(key));
    return {document,conflicts};
  }
  return {empty,canonical,same,withoutRhFiles,merge};
});
