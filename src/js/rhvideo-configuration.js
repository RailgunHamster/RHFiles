(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.RHVideoConfiguration=value;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  const tagSettings=typeof module==='object'&&module.exports?require('./rhvideo-rules-model.js').settings:globalThis.RHVideoRulesModel.settings;
  const names=['page_volume','rotate','mix_pictures','grid_tag_prefs','media_tag_filter','strip_layout','strip_speed','kenburns_duration','kenburns_overlap','kenburns_fade_min','kenburns_fade_max','kenburns_fade_ratio','novel_settings','favshow_image','favshow_video','favshow_fade'];
  // Backup values use the reference's units: multiplier (200 px/s) and percent.
  const numbers={strip_speed:['scrollSpeed',0,10,1/200],kenburns_duration:['stay',0.1,30],kenburns_fade_min:['min',0,30],kenburns_fade_max:['max',0,60],kenburns_fade_ratio:['ratio',0,100,100],favshow_image:['favoriteStay',1,60],favshow_video:['videoStay',1,300],favshow_fade:['favoriteFadeMs',100,5000]};
  function safe(value,depth=0){if(depth>16)throw Error('偏好结构过深');if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw Error('偏好包含保留名称');safe(item,depth+1);}return value;}
  function referencePreferences(config,previous={}){
    const result=Object.fromEntries(names.filter(key=>typeof previous[key]==='string'&&previous[key].length<=16384).map(key=>[key,previous[key]]));
    result.page_volume=String(config.volume/100);result.rotate=String(config.autoRotate);result.mix_pictures=String(config.mixPictures);result.media_tag_filter=JSON.stringify(config.rule);result.strip_layout=config.lanes===2?'double':'single';
    if(config.tagEditor!==undefined)result.grid_tag_prefs=JSON.stringify(tagSettings(config.tagEditor));
    for(const [key,[field,_min,_max,scale=1]]of Object.entries(numbers))result[key]=String(config[field]*scale);
    result.kenburns_overlap=String(config.overlap);result.novel_settings=JSON.stringify({fs:config.readerFont,lh:config.readerLine,theme:config.readerTheme});
    return result;
  }
  function restoredPreferences(values){
    const patch={},ignored=[];
    const number=(value,min,max)=>{const n=Number(value);if(value.trim()===''||!Number.isFinite(n)||n<min||n>max)throw Error('偏好数值无效');return n;};
    for(const key of names){const value=values?.[key];if(typeof value!=='string')continue;
      try{
        if(key==='page_volume')patch.volume=Math.round(number(value,0,1)*100);
        else if(['rotate','mix_pictures','kenburns_overlap'].includes(key)){if(!['true','false'].includes(value))throw Error('开关无效');patch[{rotate:'autoRotate',mix_pictures:'mixPictures',kenburns_overlap:'overlap'}[key]]=value==='true';}
        else if(key==='strip_layout'){if(!['single','double'].includes(value))throw Error('条带布局无效');patch.lanes=value==='double'?2:1;}
        else if(numbers[key]){const [field,min,max,scale=1]=numbers[key];patch[field]=number(value,min,max)/scale;}
        else if(key==='media_tag_filter'){const parsed=safe(JSON.parse(value));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('规则无效');patch.rule=parsed;}
        else if(key==='grid_tag_prefs'){const parsed=safe(JSON.parse(value));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('标签偏好无效');patch.tagEditor=tagSettings(parsed);}
        else if(key==='novel_settings'){const v=safe(JSON.parse(value));if(!['day','sepia','night'].includes(v.theme))throw Error('阅读主题无效');const fs=number(String(v.fs),13,40);if(!Number.isInteger(fs))throw Error('字号无效');patch.readerFont=fs;patch.readerLine=number(String(v.lh),1.2,3);patch.readerTheme=v.theme;}
      }catch{ignored.push(key);}
    }
    return {patch,ignored};
  }
  function install(ctx){
    const {api,action,native,object,string,state,button,el,listen,notice}=ctx;
    let epoch=0,busy=false,waitingKind=null,ticket=null,preview=null,message='',error=false,root=null;
    const current=value=>value===epoch;
    function paint(){
      if(!root?.isConnected)return;
      root.querySelector('[data-config-message]').textContent=message;root.querySelector('[data-config-message]').classList.toggle('form-error',error);
      for(const control of root.querySelectorAll('button'))control.disabled=busy||control.dataset.configRestore==='true'&&!ticket;
      const details=root.querySelector('[data-config-preview]');details.replaceChildren();if(!preview)return;
      const cards=el('div',undefined,'wb-metrics');
      for(const [title,main,description]of [
        ['喜爱记录',preview.favorites?.add,`已有 ${preview.favorites?.existing??0} · 未匹配 ${preview.favorites?.unmatched??0}`],
        ['监控目录',preview.watch_folders?.add,`已有 ${preview.watch_folders?.existing??0} · 冲突 ${preview.watch_folders?.skipped??0}；新增目录默认关闭`],
        ['阅读进度',preview.reading_progress?.update,`保留较新 ${preview.reading_progress?.kept??0} · 未匹配 ${preview.reading_progress?.unmatched??0}`],
        ['页面偏好',preview.preferences,'不包含密码、登录令牌或源文件']]){
        const card=el('article');card.append(el('span',title),el('strong',String(main??0)),el('small',description));cards.append(card);
      }details.append(cards);
      if(preview.issues?.length){const issues=el('details'),summary=el('summary','查看未匹配与冲突'),list=el('ul');summary.dataset.apiAction='ui.invoke';for(const item of preview.issues.slice(0,50))list.append(el('li',`${item.title}：${({ambiguous:'存在同名条目，未自动匹配',missing:'媒体库中尚未找到',overlap:'与已有监控目录重叠'})[item.reason]||item.reason}`));issues.append(summary,list);details.append(issues);}
    }
    const status=(text,failed=false)=>{message=text;error=failed;paint();};
    function acceptPreview(value){if(value.error)throw Error(value.error);if(value.picked===false){status('已取消选择，原预览保留。');return value;}if(value.ticket&&value.preview){ticket=value.ticket;preview=value.preview;status('预览完成，尚未修改任何记录。确认后合并恢复。');}return value;}
    async function operation(label,work){if(busy)throw Error('配置备份操作正在进行');const version=epoch;busy=true;status(label);try{const result=await work(version);if(!current(version))return {stale:true};return result;}catch(e){if(current(version)){waitingKind=null;status(String(e.message||e),true);}throw e;}finally{if(current(version)){busy=waitingKind!==null;paint();}}}
    action('configuration.state',object(),()=>({busy,waiting:waitingKind,ticket,preview,message,error}),'read');
    action('configuration.export',object({path:{type:'string',maxLength:32768}}),args=>operation('正在整理配置记录…',async version=>{
      waitingKind='export';const result=await native('configuration.export',{...args,preferences:referencePreferences(ctx.config(),ctx.rawPreferences())});if(!current(version))return {stale:true};
      if(result.requested){if(waitingKind==='export')status('请选择配置备份的保存位置。');}else{waitingKind=null;status(result.saved?'配置备份已保存。':'未保存配置备份。');}return result;
    }),'write');
    action('configuration.preview',object({path:{type:'string',maxLength:32768}}),args=>operation('正在选择并核对备份…',async version=>{
      waitingKind='preview';try{const result=await native('configuration.preview',args);if(!current(version))return {stale:true};if(result.requested){if(waitingKind==='preview')status('请选择配置备份文件。');}else{waitingKind=null;acceptPreview(result);}return result;}
      catch(e){if(current(version)){ticket=null;preview=null;}throw e;}
    }),'read');
    action('configuration.restore',object({ticket:{type:'string',minLength:1,maxLength:128}},['ticket']),args=>operation('正在合并恢复配置记录…',async version=>{
      if(args.ticket!==ticket)throw Error('备份预览已改变，请重新核对后确认');ticket=null;paint();const result=await native('configuration.restore',args);if(!current(version))return {stale:true};
      preview=result;const converted=restoredPreferences(result.ui_preferences||{});let warning=result.clientWarning||'';
      try{await ctx.applyPreferences(converted.patch,result.ui_preferences||{});}catch(e){warning+=(warning?'；':'')+'记录已合并，但页面偏好保存失败：'+String(e.message||e);}
      if(!current(version))return {stale:true};try{await ctx.refresh();}catch(e){warning+=(warning?'；':'')+'记录已合并，但列表刷新失败：'+String(e.message||e);}if(!current(version))return {stale:true};
      status(warning||`恢复完成。现有喜爱已保留，新增监控目录需手动开启。${converted.ignored.length?'部分无效页面偏好已忽略。':''}`,!!warning);return {...result,...(warning?{clientWarning:warning}:{})};
    }),'write');
    if(ctx.mobile)for(const kind of ['preview','export'])window.RHVideoNative.listen('rhvideo-configuration-'+kind,({payload})=>{
      if(payload.generation!==state.generation||waitingKind!==kind)return;waitingKind=null;busy=false;try{if(payload.result?.error)throw Error(payload.result.error);if(kind==='preview')acceptPreview(payload.result);else status(payload.result.saved?'配置备份已保存。':'未保存配置备份。');}catch(e){if(kind==='preview'){ticket=null;preview=null;}status(String(e.message||e),true);}
    }).catch(notice);
    return {
      render(parent){root=el('section',undefined,'wb-configuration');root.append(el('h3','配置备份与恢复'),el('p','备份喜爱、监控目录、阅读进度和页面偏好。恢复前预览匹配结果，不覆盖现有记录。'));
        const actions=el('div',undefined,'wb-toolbar'),restore=button('确认合并恢复','configuration.restore',()=>({ticket}));restore.dataset.configRestore='true';
        actions.append(button('保存配置备份','configuration.export'),button('选择备份并预览','configuration.preview'),restore);const counts=el('div'),text=el('p');counts.dataset.configPreview='';text.dataset.configMessage='';text.setAttribute('role','status');root.append(actions,counts,text);parent.append(root);paint();},
      reset(){epoch++;busy=false;waitingKind=null;ticket=null;preview=null;message='';error=false;paint();},
    };
  }
  return {names,referencePreferences,restoredPreferences,install};
});
