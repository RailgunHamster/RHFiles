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
  const orientations=['portrait','landscape'];
  const validOrientation=value=>orientations.includes(value);
  const validScreen=key=>typeof key==='string'&&/^(default|screen-[1-9][0-9]{1,4}x[1-9][0-9]{1,4})$/.test(key);
  function validateScreens(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||![1,2].includes(value.version)||Object.keys(value).length!==2||
       !value.screens||typeof value.screens!=='object'||Array.isArray(value.screens)||Object.keys(value.screens).length>32||
       Object.entries(value.screens).some(([key,profile])=>!validScreen(key)||(value.version===1?!modes.includes(profile):
         !profile||typeof profile!=='object'||Array.isArray(profile)||Object.keys(profile).length<1||Object.keys(profile).length>2||
         Object.entries(profile).some(([orientation,mode])=>!validOrientation(orientation)||!modes.includes(mode)))))throw Error('屏幕分屏配置无效');
    return value;
  }
  function screenMemory(text,legacy='auto'){
    let value;try{value=validateScreens(JSON.parse(text));}catch{value={version:2,screens:{}};}
    // Old per-screen choices initialize BOTH directions without losing a choice.
    // Once migrated, changing either direction never writes the other one.
    if(value.version===1)value={version:2,screens:Object.fromEntries(Object.entries(value.screens).map(([key,mode])=>[key,{portrait:mode,landscape:mode}]))};
    // The old global choice belongs ONLY to the first screen seen after upgrade.
    // A newly encountered screen uses Auto, never the other screen's choice.
    let migrated=Object.keys(value.screens).length>0;
    function put(key,mode,orientation){
      if(!validScreen(key)||!modes.includes(mode)||!validOrientation(orientation))throw Error('屏幕分屏配置无效');
      if(!(key in value.screens)&&Object.keys(value.screens).length===32)delete value.screens[Object.keys(value.screens)[0]];
      (value.screens[key]||={})[orientation]=mode;
    }
    return {
      select(key,orientation='portrait'){
        key=validScreen(key)?key:'default';orientation=validOrientation(orientation)?orientation:'portrait';
        if(!migrated){for(const direction of orientations)put(key,modes.includes(legacy)?legacy:'auto',direction);migrated=true;}
        return value.screens[key]?.[orientation]||'auto';
      },
      set(key,mode,orientation='portrait'){put(key,mode,orientation);migrated=true;},
      serialize:()=>JSON.stringify(value),
    };
  }
  return {available,resolve,validScreen,validOrientation,validateScreens,screenMemory};
});
