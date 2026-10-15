// Window size is live, not a device-model check: works in multi-window too.
const adaptive=(()=>{
  let hinge,prepare=()=>{};
  function apply(){
    const scaled=hinge?{...hinge,bounds:{left:hinge.bounds.left*innerWidth,right:hinge.bounds.right*innerWidth,top:hinge.bounds.top*innerHeight,bottom:hinge.bounds.bottom*innerHeight}}:null;
    const box=mobileList.layout(innerWidth,innerHeight,scaled),style=document.documentElement.style;
    style.setProperty('--app-left',box.left+'px');style.setProperty('--app-top',box.top+'px');style.setProperty('--app-width',box.width+'px');style.setProperty('--app-height',box.height+'px');style.setProperty('--rail-width',box.railWidth+'px');
    const wasWide=document.body.classList.contains('wide-layout');document.body.classList.toggle('wide-layout',box.rail>0);
    if(box.rail){prepare();ui.setDrawerOpen(true);}else if(wasWide)ui.setDrawerOpen(false);
  }
  function init(renderDrawer){prepare=renderDrawer;window.addEventListener('resize',apply);window.addEventListener('rhfiles-window-layout',event=>{hinge=event.detail?.hinge;apply();});apply();
    if(api.adaptiveAvailable())api.native('window.layout').then(info=>{hinge=info.hinge;apply();}).catch(()=>{});
  }
  return {init,apply};
})();
