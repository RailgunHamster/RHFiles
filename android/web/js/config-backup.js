const configBackup=(()=>{
  async function boot(){
    if(workbench.child()||!api.backupAvailable())return;
    const pending=await api.native('config.pending');if(!pending)return;
    try{settingsData.apply(localStorage,pending.web);await api.native('config.ack',{id:pending.id});}
    catch(error){await api.native('config.rollback');const before=await api.native('config.pending');if(before){settingsData.apply(localStorage,before.web);await api.native('config.ack',{id:before.id});}ui.toast('配置导入未完成，已恢复原配置：'+error.message,5000);}
  }
  function init(error){
    const panel=document.querySelector('[data-settings-panel=backup]');panel.hidden=true;
    document.querySelector('[data-settings-section=backup]').hidden=!api.backupAvailable();
    for(const kind of ['export','import'])document.getElementById('btn-config-'+kind).addEventListener('click',async()=>{
      const buttons=[...panel.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
      try{
        const result=await api.native('config.'+kind+'.pick',{web:settingsData.snapshot(localStorage)});
        if(result?.applied){(window.parent!==window?window.parent:window).location.reload();return;}
        ui.toast(result?.saved?'配置已加密导出':'已取消');
      }catch(e){error(e);}finally{buttons.forEach(b=>b.disabled=false);}
    });
  }
  return {boot,init};
})();
