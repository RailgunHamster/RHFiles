// Server-side observation only. A Node response finish means handed to the
// transport, not that Android received/decoded it. Never store headers or URLs.
export function fixtureTransport({limit=4096,now=()=>performance.now()}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>4096)throw Error('Invalid fixture transport limit');
  const origin=now(),rows=[];let dropped=0;
  const elapsed=()=>Math.max(0,now()-origin);
  return {
    observe(response,requestIndex){
      if(!Number.isSafeInteger(requestIndex)||requestIndex<0)throw Error('Invalid fixture request index');
      if(rows.length>=limit){dropped++;return;}
      const row={requestIndex,startedMs:elapsed(),finishedMs:null,closedMs:null,statusCode:null,writableFinished:false,errorClass:null};
      rows.push(row);
      response.once('finish',()=>{row.finishedMs=elapsed();row.statusCode=response.statusCode;row.writableFinished=response.writableFinished;});
      response.once('close',()=>{row.closedMs=elapsed();row.statusCode=response.headersSent?response.statusCode:null;row.writableFinished=response.writableFinished;});
      response.on('error',error=>{row.errorClass=typeof error?.name==='string'&&/^[A-Za-z]{1,64}$/.test(error.name)?error.name:'Error';});
    },
    snapshot(){return {limit,dropped,requests:rows.map(row=>({...row}))};},
  };
}
