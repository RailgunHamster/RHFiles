/* RHFiles-owned client UI. All data comes through the native RHVideo adapter. */
(() => {
  'use strict';
  const api=window.RHFilesAPI,model=RHVideoModel,$=id=>document.getElementById(id);
  const mobile=!!window.RHVideoNative;
  api.provideRunLookup(query=>mobile?window.RHVideoNative.request('automation.receipt',query):window.__TAURI__.core.invoke('automation_receipt',{query}));
  if(!mobile)api.provideRunTransport(()=>window.__TAURI__.core.invoke('automation_receipt_transport'));
  const cardCache=new Map();
  let visibilityOrder=0;
  const cardVisibility=typeof IntersectionObserver==='function'?new IntersectionObserver(rememberVisibleCards):null;
  function rememberVisibleCards(entries){
    if(document.visibilityState!=='visible')return;
    for(const entry of entries){
      if(!entry.isIntersecting||entry.intersectionRect.width<=0||entry.intersectionRect.height<=0||!entry.target.isConnected)continue;
      const card=entry.target,cached=cardCache.get(card.dataset.kind+':'+card.dataset.id);
      if(cached?.node===card)cached.seen=++visibilityOrder;
    }
  }
  function clearCards(){cardVisibility?.disconnect();for(const {node} of cardCache.values())node.querySelector('img')?.removeAttribute('src');cardCache.clear();$('media-grid').replaceChildren();}
  function trimCards(){
    let detached=0;const candidates=[];
    for(const [key,entry] of cardCache)if(!entry.node.isConnected){const image=entry.node.querySelector('img'),bytes=(image?.naturalWidth||0)*(image?.naturalHeight||0)*4;detached+=bytes;candidates.push({key,entry,bytes});}
    // Preserve actual viewport history, not construction order (which favors
    // unseen bottom rows). Keep the existing count and decoded-byte ceilings.
    candidates.sort((a,b)=>(a.entry.seen||0)-(b.entry.seen||0));
    for(const {key,entry,bytes} of candidates){
      if(cardCache.size<=72&&detached<=16*1024*1024)break;
      detached-=bytes;cardVisibility?.unobserve(entry.node);entry.node.querySelector('img')?.removeAttribute('src');cardCache.delete(key);
    }
  }
  let modalOrder=[];
  const modalTop=()=>modalOrder.filter(id=>$(id)?.open).at(-1);
  function openDialog(id){workbench?.invalidatePendingConfirmation();const node=$(id);if(id==='image-dialog'&&node.open&&modalTop()!==id)node.close();if(!node.open){node.showModal();modalOrder=modalOrder.filter(v=>$(v)?.open&&v!==id);modalOrder.push(id);}if(id==='image-dialog')node.querySelector('.image-stage').focus({preventScroll:true});return node;}
  const native=(action,args={})=>{
    if(state.generation>0&&!['state','connect','register','restore','close','presentation.close','grid.close'].includes(action))args={...args,_sessionGeneration:state.generation};
    return (mobile?window.RHVideoNative.request(action,args):window.__TAURI__.core.invoke('rhvideo_request',{action,args})).catch(error=>{workbench?.invalidateSession();throw error;});
  };
  let libraryReady=false;
  api.provideState('application',()=>({platform:mobile?'android':'windows',window:'window-rhvideo',ready:libraryReady}));
  const icons={
    duplicates:'<rect x="3" y="3" width="13" height="13" rx="3"/><path d="M9 20h8a3 3 0 0 0 3-3V9M7 9l2 2 4-4"/>',
    gallery:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
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
  const state={view:'gallery',kind:'video',offset:0,limit:36,total:0,items:[],favorites:new Set(),favoriteBusy:new Set(),loading:false,error:'',connected:false,nativePlayback:false,loadId:0,search:'',folder:'',generation:0,server:'',username:'',credentialsPersisted:false,restoring:false,loginWarning:''};
  const reader={book:null,chapter:0,loaded:false,token:0,saveTimer:0,ratio:0};
  let workbench=null;
  let readSaveChain=Promise.resolve();
  let readEpoch=0;
  let connectionEpoch=0;
  let connectionPreparation=null;
  function prepareConnection(authenticated){
    const pending={version:connectionEpoch,promise:Promise.resolve(workbench?.reset(authenticated))};connectionPreparation=pending;
    return pending.promise.finally(()=>{if(connectionPreparation===pending)connectionPreparation=null;});
  }
  async function connectionReady(){const version=connectionEpoch,pending=connectionPreparation;if(pending?.version===version)await pending.promise;if(version!==connectionEpoch)throw Error('媒体账户已改变，旧读取未继续');}
  function beginConnection(){readEpoch++;clearMediaViews();return ++connectionEpoch;}
  let searchTimer=0,folderLoadId=0,timelineLoadId=0,images=[],imageIndex=0,imageZoom=1;
  const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
  const string={type:'string',maxLength:4096},integer={type:'integer',minimum:0,maximum:100000};
  function action(name,params,handler,risk='ui'){api.register('rhvideo.'+name,handler,{params,risk,description:'RHVideo '+name});}
  function invoke(name,args={}){return api.invoke('rhvideo.'+name,args);}
  function notice(message,success=false){$('notice').textContent=String(message?.message||message);$('notice').hidden=false;$('notice').classList.toggle('success',success);}
  function bind(id,event,name,args=()=>({})){
    $(id).dataset.apiAction='rhvideo.'+name;
    if($(id).tagName==='FORM')for(const button of $(id).querySelectorAll('button[type=submit]'))button.dataset.apiAction='rhvideo.'+name;
    RHFilesUI.listen($(id),event,e=>{
      if(event==='submit')e.preventDefault();
      const pending=Promise.resolve(invoke(name,args(e)));
      // DOM dispatch ignores returned promises; attach the normal UI notice
      // without replacing the original promise awaited by ui.invoke.
      void pending.catch(notice);return pending;
    },undefined,'rhvideo.'+id+'.'+event);
  }
  function item(id,kind){const value=state.items.find(item=>item.id===id&&(!kind||item.kind===kind));if(!value)throw Error('媒体已不在当前列表中，请刷新');return value;}
  function status(title,description,kind='library',button=false){
    const root=$('library-status');root.replaceChildren();root.innerHTML=icon(kind);
    const h=document.createElement('h2');h.textContent=title;root.append(h);
    if(description){const p=document.createElement('p');p.textContent=description;root.append(p);}
    if(button){const b=document.createElement('button');b.dataset.apiAction='rhvideo.connection.open';b.className='button primary';b.textContent='连接 RHVideo';RHFilesUI.listen(b,'click',()=>invoke('connection.open'),undefined,'rhvideo.empty.connect');root.append(b);}
  }
  function updateConnection(value){
    state.connected=value.connected;state.nativePlayback=value.nativePlayback;
    state.generation=value.connected?(value.generation??0):0;
    state.server=value.server||'';state.username=value.username||'';
    state.credentialsPersisted=!!value.credentialsPersisted;state.restoring=!!value.restoring;state.loginWarning=value.loginWarning||'';
    workbench?.acceptSession(value);
    $('connection-open').classList.toggle('connected',value.connected);
    $('connection-label').textContent=value.connected?(value.username||'已连接'):'尚未连接';
    let host=value.server;try{host=new URL(host).host;}catch{}
    $('connection-host').textContent=host||'连接你的 RHVideo';
    $('server').value=value.server||'';$('username').value=value.username||'';
    $('disconnect').hidden=!value.connected;
    $('engine-status').textContent=mobile?'视频使用 Android 原生播放器。':value.nativePlayback?'原生视频内核：VLC。':'视频播放需要安装 64 位 VLC 3.x。';
    if(value.loginWarning)notice(value.loginWarning);
    syncSection();
  }
  function syncSection(){
    workbench?.syncContext();
    const gallery=state.view==='gallery',visible=gallery&&state.connected;
    document.body.dataset.libraryView=state.view;
    $('gallery-panel').hidden=!visible;$('media-grid').hidden=visible;$('library-status').hidden=visible;
    document.querySelector('.pagination').hidden=gallery;
    $('folder').closest('label').hidden=gallery||state.kind==='favorite';
    $('page-title').textContent=gallery?'截图浏览':titles[state.kind];
    $('gallery-nav').classList.toggle('active',gallery);$('gallery-nav').setAttribute('aria-pressed',String(gallery));
    document.querySelectorAll('[data-kind].nav-item').forEach(n=>{const active=!gallery&&n.dataset.kind===state.kind;n.classList.toggle('active',active);n.setAttribute('aria-pressed',String(active));});
    if(!visible)$('result-count').textContent=state.connected?state.total.toLocaleString()+' 项内容':'';
  }
  async function loadFolders(){
    const kind=state.kind,token=++folderLoadId;
    $('folder').replaceChildren(new Option('所有文件夹',''));$('folder').value='';
    if(kind==='favorite'){$('folder').closest('label').hidden=true;return;}
    $('folder').closest('label').hidden=state.view==='gallery';
    try{
      const values=await native('folders',{kind});
      if(kind!==state.kind||token!==folderLoadId)return;
      if(!Array.isArray(values))throw Error('文件夹列表格式不兼容');
      for(const value of values.slice(0,10000)){const label=typeof value==='string'?value:value?.label;if(typeof label==='string')$('folder').append(new Option(label,label));}
      $('folder').value=state.folder;
    }catch(error){if(kind===state.kind)notice('文件夹筛选加载失败：'+String(error));}
  }
  async function load(refresh=false,folders=false,locate){
    if(!state.connected){state.items=[];$('media-grid').replaceChildren();status('把你的媒体库带进来','连接已经运行的 RHVideo，浏览视频、图片、小说和收藏。','library',true);pagination();return;}
    const token=++state.loadId;state.loading=true;state.error='';state.items=[];$('notice').hidden=true;$('media-grid').setAttribute('aria-busy','true');
    if(refresh)clearCards();
    if(folders)void loadFolders();
    if($('media-grid').dataset.kind!==state.kind){$('media-grid').replaceChildren();trimCards();}$('media-grid').inert=true;if(!$('media-grid').children.length)status('正在读取媒体库…','只读取当前分类的清单，图片按需加载。','refresh');else $('result-count').textContent='正在更新…';
    try{
      const value=model.validateCatalog(await (workbench?workbench.catalog(refresh,locate):native('catalog',{kind:state.kind,offset:state.offset,limit:state.limit,search:state.search,folder:state.folder,refresh})));
      if(token!==state.loadId)return;
      if(locate){if(!Number.isSafeInteger(value.offset)||value.offset<0||value.offset%state.limit!==0)throw Error('媒体定位页码无效');state.offset=value.offset;}
      if(value.total>0&&state.offset>=value.total){state.offset=Math.floor((value.total-1)/state.limit)*state.limit;return load(false,false);}
      state.total=value.total;state.items=value.items;state.generation=value.generation;paint();workbench?.paintCards();
    }catch(error){
      if(token!==state.loadId)return;state.items=[];state.error=String(error);$('media-grid').replaceChildren();trimCards();status('暂时无法读取媒体库',state.error,'library');notice(state.error);
    }finally{if(token===state.loadId){state.loading=false;$('media-grid').inert=false;$('media-grid').setAttribute('aria-busy','false');pagination();}}
    return snapshot();
  }
  function pagination(){
    const page=model.page(state.total,state.offset,state.limit);
    if(state.view!=='gallery'||!state.connected)$('result-count').textContent=state.connected?state.total.toLocaleString()+' 项内容':'';
    $('page-count').textContent=state.connected&&state.total?'第 '+page.number+' / '+page.pages+' 页 · 每页 '+state.limit+' 项':'';
    $('page-number').max=String(Math.max(1,page.pages));$('page-number').disabled=!state.connected||state.loading||!state.total;
    if(document.activeElement!==$('page-number')&&!state.loading)$('page-number').value=String(page.number||1);
    $('page-jump-form').querySelector('button').disabled=$('page-number').disabled;
    $('previous-page').disabled=!state.connected||state.loading||!page.previous;$('next-page').disabled=!state.connected||state.loading||!page.next;
  }
  function paint(){
    $('library-status').replaceChildren();const grid=$('media-grid');grid.replaceChildren();grid.dataset.kind=state.kind;grid.className='media-grid '+({picture:'pictures',novel:'novels'}[state.kind]||'');
    if(!state.items.length){trimCards();status('这里暂时没有内容',state.search||state.folder?'换个关键词或文件夹试试。':'内容会沿用服务器的媒体库；可以在 RHVideo 中添加监控目录。',state.kind==='favorite'?'heart':state.kind);return;}
    for(const media of state.items){
      const cacheKey=model.itemKey(media),signature=JSON.stringify(media),cached=cardCache.get(cacheKey);
      if(cached?.signature===signature){cardCache.delete(cacheKey);cardCache.set(cacheKey,cached);grid.append(cached.node);paintCardFavorite(cached.node.querySelector('.favorite-button'),cacheKey,media.title);continue;}
      if(cached)cardVisibility?.unobserve(cached.node);
      cached?.node.querySelector('img')?.removeAttribute('src');
      const card=document.createElement('article');card.className='media-card';card.dataset.id=media.id;card.dataset.kind=media.kind;
      const cover=document.createElement('button');cover.className='cover-button';cover.setAttribute('aria-label',(media.kind==='novel'?'阅读 ':media.kind==='picture'?'查看 ':'播放 ')+media.title);
      cover.innerHTML='<span class="cover-empty">'+icon(media.kind==='novel'?'book':media.kind)+'</span>';
      if(media.cover){
        const image=document.createElement('img');image.loading='lazy';image.decoding='async';image.alt='';image.src=media.cover;
        RHFilesUI.listen(image,'load',()=>{image.classList.add('loaded');cover.querySelector('.cover-empty')?.remove();trimCards();},undefined,'rhvideo.cover.loaded');
        RHFilesUI.listen(image,'error',()=>{workbench?.invalidateSession();image.hidden=true;cover.title='缩略图暂时不可用，可刷新；仍可点击打开内容';},undefined,'rhvideo.cover.error');cover.append(image);
      }else if(media.kind==='novel'){
        cover.replaceChildren();cover.classList.add('book-cover');cover.innerHTML=icon('book');const name=document.createElement('span');name.textContent=media.title.slice(0,22);cover.append(name);
      }
      if(media.kind==='video'){
        const duration=document.createElement('span');duration.className='duration';duration.textContent=model.clock(media.duration);cover.append(duration);
        const hint=document.createElement('span');hint.className='play-hint';hint.innerHTML='<span>'+icon('play')+'</span>';cover.append(hint);
      }
      const open=()=>(workbench?.selectCard(media)||invoke('media.open',{id:media.id,kind:media.kind})).catch(notice);
      cover.dataset.apiAction='rhvideo.media.open';RHFilesUI.listen(cover,'click',open,undefined,'rhvideo.card.open');card.append(cover);
      const info=document.createElement('div');info.className='card-info';
      const title=document.createElement('button');title.dataset.apiAction='rhvideo.media.open';title.className='card-title';title.textContent=media.title;title.title=media.title;RHFilesUI.listen(title,'click',open,undefined,'rhvideo.card.title');info.append(title);
      const meta=document.createElement('div');meta.className='card-meta';meta.innerHTML=icon('folder');const label=document.createElement('span');label.className='folder-label';label.textContent=media.folder||'媒体库';label.title=media.folder;meta.append(label);
      const detail=document.createElement('span');detail.textContent=media.kind==='novel'?(Math.round((media.wordCount||0)/1000)/10)+' 万字':media.resolution&&media.resolution!=='N/A'?media.resolution:'';meta.append(detail);info.append(meta);
      const actions=document.createElement('div');actions.className='card-actions';
      const extra=document.createElement('button');extra.className='text-button';extra.innerHTML=icon(media.kind==='video'?'timeline':media.kind==='picture'?'picture':'book');
      const caption=document.createElement('span');caption.textContent=media.kind==='video'?'时间轴':media.kind==='picture'?'查看图片':media.progress?.percent?'继续阅读 · '+media.progress.percent+'%':'开始阅读';extra.append(caption);
      extra.dataset.apiAction='rhvideo.'+(media.kind==='video'?'timeline.open':'media.open');RHFilesUI.listen(extra,'click',()=>invoke(media.kind==='video'?'timeline.open':'media.open',{id:media.id,kind:media.kind}).catch(notice),undefined,'rhvideo.card.secondary');
      const heart=document.createElement('button');const key=model.itemKey(media);heart.dataset.key=key;heart.className='favorite-button';heart.innerHTML=icon('heart');paintCardFavorite(heart,key,media.title);
      heart.dataset.apiAction='rhvideo.favorite.toggle';RHFilesUI.listen(heart,'click',()=>invoke('favorite.toggle',{id:media.id,kind:media.kind}).catch(notice),undefined,'rhvideo.card.favorite');
      actions.append(extra,heart);info.append(actions);card.append(info);grid.append(card);cardCache.delete(cacheKey);cardCache.set(cacheKey,{node:card,signature,seen:0});cardVisibility?.observe(card);
    }
    trimCards();
  }
  function paintCardFavorite(heart,key,title=''){
    if(!heart)return;
    heart.classList.toggle('active',state.favorites.has(key));heart.disabled=state.favoriteBusy.has(key);
    heart.setAttribute('aria-pressed',String(state.favorites.has(key)));
    heart.setAttribute('aria-label',(state.favorites.has(key)?'取消收藏 ':'收藏 ')+title);
  }
  function paintFavorite(key){
    workbench?.refreshViewer();
    if($('image-dialog').open)workbench?.refreshImage();
    if(reader.book&&key==='novel:'+reader.book.id){const button=$('reader-favorite');if(button){button.classList.toggle('active',state.favorites.has(key));button.setAttribute('aria-pressed',String(state.favorites.has(key)));button.title=state.favorites.has(key)?'取消收藏本书':'收藏本书';}}
    // Updating one heart must not discard decoded images or scroll/card state.
    for(const heart of $('media-grid').querySelectorAll('.favorite-button')){
      if(heart.dataset.key!==key)continue;
      const card=heart.closest('.media-card'),media=state.items.find(m=>m.id===card.dataset.id&&m.kind===card.dataset.kind);
      paintCardFavorite(heart,key,media?.title||'');
    }
  }
  function snapshot(){return {view:state.view,kind:state.kind,connected:state.connected,server:state.server,username:state.username,generation:state.generation,nativePlayback:state.nativePlayback,credentialsPersisted:state.credentialsPersisted,restoring:state.restoring,loginWarning:state.loginWarning,loading:state.loading,error:state.error,offset:state.offset,total:state.total,search:state.search,folder:state.folder,items:state.items.map(({id,title,kind,folder})=>({id,title,kind,folder})),reader:reader.book?{id:reader.book.id,chapter:reader.chapter,loaded:reader.loaded}:null};}
  action('state',object(),snapshot,'read');api.provideState('rhvideo',snapshot);
  action('render.state',object(),()=>{let detachedBytes=0,detachedCards=0;for(const {node} of cardCache.values())if(!node.isConnected){detachedCards++;const image=node.querySelector('img');detachedBytes+=(image?.naturalWidth||0)*(image?.naturalHeight||0)*4;}return {cachedCards:cardCache.size,detachedCards,detachedBytes,currentCards:$('media-grid').children.length,loading:state.loading};},'read');
  action('connection.open',object(),async()=>{updateConnection(await native('state'));$('connection-error').textContent='';openDialog('connection-dialog');return {opened:true};});
  action('connection.close',object(),()=>{workbench?.invalidatePendingConfirmation();$('connection-dialog').close();$('password').value='';return {closed:true};});
  action('connection.restore',object({fresh:{type:'boolean'}}),async({fresh=false}={})=>{
    if(state.connected)return snapshot();
    const connection=beginConnection();state.restoring=true;$('connection-label').textContent='正在恢复登录…';
    let value;try{value=await native('restore',{fresh});}catch(error){if(connection!==connectionEpoch)return {stale:true};state.restoring=false;state.loginWarning=String(error?.message||error);$('connection-label').textContent='尚未连接';throw error;}
    if(connection!==connectionEpoch)return {stale:true};updateConnection(value);
    let initialRead=state.loadId;
    if(state.connected){
      const preparing=prepareConnection(true);initialRead=state.loadId;await preparing;if(connection!==connectionEpoch)return {stale:true};
      try{const favorites=model.favoriteSet(await native('favorites'));if(connection!==connectionEpoch)return {stale:true};state.favorites=favorites;}catch(error){if(connection!==connectionEpoch)return {stale:true};notice('收藏状态读取失败：'+String(error));}
    }
    if(initialRead===state.loadId)await load(false,true);if(connection!==connectionEpoch)return {stale:true};if(value.loginWarning)notice(value.loginWarning);return snapshot();
  },'external');
  action('connection.connect',object({server:string,username:string,password:{type:'string',maxLength:4096}},['server','username','password']),async args=>{
    const connection=beginConnection();
    $('connect').disabled=true;$('disconnect').disabled=true;$('connection-error').textContent='';$('connection-error').classList.remove('success');
    try{
      const value=await native('connect',args);if(connection!==connectionEpoch)return {stale:true};updateConnection(value);$('connection-dialog').close();state.offset=0;state.search='';state.folder='';$('search').value='';
      const preparing=prepareConnection(true),initialRead=state.loadId;await preparing;
      if(connection!==connectionEpoch)return {stale:true};
      let favoriteError;try{const favorites=model.favoriteSet(await native('favorites'));if(connection!==connectionEpoch)return {stale:true};state.favorites=favorites;}catch(error){if(connection!==connectionEpoch)return {stale:true};state.favorites.clear();favoriteError=error;}
      if(initialRead===state.loadId)await load(true,true);if(connection!==connectionEpoch)return {stale:true};if(favoriteError)notice('收藏状态读取失败：'+String(favoriteError));if(value.loginWarning)notice(value.loginWarning);return snapshot();
    }catch(error){
      if(connection!==connectionEpoch)return {stale:true};let actual;
      try{actual=await native('state');}catch{actual={connected:false,generation:0};}
      if(connection!==connectionEpoch)return {stale:true};updateConnection(actual);state.items=[];state.total=0;state.favorites.clear();const preparing=prepareConnection(state.connected),initialRead=state.loadId;await preparing;
      if(connection!==connectionEpoch)return {stale:true};if(initialRead===state.loadId)await load();$('connection-error').textContent=String(error);throw error;
    }
    finally{if(connection===connectionEpoch){$('connect').disabled=false;$('disconnect').disabled=false;$('password').value='';}}
  },'external');
  action('connection.logout',object(),async()=>{
    const connection=++connectionEpoch;
    readEpoch++;
    await prepareConnection(false);
    ++state.loadId;++reader.token;++folderLoadId;++timelineLoadId;state.loading=false;state.search='';state.folder='';$('search').value='';$('folder').replaceChildren(new Option('所有文件夹',''));
    clearTimeout(searchTimer);clearTimeout(reader.saveTimer);for(const id of ['image-dialog','reader-dialog','timeline-dialog'])$(id).close();reader.book=null;
    $('full-image').removeAttribute('src');$('chapter-text').replaceChildren();images=[];
    const value=await native('logout');if(connection!==connectionEpoch)return {stale:true};updateConnection(value);state.items=[];state.total=0;state.favorites.clear();$('connection-dialog').close();await load();return snapshot();
  },'external');
  function loadCategory(kind,locate){
    clearTimeout(searchTimer);workbench?.leaveGallery();state.view='catalog';state.kind=kind;state.offset=0;state.search='';state.folder='';$('search').value='';$('folder').value='';
    syncSection();return load(false,true,locate);
  }
  action('category',object({kind:{type:'string',enum:model.kinds}},['kind']),({kind})=>loadCategory(kind));
  action('refresh',object(),async()=>{if(!state.connected)return invoke('connection.restore',{fresh:true});try{state.favorites=model.favoriteSet(await native('favorites'));}catch(error){notice(error);}return state.view==='gallery'?workbench.refreshGallery(true):load(true);},'read');
  action('search',object({query:{type:'string',maxLength:256}},['query']),({query})=>{state.search=query;state.offset=0;$('search').value=query;return state.view==='gallery'&&state.connected?workbench.refreshGallery(false,true):load();});
  action('filter',object({folder:{type:'string',maxLength:1024}},['folder']),({folder})=>{state.folder=folder;state.offset=0;$('folder').value=folder;return load();});
  action('page',object({direction:{type:'integer',enum:[-1,1]}},['direction']),({direction})=>{const p=model.page(state.total,state.offset,state.limit);if(state.loading||direction<0&&!p.previous||direction>0&&!p.next)return snapshot();state.offset+=direction*state.limit;window.scrollTo(0,0);return load();});
  action('page.jump',object({page:{type:'integer',minimum:1,maximum:1000000}},['page']),({page})=>{const p=model.page(state.total,state.offset,state.limit);if(state.loading)throw Error('媒体清单正在读取，请稍后跳转');if(page>p.pages)throw Error('页码超出当前筛选范围');state.offset=(page-1)*state.limit;window.scrollTo(0,0);return load();});
  action('favorite.toggle',object({id:string,kind:{type:'string',enum:['video','picture','novel']}},['id','kind']),async args=>{
    const media=args.kind==='novel'&&reader.book?.id===args.id?{id:args.id,kind:'novel'}:workbench?.previewTarget(args.kind,args.id)||item(args.id,args.kind),key=model.itemKey(media);if(state.favoriteBusy.has(key))throw Error('收藏操作正在处理');
    const generation=state.generation;state.favoriteBusy.add(key);paintFavorite(key);
    try{await native('favorite',{id:media.id,kind:media.kind,enabled:!state.favorites.has(key)});if(generation!==state.generation)return {changed:false};if(state.favorites.has(key))state.favorites.delete(key);else state.favorites.add(key);workbench?.invalidate('favorite');if(state.kind==='favorite')await load();return {favorite:state.favorites.has(key)};}
    finally{state.favoriteBusy.delete(key);if(state.connected&&!state.loading)paintFavorite(key);}
  },'write');
  action('media.open',object({id:string,kind:{type:'string',enum:['video','picture','novel']}},['id','kind']),async args=>{
    const media=item(args.id,args.kind);
    return openMedia(media);
  },'external');
  async function openMedia(media){
    if(media.kind!=='novel')reader.token++;
    if(media.kind==='novel')workbench?.cancelPendingPlayback();
    if(media.kind==='video'){if(!workbench)throw Error('媒体工作台尚未就绪，播放未开始');return workbench.play(media);}
    if(media.kind==='picture'&&workbench)return workbench.image(media);
    if(media.kind==='picture'){const result=model.imageIndex(state.items,media.id);images=result.images;imageIndex=result.index;imageZoom=1;showImage();openDialog('image-dialog');return {opened:true};}
    const token=++reader.token;const book=await native('novel',{id:media.id});if(token!==reader.token)return {cancelled:true};
    reader.book=book;reader.loaded=false;reader.chapter=book.progress?.chapter_index||0;$('book-title').textContent=book.title||media.title;
    const select=$('chapter-select');select.replaceChildren();
    if(!Array.isArray(book.chapters)||!book.chapters.length)throw Error('这本书还没有可读取的章节');
    for(const chapter of book.chapters)select.append(new Option(chapter.title,String(chapter.index)));
    openDialog('reader-dialog');paintFavorite('novel:'+book.id);await chapter(reader.chapter,book.progress?.scroll_ratio||0);return {opened:true};
  }
  let pendingImageDecode=null;
  function cancelImageDecode(){const pending=pendingImageDecode;pendingImageDecode=null;pending?.cancel();}
  async function prepareImage(media,current){
    if(!current())return {stale:true};
    cancelImageDecode();
    const image=$('full-image');let timer;
    let cancel;const cancelled=new Promise(resolve=>{cancel=()=>{if(image.getAttribute('src')===media.cover)image.removeAttribute('src');resolve({stale:true});};}),pending={cancel};pendingImageDecode=pending;
    try{
      if(typeof media?.cover!=='string'||!media.cover)throw Error('图片地址不可用');
      if(image.getAttribute('src')!==media.cover)image.src=media.cover;
      const result=await Promise.race([image.decode(),cancelled,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('图片加载超时，请检查服务器连接')),20000);})]);
      if(result?.stale)return {stale:true};
      if(!current())return {stale:true};
      if(image.getAttribute('src')!==media.cover||!image.complete||!image.naturalWidth||!image.naturalHeight)throw Error('图片内容不可用');
      return {decoded:true};
    }catch(error){
      if(!current())return {stale:true};
      if(pendingImageDecode===pending&&image.getAttribute('src')===media.cover)image.removeAttribute('src');
      throw Error(error?.message==='图片加载超时，请检查服务器连接'?error.message:'图片加载失败，服务器未返回可解码的图片');
    }finally{clearTimeout(timer);if(pendingImageDecode===pending)pendingImageDecode=null;}
  }
  function showImage(media=images[imageIndex],index=imageIndex,total=images.length){
    $('image-title').textContent=media.title;if($('full-image').src!==media.cover)$('full-image').src=media.cover;$('full-image').alt=media.title;
    $('image-position').textContent=(index+1)+' / '+total+(media.kind==='frame'?' · '+model.clock(media.seconds)+' / '+model.clock(media.duration):'');$('image-previous').disabled=total<=1;$('image-next').disabled=total<=1;
    const collection=$('image-collection-seek');if(collection){collection.value=String(total>1?Math.round(index/(total-1)*1000):0);collection.disabled=total<=1;}
    $('full-image').style.cursor=media.kind==='frame'?'pointer':'';
    $('full-image').style.transform='scale('+imageZoom+')';$('image-fit').textContent=imageZoom===1?'适应画面':Math.round(imageZoom*100)+'%';
  }
  action('image.step',object({direction:{type:'integer',enum:[-1,1]}},['direction']),({direction})=>{if(!$('image-dialog').open)throw Error('图片查看器未打开');if(workbench)return workbench.stepImage(direction);imageIndex=Math.max(0,Math.min(images.length-1,imageIndex+direction));imageZoom=1;showImage();return {index:imageIndex,total:images.length};});
  action('image.zoom',object({delta:{type:'number',minimum:-1,maximum:1}},['delta']),({delta})=>{if(!$('image-dialog').open)throw Error('图片查看器未打开');imageZoom=delta===0?1:Math.max(.5,Math.min(4,imageZoom+delta));if(workbench)workbench.refreshImage();else showImage();return {zoom:imageZoom};});
  action('image.close',object(),async()=>{workbench?.invalidatePendingConfirmation();const previewId=workbench?.closeImage();$('image-dialog').close();$('full-image').removeAttribute('src');images=[];if(previewId)await native('player.closeParent',{parentPreview:previewId});await invoke('preview.commit');return {closed:true};});
  action('timeline.open',object({id:string,kind:{type:'string'}},['id']),async({id})=>{
    const media=item(id,'video'),token=++timelineLoadId;$('timeline-title').textContent=media.title;$('timeline-frames').textContent='正在读取时间轴…';openDialog('timeline-dialog');
    const value=await native('frames',{id});if(!$('timeline-dialog').open||token!==timelineLoadId)return {cancelled:true};
    const root=$('timeline-frames');root.replaceChildren();
    if(!value.frames?.length){root.textContent='服务器还没有为这个视频生成关键帧。';return {count:0};}
    for(const frame of value.frames){
      const button=document.createElement('button');button.className='frame-button';const image=document.createElement('img');image.src=frame.url;image.loading='lazy';image.alt='';const label=document.createElement('span');label.textContent=model.clock(frame.seconds);button.append(image,label);
      button.dataset.apiAction='rhvideo.timeline.play';RHFilesUI.listen(button,'click',()=>invoke('timeline.play',{id,seconds:frame.seconds}).catch(notice),undefined,'rhvideo.timeline.frame');root.append(button);
    }
    return {count:value.frames.length};
  },'read');
  action('timeline.play',object({id:string,seconds:{type:'number',minimum:0,maximum:604800}},['id','seconds']),({id,seconds})=>{const media=item(id,'video');workbench?.cancelPendingPlayback();return native('play',{id,title:media.title,seconds});},'external');
  action('timeline.close',object(),()=>{workbench?.invalidatePendingConfirmation();timelineLoadId++;$('timeline-dialog').close();$('timeline-frames').replaceChildren();return {closed:true};});
  async function saveRead(){
    if(!reader.book||!reader.loaded)return {saved:false};
    const id=reader.book.id,index=reader.chapter,token=reader.token,epoch=readEpoch,scroll=$('chapter-scroll'),ratio=scroll.scrollHeight>scroll.clientHeight?scroll.scrollTop/(scroll.scrollHeight-scroll.clientHeight):0;
    $('reader-save').textContent='正在保存进度…';
    try{const pending=readSaveChain.catch(()=>{}).then(()=>epoch===readEpoch&&state.connected?native('progress',{id,chapter:index,ratio:Math.min(1,Math.max(0,ratio))}):null);readSaveChain=pending;const value=await pending;if(epoch!==readEpoch)return {saved:false,stale:true};if(token===reader.token)$('reader-save').textContent='进度已同步到 RHVideo';return {saved:value!==null};}
    catch(error){if(token===reader.token)$('reader-save').textContent='进度保存失败';notice('阅读进度未保存：'+String(error));throw error;}
  }
  function clearMediaViews(){cancelImageDecode();++reader.token;++timelineLoadId;++folderLoadId;++state.loadId;state.loading=false;clearCards();$('media-grid').inert=false;$('media-grid').setAttribute('aria-busy','false');clearTimeout(reader.saveTimer);reader.book=null;reader.loaded=false;for(const id of ['image-dialog','reader-dialog','timeline-dialog'])$(id).close();$('full-image').removeAttribute('src');$('chapter-text').textContent='';$('timeline-frames').replaceChildren();images=[];}
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
  action('reader.toc',object({visible:{type:'boolean'}}),({visible})=>{if(!reader.book)throw Error('请先打开小说');const aside=$('reader-dialog').querySelector('.reader-body>aside');aside.hidden=visible===undefined?!aside.hidden:!visible;return {visible:!aside.hidden};});
  action('reader.favorite',object(),()=>{if(!reader.book)throw Error('请先打开小说');return invoke('favorite.toggle',{id:reader.book.id,kind:'novel'});},'write');
  action('reader.step',object({direction:{type:'integer',enum:[-1,1]}},['direction']),({direction})=>chapter(reader.chapter+direction),'read');
  action('reader.save',object(),saveRead,'write');
  action('reader.close',object(),async()=>{
    workbench?.invalidatePendingConfirmation();
    clearTimeout(reader.saveTimer);const save=saveRead();++reader.token;reader.loaded=false;reader.book=null;$('reader-dialog').close();$('chapter-text').textContent='';
    await save;return {closed:true};
  });
  action('reader.font',object({size:{type:'integer',minimum:13,maximum:40}},['size']),async({size})=>{if(workbench)await invoke('preferences.set',{key:'readerFont',value:size});else document.documentElement.style.setProperty('--reader-size',size+'px');$('reader-font').value=String(size);return {size};});
  action('back',object(),async(_,run)=>{
    if(workbench?.back())return {closed:true};
    for(const [id,name] of [['connection-dialog','connection.close'],['image-dialog','image.close'],['reader-dialog','reader.close'],['timeline-dialog','timeline.close']])if(modalTop()===id)return invoke(name);
    if(mobile)return native('close',run?{_automationRun:run}:{});return {closed:false};
  });
  if(mobile){document.body.classList.add('mobile-client');$('chapter-select').size=1;$('library-back').hidden=false;bind('library-back','click','back');window.RHVideoBack=()=>invoke('back').catch(notice);}
  workbench=window.RHVideoWorkbench.install({api,native,action,invoke,object,string,state,reader,$,mobile,notice,load,loadCategory,paint,paintFavorite,showImage,prepareImage,cancelImageDecode,openDialog,modalTop,beginConnection,connectionReady,connectionVersion:()=>connectionEpoch,connectionCurrent:token=>token===connectionEpoch,resetImageZoom:()=>{imageZoom=1;},invalidateReads:()=>{readEpoch++;clearMediaViews();},openMedia,updateConnection,syncSection,saveRead,chapter,icon,bind});
  const listenNative=mobile?window.RHVideoNative.listen:window.__TAURI__.event.listen;
  listenNative('rhvideo-favorite',({payload})=>{if(payload.generation!==state.generation)return;const key=payload.kind+':'+payload.id;if(state.favoriteBusy.has(key))return;if(payload.enabled)state.favorites.add(key);else state.favorites.delete(key);paintFavorite(key);workbench.invalidate('favorite');if(state.kind==='favorite')void load().catch(notice);}).catch(notice);
  listenNative('rhvideo-preview-result',({payload})=>{if(payload.generation===state.generation)void workbench.receivePreviewResult(payload.result).catch(notice);}).catch(notice);
  listenNative('rhvideo-parent-preview',({payload})=>{if(payload.generation===state.generation)void invoke('image.returnFromVideo',payload).catch(notice);}).catch(notice);
  listenNative('rhvideo-rotation-preference',({payload})=>{if(payload.generation===state.generation)workbench.rotationChanged(payload.enabled);}).catch(notice);
  listenNative('rhvideo-playback-error',({payload})=>{if(payload.generation===state.generation)notice(payload.message);}).catch(notice);
  if(mobile)listenNative('rhvideo-media-action',({payload})=>{if(payload.generation===state.generation&&payload.error)notice(payload.error);}).catch(notice);
  bind('connection-open','click','connection.open');bind('connection-close','click','connection.close');
  bind('connection-form','submit','connection.connect',()=>({server:$('server').value,username:$('username').value,password:$('password').value}));
  bind('disconnect','click','connection.logout');bind('refresh','click','refresh');
  bind('gallery-nav','click','gallery.show');
  for(const button of document.querySelectorAll('nav [data-kind]')){button.dataset.apiAction='rhvideo.category';RHFilesUI.listen(button,'click',()=>invoke('category',{kind:button.dataset.kind}).catch(notice),undefined,'rhvideo.nav.'+button.dataset.kind);}
  $('search').dataset.apiAction='rhvideo.search';
  RHFilesUI.listen($('search'),'input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>invoke('search',{query:$('search').value}).catch(notice),300);},undefined,'rhvideo.search.input');
  bind('folder','change','filter',()=>({folder:$('folder').value}));bind('previous-page','click','page',()=>({direction:-1}));bind('next-page','click','page',()=>({direction:1}));
  bind('page-jump-form','submit','page.jump',()=>({page:Number($('page-number').value)}));$('page-number').dataset.apiAction='rhvideo.page.jump';
  bind('image-close','click','image.close');bind('image-previous','click','image.step',()=>({direction:-1}));bind('image-next','click','image.step',()=>({direction:1}));
  bind('image-fit','click','image.zoom',()=>({delta:0}));bind('image-zoom-in','click','image.zoom',()=>({delta:.25}));bind('image-zoom-out','click','image.zoom',()=>({delta:-.25}));
  bind('image-collection-seek','change','image.seek',()=>({ratio:Number($('image-collection-seek').value)/1000}));
  $('full-image').dataset.apiAction='rhvideo.image.playVideo';RHFilesUI.listen($('full-image'),'click',()=>{if(workbench?.canPlayImage())void invoke('image.playVideo').catch(notice);},undefined,'rhvideo.image.playVideo');
  RHFilesUI.listen($('full-image'),'error',()=>{if(!workbench)$('image-position').textContent='图片加载失败，请检查服务器连接。';},undefined,'rhvideo.image.error');
  bind('timeline-close','click','timeline.close');bind('reader-close','click','reader.close');bind('chapter-select','change','reader.chapter',()=>({index:Number($('chapter-select').value)}));
  bind('chapter-previous','click','reader.step',()=>({direction:-1}));bind('chapter-next','click','reader.step',()=>({direction:1}));
  bind('reader-font','change','reader.font',()=>({size:Number($('reader-font').value)}));
  const readerTools=$('reader-dialog').querySelector('.reader-toolbar');
  for(const [id,label,name,markup] of [['reader-toc','章节目录','reader.toc','目录'],['reader-favorite','收藏本书','reader.favorite',icon('heart')]]){const button=document.createElement('button');button.id=id;button.type='button';button.className='icon-button';button.setAttribute('aria-label',label);button.innerHTML=markup;readerTools.append(button);bind(id,'click',name);}
  RHFilesUI.listen($('chapter-scroll'),'scroll',()=>{if(!reader.loaded)return;clearTimeout(reader.saveTimer);reader.saveTimer=setTimeout(()=>invoke('reader.save').catch(()=>{}),1200);},undefined,'rhvideo.reader.scroll');
  for(const [id,name]of [['connection-dialog','connection.close'],['image-dialog','image.close'],['reader-dialog','reader.close'],['timeline-dialog','timeline.close']]){
    RHFilesUI.listen($(id),'cancel',event=>{event.preventDefault();invoke(name).catch(notice);},undefined,'rhvideo.'+id+'.cancel');
  }
  RHFilesUI.listen(document,'keydown',event=>{
    if(modalTop()!=='image-dialog'||event.target.matches('input,select,textarea')||event.target.isContentEditable)return;
    if(!workbench&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();invoke('image.step',{direction:event.key==='ArrowLeft'?-1:1}).catch(notice);}
    else if(['Home','End'].includes(event.key)){event.preventDefault();invoke('image.seek',{ratio:event.key==='Home'?0:1}).catch(notice);}
  },undefined,'rhvideo.image.keyboard');
  let imageWheelAt=-Infinity;const imageStage=$('image-dialog').querySelector('.image-stage');
  RHFilesUI.listen(imageStage,'wheel',event=>{if(modalTop()!=='image-dialog'||!event.deltaY)return;event.preventDefault();if(performance.now()-imageWheelAt<180)return;imageWheelAt=performance.now();invoke('image.step',{direction:event.deltaY>0?1:-1}).catch(notice);},{passive:false},'rhvideo.image.wheel');
  let imageTouch=null;
  RHFilesUI.listen(imageStage,'touchstart',event=>{imageTouch=event.touches.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;},{passive:true},'rhvideo.image.touchstart');
  RHFilesUI.listen(imageStage,'touchend',event=>{const start=imageTouch;imageTouch=null;if(!start||modalTop()!=='image-dialog'||event.changedTouches.length!==1)return;const dx=event.changedTouches[0].clientX-start.x,dy=event.changedTouches[0].clientY-start.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)){event.preventDefault();invoke('image.step',{direction:dx<0?1:-1}).catch(notice);}},{passive:false},'rhvideo.image.touchend');
  RHFilesUI.listen(document,'contextmenu',event=>event.preventDefault(),undefined,'rhvideo.contextmenu');
  (async()=>{const connection=connectionEpoch,value=await native('state');if(connection!==connectionEpoch)return;updateConnection(value);if(!state.connected){await invoke('connection.restore',{fresh:true});return;}const preparing=prepareConnection(true),initialRead=state.loadId;await preparing;if(connection!==connectionEpoch)return;let favoriteError;try{state.favorites=model.favoriteSet(await native('favorites'));}catch(error){favoriteError=error;}if(connection!==connectionEpoch)return;if(initialRead===state.loadId)await load(false,true);if(favoriteError)notice('收藏状态读取失败：'+String(favoriteError));if(value.loginWarning)notice(value.loginWarning);})().catch(notice).then(async()=>{try{await workbench?.ready();}catch(error){notice(error);}libraryReady=true;});
})();
