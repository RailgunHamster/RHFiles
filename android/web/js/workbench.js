/* Only trusted same-origin app frames use this host. Books run in another origin
 * and process and never receive this bridge. Frames survive mode/size changes. */
const workbench=(()=>{
  const id=new URLSearchParams(location.search).get('pane');
  const parentHost=()=>window.parent!==window?window.parent.RHFilesWorkbench:null;
  let frames=[],active=0,mode='single',preference='auto',clipboard=null,revision=0,lock=null,hinge=null,insets={},capabilities;
  let host,divider,chooser,layoutButton;
  const child=()=>!!parentHost();
  const primary=()=>!child()||id==='first';
  const send=(frame,name,detail)=>frame.contentWindow?.dispatchEvent(new frame.contentWindow.CustomEvent(name,{detail}));
  const broadcast=(name,detail)=>frames.forEach(frame=>{if(frame.dataset.ready==='true')send(frame,name,detail)});
  const indexOf=source=>frames.findIndex(frame=>frame.contentWindow===source);
  const peer=source=>{const index=indexOf(source);return index<0?null:frames[1-index]?.contentWindow?.rhfilesPane};
  const trusted=source=>{if(indexOf(source)<0)throw Error('无效窗格');};
  function setActive(index){active=index;try{localStorage.setItem('rhfiles.panes.active',String(index))}catch{}frames.forEach((frame,i)=>frame.classList.toggle('active-pane',i===active));}
  function getClipboard(){return clipboard?{...clipboard,paths:[...clipboard.paths],revision}:null;}
  function changedClipboard(value){clipboard=value?{mode:value.mode,paths:[...new Set(value.paths)]}:null;revision++;try{localStorage.setItem('rhfiles.panes.clipboard',JSON.stringify(clipboard))}catch{}broadcast('rhfiles-clipboard',getClipboard());}
  function detailFor(frame){
    const bounds=frame.getBoundingClientRect();let localHinge=null;
    if(hinge){const b=hinge.bounds,x1=b.left*innerWidth-bounds.left,x2=b.right*innerWidth-bounds.left,y1=b.top*innerHeight-bounds.top,y2=b.bottom*innerHeight-bounds.top;
      if(x2>0&&x1<bounds.width&&y2>0&&y1<bounds.height)localHinge={...hinge,bounds:{left:Math.max(0,x1)/bounds.width,right:Math.min(bounds.width,x2)/bounds.width,top:Math.max(0,y1)/bounds.height,bottom:Math.min(bounds.height,y2)/bounds.height}};
    }
    return {hinge:localHinge};
  }
  function layout(){
    const left=(insets.left||0)*innerWidth,right=(insets.right||0)*innerWidth,top=(insets.top||0)*innerHeight,bottom=(insets.bottom||0)*innerHeight;
    Object.assign(host.style,{left:left+'px',right:right+'px',top:top+'px',bottom:bottom+'px'});
    const resolved=paneLayout.resolve(innerWidth-left-right,innerHeight-top-bottom,preference);mode=resolved.mode;host.dataset.mode=mode;
    frames.forEach((frame,index)=>{frame.hidden=mode==='single'&&index!==active;});divider.hidden=mode==='single';layoutButton.hidden=false;
    if(mode!=='single'&&frames.length===1)addFrame('second');
    // A separating physical hinge becomes the divider, not covered content.
    host.style.removeProperty('--first-size');host.style.setProperty('--divider-size','12px');
    if(hinge?.separating&&((mode==='columns'&&hinge.orientation==='vertical')||(mode==='rows'&&hinge.orientation==='horizontal'))){
      const vertical=mode==='columns',viewport=vertical?innerWidth:innerHeight,offset=vertical?left:top,length=viewport-offset-(vertical?right:bottom),b=hinge.bounds,start=(vertical?b.left:b.top)*viewport-offset,end=(vertical?b.right:b.bottom)*viewport-offset;
      if(start>= (vertical?480:420)&&length-end>=(vertical?480:420)){host.style.setProperty('--first-size',start+'px');host.style.setProperty('--divider-size',Math.max(12,end-start)+'px');}
    }
    broadcast('rhfiles-panes-changed',{mode});requestAnimationFrame(()=>frames.forEach(frame=>{if(!frame.hidden&&frame.dataset.ready==='true')send(frame,'rhfiles-window-layout',detailFor(frame))}));
    for(const button of chooser.querySelectorAll('[data-layout]')){const option=button.dataset.layout;button.disabled=option in resolved.options&&!resolved.options[option];button.setAttribute('aria-checked',String(option===preference));button.title=button.disabled?'当前可用空间不足':'';}
  }
  function addFrame(pane){
    const frame=document.createElement('iframe');frame.className='file-pane';frame.title=pane==='first'?'第一窗格':'第二窗格';frame.src='index.html?pane='+pane;frames.push(frame);host.append(frame);
    frame.onload=()=>{frame.dataset.ready='true';frame.contentWindow.addEventListener('pointerdown',()=>setActive(frames.indexOf(frame)),true);frame.contentWindow.addEventListener('focusin',()=>setActive(frames.indexOf(frame)));send(frame,'rhfiles-clipboard',getClipboard());send(frame,'rhfiles-pane-task',lock?.label||null);layout();};
    return frame;
  }
  async function boot(){
    if(child()||!api.dualPaneAvailable())return false;
    capabilities=await api.native('capabilities');
    if(capabilities.restoreNavigation)try{const pending=JSON.parse(localStorage.getItem('rhfiles.panes.clipboard')||'null');if(['copy','cut'].includes(pending?.mode)&&Array.isArray(pending.paths)&&pending.paths.length<=1000&&pending.paths.every(path=>typeof path==='string'))clipboard=pending;active=localStorage.getItem('rhfiles.panes.active')==='1'?1:0;}catch{}
    document.body.classList.add('workbench-host');
    document.documentElement.dataset.theme=localStorage.getItem('rhfiles.theme')==='dark'?'dark':'light';
    window.addEventListener('storage',event=>{if(event.key==='rhfiles.theme')document.documentElement.dataset.theme=event.newValue==='dark'?'dark':'light';});
    try{preference=localStorage.getItem('rhfiles.panes')||'auto';if(!['auto','single','columns','rows'].includes(preference))preference='auto';}catch{}
    host=document.createElement('main');host.id='workbench';document.body.append(host);
    divider=document.createElement('div');divider.className='pane-divider';host.append(divider);
    const toggle=document.createElement('button');toggle.className='pane-layout-toggle';toggle.textContent='⋮';toggle.setAttribute('aria-label','切换分屏布局');divider.append(toggle);
    layoutButton=document.createElement('button');layoutButton.className='pane-layout-toggle single-layout-toggle';layoutButton.textContent='分屏';layoutButton.setAttribute('aria-label','分屏布局');host.append(layoutButton);
    chooser=document.createElement('nav');chooser.className='pane-layout-chooser';chooser.setAttribute('aria-label','分屏方向');chooser.hidden=true;host.append(chooser);
    for(const [value,label] of [['auto','自动布局'],['columns','左右分屏'],['rows','上下分屏'],['single','单窗格']]){const button=document.createElement('button');button.dataset.layout=value;button.textContent=label;button.setAttribute('role','menuitemradio');button.onclick=()=>{preference=value;try{localStorage.setItem('rhfiles.panes',value)}catch{}chooser.hidden=true;layout();};chooser.append(button);}
    toggle.onclick=layoutButton.onclick=()=>{chooser.hidden=!chooser.hidden;};
    window.RHFilesWorkbench={
      call(source,kind,command,args){trusted(source);return kind==='native'?api.native(command,args):kind==='asset'?api.assetUrl(command):api.raw(command,args);},
      capabilities(source){trusted(source);return {...capabilities,nativeBack:true};},
      select(source){trusted(source);setActive(indexOf(source));},
      dual(source){trusted(source);return mode!=='single'&&frames.length===2;},
      other(source){trusted(source);return mode!=='single'?peer(source)?.snapshot():null;},
      clipboard(source,value,expected){trusted(source);if(expected!==undefined&&expected!==revision)return false;changedClipboard(value);return true;},
      currentClipboard(source){trusted(source);return getClipboard();},
      acquire(source,label){trusted(source);if(lock)return false;lock={source,label};broadcast('rhfiles-pane-task',label);return true;},
      release(source){trusted(source);if(lock?.source===source){lock=null;broadcast('rhfiles-pane-task',null);broadcast('rhfiles-files-changed');}},
      refreshOther(source){trusted(source);const other=peer(source);other?.refresh();},
      windowLayout(source){trusted(source);return detailFor(frames[indexOf(source)]);},
    };
    addFrame('first');if(active===1)addFrame('second');layout();setActive(active);
    window.rhfilesHandleBack=()=>{if(!chooser.hidden){chooser.hidden=true;return true;}return frames[active]?.contentWindow?.rhfilesHandleBack?.()??true;};
    window.addEventListener('resize',layout);
    window.addEventListener('rhfiles-window-layout',event=>{hinge=event.detail?.hinge||null;insets=event.detail?.insets||{};layout();});
    window.addEventListener('rhfiles-storage-changed',()=>broadcast('rhfiles-storage-changed'));
    api.native('window.layout').then(value=>{hinge=value.hinge;insets=value.insets||{};layout();}).catch(()=>{});
    return true;
  }
  return {boot,child,primary,id,parentHost};
})();
