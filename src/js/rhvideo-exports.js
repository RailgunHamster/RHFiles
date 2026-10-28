(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.RHVideoExports=value;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  const maximum=50000,chunkSize=200;
  const uuid=/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

  function selection(result){
    if(!Number.isSafeInteger(result?.total)||result.total<1||result.total>maximum||!Array.isArray(result.queue)||result.queue.length!==result.total)
      throw Error(result?.total===0?'没有可导出的收藏':'导出需要完整筛选结果，一次最多 50000 项；请缩小筛选范围');
    const seen=new Set();
    return result.queue.map(item=>{
      const type=item.kind,id=item.id;
      if(!['video','picture','novel'].includes(type)||typeof id!=='string'||[...id].length<1||[...id].length>36||id.includes('\0'))throw Error('筛选结果包含无效的收藏项目');
      const key=JSON.stringify([type,id]);if(seen.has(key))throw Error('筛选结果包含重复的收藏项目');seen.add(key);
      return {type,id};
    });
  }

  function install(ctx){
    const {action,object,native}=ctx;
    let epoch=0,busy=false,phase='idle',lastJob=null,message='';
    const idSchema={type:'string',pattern:uuid.source,maxLength:36,minLength:36};
    const current=version=>version===epoch;
    const snapshot=()=>({busy,phase,lastJob:lastJob?JSON.parse(JSON.stringify(lastJob)):null,message});
    const changed=()=>ctx.changed?.(snapshot());
    const ensure=version=>{if(!current(version))throw Error('媒体账户已改变，旧导出操作未继续');};

    action('exports.state',object(),snapshot,'read');
    action('exports.list',object({limit:{type:'integer',minimum:1,maximum:100}}),async({limit=20})=>{
      const version=epoch;const result=await native('operation',{name:'exports.list',query:{limit}});
      return current(version)?result:{stale:true};
    },'read');
    action('exports.get',object({id:idSchema},['id']),async({id})=>{
      if(!uuid.test(id))throw Error('导出任务编号无效');const version=epoch;
      const result=await native('operation',{name:'exports.get',params:{id}});return current(version)?result:{stale:true};
    },'read');
    action('exports.cancel',object({id:idSchema},['id']),args=>exclusive(async version=>{
      if(!uuid.test(args.id))throw Error('导出任务编号无效');phase='cancelling';changed();
      const result=await native('operation',{name:'exports.cancel',params:{id:args.id}});ensure(version);lastJob=result;phase='idle';return result;
    }),'write');
    action('exports.create',object({scope:{type:'string',enum:['all','filtered']}},['scope']),({scope})=>exclusive(async version=>{
      if(!['all','filtered'].includes(scope))throw Error('导出范围无效');
      let ticket=null,submitted=false;
      try{
        if(scope==='filtered'){
          phase='preparing';changed();
          // The provider captures the filter before awaiting I/O and queries all
          // keys. Never substitute visible cards or a selection checkbox page.
          const rows=selection(await ctx.selection());ensure(version);
          ticket=(ctx.requestId||(()=>crypto.randomUUID()))();
          if(!uuid.test(ticket))throw Error('无法生成导出准备标识');
          for(let offset=0;offset<rows.length;offset+=chunkSize){
            ensure(version);
            const items=rows.slice(offset,offset+chunkSize),result=await native('exports.prepare',{ticket,offset,total:rows.length,items});ensure(version);
            if(result.ticket!==ticket||result.count!==offset+items.length||result.total!==rows.length||result.ready!==(offset+items.length===rows.length))throw Error('导出选择没有完整准备，打包未提交');
          }
        }
        ensure(version);const requestId=(ctx.requestId||(()=>crypto.randomUUID()))();if(!uuid.test(requestId))throw Error('无法生成导出请求标识');
        phase='submitting';changed();submitted=true;
        const result=await native('exports.create',{requestId,...(ticket?{ticket}:{})});ensure(version);
        lastJob=result;phase='idle';message='已提交服务端后台打包，关闭界面不会取消。';return result;
      }catch(error){
        if(current(version)){
          if(ticket&&!submitted){try{await native('exports.discard',{ticket});}catch(discard){if(current(version))message='释放导出准备失败：'+String(discard.message||discard);}}
          if(submitted)message='打包结果未确认，请查看最近导出核对；不会自动重发。';
        }
        throw error;
      }
    }),'write');

    async function exclusive(work){
      if(busy)throw Error('导出操作正在进行');
      const version=epoch;busy=true;message='';changed();
      try{return await work(version);}catch(error){if(current(version)){phase='failed';message=String(error.message||error)+(message?'；'+message:'');}throw error;}
      finally{if(current(version)){busy=false;changed();}}
    }
    return {state:snapshot,reset(){epoch++;busy=false;phase='idle';lastJob=null;message='';changed();}};
  }
  return {maximum,chunkSize,selection,install};
});
