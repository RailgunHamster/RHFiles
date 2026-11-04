// Private reference integration is run locally; public CI must report why it
// cannot run it, not request personal credentials or pretend fixture parity.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
export const rhvideoReferenceSource=path.resolve(process.env.RHVIDEO_SOURCE||'../RHVideo');
// Differential tests read the canonical source, whether it is still inline or
// has been mechanically extracted into ordinary script/style modules.
export function rhvideoReferenceDocument(file){
  let html=fs.readFileSync(file,'utf8');
  for(const [name,tag]of [['app.css','style'],['app.js','script']]){
    const module=path.join(path.dirname(file),name);
    if(fs.existsSync(module))html+='\n<'+tag+'>\n'+fs.readFileSync(module,'utf8')+'\n</'+tag+'>';
  }
  return html;
}
export function rhvideoReferenceContext(values={}){
  const scope=vm.createContext(values);
  // The web adapter is deliberately an identity media mapper. Native adapters
  // are covered by separate real-host tests, not substituted in differentials.
  scope.RHVideoHost={native:false,asset:value=>value,get storage(){return scope.localStorage;}};
  return scope;
}
export function rhvideoReferenceSkip(files=['app/main.py']){
  const missing=files.filter(file=>!fs.existsSync(path.join(rhvideoReferenceSource,file)));
  if(!missing.length)return false;
  if(process.env.RHVIDEO_SOURCE)throw Error('Explicit RHVIDEO_SOURCE lacks reference files: '+missing.join(', '));
  return 'Private RHVideo reference is unavailable; run locally with RHVIDEO_SOURCE (generated data only)';
}
