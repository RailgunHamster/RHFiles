(() => {
  'use strict';
  window.RHFilesAPI.register('rhvideo.open',()=>api.native('rhvideo.open'),{params:{type:'object',properties:{},additionalProperties:false},risk:'ui',description:'打开 RHVideo 媒体库'});
  RHFilesUI.listen(document.getElementById('nav-rhvideo'),'click',()=>{
    ui.setDrawerOpen(false);
    window.RHFilesAPI.invoke('rhvideo.open').catch(error=>ui.toast(String(error)));
  },undefined,'rhvideo.entry.open');
})();
