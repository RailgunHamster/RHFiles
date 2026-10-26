// Opens a packaged RHFiles view, not a URL or an embedded RHVideo website.
(() => {
  const api=window.RHFilesAPI;
  api.register('rhvideo.open',()=>call('rhvideo_open',{}),{description:'Open the built-in RHVideo client',params:{type:'object',properties:{},additionalProperties:false}});
  const sidebar=document.getElementById('sidebar');
  if(!sidebar)return;
  const section=document.createElement('div');section.className='sidebar-section';
  const button=document.createElement('button');button.id='rhvideo-open';button.className='sidebar-item';button.style.cssText='width:100%;border:0;background:transparent;font:inherit;text-align:left;color:inherit;cursor:pointer';
  button.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="m10 8 6 4-6 4z"/></svg><span>RHVideo</span>';
  RHFilesUI.listen(button,'click',()=>api.invoke('rhvideo.open').catch(error=>showNotice(String(error))),undefined,'rhvideo.entry.open');
  section.append(button);const first=sidebar.querySelector('.sidebar-section');if(first)first.after(section);else sidebar.prepend(section);
})();
