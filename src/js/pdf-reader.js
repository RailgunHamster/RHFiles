/* Shared PDF reading surface. Parsing runs in the bundled worker; no document
 * scripting manager is installed. Hosts supply authorized local/range access. */
const RHFilesPdfReader=(()=>{
  let current=null,modules;
  const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
  const state=()=>current?current.state():{opened:false};
  const requireView=()=>{if(!current)throw Error('PDF reader is closed');return current;};
  function register(api){
    api.provideState('pdf',state);
    const methods={
      state:[object(),()=>state(),'read'],
      'page.set':[object({page:{type:'integer',minimum:1}},['page']),p=>requireView().page(p.page)],
      previous:[object(),()=>requireView().step(-1)],next:[object(),()=>requireView().step(1)],
      'zoom.set':[object({value:{anyOf:[{enum:['page-width','page-fit']},{type:'number',minimum:.1,maximum:5}]}},['value']),p=>requireView().zoom(p.value)],
      rotate:[object(),()=>requireView().rotate()],
      search:[object({query:{type:'string',maxLength:256}},['query']),p=>requireView().search(p.query)],
      'search.next':[object(),()=>requireView().find(false)],'search.previous':[object(),()=>requireView().find(true)],
      'search.toggle':[object(),()=>requireView().toggleSearch()],
      'outline.toggle':[object(),()=>requireView().toggleOutline()],
      'outline.go':[object({index:{type:'integer',minimum:0}},['index']),p=>requireView().outline(p.index)],
      'password.submit':[object({password:{type:'string',maxLength:1024}},['password']),p=>requireView().password(p.password)],
      saveAs:[object({destination:{type:'string',minLength:1,maxLength:108000},overwrite:{type:'boolean'},expectedTargetRevision:{type:'string',maxLength:256}}),p=>requireView().save(p),'write'],
      systemOpen:[object(),()=>requireView().systemOpen(),'external'],close:[object(),(_,run)=>requireView().close(run)]
    };
    for(const [name,[params,handler,risk]]of Object.entries(methods))api.register('pdf.reader.'+name,handler,{params,risk:risk||'ui'});
  }
  async function open(host,options){
    current?.destroy();
    const zh=!/^en/i.test(options.language||'zh'),t=(cn,en)=>zh?cn:en,api=options.api||RHFilesAPI;
    const controller=new AbortController(),signal=controller.signal;
    let closed=false,loading=true,error='',documentPdf=null,task=null,viewer=null,links=null,bus=null,transport=null,query='',matches={current:0,total:0},passwordReply=null,passwordNeeded=false,outlineItems=[],outlineOpen=false,searchOpen=false,rotation=0;
    const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
    const shell=el('section','pdf-reader'),header=el('header','pdf-header'),title=el('strong','pdf-title',options.name),tools=el('div','pdf-tools'),body=el('div','pdf-body'),sidebar=el('aside','pdf-outline'),scroll=el('div','pdf-scroll'),pages=el('div','pdfViewer'),notice=el('div','pdf-notice',t('正在读取 PDF…','Loading PDF…'));
    scroll.tabIndex=0;scroll.append(pages);body.append(sidebar,scroll,notice);host.replaceChildren(shell);shell.append(header,tools,body);sidebar.hidden=true;
    const listen=(node,event,fn,id)=>RHFilesUI.listen(node,event,fn,{signal},'shared.pdf.'+id);
    const invoke=(name,args={})=>api.invoke('pdf.reader.'+name,args).catch(fail);
    function button(label,action,parent=tools,args={}){const b=el('button','',label);b.type='button';b.title=label;b.setAttribute('aria-label',label);listen(b,'click',()=>invoke(action,args),action);parent.append(b);return b;}
    button(t('返回','Back'),'close',header);header.append(el('span','pdf-badge','PDF'),title);
    const save=button(t('另存为','Save as'),'saveAs',header);save.hidden=!options.save;
    const system=button(t('系统应用','System app'),'systemOpen',header);system.hidden=!options.systemOpen;
    const outlineButton=button(t('目录','Contents'),'outline.toggle'),previous=button('‹','previous'),pageInput=el('input','pdf-page'),count=el('span','pdf-count','/ —'),next=button('›','next');
    previous.setAttribute('aria-label',t('上一页','Previous page'));next.setAttribute('aria-label',t('下一页','Next page'));
    pageInput.type='number';pageInput.min='1';pageInput.value='1';pageInput.setAttribute('aria-label',t('页码','Page number'));tools.insertBefore(pageInput,next);tools.insertBefore(count,next);
    button('−','zoom.set',tools,{value:.8}).dataset.zoom='out';
    const scale=el('span','pdf-scale','100%');tools.append(scale);button('+','zoom.set',tools,{value:1.2}).dataset.zoom='in';
    button(t('适应宽度','Fit width'),'zoom.set',tools,{value:'page-width'});button(t('适应整页','Fit page'),'zoom.set',tools,{value:'page-fit'});button(t('旋转','Rotate'),'rotate');button(t('搜索','Search'),'search.toggle');
    // Zoom controls calculate their next value when clicked, not at construction.
    for(const b of tools.querySelectorAll('[data-zoom]')){b.replaceWith(b.cloneNode(true));}
    for(const b of tools.querySelectorAll('[data-zoom]'))listen(b,'click',()=>invoke('zoom.set',{value:Math.max(.1,Math.min(5,(viewer?.currentScale||1)*(b.dataset.zoom==='in'?1.2:1/1.2)))}),'zoom.'+b.dataset.zoom);
    const searchRow=el('div','pdf-search'),searchInput=el('input'),searchCount=el('span','pdf-search-count');searchInput.type='search';searchInput.placeholder=t('搜索文档','Find in document');searchInput.maxLength=256;searchInput.setAttribute('aria-label',searchInput.placeholder);searchRow.append(searchInput,searchCount);button(t('上一个','Previous'),'search.previous',searchRow);button(t('下一个','Next'),'search.next',searchRow);shell.insertBefore(searchRow,body);searchRow.hidden=true;
    const passwordPanel=el('form','pdf-password'),passwordLabel=el('label','',t('此 PDF 需要密码','This PDF requires a password')),passwordInput=el('input'),passwordStatus=el('p');passwordInput.type='password';passwordInput.autocomplete='off';passwordInput.maxLength=1024;passwordInput.setAttribute('aria-label',passwordLabel.textContent);const unlock=el('button','',t('打开文档','Open document'));unlock.type='submit';passwordPanel.append(passwordLabel,passwordInput,unlock,passwordStatus);body.append(passwordPanel);passwordPanel.hidden=true;
    function fail(reason){if(closed)return;error=String(reason?.message||reason);notice.textContent=t('无法阅读：','Cannot read: ')+error;notice.hidden=false;loading=false;return snapshot();}
    function ready(){if(!documentPdf||loading||passwordNeeded)throw Error(t('PDF 尚未读取完成','PDF is not ready'));}
    function snapshot(){return {opened:!closed,path:options.path,name:options.name,loading,error,page:viewer?.currentPageNumber||1,pageCount:documentPdf?.numPages||0,scale:viewer?.currentScale||1,rotation,passwordRequired:passwordNeeded,query,matches:{...matches},outlineOpen,outline: outlineItems.map(({title,depth},index)=>({title,depth,index})),renderedPages:pages.querySelectorAll('canvas').length};}
    function paint(){if(closed)return;const at=viewer?.currentPageNumber||1;pageInput.value=String(at);pageInput.max=String(documentPdf?.numPages||1);count.textContent='/ '+(documentPdf?.numPages||'—');scale.textContent=Math.round((viewer?.currentScale||1)*100)+'%';previous.disabled=!documentPdf||at<=1;next.disabled=!documentPdf||at>=documentPdf.numPages;pageInput.disabled=!documentPdf;outlineButton.setAttribute('aria-pressed',String(outlineOpen));searchCount.textContent=matches.total?matches.current+' / '+matches.total:query?t('未找到','No matches'):'';}
    const view={state:snapshot,
      page(value){ready();if(!Number.isSafeInteger(value)||value<1||value>documentPdf.numPages)throw Error(t('页码超出范围','Page out of range'));viewer.currentPageNumber=value;paint();return snapshot();},
      step(delta){ready();return this.page(Math.max(1,Math.min(documentPdf.numPages,viewer.currentPageNumber+delta)));},
      zoom(value){ready();if(!(typeof value==='number'&&Number.isFinite(value)&&value>=.1&&value<=5||typeof value==='string'&&['page-width','page-fit'].includes(value)))throw Error(t('缩放比例无效','Invalid zoom'));viewer.currentScaleValue=value;paint();return snapshot();},
      rotate(){ready();rotation=(rotation+90)%360;viewer.pagesRotation=rotation;return snapshot();},
      search(value){ready();query=value;searchInput.value=query;matches={current:0,total:0};this.find(false,'');return snapshot();},
      find(backwards,type='again'){ready();bus.dispatch('find',{source:shell,type,query,phraseSearch:true,caseSensitive:false,entireWord:false,highlightAll:true,findPrevious:backwards,matchDiacritics:false});paint();return snapshot();},
      toggleSearch(){searchOpen=!searchOpen;searchRow.hidden=!searchOpen;if(searchOpen)searchInput.focus();return snapshot();},
      toggleOutline(){outlineOpen=!outlineOpen;sidebar.hidden=!outlineOpen;paint();return snapshot();},
      async outline(index){ready();const item=outlineItems[index];if(!item?.dest)throw Error(t('目录项没有页码','No page for this outline item'));await links.goToDestination(item.dest);paint();return snapshot();},
      password(value){if(!passwordReply)throw Error(t('当前不需要密码','No password requested'));const reply=passwordReply;passwordReply=null;passwordNeeded=false;passwordInput.value='';passwordStatus.textContent=t('正在打开…','Opening…');reply(value);return snapshot();},
      save:params=>options.save?options.save(params):Promise.reject(Error(t('此平台暂不支持另存为','Save As is unavailable'))),
      systemOpen:()=>options.systemOpen?.(),close:run=>options.close(run),
      destroy(){if(closed)return;closed=true;controller.abort();transport?.abort();viewer?.setDocument(null);links?.setDocument(null);void task?.destroy().catch(()=>{});void Promise.resolve(options.release?.()).catch(()=>{});if(current===view)current=null;host.replaceChildren();}
    };
    current=view;paint();
    listen(pageInput,'change',()=>invoke('page.set',{page:Number(pageInput.value)}),'page');listen(searchInput,'input',()=>invoke('search',{query:searchInput.value}),'search.input');listen(searchInput,'keydown',e=>{if(e.key==='Enter'){e.preventDefault();invoke(e.shiftKey?'search.previous':'search.next');}},'search.key');listen(passwordPanel,'submit',e=>{e.preventDefault();invoke('password.submit',{password:passwordInput.value});},'password');
    listen(shell,'keydown',e=>{if(e.isComposing)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();if(!searchOpen)view.toggleSearch();searchInput.focus();return;}if(e.key==='Escape'){e.preventDefault();if(searchOpen)view.toggleSearch();else invoke('close');return;}if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const name={PageDown:'next',PageUp:'previous',ArrowRight:'next',ArrowLeft:'previous'}[e.key];if(name){e.preventDefault();invoke(name);}},'keyboard');
    try{
      modules ||= import('../vendor/pdfjs/pdf.mjs').then(async lib=>({lib,ui:await import('../vendor/pdfjs/pdf_viewer.mjs')}));
      const {lib,ui}=await modules;if(closed)return view;
      lib.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdfjs/pdf.worker.mjs',document.baseURI).href;
      bus=new ui.EventBus();links=new ui.PDFLinkService({eventBus:bus});links.externalLinkEnabled=false;
      const findController=new ui.PDFFindController({eventBus:bus,linkService:links});
      viewer=new ui.PDFViewer({container:scroll,viewer:pages,eventBus:bus,linkService:links,findController,annotationMode:lib.AnnotationMode.ENABLE,enableScripting:false,enablePermissions:true,enableAutoLinking:false,maxCanvasPixels:options.mobile?2621440:8388608,maxCanvasDim:8192,abortSignal:signal});links.setViewer(viewer);
      bus.on('pagechanging',paint);bus.on('scalechanging',paint);bus.on('updatefindmatchescount',e=>{matches=e.matchesCount||matches;paint();});bus.on('updatefindcontrolstate',e=>{matches=e.matchesCount||matches;paint();});
      bus.on('pagerendered',e=>{if(e.error)fail(e.error);});
      bus.on('pagesinit',()=>{viewer.currentScaleValue='page-width';paint();});
      const source=await options.source();if(closed){void options.release?.();return view;}
      const config={...source,cMapUrl:new URL('vendor/pdfjs/cmaps/',document.baseURI).href,cMapPacked:true,standardFontDataUrl:new URL('vendor/pdfjs/standard_fonts/',document.baseURI).href,wasmUrl:new URL('vendor/pdfjs/wasm/',document.baseURI).href,iccUrl:new URL('vendor/pdfjs/iccs/',document.baseURI).href,disableAutoFetch:true,disableStream:true,rangeChunkSize:512*1024,enableXfa:false,isEvalSupported:false,isImageDecoderSupported:false,maxImageSize:33554432};
      if(source.readRange){
        delete config.readRange;let queue=Promise.resolve(),aborted=false;
        class Range extends lib.PDFDataRangeTransport{
          requestDataRange(begin,end){queue=queue.then(async()=>{if(aborted)return;if(end-begin>32*1024*1024)throw Error(t('PDF 单次读取过大，请使用系统应用打开','PDF range is too large; try the system app'));const bytes=new Uint8Array(end-begin);for(let at=begin;at<end;){if(aborted)return;const chunk=await source.readRange(at,Math.min(1024*1024,end-at));if(!chunk.length||chunk.length>end-at)throw Error(t('PDF 读取提前结束','PDF read ended early'));bytes.set(chunk,at-begin);at+=chunk.length;}if(!aborted)this.onDataRange(begin,bytes);}).catch(e=>{if(!aborted){fail(e);void task?.destroy();}});}
          abort(){aborted=true;}
        }
        transport=new Range(source.length,new Uint8Array(0));config.range=transport;delete config.url;
      }
      task=lib.getDocument(config);task.onPassword=(reply,reason)=>{if(closed)return;passwordReply=reply;passwordNeeded=true;passwordPanel.hidden=false;passwordStatus.textContent=reason===lib.PasswordResponses.INCORRECT_PASSWORD?t('密码不正确，请重试','Incorrect password. Try again.'):'';notice.hidden=true;passwordInput.focus();};
      documentPdf=await task.promise;if(closed){await documentPdf.destroy();return view;}
      passwordNeeded=false;passwordPanel.hidden=true;notice.hidden=true;links.setDocument(documentPdf);viewer.setDocument(documentPdf);findController.setDocument(documentPdf);await viewer.firstPagePromise;loading=false;paint();scroll.focus({preventScroll:true});
      documentPdf.getOutline().then(items=>{if(closed)return;const pending=(items||[]).map(item=>({item,depth:0})).reverse();while(pending.length&&outlineItems.length<10000){const {item,depth}=pending.pop();outlineItems.push({title:item.title||'',dest:item.dest,depth});for(const child of [...(item.items||[])].reverse())pending.push({item:child,depth:depth+1});}if(!outlineItems.length)sidebar.append(el('p','',t('此文档没有目录','No contents in this document')));for(const [index,item]of outlineItems.entries()){const b=button(item.title,'outline.go',sidebar,{index});b.style.paddingInlineStart=(12+Math.min(10,item.depth)*14)+'px';}paint();}).catch(()=>{if(!closed)sidebar.textContent=t('目录读取失败','Cannot load contents');});
    }catch(e){fail(e);}
    return view;
  }
  return {register,open,state,destroy:()=>current?.destroy()};
})();
