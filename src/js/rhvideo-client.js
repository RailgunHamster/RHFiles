/* RHFiles-owned client UI. All data comes through the native RHVideo adapter. */
(() => {
  'use strict';
  const api=window.RHFilesAPI,model=RHVideoModel,$=id=>document.getElementById(id);
  const mobile=!!window.RHVideoNative;
  const native=(action,args={})=>mobile?window.RHVideoNative.request(action,args):window.__TAURI__.core.invoke('rhvideo_request',{action,args});
  api.provideState('application',()=>({platform:mobile?'android':'windows',window:'window-rhvideo',ready:true}));
  const icons={
    library:'<rect x="3" y="4" width="18" height="16" rx="4"/><path d="m10 8 6 4-6 4z"/>',
    video:'<rect x="3" y="5" width="14" height="14" rx="3"/><path d="m17 10 4-3v10l-4-3"/>',
    picture:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    book:'<path d="M12 5v16M3 4h5a4 4 0 0 1 4 3 4 4 0 0 1 4-3h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3V4z"/>',
    heart:'<path d="M20.8 4.8a5.2 5.2 0 0 0-7.4 0L12 6.2l-1.4-1.4a5.2 5.2 0 0 0-7.4 7.4L12 21l8.8-8.8a5.2 5.2 0 0 0 0-7.4z"/>',
    folder:'<path d="M3 6h6l2 2h10v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"/><path d="M3 6V4h6l2 2h8a2 2 0 0 1 2 2"/>',
    refresh:'<path d="M20 11a8 8 0 1 0-2 7M20 4v7h-7"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
    desktop:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    settings:'<path d="m9 4 1-2h4l1 2 2 1 2-.2 2 3.4-1.2 1.8v4L21 16l-2 3.4-2-.2-2 1-1 2h-4l-1-2-2-1-2 .2L3 16l1.2-1.8v-4L3 8.2l2-3.4L7 5z"/><circle cx="12" cy="12" r="3"/>',
    layers:'<path d="m12 3 10 5-10 5L2 8l10-5zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
    shield:'<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4z"/><path d="m8 12 3 3 5-6"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    left:'<path d="m14 5-7 7 7 7"/>',right:'<path d="m10 5 7 7-7 7"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
    play:'<path d="m9 5 11 7-11 7z"/>',timeline:'<path d="M3 5h18v14H3zM8 5v14M16 5v14M3 10h5m8 0h5M3 14h5m8 0h5"/>'
  };
  const icon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(icons[name]||icons.library)+'</svg>';
  document.querySelectorAll('[data-icon]').forEach(node=>node.innerHTML=icon(node.dataset.icon));
  const titles={video:'视频',picture:'图片',novel:'小说',favorite:'我的收藏'};
  const state={kind:'video',offset:0,limit:36,total:0,items:[],favorites:new Set(),favoriteBusy:new Set(),loading:false,error:'',connected:false,nativePlayback:false,loadId:0,search:'',folder:'',generation:0};
  const reader={book:null,chapter:0,loaded:false,token:0,saveTimer:0,ratio:0};
  let searchTimer=0,folderLoadId=0,timelineLoadId=0,images=[],imageIndex=0,imageZoom=1;
  const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
  const string={type:'string',maxLength:4096},integer={type:'integer',minimum:0,maximum:100000};
  function action(name,params,handler,risk='ui'){api.register('rhvideo.'+name,handler,{params,risk,description:'RHVideo '+name});}
  function invoke(name,args={}){return api.invoke('rhvideo.'+name,args);}
  function notice(message,success=false){$('notice').textContent=String(message?.message||message);$('notice').hidden=false;$('notice').classList.toggle('success',success);}
  function bind(id,event,name,args=()=>({})){
    RHFilesUI.listen($(id),event,e=>{if(event==='submit')e.preventDefault();Promise.resolve(invoke(name,args(e))).catch(notice);},undefined,'rhvideo.'+id+'.'+event);
  }
  function item(id,kind){const value=state.items.find(item=>item.id===id&&(!kind||item.kind===kind));if(!value)throw Error('媒体已不在当前列表中，请刷新');return value;}
  function status(title,description,kind='library',button=false){
    const root=$('library-status');root.replaceChildren();root.innerHTML=icon(kind);
    const h=document.createElement('h2');h.textContent=title;root.append(h);
    if(description){const p=document.createElement('p');p.textContent=description;root.append(p);}
    if(button){const b=document.createElement('button');b.className='button primary';b.textContent='连接 RHVideo';RHFilesUI.listen(b,'click',()=>invoke('connection.open'),undefined,'rhvideo.empty.connect');root.append(b);}
  }
  function updateConnection(value){
    state.connected=value.connected;state.nativePlayback=value.nativePlayback;
    $('connection-open').classList.toggle('connected',value.connected);
    $('connection-label').textContent=value.connected?(value.username||'已连接'):'尚未连接';
    let host=value.server;try{host=new URL(host).host;}catch{}
    $('connection-host').textContent=host||'连接你的 RHVideo';
    $('server').value=value.server||'';$('username').value=value.username||'';
    $('disconnect').hidden=!value.connected;
    $('engine-status').textContent=mobile?'视频使用 Android 原生播放器。':value.nativePlayback?'原生视频内核：VLC。':'视频播放需要安装 64 位 VLC 3.x。';
  }
  async function loadFolders(){
    const kind=state.kind,token=++folderLoadId;
    $('folder').replaceChildren(new Option('所有文件夹',''));$('folder').value='';
    if(kind==='favorite'){$('folder').closest('label').hidden=true;return;}
    $('folder').closest('label').hidden=false;
    try{
      const values=await native('folders',{kind});
      if(kind!==state.kind||token!==folderLoadId)return;
      if(!Array.isArray(values))throw Error('文件夹列表格式不兼容');
      for(const value of values.slice(0,10000)){const label=typeof value==='string'?value:value?.label;if(typeof label==='string')$('folder').append(new Option(label,label));}
      $('folder').value=state.folder;
    }catch(error){if(kind===state.kind)notice('文件夹筛选加载失败：'+String(error));}
  }
  async function load(refresh=false,folders=false){
    if(!state.connected){state.items=[];$('media-grid').replaceChildren();status('把你的媒体库带进来','连接已经运行的 RHVideo，浏览视频、图片、小说和收藏。','library',true);pagination();return;}
    const token=++state.loadId;state.loading=true;state.error='';state.items=[];$('notice').hidden=true;$('media-grid').setAttribute('aria-busy','true');
    if(folders)void loadFolders();
    status('正在读取媒体库…','只读取当前分类的清单，图片按需加载。','refresh');$('media-grid').replaceChildren();
    try{
      const value=model.validateCatalog(await native('catalog',{kind:state.kind,offset:state.offset,limit:state.limit,search:state.search,folder:state.folder,refresh}));
      if(token!==state.loadId)return;
      if(value.total>0&&state.offset>=value.total){state.offset=Math.floor((value.total-1)/state.limit)*state.limit;return load(false,false);}
      state.total=value.total;state.items=value.items;state.generation=value.generation;paint();
    }catch(error){
      if(token!==state.loadId)return;state.items=[];state.error=String(error);status('暂时无法读取媒体库',state.error,'library');notice(state.error);
    }finally{if(token===state.loadId){state.loading=false;$('media-grid').setAttribute('aria-busy','false');pagination();}}
    return snapshot();
  }
  function pagination(){
    const page=model.page(state.total,state.offset,state.limit);
    $('result-count').textContent=state.connected?state.total.toLocaleString()+' 项内容':'';
    $('page-count').textContent=state.connected&&state.total?'第 '+page.number+' / '+page.pages+' 页 · 每页 '+state.limit+' 项':'';
    $('previous-page').disabled=!state.connected||state.loading||!page.previous;$('next-page').disabled=!state.connected||state.loading||!page.next;
  }
  function paint(){
    $('library-status').replaceChildren();const grid=$('media-grid');grid.replaceChildren();grid.className='media-grid '+({picture:'pictures',novel:'novels'}[state.kind]||'');
    if(!state.items.length){status('这里暂时没有内容',state.search||state.folder?'换个关键词或文件夹试试。':'内容会沿用服务器的媒体库；可以在 RHVideo 中添加监控目录。',state.kind==='favorite'?'heart':state.kind);return;}
    for(const media of state.items){
      const card=document.createElement('article');card.className='media-card';card.dataset.id=media.id;card.dataset.kind=media.kind;
      const cover=document.createElement('button');cover.className='cover-button';cover.setAttribute('aria-label',(media.kind==='novel'?'阅读 ':media.kind==='picture'?'查看 ':'播放 ')+media.title);
      cover.innerHTML='<span class="cover-empty">'+icon(media.kind==='novel'?'book':media.kind)+'</span>';
      if(media.cover){
        const image=document.createElement('img');image.loading='lazy';image.decoding='async';image.alt='';image.src=media.cover;
        RHFilesUI.listen(image,'load',()=>{image.classList.add('loaded');cover.querySelector('.cover-empty')?.remove();},undefined,'rhvideo.cover.loaded');
        RHFilesUI.listen(image,'error',()=>{image.hidden=true;cover.title='缩略图暂时不可用；仍可点击打开内容';},undefined,'rhvideo.cover.error');cover.append(image);
      }else if(media.kind==='novel'){
        cover.replaceChildren();cover.classList.add('book-cover');cover.innerHTML=icon('book');const name=document.createElement('span');name.textContent=media.title.slice(0,22);cover.append(name);
      }
      if(media.kind==='video'){
        const duration=document.createElement('span');duration.className='duration';duration.textContent=model.clock(media.duration);cover.append(duration);
        const hint=document.createElement('span');hint.className='play-hint';hint.innerHTML='<span>'+icon('play')+'</span>';cover.append(hint);
      }
      const open=()=>invoke('media.open',{id:media.id,kind:media.kind}).catch(notice);
      RHFilesUI.listen(cover,'click',open,undefined,'rhvideo.card.open');card.append(cover);
      const info=document.createElement('div');info.className='card-info';
      const title=document.createElement('button');title.className='card-title';title.textContent=media.title;title.title=media.title;RHFilesUI.listen(title,'click',open,undefined,'rhvideo.card.title');info.append(title);
      const meta=document.createElement('div');meta.className='card-meta';meta.innerHTML=icon('folder');const label=document.createElement('span');label.className='folder-label';label.textContent=media.folder||'媒体库';label.title=media.folder;meta.append(label);
      const detail=document.createElement('span');detail.textContent=media.kind==='novel'?(Math.round((media.wordCount||0)/1000)/10)+' 万字':media.resolution&&media.resolution!=='N/A'?media.resolution:'';meta.append(detail);info.append(meta);
      const actions=document.createElement('div');actions.className='card-actions';
      const extra=document.createElement('button');extra.className='text-button';extra.innerHTML=icon(media.kind==='video'?'timeline':media.kind==='picture'?'picture':'book');
      const caption=document.createElement('span');caption.textContent=media.kind==='video'?'时间轴':media.kind==='picture'?'查看图片':media.progress?.percent?'继续阅读 · '+media.progress.percent+'%':'开始阅读';extra.append(caption);
      RHFilesUI.listen(extra,'click',()=>invoke(media.kind==='video'?'timeline.open':'media.open',{id:media.id,kind:media.kind}).catch(notice),undefined,'rhvideo.card.secondary');
      const heart=document.createElement('button');const key=model.itemKey(media);heart.className='favorite-button'+(state.favorites.has(key)?' active':'');heart.innerHTML=icon('heart');
      heart.setAttribute('aria-label',state.favorites.has(key)?'取消收藏 '+media.title:'收藏 '+media.title);heart.setAttribute('aria-pressed',String(state.favorites.has(key)));heart.disabled=state.favoriteBusy.has(key);
      RHFilesUI.listen(heart,'click',()=>invoke('favorite.toggle',{id:media.id,kind:media.kind}).catch(notice),undefined,'rhvideo.card.favorite');
      actions.append(extra,heart);info.append(actions);card.append(info);grid.append(card);
    }
  }
  function snapshot(){return {kind:state.kind,connected:state.connected,nativePlayback:state.nativePlayback,loading:state.loading,error:state.error,offset:state.offset,total:state.total,search:state.search,folder:state.folder,items:state.items.map(({id,title,kind,folder})=>({id,title,kind,folder})),reader:reader.book?{id:reader.book.id,chapter:reader.chapter,loaded:reader.loaded}:null};}
  action('state',object(),snapshot,'read');api.provideState('rhvideo',snapshot);
  action('connection.open',object(),async()=>{updateConnection(await native('state'));$('connection-error').textContent='';if(!$('connection-dialog').open)$('connection-dialog').showModal();return {opened:true};});
  action('connection.close',object(),()=>{$('connection-dialog').close();$('password').value='';return {closed:true};});
  action('connection.connect',object({server:string,username:string,password:{type:'string',maxLength:4096}},['server','username','password']),async args=>{
    $('connect').disabled=true;$('disconnect').disabled=true;$('connection-error').textContent='';
    try{
      updateConnection(await native('connect',args));$('connection-dialog').close();state.offset=0;state.search='';state.folder='';$('search').value='';
      let favoriteError;try{state.favorites=model.favoriteSet(await native('favorites'));}catch(error){state.favorites.clear();favoriteError=error;}
      await load(true,true);if(favoriteError)notice('收藏状态读取失败：'+String(favoriteError));return snapshot();
    }catch(error){$('connection-error').textContent=String(error);throw error;}
    finally{$('connect').disabled=false;$('disconnect').disabled=false;$('password').value='';}
  },'external');
  action('connection.logout',object(),async()=>{
    ++state.loadId;++reader.token;++folderLoadId;++timelineLoadId;state.loading=false;state.search='';state.folder='';state.generation=0;$('search').value='';$('folder').replaceChildren(new Option('所有文件夹',''));
    clearTimeout(searchTimer);clearTimeout(reader.saveTimer);for(const id of ['image-dialog','reader-dialog','timeline-dialog'])$(id).close();reader.book=null;
    $('full-image').removeAttribute('src');$('chapter-text').replaceChildren();images=[];
    updateConnection(await native('logout'));state.items=[];state.total=0;state.favorites.clear();$('connection-dialog').close();await load();return snapshot();
  },'external');
  action('category',object({kind:{type:'string',enum:model.kinds}},['kind']),async({kind})=>{
    clearTimeout(searchTimer);state.kind=kind;state.offset=0;state.search='';state.folder='';$('search').value='';$('folder').value='';
    $('page-title').textContent=titles[kind];document.querySelectorAll('[data-kind].nav-item').forEach(n=>n.classList.toggle('active',n.dataset.kind===kind));return load(false,true);
  });
  action('refresh',object(),async()=>{if(state.connected)try{state.favorites=model.favoriteSet(await native('favorites'));}catch(error){notice(error);}return load(true);},'read');
  action('search',object({query:{type:'string',maxLength:256}},['query']),({query})=>{state.search=query;state.offset=0;$('search').value=query;return load();});
  action('filter',object({folder:{type:'string',maxLength:1024}},['folder']),({folder})=>{state.folder=folder;state.offset=0;$('folder').value=folder;return load();});
  action('page',object({direction:{type:'integer',enum:[-1,1]}},['direction']),({direction})=>{const p=model.page(state.total,state.offset,state.limit);if(state.loading||direction<0&&!p.previous||direction>0&&!p.next)return snapshot();state.offset+=direction*state.limit;window.scrollTo(0,0);return load();});
  action('favorite.toggle',object({id:string,kind:{type:'string',enum:['video','picture','novel']}},['id','kind']),async args=>{
    const media=item(args.id,args.kind),key=model.itemKey(media);if(state.favoriteBusy.has(key))throw Error('收藏操作正在处理');
    const generation=state.generation;state.favoriteBusy.add(key);paint();
    try{await native('favorite',{id:media.id,kind:media.kind,enabled:!state.favorites.has(key)});if(generation!==state.generation)return {changed:false};if(state.favorites.has(key))state.favorites.delete(key);else state.favorites.add(key);if(state.kind==='favorite')await load();return {favorite:state.favorites.has(key)};}
    finally{state.favoriteBusy.delete(key);if(state.connected&&!state.loading)paint();}
  },'write');
  action('media.open',object({id:string,kind:{type:'string',enum:['video','picture','novel']}},['id','kind']),async args=>{
    const media=item(args.id,args.kind);
    if(media.kind==='video')return native('play',{id:media.id,title:media.title,queue:state.items.filter(v=>v.kind==='video').map(({id,title})=>({id,title}))});
    if(media.kind==='picture'){const result=model.imageIndex(state.items,media.id);images=result.images;imageIndex=result.index;imageZoom=1;showImage();if(!$('image-dialog').open)$('image-dialog').showModal();return {opened:true};}
    const token=++reader.token;const book=await native('novel',{id:media.id});if(token!==reader.token)return {cancelled:true};
    reader.book=book;reader.loaded=false;reader.chapter=book.progress?.chapter_index||0;$('book-title').textContent=book.title||media.title;
    const select=$('chapter-select');select.replaceChildren();
    if(!Array.isArray(book.chapters)||!book.chapters.length)throw Error('这本书还没有可读取的章节');
    for(const chapter of book.chapters)select.append(new Option(chapter.title,String(chapter.index)));
    if(!$('reader-dialog').open)$('reader-dialog').showModal();await chapter(reader.chapter,book.progress?.scroll_ratio||0);return {opened:true};
  },'external');
  function showImage(){
    const media=images[imageIndex];$('image-title').textContent=media.title;$('full-image').src=media.cover;$('full-image').alt=media.title;
    $('image-position').textContent=(imageIndex+1)+' / '+images.length;$('image-previous').disabled=imageIndex===0;$('image-next').disabled=imageIndex===images.length-1;
    $('full-image').style.transform='scale('+imageZoom+')';$('image-fit').textContent=imageZoom===1?'适应画面':Math.round(imageZoom*100)+'%';
  }
  action('image.step',object({direction:{type:'integer',enum:[-1,1]}},['direction']),({direction})=>{if(!$('image-dialog').open)throw Error('图片查看器未打开');imageIndex=Math.max(0,Math.min(images.length-1,imageIndex+direction));imageZoom=1;showImage();return {index:imageIndex,total:images.length};});
  action('image.zoom',object({delta:{type:'number',minimum:-1,maximum:1}},['delta']),({delta})=>{if(!$('image-dialog').open)throw Error('图片查看器未打开');imageZoom=delta===0?1:Math.max(.5,Math.min(4,imageZoom+delta));showImage();return {zoom:imageZoom};});
  action('image.close',object(),()=>{$('image-dialog').close();$('full-image').removeAttribute('src');images=[];return {closed:true};});
  action('timeline.open',object({id:string,kind:{type:'string'}},['id']),async({id})=>{
    const media=item(id,'video'),token=++timelineLoadId;$('timeline-title').textContent=media.title;$('timeline-frames').textContent='正在读取时间轴…';if(!$('timeline-dialog').open)$('timeline-dialog').showModal();
    const value=await native('frames',{id});if(!$('timeline-dialog').open||token!==timelineLoadId)return {cancelled:true};
    const root=$('timeline-frames');root.replaceChildren();
    if(!value.frames?.length){root.textContent='服务器还没有为这个视频生成关键帧。';return {count:0};}
    for(const frame of value.frames){
      const button=document.createElement('button');button.className='frame-button';const image=document.createElement('img');image.src=frame.url;image.loading='lazy';image.alt='';const label=document.createElement('span');label.textContent=model.clock(frame.seconds);button.append(image,label);
      RHFilesUI.listen(button,'click',()=>invoke('timeline.play',{id,seconds:frame.seconds}).catch(notice),undefined,'rhvideo.timeline.frame');root.append(button);
    }
    return {count:value.frames.length};
  },'read');
  action('timeline.play',object({id:string,seconds:{type:'number',minimum:0,maximum:604800}},['id','seconds']),({id,seconds})=>{const media=item(id,'video');return native('play',{id,title:media.title,seconds});},'external');
  action('timeline.close',object(),()=>{timelineLoadId++;$('timeline-dialog').close();$('timeline-frames').replaceChildren();return {closed:true};});
  async function saveRead(){
    if(!reader.book||!reader.loaded)return {saved:false};
    const id=reader.book.id,index=reader.chapter,token=reader.token,scroll=$('chapter-scroll'),ratio=scroll.scrollHeight>scroll.clientHeight?scroll.scrollTop/(scroll.scrollHeight-scroll.clientHeight):0;
    $('reader-save').textContent='正在保存进度…';
    try{await native('progress',{id,chapter:index,ratio:Math.min(1,Math.max(0,ratio))});if(token===reader.token)$('reader-save').textContent='进度已同步到 RHVideo';return {saved:true};}
    catch(error){if(token===reader.token)$('reader-save').textContent='进度保存失败';notice('阅读进度未保存：'+String(error));throw error;}
  }
  async function chapter(index,ratio=0){
    if(!reader.book)throw Error('请先打开一本书');
    if(!reader.book.chapters.some(c=>c.index===index))throw Error('没有这个章节');
    clearTimeout(reader.saveTimer);void saveRead().catch(()=>{});
    const id=reader.book.id,token=++reader.token;reader.loaded=false;$('chapter-text').textContent='正在读取章节…';$('reader-save').textContent='';
    try{
      const value=await native('chapter',{id,chapter:index});if(token!==reader.token)return {cancelled:true};
      reader.chapter=index;$('chapter-title').textContent=value.title;$('chapter-text').textContent=value.text;$('chapter-select').value=String(index);
      $('chapter-previous').disabled=!value.has_prev;$('chapter-next').disabled=!value.has_next;
      requestAnimationFrame(()=>{if(token!==reader.token)return;const scroll=$('chapter-scroll');scroll.scrollTop=ratio*Math.max(0,scroll.scrollHeight-scroll.clientHeight);reader.loaded=true;});return {chapter:index};
    }catch(error){if(token===reader.token)$('chapter-text').textContent='读取失败：'+String(error);throw error;}
  }
  action('reader.chapter',object({index:integer},['index']),({index})=>chapter(index),'read');
  action('reader.step',object({direction:{type:'integer',enum:[-1,1]}},['direction']),({direction})=>chapter(reader.chapter+direction),'read');
  action('reader.save',object(),saveRead,'write');
  action('reader.close',object(),async()=>{
    clearTimeout(reader.saveTimer);const save=saveRead();++reader.token;reader.loaded=false;reader.book=null;$('reader-dialog').close();$('chapter-text').textContent='';
    await save;return {closed:true};
  });
  action('reader.font',object({size:{type:'integer',enum:[18,20,22,24]}},['size']),({size})=>{document.documentElement.style.setProperty('--reader-size',size+'px');$('reader-font').value=String(size);return {size};});
  action('back',object(),async()=>{
    for(const [id,name] of [['connection-dialog','connection.close'],['image-dialog','image.close'],['reader-dialog','reader.close'],['timeline-dialog','timeline.close']])if($(id).open)return invoke(name);
    if(mobile)return native('close');return {closed:false};
  });
  if(mobile){document.body.classList.add('mobile-client');$('chapter-select').size=1;$('library-back').hidden=false;bind('library-back','click','back');window.RHVideoBack=()=>invoke('back').catch(notice);}
  bind('connection-open','click','connection.open');bind('connection-close','click','connection.close');
  bind('connection-form','submit','connection.connect',()=>({server:$('server').value,username:$('username').value,password:$('password').value}));
  bind('disconnect','click','connection.logout');bind('refresh','click','refresh');
  for(const button of document.querySelectorAll('nav [data-kind]'))RHFilesUI.listen(button,'click',()=>invoke('category',{kind:button.dataset.kind}).catch(notice),undefined,'rhvideo.nav.'+button.dataset.kind);
  RHFilesUI.listen($('search'),'input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>invoke('search',{query:$('search').value}).catch(notice),300);},undefined,'rhvideo.search.input');
  bind('folder','change','filter',()=>({folder:$('folder').value}));bind('previous-page','click','page',()=>({direction:-1}));bind('next-page','click','page',()=>({direction:1}));
  bind('image-close','click','image.close');bind('image-previous','click','image.step',()=>({direction:-1}));bind('image-next','click','image.step',()=>({direction:1}));
  bind('image-fit','click','image.zoom',()=>({delta:0}));bind('image-zoom-in','click','image.zoom',()=>({delta:.25}));bind('image-zoom-out','click','image.zoom',()=>({delta:-.25}));
  RHFilesUI.listen($('full-image'),'error',()=>{$('image-position').textContent='图片加载失败，请检查服务器连接后重试。';},undefined,'rhvideo.image.error');
  bind('timeline-close','click','timeline.close');bind('reader-close','click','reader.close');bind('chapter-select','change','reader.chapter',()=>({index:Number($('chapter-select').value)}));
  bind('chapter-previous','click','reader.step',()=>({direction:-1}));bind('chapter-next','click','reader.step',()=>({direction:1}));
  bind('reader-font','change','reader.font',()=>({size:Number($('reader-font').value)}));
  RHFilesUI.listen($('chapter-scroll'),'scroll',()=>{if(!reader.loaded)return;clearTimeout(reader.saveTimer);reader.saveTimer=setTimeout(()=>invoke('reader.save').catch(()=>{}),1200);},undefined,'rhvideo.reader.scroll');
  for(const [id,name]of [['connection-dialog','connection.close'],['image-dialog','image.close'],['reader-dialog','reader.close'],['timeline-dialog','timeline.close']]){
    RHFilesUI.listen($(id),'cancel',event=>{event.preventDefault();invoke(name).catch(notice);},undefined,'rhvideo.'+id+'.cancel');
  }
  RHFilesUI.listen(document,'keydown',event=>{
    if(!$('image-dialog').open||!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();invoke('image.step',{direction:event.key==='ArrowLeft'?-1:1}).catch(notice);
  },undefined,'rhvideo.image.keyboard');
  RHFilesUI.listen(document,'contextmenu',event=>event.preventDefault(),undefined,'rhvideo.contextmenu');
  (async()=>{updateConnection(await native('state'));let favoriteError;if(state.connected)try{state.favorites=model.favoriteSet(await native('favorites'));}catch(error){favoriteError=error;}await load(false,true);if(favoriteError)notice('收藏状态读取失败：'+String(favoriteError));})().catch(notice);
})();
