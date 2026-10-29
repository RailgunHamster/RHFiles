/* Queue metadata only: a promotion never starts, cancels or retries a task. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.RHVideoTaskPriority=value;})(globalThis,()=>{
  'use strict';
  function validTarget(kind,id){
    return kind==='default'&&/^video:[A-Za-z0-9_-]{1,48}$/.test(id)||kind==='replacement'&&/^replace:[1-9][0-9]{0,18}$/.test(id)&&BigInt(id.slice(8))<2n**63n;
  }
  function filter(key,value){
    const options={queue:['default','replacement'],view:['running','queued','failed','history'],days:[0,7,30,90],status:['all','succeeded','issues','skipped','cancelled']};
    const valid=Object.hasOwn(options,key)?options[key].includes(value):key==='q'?typeof value==='string'&&Array.from(value).length<=200&&!value.includes('\0'):key==='pageNumber'&&Number.isSafeInteger(value)&&value>=1&&value<=100000;
    if(!valid)throw Error('处理队列筛选参数无效：'+key);return value;
  }
  function install(ctx){
    let generation=0,pending=null,receipt=null,error='',message='',target=null;
    const process=ctx.processId||crypto.randomUUID(),scope=()=>process+':'+generation+':'+ctx.identity();
    const state=()=>({revision:scope(),pending:pending?{kind:pending.kind,id:pending.id}:null,receipt:receipt?JSON.parse(JSON.stringify(receipt)):null,error,message,target:target?{...target}:null});
    const changed=()=>ctx.changed?.(state());
    const reset=()=>{generation++;pending=null;receipt=null;error=message='';target=null;changed();};
    ctx.action('task.priorityState',ctx.object(),state,'read');
    ctx.action('task.prioritize',ctx.object({kind:{type:'string',enum:['default','replacement']},id:{type:'string',minLength:1,maxLength:160},expectedRevision:{type:'string',minLength:1,maxLength:200}},['kind','id','expectedRevision']),async args=>{
      if(!validTarget(args.kind,args.id))throw Error('请选择等待列表中的任务');
      if(args.expectedRevision!==scope())throw Error('媒体账户或进程已改变，请重新读取队列');
      if(pending)throw Error('已有置顶请求正在提交，不会重复提交');
      const version=generation,identity=scope(),capture=ctx.capture?.(),lease={kind:args.kind,id:args.id};let sent=false;
      const guard=()=>{if(version!==generation||identity!==scope())throw Error('媒体账户已改变；已发送的置顶请求可能已完成，请在原服务器核对，不会自动重发');};
      pending=lease;receipt=null;error=message='';target={...lease,session:capture?.session??null};changed();
      try{
        await ctx.ready?.();guard();
        const detail=await ctx.native('operation',{name:'tasks.detail',params:{queue:args.kind,entry:args.id}});guard();
        if(detail?.id!==args.id)throw Error('任务回执不匹配，未提交置顶');
        if(detail.status!=='pending')throw Error('任务已开始或结束，只有等待任务可以置顶');
        if(detail.can_prioritize!==true)throw Error('此任务未提供置顶能力，请更新 RHVideo 后端');
        sent=true;
        const result=await ctx.native('operation',{name:'tasks.prioritize',params:{queue:args.kind,entry:args.id}});guard();
        if(result?.id!==args.id||result.kind!==args.kind||result.status!=='pending'||result.prioritized!==true||![null,undefined,'replacement','default','paused'].includes(result.blocked_by))throw Error('置顶回执不匹配，请刷新原队列核对结果');
        receipt=JSON.parse(JSON.stringify(result));
        const blocked={replacement:'等待原片替换完成后优先处理',default:'等待默认处理完成后优先处理',paused:'队列恢复后优先处理'}[result.blocked_by];
        message='已置顶：'+(detail.filename||args.id)+'；'+(blocked||'当前任务结束后优先处理');changed();
        try{await ctx.applied?.(result,lease,capture);guard();}
        catch(failure){guard();receipt.clientWarning=String(failure.message||failure);message+='。列表刷新失败：'+receipt.clientWarning+'；不会重发置顶请求';changed();}
        return JSON.parse(JSON.stringify(receipt));
      }catch(failure){
        if(version===generation&&identity===scope()){error=String(failure.message||failure)+(sent?'；不会自动重发，请刷新队列核对结果':'');changed();}
        throw Error(version===generation&&identity===scope()?error:String(failure.message||failure));
      }finally{if(pending===lease){pending=null;changed();}}
    },'write');
    return {state,reset};
  }
  return {install,filter,validTarget};
});
