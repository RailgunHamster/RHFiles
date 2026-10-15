let nearbyDialogController;
async function openNearby(){
  document.getElementById('nearby-dialog')?.remove();nearbyDialogController?.destroy();
  const overlay=document.createElement('div');overlay.id='nearby-dialog';overlay.className='overlay';overlay.style.display='flex';
  const backdrop=document.createElement('div');backdrop.className='dialog-backdrop';const box=document.createElement('div');box.className='dialog-box dialog-wide';box.setAttribute('role','dialog');box.setAttribute('aria-label','Nearby Transfer');
  const content=document.createElement('div');content.className='dialog-scroll';content.style.cssText='padding:20px;max-height:75vh;overflow:auto';
  const close=document.createElement('button');close.className='dialog-btn';close.textContent=String(_lang||'').startsWith('zh')?'关闭（互传继续在后台运行）':'Close (transfers continue in background)';const dismiss=()=>{nearbyDialogController?.destroy();nearbyDialogController=null;overlay.remove()};close.onclick=backdrop.onclick=dismiss;
  const row=document.createElement('div');row.className='dialog-actions';row.append(close);box.append(content,row);overlay.append(backdrop,box);document.body.append(overlay);
  overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!nearbyDialogController?.back())dismiss();}},true);
  const folder=(G.dualOn&&G.lastActivePane==='right'?G.rp:getTab())?.path||'';let destination='';try{destination=(await call('get_known_folders',{})).downloads||''}catch{}
  const paths=getSelectedPaths().map(entry=>entry.path).filter(path=>!path.includes('://')&&!path.startsWith('\\\\'));
  if(!overlay.isConnected)return;
  nearbyDialogController=nearbyView.mount(content,{call,lang:String(_lang||'en'),paths,folder:folder&&!folder.includes('://')&&!folder.startsWith('\\\\')?folder:null,destination,defaultAlias:String(_lang||'').startsWith('zh')?'我的电脑':'My computer',formatSize:typeof formatSize==='function'?formatSize:undefined,open:path=>{dismiss();navigateTo(path);}});
}
