import assert from 'node:assert/strict';
// Third-party JNI can advertise an ABI without the application's Rust runtime.
// Refuse that package before installation; never remove ABI checks to admit it.
export function androidApkRuntimes(entries){
 assert(Array.isArray(entries)&&entries.length<=100000&&entries.every(v=>typeof v==='string'),'Expected a bounded APK entry list');
 const abis=[...new Set(entries.filter(v=>v.startsWith('lib/')).map(v=>v.split('/')[1]))];
 assert(abis.length>0,'Release APK has no native libraries');
 for(const abi of abis){
  assert(['arm64-v8a','armeabi-v7a','x86','x86_64'].includes(abi),'Unsupported APK ABI');
  assert(entries.includes('lib/'+abi+'/librhfiles_android_lib.so'),'Missing RHFiles runtime for '+abi+'; use the same ABI filters as the completed Rust build');
 }
 return abis;
}
