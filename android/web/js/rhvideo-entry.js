(() => {
  'use strict';
  window.RHFilesAPI.register('rhvideo.open',({shared=false}={})=>api.native('rhvideo.open',{shared}),{params:{type:'object',properties:{shared:{type:'boolean'}},additionalProperties:false},risk:'ui',description:'打开 RHVideo 媒体库（可选择共享前端预览）'});
  RHFilesUI.listen(document.getElementById('nav-rhvideo'),'click',()=>{
    ui.setDrawerOpen(false);
    window.RHFilesAPI.invoke('rhvideo.open').catch(error=>ui.toast(String(error)));
  },undefined,'rhvideo.entry.open');
})();
