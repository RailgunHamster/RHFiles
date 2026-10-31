// Split observed delivery phases only with explicit cross-process clock anchors.
// Never assume browser/Node/Rust monotonic epochs are interchangeable.
export function wryPipeline(producer,ipc,{frontendUnixMs,wallDriftMs,toleranceMs=50}={}){
 const anchor=producer?.hostClockAnchor,stages=producer?.hostStages;
 if(!anchor||![anchor.atMs,anchor.unixMs,frontendUnixMs,wallDriftMs,toleranceMs].every(Number.isFinite)||anchor.unixMs<=0||toleranceMs<0||toleranceMs>50||Math.abs(wallDriftMs)>toleranceMs)throw Error('Missing or unstable cross-process clock anchor');
 if(!Array.isArray(stages)||stages.length>128||!Array.isArray(ipc)||ipc.length>64)throw Error('Unbounded pipeline evidence');
 const sent=ipc.filter(row=>row.phase==='sent'),headers=ipc.filter(row=>row.phase==='headers'),finished=ipc.filter(row=>row.phase==='finished');
 if(sent.length!==1||headers.length!==1||finished.length!==1||![sent[0].unixMs,headers[0].unixMs,finished[0].unixMs].every(Number.isFinite)||sent[0].request!==headers[0].request||sent[0].request!==finished[0].request)throw Error('A single completed, wall-anchored play response is required');
 const entry=stages.find(row=>row.family==='request'&&row.stage==='entry'),returned=stages.find(row=>row.family==='command-return'&&row.stage==='dispatch-returned');
 if(!entry||!returned||![entry.at_ms,returned.at_ms].every(Number.isFinite)||returned.at_ms<entry.at_ms)throw Error('Missing native entry/return boundaries');
 const unix=at=>anchor.unixMs+at-anchor.atMs;
 if(unix(entry.at_ms)<sent[0].unixMs-toleranceMs||unix(returned.at_ms)>headers[0].unixMs+toleranceMs||finished[0].unixMs<unix(returned.at_ms)-toleranceMs||frontendUnixMs<finished[0].unixMs-toleranceMs)throw Error('Clock anchors contradict response ordering');
 const pairs=new Map();for(const row of stages){if(!/^wry-exec-(?:[1-9]|[12]\d|3[0-2])$/.test(row.family)||!['entered','returned'].includes(row.stage)||!Number.isFinite(row.at_ms))continue;const pair=pairs.get(row.family)||{family:row.family};if(Object.hasOwn(pair,row.stage))throw Error('Duplicate Wry message boundary');pair[row.stage]=row.at_ms;pairs.set(row.family,pair);}
 const candidates=[...pairs.values()].filter(pair=>pair.entered>=returned.at_ms&&unix(pair.entered)<=headers[0].unixMs+toleranceMs&&Number.isFinite(pair.returned)&&pair.returned>=pair.entered);
 if(candidates.length!==1)return {unique:false,candidateCount:candidates.length,reason:'Cannot uniquely bind an observed Wry dispatch to this response',clockToleranceMs:toleranceMs};
 // CDP's resource finish timestamp can precede its response notification
 // timestamp (observed 6.9 ms in a real capture). Preserve that signed fact;
 // do not call it a negative physical transfer duration or reorder the data.
 const pair=candidates[0],durations={networkToNativeMs:unix(entry.at_ms)-sent[0].unixMs,nativeHandlingMs:returned.at_ms-entry.at_ms,nativeReturnToWryMs:pair.entered-returned.at_ms,wryExecutionMs:pair.returned-pair.entered,wryReturnToHeadersMs:headers[0].unixMs-unix(pair.returned),finishedToFrontendMs:frontendUnixMs-finished[0].unixMs};
 if(Object.values(durations).some(value=>!Number.isFinite(value)||value < -toleranceMs))throw Error('An observed phase contradicts clock ordering');
 const dominant=Object.entries(durations).sort((a,b)=>b[1]-a[1])[0];
 return {unique:true,message:pair.family,clockToleranceMs:toleranceMs,durations,browserEvents:{finishMinusHeadersMs:finished[0].unixMs-headers[0].unixMs,finishTimestampBeforeHeaders:finished[0].unixMs<headers[0].unixMs},dominantObservedSegment:dominant[0],dominantObservedMs:dominant[1],interpretation:'Observed location only, not an inferred root cause or performance acceptance'};
}
