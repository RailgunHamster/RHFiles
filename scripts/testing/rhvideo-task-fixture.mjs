// Controlled task progress records for packaged Android UI acceptance, not an
// encoder or production RHVideo service. Real queue behavior is tested apart.
export function taskFixture(){
  const queued=Array.from({length:55},(_,i)=>({id:'video:queue-'+i,filename:'等待样本 '+i+'.mp4',status:'pending',kind:'initial'}));
  const active=[{id:'video:metrics',filename:'完整处理流程.mp4',status:'processing',kind:'initial'}, {id:'video:unknown',filename:'尚未取得百分比.mp4',status:'processing',kind:'initial'}];
  return async({req,path,send})=>{
    const url=new URL(req.url,'http://owned.invalid');
    if(path==='/api/v1/processing-tasks'){
      const kind=url.searchParams.get('kind'),view=url.searchParams.get('view'),q=url.searchParams.get('q')||'';
      let items=view==='running'?active:view==='queued'?queued:view==='failed'?[{id:'video:failed',filename:'失败任务.mp4',status:'failed',message:'测试源离线'}]:[{id:'run:old',filename:'历史结果.mp4',status:'succeeded'}];
      if(kind==='replacement')items=items.map((item,i)=>({...item,id:'replace:'+(i+1),kind:'replacement'}));if(q)items=items.filter(item=>item.filename.includes(q));
      const pages=Math.max(1,Math.ceil(items.length/25)),page=Math.min(pages,Number(url.searchParams.get('page')||1));return send(200,{items:items.slice((page-1)*25,page*25),page,pages,total:items.length,counts:{running:2,queued:55,failed:1,history:1}});
    }
    const id=decodeURIComponent(path.split('/').at(-1)),status=active.some(item=>item.id===id)?'processing':id.includes('failed')||id.startsWith('replace:')?'failed':id.startsWith('run:')?'succeeded':'pending';
    return send(200,{id,video_id:'video-0',filename:active.find(item=>item.id===id)?.filename||'样本 '+id,kind:id.startsWith('replace:')?'replacement':'initial',status,live:status==='processing',queued_at:'2020-01-01T00:00:00Z',started_at:'2020-01-01T00:00:01Z',message:status==='failed'?'测试源离线':'',
      steps:['probe','compress','super_compress','keyframes','save','commit'].map((key,i)=>({key,label:['读取视频信息','普通压缩','超压压缩','提取截图','保存文件','更新记录'][i],status:i===0?'done':i===1?'running':'pending',elapsed_seconds:i===0?0:null,metrics:i===0?[{label:'编码器',value:'HEVC'},{label:'原始大小',value:1024**3,format:'bytes'}]:[{label:'计划 CRF',value:28}]})),
      progress:status==='processing'?{stage:'compress',percent:id==='video:unknown'?null:40,processed_seconds:20,duration_seconds:50,output_bytes:1536,frame:480,fps:24,speed:2,eta_seconds:15,encoder:'libx264',stage_elapsed_seconds:10,process_running:true,heartbeat_age_seconds:0,unchanged_seconds:0}:null});
  };
}
