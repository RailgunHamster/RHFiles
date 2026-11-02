// Two independent, reversible current-user integrations, not an Explorer shell
// replacement. The native recovery launcher owns the registration journal.
const shellDefaults=(()=>{
  let host,state,busy=false;
  const text=(zh,en)=>String(_lang||'').startsWith('zh')?zh:en;
  async function refresh(){state=await call('shell_defaults_state',{});paint();return state;}
  function paint(){
    if(!host||!state)return;
    for(const key of ['folders','winE','newWindow']){const el=host.querySelector('[name="'+key+'"]');el.checked=!!state[key];el.disabled=busy||!state.supported;}
    host.querySelector('[role="status"]').textContent=state.error||state.warnings?.join('\n')||((state.folders||state.winE)&&!state.targetExists?text('原程序位置已失效，点击修复更新当前路径。','The executable moved; repair the registered path.'):'');
  }
  async function save(options){
    if(busy)throw Error(text('正在保存，请稍候','Saving; wait a moment'));busy=true;paint();
    try{state=await call('shell_defaults_save',options);return state;}
    catch(error){state={...state,error:String(error)};throw error;}
    finally{busy=false;paint();}
  }
  function mount(element){
    host=element;if(!host||IS_MAC)return;
    host.innerHTML='<div class="settings-card"><div class="settings-card-title">'+text('默认文件管理器','Default file manager')+'</div>'+[
      ['winE',text('Win+E 打开 RHFiles','Win+E opens RHFiles')],['folders',text('普通文件夹和磁盘默认用 RHFiles 打开','Open regular folders and drives with RHFiles')],['newWindow',text('从系统打开时使用新窗口（关闭则新标签页）','Open system requests in a new window (otherwise a new tab)')]
    ].map(([key,label])=>'<div class="settings-row"><label for="shell-default-'+key+'">'+label+'</label><input id="shell-default-'+key+'" name="'+key+'" type="checkbox" data-api-action="shell.defaults.save"></div>').join('')+
      '<p class="settings-card-description">'+text('仅当前 Windows 用户。Win+E 使用轻量登录启动进程；不替换 explorer.exe，不影响桌面、任务栏或打开/保存对话框。虚拟目录仍由 Windows 处理。右键文件夹可选“用 Windows 资源管理器打开”。关闭开关会恢复原注册项；其他软件后来的修改会保留。','Current Windows user only. Win+E uses a lightweight sign-in helper. Does not replace explorer.exe, the desktop, taskbar, file dialogs or virtual folders. A folder context action bypasses RHFiles. Disabling restores original registrations, preserving subsequent changes by other apps.')+'</p><p class="settings-card-description" role="status" style="white-space:pre-line"></p><button type="button" class="dialog-btn" data-api-action="shell.defaults.repair">'+text('修复程序路径','Repair registered path')+'</button></div>';
    for(const input of host.querySelectorAll('input'))RHFilesUI.listen(input,'change',()=>save(Object.fromEntries(['folders','winE','newWindow'].map(key=>[key,host.querySelector('[name="'+key+'"]').checked]))).catch(()=>{}),undefined,'shell.defaults.change.'+input.name);
    RHFilesUI.listen(host.querySelector('button'),'click',()=>window.RHFilesAPI.invoke('shell.defaults.repair').catch(()=>{}),undefined,'shell.defaults.repair');
    refresh().catch(error=>{host.querySelector('[role="status"]').textContent=String(error);});
  }
  async function openRequest(p){
    if(!p?.path)return {opened:false};
    const path=p.path,existing=G.tabs.find(tab=>windowsPathKey(tab.path)===windowsPathKey(path));
    if(existing){switchTab(existing.id);return {opened:true,tab:existing.id};}
    addTab(path,false);await navigateAddressInput(path,false);return {opened:true};
  }
  const api=window.RHFilesAPI,object=properties=>({type:'object',properties,additionalProperties:false}),boolean={type:'boolean'};
  api.register('shell.defaults.state',refresh,{params:object({}),risk:'read'});
  api.register('shell.defaults.save',save,{params:{...object({folders:boolean,winE:boolean,newWindow:boolean}),required:['folders','winE','newWindow']},risk:'external',description:'Reversible per-user folder verbs and independent Win+E helper; never replaces Explorer desktop/taskbar or Open/Save dialogs.'});
  api.register('shell.defaults.repair',async()=>{const s=await refresh();return save({folders:s.folders,winE:s.winE,newWindow:s.newWindow});},{params:object({}),risk:'external'});
  return {mount,openRequest};
})();
