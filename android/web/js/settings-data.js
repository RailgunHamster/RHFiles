(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.settingsData=value;})(globalThis,()=>{
  const keys=['rhfiles.theme','rhfiles.view','rhfiles.sort','rhfiles.hidden','rhfiles.favorites','rhfiles.panes','rhfiles.panes.screens','rhfiles.nearby.alias'];
  const enums={'rhfiles.theme':['light','dark'],'rhfiles.view':['list','grid'],'rhfiles.sort':['name','date','size','kind'],'rhfiles.hidden':['0','1'],'rhfiles.panes':['auto','single','columns','rows']};
  function validate(value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('配置内容无效');
    const result={};
    for(const [key,text] of Object.entries(value)){
      if(!keys.includes(key)||typeof text!=='string'||text.length>65536)throw Error('配置包含无效字段');
      if(enums[key]&&!enums[key].includes(text))throw Error('配置选项无效');
      if(key==='rhfiles.panes.screens'){
        const value=JSON.parse(text),modes=['auto','single','columns','rows'];
        if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||Object.keys(value).length!==2||!value.screens||typeof value.screens!=='object'||Array.isArray(value.screens)||Object.keys(value.screens).length>32||Object.entries(value.screens).some(([key,mode])=>!/^(default|screen-[1-9][0-9]{1,4}x[1-9][0-9]{1,4})$/.test(key)||!modes.includes(mode)))throw Error('屏幕分屏配置无效');
      }
      if(key==='rhfiles.nearby.alias'&&text.length>80)throw Error('设备名称过长');
      if(key==='rhfiles.favorites'){
        const items=JSON.parse(text);if(!Array.isArray(items)||items.length>100||items.some(i=>!i||typeof i.name!=='string'||typeof i.path!=='string'||i.name.length>1024||i.path.length>8192))throw Error('收藏夹配置无效');
      }
      result[key]=text;
    }
    return result;
  }
  function snapshot(storage){const value={};for(const key of keys){const text=storage.getItem(key);if(text!==null)value[key]=text;}return validate(value);}
  function apply(storage,value){const next=validate(value),before=snapshot(storage);try{
    for(const key of keys)key in next?storage.setItem(key,next[key]):storage.removeItem(key);
  }catch(error){for(const key of keys)try{key in before?storage.setItem(key,before[key]):storage.removeItem(key);}catch{}throw error;}
    for(const key of ['rhfiles.navigation','rhfiles.navigation.second','rhfiles.panes.clipboard','rhfiles.panes.active'])storage.removeItem(key);
  }
  return {keys,validate,snapshot,apply};
});
