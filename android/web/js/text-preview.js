(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.androidTextPreview=value;})(globalThis,()=>{
  const extensions=new Set('txt text md markdown mdown json jsonc jsonl ndjson log csv tsv xml yaml yml ini cfg conf config toml properties env gitignore editorconfig js mjs cjs ts tsx jsx py rb rs go kt kts java c h cpp cc cxx hpp cs css scss less html htm sh bash ps1 bat cmd sql lua swift vue svelte proto gradle'.split(' '));
  const supports=name=>extensions.has(String(name).split('.').pop().toLowerCase())||/^(readme|license|notice|dockerfile|makefile)$/i.test(name);
  function parts(text){const result=[];let start=0,lines=0;for(let at=0;at<text.length;at++){if(text[at]==='\n')lines++;if(at-start>=32767||lines>=400){let end=at+1;if(text.charCodeAt(at)>=0xd800&&text.charCodeAt(at)<=0xdbff&&text.charCodeAt(at+1)>=0xdc00&&text.charCodeAt(at+1)<=0xdfff)end++;result.push([start,end]);start=end;at=end-1;lines=0;}}if(start<text.length||!result.length)result.push([start,text.length]);return result;}
  let current=null;
  const state=()=>current?{open:true,path:current.path,name:current.name,loading:current.loading,error:current.error||'',mode:current.mode,treeError:current.treeError??null,truncated:!!current.data?.truncated,encoding:current.data?.encoding||'',part:current.part||0,partCount:current.partCount||0}:{open:false};
  async function control(command){if(!current?.controls?.[command])throw Error('文本预览未打开或操作无效');await current.controls[command]();return state();}
  async function open(entry,backend=api){
    if(!ui.openSheet('',[]))return {opened:false};
    const panel=document.getElementById('sheet-panel');panel.classList.add('text-preview');
    const markdown=/\.(md|markdown|mdown)$/i.test(entry.name),json=/\.json$/i.test(entry.name);
    const session={path:entry.path,name:entry.name,loading:false,mode:markdown?'reading':json?'formatted':'source'};current=session;
    let closed=false,requestId,worker,workerTimer,renderEpoch=0,textView=null;
    const header=ui.el('div','text-preview-header'),title=ui.el('strong','',entry.name),tools=ui.el('div','text-preview-tools'),status=ui.el('p','muted','正在读取…'),content=ui.el('div','text-preview-content');
    panel.append(header,tools,status,content);
    function button(label,id,action){const b=ui.el('button','',label);b.type='button';b.dataset.previewAction=id;RHFilesUI.listen(b,'click',async()=>{try{await action();}catch(error){ui.toast('操作失败：'+(error.message||error));}},undefined,'android.preview.'+id);return b;}
    const close=button('返回','close',()=>ui.closeSheet()),toggle=button('源码','mode',()=>view(session.mode==='source'?'reading':'source'));
    const modes=new Map();
    if(json){
      const group=ui.el('div','text-preview-json-modes');group.setAttribute('role','group');group.setAttribute('aria-label','JSON 显示模式');
      for(const [mode,label] of [['formatted','格式化'],['tree','树状'],['source','源码']]){
        const choice=button(label,mode,()=>view(mode));modes.set(mode,choice);group.append(choice);
      }
      tools.append(group);
    }else if(markdown)tools.append(toggle);
    async function copyCurrent(){if(session.clipboard==null)throw Error('文本正在读取或排版，请稍后再复制');await ui.copyText(session.clipboard);ui.toast('已复制文本');}
    const copy=button('复制文本','copy',copyCurrent);copy.disabled=true;header.append(close,title);tools.append(copy);
    function paintModes(){
      toggle.textContent=session.mode==='source'?'阅读':'源码';
      for(const [mode,choice] of modes)choice.setAttribute('aria-pressed',String(session.mode===mode));
      copy.hidden=session.mode==='tree';
    }
    paintModes();
    function stopWorker(){clearTimeout(workerTimer);worker?.terminate();worker=null;}
    function showText(text){
      const ranges=parts(text),pre=ui.el('pre','text-preview-source'),bar=ui.el('div','text-preview-paging'),label=ui.el('span');
      const previous=button('上一段','previousPart',()=>textView.show(session.part-1)),next=button('下一段','nextPart',()=>textView.show(session.part+1));bar.append(previous,label,next);bar.hidden=ranges.length<=1;content.replaceChildren(bar,pre);
      textView={show(value){const at=Math.max(0,Math.min(ranges.length-1,value)),[start,end]=ranges[at];session.part=at;session.partCount=ranges.length;pre.textContent=text.slice(start,end);session.clipboard=pre.textContent;copy.textContent=ranges.length>1?'复制本段':'复制文本';copy.disabled=false;label.textContent=(at+1)+' / '+ranges.length;previous.disabled=at===0;next.disabled=at===ranges.length-1;content.scrollTop=0;}};textView.show(0);
    }
    function showSource(message=''){showText(session.data.text);if(message){session.mode='source';paintModes();status.textContent+=' · '+message;}}
    function render(){
      const epoch=++renderEpoch;stopWorker();session.clipboard=null;session.treeError=null;session.part=0;session.partCount=0;textView=null;copy.disabled=true;if(closed||!session.data)return;
      const data=session.data;status.textContent=(data.encoding||'文本')+' · '+fmt.size(data.bytesRead||new TextEncoder().encode(data.text).length)+(data.truncated?' · 文件较大，仅预览前 '+fmt.size(data.maxBytes||256*1024):'');
      paintModes();
      if(session.mode==='source'){showSource();return;}
      if(session.mode==='tree'){
        const result=RHFilesJsonTree.parse(data.text,data.truncated);
        session.treeError=result.error??null;
        const tree=ui.el('div','json-tree-view');
        RHFilesJsonTree.mount(tree,result,{
          count:value=>value+' 项',previous:'上一页',next:'下一页',
          incomplete:'只读取了文件开头。树状视图需要完整的 JSON。',
          invalid:'JSON 格式不完整或无效。可切回源码查看。',
          limit:'JSON 太大或层级太深。可切回源码查看。',
        });
        content.replaceChildren(tree);content.scrollTop=0;return;
      }
      if(json&&data.truncated){showSource('格式化需要完整的 JSON');return;}
      if(data.text.length>256*1024){showSource('文档较长，显示源码');return;}
      content.replaceChildren(ui.el('p','muted','正在排版…'));
      try{worker=new Worker(new URL('js/text-preview-worker.js',document.baseURI));}catch{showSource('设备暂不支持排版，显示源码');return;}
      worker.onmessage=event=>{
        if(closed||epoch!==renderEpoch)return;stopWorker();
        if(event.data.error){showSource(event.data.error);return;}
        if(session.mode==='formatted'){showText(event.data.text);return;}
        const article=ui.el('article','text-preview-markdown');
        article.innerHTML=DOMPurify.sanitize(event.data.html,{ALLOWED_TAGS:['h1','h2','h3','h4','h5','h6','p','br','hr','pre','code','blockquote','ul','ol','li','strong','em','del','table','thead','tbody','tr','th','td','span','a'],ALLOWED_ATTR:['title','colspan','rowspan'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false});
        textView=null;session.partCount=0;session.clipboard=data.text;copy.textContent='复制文本';copy.disabled=false;content.replaceChildren(article);
      };
      worker.onerror=()=>{if(closed||epoch!==renderEpoch)return;stopWorker();showSource('排版失败，显示源码');};
      workerTimer=setTimeout(()=>{if(closed||epoch!==renderEpoch)return;stopWorker();showSource('排版耗时较长，显示源码');},2000);
      worker.postMessage({text:data.text,mode:session.mode});
    }
    const more=button('读取更多（最多 1 MB）','more',()=>read(1024*1024));more.hidden=true;tools.append(more);
    async function read(maxBytes){
      if(session.loading)throw Error('文本正在读取');stopWorker();++renderEpoch;
      requestId=crypto.randomUUID();session.loading=true;session.error='';session.clipboard=null;copy.disabled=true;more.disabled=true;status.textContent='正在读取…';
      try{const data=await backend.readTextPreview({path:entry.path,maxBytes,requestId});if(closed)return;session.data=data;more.hidden=!data.truncated||maxBytes>=1024*1024;render();}
      catch(error){if(!closed){session.error=error.message||String(error);status.textContent='无法预览：'+session.error;}}
      finally{session.loading=false;more.disabled=false;}
    }
    function view(mode){if(session.loading||!session.data)throw Error('文本尚未读取');if(mode==='reading'&&!markdown||['formatted','tree'].includes(mode)&&!json)throw Error('此文件不支持该显示模式');session.mode=mode;render();}
    session.controls={source:()=>view('source'),reading:()=>view('reading'),formatted:()=>view('formatted'),tree:()=>view('tree'),more:()=>{if(!session.data?.truncated||session.data.maxBytes>=1024*1024)throw Error('已达到本次预览上限');return read(1024*1024);},previousPart:()=>{if(!textView)throw Error('当前不是分页文本');textView.show(session.part-1);},nextPart:()=>{if(!textView)throw Error('当前不是分页文本');textView.show(session.part+1);},copy:copyCurrent,close:()=>ui.closeSheet()};
    ui.onClosed(()=>{closed=true;stopWorker();if(requestId)void backend.cancelTextPreview(requestId).catch(()=>{});if(current===session)current=null;});
    await read(256*1024);return state();
  }
  async function install(entry,app){
    if(!ui.openSheet(entry.name,[],'正在缓存安装包…'))return;
    const panel=document.getElementById('sheet-panel'),identity=panel.firstChild;
    const card=ui.el('div','apk-cache-progress'),progress=ui.el('progress'),detail=ui.el('p','muted');card.append(progress,detail,app.button('查看文件任务','tasks',()=>RHFilesAPI.invoke('navigation.tool',{tool:'tasks'})));panel.append(card);
    let result;try{result=await api.cacheApk(entry.path,job=>{if(!ui.isSheetOpen()||panel.firstChild!==identity)return;progress.max=Math.max(job.total,job.bytes,1);progress.value=job.bytes;detail.textContent=fmt.size(job.bytes)+' / '+fmt.size(job.total)+' · '+Math.min(100,Math.floor(100*job.bytes/Math.max(1,job.total)))+'% · '+fmt.size(job.bytes/Math.max(1,(Date.now()-job.started)/1000))+'/s';});}catch(error){if(ui.isSheetOpen()&&panel.firstChild===identity)panel.querySelector('.sheet-note').textContent='无法缓存：'+(error.message||error);return {error:error.message||String(error)};}
    if(result.failures?.length)throw Error(result.failures.map(item=>item.message).join('\n'));
    if(!ui.isSheetOpen()||panel.firstChild!==identity)return result;
    const install=app.button('安装','apk',()=>api.native('cache.install',{jobId:result.jobId}),'primary');
    panel.querySelector('.sheet-note').textContent='安装包已缓存';panel.append(install);
    if(document.visibilityState==='visible')try{await api.native('cache.install',{jobId:result.jobId});}catch(error){panel.querySelector('.sheet-note').textContent=error.message||String(error);}
    return result;
  }
  return {supports,parts,open,install,state,control};
});
