/* The picker shares the app's theme packs without loading a second file manager. */
const G={};
const call=(command,args={})=>window.__TAURI__.core.invoke(command,args);
