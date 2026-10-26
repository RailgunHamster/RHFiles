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
  return Object.freeze({prefix,is,make,parse,parent,join,name});
});
