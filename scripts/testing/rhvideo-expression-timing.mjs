// Read only the opt-in, bounded QA probe's fixed timing fields. Android
// elapsedRealtime is not the host stdout clock or native API execution time.
export function expressionTimings(log,run){
  if(typeof run!=='string'||!/^[a-f0-9]{32}$/.test(run))throw Error('Invalid expression timing run identity');
  const fields=['elapsedMs','evals','polls','mainQueueMs','mainQueueMaxMs','callbackMs','callbackMaxMs','callbackMissing','resetEvalMs','launchEvalMs','pollEvalMs','pollSleepMs'];
  const records=[];let rejected=0,dropped=0,previous=0;
  for(const line of String(log).split(/\r?\n/)){
    const match=/\bRHVideoQATiming\s*:\s*(\{.*\})\s*$/.exec(line);if(!match)continue;
    let row;try{row=JSON.parse(match[1]);}catch{rejected++;continue;}
    if(row.run!==run)continue;
    if(row.protocol!==1||row.clock!=='android-elapsed-realtime'||!['value','error','timeout'].includes(row.outcome)||typeof row.label!=='string'||row.label.length>160||!/^(?:expression|(?:native|files|rhvideo)\.[A-Za-z][A-Za-z0-9_.]*)$/.test(row.label)||!Number.isSafeInteger(row.pid)||row.pid<=0||!Number.isSafeInteger(row.sequence)||row.sequence<=previous||row.sequence>512||fields.some(key=>!Number.isSafeInteger(row[key])||row[key]<0||row[key]>3600000)){
      rejected++;continue;
    }
    if(records.length>=512){dropped++;continue;}
    previous=row.sequence;
    records.push(Object.fromEntries(['sequence','pid','label','outcome',...fields].map(key=>[key,row[key]])));
  }
  return {clock:'android-elapsed-realtime',scope:'opt-in owned probe, not native API execution duration',records,rejected,dropped};
}
