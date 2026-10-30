// Observe existing instrumentation stdout. No polling, actions or credentials.
export function stepTimeline({now=()=>performance.now(),limit=4096}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>4096)throw Error('Invalid timeline limit');
  const start=now(),steps=[];let pending='',dropped=0;
  return {
    push(chunk){
      pending+=String(chunk);let end;
      while((end=pending.indexOf('\n'))>=0){
        const line=pending.slice(0,end).replace(/\r$/,'');pending=pending.slice(end+1);
        const match=/^STEP: ((?:native|files|rhvideo)\.[A-Za-z][A-Za-z0-9_.]*)$/.exec(line);
        if(match){if(steps.length<limit)steps.push({command:match[1],deliveredMs:now()-start});else dropped++;}
      }
      // Only exact bounded command labels are observed; ignore long log lines.
      if(pending.length>4096)pending=pending.slice(-4096);
    },
    snapshot(){return {clock:'host monotonic stdout delivery; not native execution duration',steps:steps.map(row=>({...row})),dropped};},
  };
}
