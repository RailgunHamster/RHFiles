// Generated source-frame identities, independently recovered from actual native
// pixels. Neither player time, presentation counters nor wall time decode them.
import {execFileSync} from 'node:child_process';
export const clockFormat=Object.freeze({width:1920,height:1080,fps:24,seconds:20,bits:12,columns:16,left:416,top:430,cell:68,row:110,box:54});
export function frameWord(frame){
  if(!Number.isSafeInteger(frame)||frame<0||frame>=4096)throw Error('Frame identity outside 12-bit range');
  return [1,0,1,0,...Array.from({length:12},(_,bit)=>(frame>>(11-bit))&1)];
}
export function clockFilter(){
  const f=clockFormat,filters=[
    'drawbox=x=iw*.05:y=ih*.05:w=iw*.1:h=ih*.1:color=red:t=fill',
    'drawbox=x=iw*.85:y=ih*.05:w=iw*.1:h=ih*.1:color=lime:t=fill',
    'drawbox=x=iw*.05:y=ih*.85:w=iw*.1:h=ih*.1:color=blue:t=fill',
    'drawbox=x=iw*.85:y=ih*.85:w=iw*.1:h=ih*.1:color=yellow:t=fill',
    `drawbox=x=${f.left-12}:y=${f.top-12}:w=${f.columns*f.cell+24}:h=${f.row+f.box+24}:color=black:t=fill`,
  ];
  for(let row=0;row<2;row++)for(let column=0;column<f.columns;column++){
    const bit=column<4?String([1,0,1,0][column]):`mod(floor(n/${2**(15-column)}),2)`;
    filters.push(`drawbox=x=${f.left+column*f.cell}:y=${f.top+row*f.row}:w=${f.box}:h=${f.box}:color=white:t=fill:enable='${row?'1-('+bit+')':bit}'`);
  }
  return filters.join(',');
}
export function generateClockMedia(file){
 const f=clockFormat;execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i',`testsrc2=size=${f.width}x${f.height}:rate=${f.fps}`,'-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000','-vf',clockFilter(),'-t',String(f.seconds),'-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',file],{windowsHide:true,timeout:120000});return f;
}
export function decodeFrameIdentity(bytes){
 const f=clockFormat;
 if(bytes.length<54||bytes.subarray(0,2).toString()!=='BM'||bytes.readUInt32LE(10)!==54||bytes.readUInt32LE(14)!==40||bytes.readUInt16LE(26)!==1||bytes.readUInt16LE(28)!==32||bytes.readUInt32LE(30)!==0)throw Error('Unsupported owned top-down 32-bit clock bitmap');
 const width=bytes.readInt32LE(18),height=-bytes.readInt32LE(22);
 if(width<160||height<120||width>4096||height>4096||bytes.length!==54+width*height*4)throw Error('Invalid owned clock bitmap dimensions');
 const scale=Math.min(width/f.width,height/f.height),left=(width-f.width*scale)/2,top=(height-f.height*scale)/2;
 const rows=[];
 for(let row=0;row<2;row++){
  const values=[];
  for(let column=0;column<f.columns;column++){
   const x=Math.round(left+(f.left+column*f.cell+f.box/2)*scale),y=Math.round(top+(f.top+row*f.row+f.box/2)*scale);let white=true,black=true;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(x+dx<0||y+dy<0||x+dx>=width||y+dy>=height)throw Error('Clock sample outside owned pixels');
    const offset=54+((y+dy)*width+x+dx)*4;for(let channel=0;channel<3;channel++){const v=bytes[offset+channel];white&&=v>=185;black&&=v<=70;}
   }
   if(!white&&!black)throw Error('Ambiguous source clock cell');values.push(white?1:0);
  }
  rows.push(values);
 }
 if(rows[0].slice(0,4).join('')!=='1010'||rows[1].slice(0,4).join('')!=='0101')throw Error('Source clock sentinel missing');
 if(!rows[0].every((value,column)=>value===1-rows[1][column]))throw Error('Source clock inverse checksum mismatch');
 const frame=rows[0].slice(4).reduce((sum,bit)=>sum*2+bit,0);
 if(frame>=f.fps*f.seconds)throw Error('Source clock frame outside generated clip');
 return {width,height,frame,sourceMs:frame*1000/f.fps};
}
export function clockObservations(samples){
 if(!Array.isArray(samples)||samples.length!==3)throw Error('Exactly three predeclared pixel observations are required');
 for(const row of samples)if(row.error||!row.pixels?.visible||![row.captureStartedMs,row.captureEndedMs,row.readEndedMs,row.after?.positionMs,row.identity?.sourceMs].every(Number.isFinite)||row.captureEndedMs<row.captureStartedMs||row.readEndedMs<row.captureEndedMs)throw Error('Incomplete source-pixel observation');
 const synchronization=samples.map(row=>({sourceMs:row.identity.sourceMs,displayedMs:row.after.positionMs,errorMs:row.after.positionMs-row.identity.sourceMs,boundMs:250+row.readEndedMs-row.captureEndedMs}));
 const intervals=samples.slice(1).map((b,index)=>{const a=samples[index],elapsed=((b.captureStartedMs+b.captureEndedMs)-(a.captureStartedMs+a.captureEndedMs))/2;if(elapsed<=0)throw Error('Source observations must be chronologically distinct');const sourceAdvance=b.identity.sourceMs-a.identity.sourceMs;return {elapsedMs:elapsed,sourceAdvanceMs:sourceAdvance,sourceRate:sourceAdvance/elapsed,displayedAdvanceMs:b.after.positionMs-a.after.positionMs};});
 return {synchronization,intervals,cadenceWithinBudget:intervals.every(value=>value.sourceRate>=.8&&value.sourceRate<=1.2),synchronizationWithinBudget:synchronization.every(value=>Math.abs(value.errorMs)<=value.boundMs)};
}
