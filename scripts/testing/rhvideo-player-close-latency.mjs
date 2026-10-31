import assert from 'node:assert/strict';
export function playerCloseLatencyEvents(log,run){
 assert.match(run||'',/^[a-f0-9]{32}$/);
 const result={clock:'android-elapsed-realtime',scope:'partial diagnostic events only; never an acceptance receipt',events:[],rejected:0,dropped:0};
 for(const line of log.split(/\r?\n/)){
  const marker='RHVideoCloseEvent: ',index=line.indexOf(marker);if(index<0)continue;
  let row;try{row=JSON.parse(line.slice(index+marker.length));}catch{result.rejected++;continue;}
  if(row.run!==run)continue;
  if(row.protocol!==1||row.clock!==result.clock||!['started','ack','stopped','destroyed','finished'].includes(row.event)||!['pid','startedAt','at'].every(k=>Number.isSafeInteger(row[k])&&row[k]>0)||row.at<row.startedAt){result.rejected++;continue;}
  if(result.events.length>=8){result.dropped++;continue;}
  result.events.push({event:row.event,pid:row.pid,startedAt:row.startedAt,at:row.at,elapsedMs:row.at-row.startedAt});
 }
 return result;
}
export function playerCloseLatencyReceipt(row,run){
 assert.match(run||'',/^[a-f0-9]{32}$/);assert(row&&row.protocol===1&&row.run===run&&row.clock==='android-elapsed-realtime');
 for(const key of ['pid','inputId','renderedFrames','startedAt','ackAt','stoppedAt','destroyedAt'])assert(Number.isSafeInteger(row[key])&&row[key]>0,'Missing actual native close evidence: '+key);
 assert(row.completed===true&&row.destroyed===true&&row.libraryResumed===true&&row.observationStopped===true,'An acknowledgement cannot replace actual native destruction and observer cleanup');
 assert(row.ackAt>=row.startedAt&&row.stoppedAt>=row.startedAt&&row.destroyedAt>=row.stoppedAt);
 const result={protocol:1,run,pid:row.pid,inputId:row.inputId,renderedFrames:row.renderedFrames,clock:'android-elapsed-realtime',scope:'owned probe with bounded thread observation; not full product acceptance',ackMs:row.ackAt-row.startedAt,stoppedMs:row.stoppedAt-row.startedAt,destroyedMs:row.destroyedAt-row.startedAt,ackAfterDestroyMs:row.ackAt-row.destroyedAt};
 assert([result.ackMs,result.stoppedMs,result.destroyedMs].every(n=>n<=180000),'The close diagnostic exceeded its finite whole-run budget');return result;
}
