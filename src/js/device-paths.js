/* Stable identity paths: addresses and credentials never enter tab/favorite URLs. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.RHFilesDevicePaths=value;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const prefix='rhfiles-device://',identity=/^[a-f0-9]{64}$/i;
  const is=value=>/^rhfiles-device:/i.test(String(value||''));
  function name(value){
    if(typeof value!=='string'||!value||value.length>240||value==='.'||value==='..'||/[\\/:*?"<>|\u0000-\u001f\u007f]/.test(value)||/[. ]$/.test(value)||/^\.rhfiles-service-/i.test(value)||/^lan-service-v1$/i.test(value)||/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(value))throw Error('[invalid_path] Invalid shared-file name');
    return value;
  }
  function make(group,peer,path='/'){
    if(!identity.test(group)||!identity.test(peer)||typeof path!=='string'||!path.startsWith('/')||path.includes('//')||path.length>8192)throw Error('[invalid_path] Invalid device path');
    const parts=path==='/'?[]:path.replace(/\/$/,'').slice(1).split('/').map(name);
    return prefix+group.toLowerCase()+'/'+peer.toLowerCase()+'/'+parts.map(encodeURIComponent).join('/');
  }
  function parse(value){
    const match=/^rhfiles-device:\/\/([a-f0-9]{64})\/([a-f0-9]{64})(\/[^?#]*)?$/i.exec(String(value||''));
    if(!match)throw Error('[invalid_path] Invalid device URI');
    if((match[3]||'').includes('//'))throw Error('[invalid_path] Empty device path segment');
    const parts=(match[3]||'/').replace(/\/$/,'').slice(1).split('/').filter((v,i,a)=>!(a.length===1&&v==='')).map(v=>name(decodeURIComponent(v)));
    const path='/'+parts.join('/'),group=match[1].toLowerCase(),peer=match[2].toLowerCase();
    return {group,peer,path,parts,uri:make(group,peer,path)};
  }
  const parent=value=>{const p=parse(value);p.parts.pop();return make(p.group,p.peer,'/'+p.parts.join('/'));};
  const join=(value,child)=>{const p=parse(value);return make(p.group,p.peer,(p.path==='/'?'':p.path)+'/'+name(child));};
  // Human-facing addresses are resolved locally, never handed to the shell,
  // DNS or SMB. Persist the resolved identity URI, not these mutable names.
  const isAddress=value=>/^rh:/i.test(String(value||'').trim());
  const invalidAddress=()=>{throw Error('[invalid_device_address] Expected rh://device/share/path or rh://group@device/share/path');};
  function label(value){
    if(typeof value!=='string'||!value.trim()||value.length>1024||/[\u0000-\u001f\u007f]/.test(value))invalidAddress();
    // Also reject unpaired surrogates, which cannot be represented in a URI.
    try{encodeURIComponent(value);}catch{invalidAddress();}return value;
  }
  const escapeLabel=value=>label(value).replace(/[%@/\\?#]/g,encodeURIComponent);
  const fold=value=>String(value).normalize('NFC').toLowerCase();
  function address(device,path='/',group){
    // Reuse exactly the filesystem's segment validation, without URL dot
    // normalization. Unicode/spaces stay legible; reserved characters escape.
    const parts=parse(make('0'.repeat(64),'0'.repeat(64),path)).parts;
    return 'rh://'+(group===undefined?'':escapeLabel(group)+'@')+escapeLabel(device)+'/'+parts.map(escapeLabel).join('/');
  }
  function parseAddress(value){
    const raw=String(value||'').trim();if(raw.length>27000)invalidAddress();
    const match=/^rh:\/\/([^/\\?#]+)((?:[/\\][^?#]*)?)$/i.exec(raw);if(!match)invalidAddress();
    const labels=match[1].split('@');if(labels.length>2)invalidAddress();
    let names,parts,windowsDrive=null;
    try{
      names=labels.map(v=>label(decodeURIComponent(v)));
      let tail=(match[2]||'/').replace(/\\/g,'/');
      const unquoted=/^\/"([A-Za-z]:[^"]*)"$/.exec(tail);
      if(unquoted)tail='/'+unquoted[1];
      const driveMatch=/^\/([A-Za-z]):(?=\/|$)(.*)$/.exec(tail);
      if(driveMatch){
        windowsDrive=driveMatch[1].toUpperCase();
        tail='/'+windowsDrive+(driveMatch[2]||'');
      }
      if(tail.includes('//'))invalidAddress();
      parts=tail.replace(/\/$/,'').slice(1).split('/').filter((v,i,a)=>!(a.length===1&&v==='')).map(v=>{
        let decoded;
        try{decoded=decodeURIComponent(v);}catch(e){if(!windowsDrive)throw e;decoded=v;}
        return name(decoded);
      });
    }catch{invalidAddress();}
    const path='/'+parts.join('/');if(path.length>8192)invalidAddress();
    return {device:names.at(-1),group:names.length===2?names[0]:null,path,...(windowsDrive?{windowsDrive}:{})};
  }
  function resolveAddress(value,peers){
    const parsed=parseAddress(value);
    let matches=peers.filter(p=>fold(p.name)===fold(parsed.device)&&(parsed.group===null||fold(p.groupName)===fold(parsed.group)));
    if(!matches.length)matches=peers.filter(p=>p.rawName&&fold(p.rawName)===fold(parsed.device)&&(parsed.group===null||fold(p.groupName)===fold(parsed.group)));
    const unique=[...new Map(matches.map(p=>[p.group+'/'+p.peer,p])).values()];
    if(unique.length!==1){
      const error=Error(unique.length?'[ambiguous_device] Device name is not unique':'[device_not_found] No accepted file service with this name');
      error.code=unique.length?'ambiguous_device':'device_not_found';
      error.candidates=unique.map(p=>({group:p.group,peer:p.peer,name:p.name,nameRaw:p.rawName,groupName:p.groupName}));throw error;
    }
    const peer=unique[0];return {path:make(peer.group,peer.peer,parsed.path),group:peer.group,peer:peer.peer,...(parsed.windowsDrive?{windowsDrive:parsed.windowsDrive}:{})};
  }
  function addressFor(value,peers,{strict=false}={}){
    const parsed=parse(value),peer=peers.find(p=>p.group===parsed.group&&p.peer===parsed.peer);
    if(!peer){
      if(strict){const error=Error('[device_not_found] No accepted file service for this identity');error.code='device_not_found';throw error;}
      return parsed.uri;
    }
    for(const group of [undefined,peer.groupName]){
      const candidate=address(peer.name,parsed.path,group);
      try{if(resolveAddress(candidate,peers).path===parsed.uri)return candidate;}catch{}
    }
    if(strict){const error=Error('[ambiguous_device] Group and device names are not unique');error.code='ambiguous_device';throw error;}
    return parsed.uri; // Even duplicate group names must not pick a device.
  }
  return Object.freeze({prefix,is,make,parse,parent,join,name,isAddress,address,parseAddress,resolveAddress,addressFor});
});
