// Private reference integration is run locally; public CI must report why it
// cannot run it, not request personal credentials or pretend fixture parity.
import fs from 'node:fs';
import path from 'node:path';
export const rhvideoReferenceSource=path.resolve(process.env.RHVIDEO_SOURCE||'../RHVideo');
export function rhvideoReferenceSkip(files=['app/main.py']){
  const missing=files.filter(file=>!fs.existsSync(path.join(rhvideoReferenceSource,file)));
  if(!missing.length)return false;
  if(process.env.RHVIDEO_SOURCE)throw Error('Explicit RHVIDEO_SOURCE lacks reference files: '+missing.join(', '));
  return 'Private RHVideo reference is unavailable; run locally with RHVIDEO_SOURCE (generated data only)';
}
