/* Geometry only: test without a WebView or device-model assumptions. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.paneLayout=value;})(globalThis,()=>{
  function available(){return {columns:true,rows:true};}
  function resolve(width,height,preference='auto'){
    // Geometry is a recommendation for Auto, never a restriction on manual use.
    const columns=width>=972&&height>=420,rows=width>=480&&height>=852;
    const automatic=columns&&rows?(width>=height?'columns':'rows'):columns?'columns':rows?'rows':'single';
    return {options:available(),mode:['single','columns','rows'].includes(preference)?preference:automatic};
  }
  const modes=['auto','single','columns','rows'];
  const validScreen=key=>typeof key==='string'&&/^(default|screen-[1-9][0-9]{1,4}x[1-9][0-9]{1,4})$/.test(key);
  function validateScreens(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||Object.keys(value).length!==2||
       !value.screens||typeof value.screens!=='object'||Array.isArray(value.screens)||Object.keys(value.screens).length>32||
       Object.entries(value.screens).some(([key,mode])=>!validScreen(key)||!modes.includes(mode)))throw Error('屏幕分屏配置无效');
    return value;
  }
  function screenMemory(text,legacy='auto'){
    let value;try{value=validateScreens(JSON.parse(text));}catch{value={version:1,screens:{}};}
    // The old global choice belongs ONLY to the first screen seen after upgrade.
    // A newly encountered screen uses Auto, never the other screen's choice.
    let migrated=Object.keys(value.screens).length>0;
    function put(key,mode){
      if(!validScreen(key)||!modes.includes(mode))throw Error('屏幕分屏配置无效');
      if(!(key in value.screens)&&Object.keys(value.screens).length===32)delete value.screens[Object.keys(value.screens)[0]];
      value.screens[key]=mode;
    }
    return {
      select(key){key=validScreen(key)?key:'default';if(!migrated){put(key,modes.includes(legacy)?legacy:'auto');migrated=true;}return value.screens[key]||'auto';},
      set(key,mode){put(key,mode);migrated=true;},
      serialize:()=>JSON.stringify(value),
    };
  }
  return {available,resolve,validScreen,validateScreens,screenMemory};
});
