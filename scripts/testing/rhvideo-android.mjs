// Run only against the owned emulator and the actual minified release APK.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {rhvideoFixture as contractFixture} from './rhvideo-fixture.mjs';
import {realRhVideoService} from './rhvideo-real-service.mjs';
const serial=process.argv[2]||'emulator-5584',apk=process.argv[3],probe=process.argv[4];
const gridRestoreMode=process.argv[5]==='grid-restore';
const gridRotationMode=process.argv[5]==='grid-rotation';
const gridMode=process.argv[5]==='grid'||gridRestoreMode||gridRotationMode;
const playlistMode=process.argv[5]==='playlist';
const previewMode=process.argv[5]==='preview';
const singleMode=process.argv[5]==='single';
const rulesMode=process.argv[5]==='rules';
const favoritesMode=process.argv[5]==='favorites';
const stripMode=process.argv[5]==='strip';
const ticketsMode=process.argv[5]==='tickets';
const rotationMode=process.argv[5]==='rotation';
const exportsMode=process.argv[5]==='exports';
const loginMode=process.argv[5]==='login',actualMode=exportsMode||loginMode;
const rhvideoFixture=options=>actualMode?realRhVideoService({directory:path.join(temporary,'actual-rhvideo'),video:options.videoFile}):contractFixture({...options,...(rulesMode?{videoCount:240,videoFolders:Array.from({length:240},(_,i)=>i===0?'风景,旅行':i===1?'风景,城市':i===2?'城市':'目录'+String(i).padStart(3,'0'))}:{})});
const mediaMode=gridMode||playlistMode||previewMode||singleMode||rotationMode||favoritesMode||stripMode;
function verifyContractTraffic(fixture,{actualMode,rulesMode,mediaMode,ticketsMode,stripMode}){
  if(actualMode)return;
  const authorized=r=>r.authorization==='Bearer fixture-bearer-do-not-persist';
  if(rulesMode){
    for(const endpoint of ['/api/v1/videos','/api/v1/pictures/catalog','/api/v1/screenshots/grid'])assert(fixture.requests.some(r=>r.method==='GET'&&r.path===endpoint&&authorized(r)),'Tag editing must read the authenticated actual catalog: '+endpoint);
    assert.equal(fixture.requests.filter(r=>r.method!=='GET'&&!(r.method==='POST'&&r.path==='/api/v1/auth/login')).length,0,'Local tag editing cannot modify server media');
  }else{
    assert(fixture.requests.some(r=>(stripMode?r.path.startsWith('/storage/pictures/'):r.path.endsWith('/play'))&&authorized(r)),'The media scenario must actually request authenticated media');
    if(!mediaMode&&!ticketsMode){assert(fixture.progress.length>0,'Reader progress reached server');assert(fixture.favorites.has('picture:picture-0'),'Favorite reached server');}
  }
}
assert.match(serial,/^emulator-\d+$/);assert(apk&&probe,'Provide release APK and instrumentation APK');
const sdk=process.env.ANDROID_SDK_ROOT||process.env.ANDROID_HOME||path.join(process.env.LOCALAPPDATA,'Android/Sdk');
const adb=path.join(sdk,'platform-tools/adb.exe');
const sevenZip=path.resolve('src-tauri/thirdparty/7z.exe');
const aapt=fs.readdirSync(path.join(sdk,'build-tools')).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).map(v=>path.join(sdk,'build-tools',v,'aapt.exe')).find(v=>fs.existsSync(v));
assert(aapt,'Android aapt is required to validate the native runtime');
const apkEntries=execFileSync(aapt,['list',path.resolve(apk)],{encoding:'utf8',windowsHide:true}).split(/\r?\n/),abis=new Set(apkEntries.filter(v=>v.startsWith('lib/')).map(v=>v.split('/')[1]));
assert(abis.size>0,'Release APK has no native libraries');
for(const abi of abis)assert(apkEntries.includes('lib/'+abi+'/librhfiles_android_lib.so'),'Missing RHFiles runtime for '+abi+'; use the same ABI filters as the completed Rust build');
for(const relative of ['rhvideo.html','css/rhvideo.css','css/rhvideo-workbench.css','js/automation-core.js','js/rhvideo-model.js','js/rhvideo-tags.js','js/rhvideo-rules-model.js','js/rhvideo-rules.js','js/rhvideo-client.js','js/rhvideo-configuration.js','js/rhvideo-exports.js','js/rhvideo-workbench.js','js/rhvideo-index.js','js/rhvideo-worker.js','js/rhvideo-refresh.js','rhvideo-operations.json']){
  const packaged=execFileSync(sevenZip,['e','-so',path.resolve(apk),'assets/rhvideo/'+relative],{windowsHide:true,maxBuffer:8*1024*1024});
  const expected=fs.readFileSync(path.resolve('src',relative));
  assert.equal(createHash('sha256').update(packaged).digest('hex'),createHash('sha256').update(expected).digest('hex'),'APK must include the current '+relative);
}
for(const relative of ['js/rhvideo-mobile.js','css/rhvideo-mobile.css']){
  const packaged=execFileSync(sevenZip,['e','-so',path.resolve(apk),'assets/rhvideo/'+relative],{windowsHide:true,maxBuffer:8*1024*1024});
  assert.equal(createHash('sha256').update(packaged).digest('hex'),createHash('sha256').update(fs.readFileSync(path.resolve('android/web',relative))).digest('hex'),'APK must include current mobile '+relative);
}
const run=(args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:120000});
assert.equal(run(['shell','getprop','ro.kernel.qemu']).trim(),'1','Physical devices are not allowed');
assert(run(['emu','avd','name']).split(/\r?\n/).map(v=>v.trim()).includes('RHFilesRhVideoQA20261027'),'Only the owned RHVideo QA AVD is allowed');
const bootDeadline=Date.now()+180000;
while(true){
  let ready=false;try{ready=run(['shell','getprop','sys.boot_completed']).trim()==='1'&&run(['shell','pm','path','android']).includes('package:');}catch{}
  if(ready)break;
  assert(Date.now()<bootDeadline,'Owned emulator did not finish boot/package-manager initialization');
  await new Promise(resolve=>setTimeout(resolve,1000));
}
assert.doesNotMatch(run(['shell','dumpsys','window','windows']),/Application Not Responding:|Application Error:/,'Resolve emulator system/app error dialogs before visual acceptance');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-rhvideo-android-'));
const video=path.join(temporary,'sample.mp4');
const make=(file,size)=>execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-filter_threads','1','-f','lavfi','-i','testsrc2=size='+size+':rate=24','-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000',...(rotationMode||gridRotationMode?['-vf','drawbox=x=20:y=20:w=60:h=60:color=0xff0000:t=fill,drawbox=x=iw-80:y=20:w=60:h=60:color=0x00ff00:t=fill,drawbox=x=20:y=ih-80:w=60:h=60:color=0x0000ff:t=fill,drawbox=x=iw-80:y=ih-80:w=60:h=60:color=0xffff00:t=fill']:[]),'-t','20','-c:v','libx264','-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-movflags','+faststart',file],{windowsHide:true,timeout:30000});
make(video,'640x360');const portrait=path.join(temporary,'portrait.mp4');if(mediaMode)make(portrait,'360x640');
const singleImage=(singleMode||favoritesMode||stripMode)?execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:size=800x500:rate=1','-vf','drawbox=x=0:y=0:w=400:h=250:color=0xff0000:t=fill,drawbox=x=400:y=0:w=400:h=250:color=0x00ff00:t=fill,drawbox=x=0:y=250:w=400:h=250:color=0x0000ff:t=fill,drawbox=x=400:y=250:w=400:h=250:color=0xffff00:t=fill','-frames:v','1','-c:v','png','-threads','1','-f','image2pipe','pipe:1'],{windowsHide:true,timeout:30000}):null;
let releaseGallery;const galleryGate=singleMode?new Promise(resolve=>releaseGallery=resolve):null;
// In the cold-click scenario the first native stream releases the held gallery.
// Waiting for that gallery before starting video would deadlock and fail the
// existing bounded player wait; no arbitrary sleep makes this case look cold.
const fixture=await rhvideoFixture({videoFile:video,chapterCount:83,...(stripMode?{beforeMedia:({image})=>image?{body:singleImage,contentType:'application/octet-stream',splitAt:5}:undefined}:{}),...(favoritesMode?{beforeMedia:({image,path})=>image&&/^\/storage\/pictures\/[01]\.svg$/.test(path)?{body:singleImage,contentType:'application/octet-stream',splitAt:5}:undefined}:{}),...(mediaMode?{galleryVideoCount:6,videoDuration:20,videoFiles:Object.fromEntries([0,1,3].map(i=>['video-'+i,portrait])),videoResolutions:Array.from({length:52},(_,i)=>[0,1,3].includes(i)?'360x640':'640x360')}:{ }),...(previewMode?{failTrashIds:['video:video-2'],failFavoriteIds:['video:video-3']}:{ }),...(gridMode?{failFavoriteIds:['video:video-3']}:{ }),...(singleMode?{videoCount:3,galleryVideoCount:1,galleryFrameCount:1,beforeGallery:()=>galleryGate,beforeMedia:({image,path})=>{if(!image)releaseGallery();if(image&&/^\/storage\/pictures\/[0567]\.svg$/.test(path))return {body:singleImage,contentType:'application/octet-stream',splitAt:5};if(image&&path==='/storage/pictures/owned-error.svg')return {body:Buffer.from('<!DOCTYPE html><html>owned upstream error</html>'),contentType:'image/png'};}}:{}),...(rotationMode?{loginUsers:['preview','other']}:{})}),port=new URL(fixture.url).port;
if(favoritesMode)for(const key of ['video:video-0','video:video-1','picture:picture-0','picture:picture-1','novel:novel-0'])fixture.favorites.add(key);
const failedFixture=gridMode&&!gridRestoreMode&&!gridRotationMode?await rhvideoFixture({videoFile:video,galleryVideoCount:2,beforeMedia:({image})=>image?null:{status:503,detail:'Owned offline stream'}}):null;
const failedPort=failedFixture?new URL(failedFixture.url).port:null;
const artifact=path.resolve('test-artifacts/rhvideo-android'+(rulesMode?'-rules':actualMode?(loginMode?'-login':'-exports'):gridRotationMode?'-grid-rotation':gridRestoreMode?'-grid-restore':gridMode?'-grid':playlistMode?'-playlist':previewMode?'-preview':singleMode?'-single':favoritesMode?'-favorites':stripMode?'-strip':ticketsMode?'-tickets':rotationMode?'-rotation':'')+'-'+Date.now()+'-release');fs.mkdirSync(artifact,{recursive:true});
// This exact generated diagnostic belongs to the already-verified QA emulator.
// A later failed run must never inherit an earlier run's menu screenshot.
if(singleMode||playlistMode)for(const name of ['rhvideo-menu-failure-qa.png','rhvideo-native-touch-failure-qa.png','rhvideo-failure-qa.png'])run(['shell','rm','-f','/sdcard/Android/data/com.railgunhamster.rhfiles/files/'+name]);
function installExact(packageId,file){
  const expectedHash=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const installedHash=()=>{const installed=run(['shell','pm','path',packageId]).trim().split(/\r?\n/);assert(installed.length===1&&/^package:\/data\/app\/[A-Za-z0-9_~+=./-]+\/base\.apk$/.test(installed[0]),'Expected one installed universal APK for '+packageId);return run(['shell','sha256sum',installed[0].slice(8)]).slice(0,64);};
  let matches=false;
  try{
    const installed=run(['shell','pm','path',packageId]).trim().split(/\r?\n/);
    if(installed.length===1&&/^package:\/data\/app\/[A-Za-z0-9_~+=./-]+\/base\.apk$/.test(installed[0])){
      const remote=run(['shell','sha256sum',installed[0].slice(8)]).slice(0,64);
      matches=remote===expectedHash;
    }
  }catch{}
  // Push first, then ask PackageManager to install. A streamed-install client
  // can time out after the package is already committed; keep the same bounded
  // deadline and verify actual installed bytes, never blindly retry a mutation.
  console.log(matches?'Installed APK byte-for-byte verified: '+packageId:run(['install','--no-streaming','-r',file]).trim());
  assert.equal(installedHash(),expectedHash,'Installed APK bytes differ after installation: '+packageId);
  console.log(JSON.stringify({verifiedPackage:packageId,sha256:expectedHash}));
}
try{
  installExact('com.railgunhamster.rhfiles',apk);installExact('com.railgunhamster.rhfiles.test',probe);
  run(['shell','appops','set','--uid','com.railgunhamster.rhfiles','MANAGE_EXTERNAL_STORAGE','allow']);
  run(['shell','pm','grant','com.railgunhamster.rhfiles','android.permission.POST_NOTIFICATIONS']);
  // Only this owned emulator: prevent the first-use Android fullscreen coachmark
  // from covering the native-player visual acceptance screenshot.
  run(['shell','settings','put','secure','immersive_mode_confirmations','confirmed']);
  run(['shell','svc','power','stayon','true']);run(['shell','input','keyevent','224']);run(['shell','wm','dismiss-keyguard']);
  run(['reverse','tcp:'+port,'tcp:'+port]);run(['shell','am','force-stop','com.railgunhamster.rhfiles']);
  if(failedPort)run(['reverse','tcp:'+failedPort,'tcp:'+failedPort]);
  async function instrument(modeArgs,log){
    if(rulesMode)modeArgs=['-e','mode','rules'];
  const child=spawn(adb,['-s',serial,'shell','am','instrument','-w','-e','server','http://127.0.0.1:'+port,...modeArgs,'com.railgunhamster.rhfiles.test/com.railgunhamster.rhfiles.RhVideoInstrumentation'],{windowsHide:true});
  let output='';child.stdout.on('data',data=>{output+=data;process.stdout.write(data);});child.stderr.on('data',data=>{output+=data;process.stderr.write(data);});
  // Grid now also checks real held gestures, favorite writes/failures, preview
  // commits and an active-viewer account switch. Budget the expanded scenario,
  // not slower individual frame/seek waits (those stay unchanged in the probe).
  const budgetMs=previewMode||(gridMode&&!gridRestoreMode)?600000:360000;let expired=false;
  const timer=setTimeout(()=>{expired=true;child.kill();},budgetMs);
  try{await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0&&!expired?resolve():reject(Error(expired?'Owned instrumentation exceeded whole-scenario budget '+budgetMs+' ms':'Instrumentation exit '+code)));});}
  finally{clearTimeout(timer);fs.writeFileSync(path.join(artifact,log),output);if(expired)run(['shell','am','force-stop','com.railgunhamster.rhfiles']);}
  assert.doesNotMatch(output,/FAIL:|INSTRUMENTATION_FAILED|keyDispatchingTimedOut|Input dispatching timed out/);return output;
  }
  const output=await instrument(loginMode?['-e','mode','login']:exportsMode?['-e','mode','exports']:gridRotationMode?['-e','mode','grid-rotation']:gridRestoreMode?['-e','mode','grid-restore']:gridMode?['-e','mode','grid','-e','failureServer','http://127.0.0.1:'+failedPort]:playlistMode?['-e','mode','playlist']:previewMode?['-e','mode','preview']:singleMode?['-e','mode','single']:favoritesMode?['-e','mode','favorites']:stripMode?['-e','mode','strip']:ticketsMode?['-e','mode','tickets']:rotationMode?['-e','mode','rotation']:[],'instrumentation.log');
  assert.match(output,rulesMode?/PASS: native tag rules/:loginMode?/PASS: native login phase login/:exportsMode?/PASS: favorite exports recovery armed/:gridMode?/PASS: reference grid/:playlistMode?/PASS: reference playlist/:previewMode?/PASS: reference preview/:singleMode?/PASS: contextual workflow entries and real card selection, reference single/:favoritesMode?/PASS: reference favorite mixed/:stripMode?/PASS: reference strip end/:ticketsMode?/PASS: prepared ticket/:rotationMode?/PASS: reference rotation/:/PASS: native HTTP/);
  async function stopOwnedProcess(){
    run(['shell','am','force-stop','com.railgunhamster.rhfiles']);
    let stoppedPid='',stopDeadline=Date.now()+5000;do{try{stoppedPid=run(['shell','pidof','com.railgunhamster.rhfiles']);}catch(error){assert.equal(error.status,1);stoppedPid=String(error.stdout||'');}if(!stoppedPid.trim())break;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<stopDeadline);assert.equal(stoppedPid.trim(),'','The target process must actually be stopped before recovery');
  }
  if(loginMode){
    await stopOwnedProcess();assert.match(await instrument(['-e','mode','login-recover'],'recovery-instrumentation.log'),/PASS: native login phase login-recover/);
    assert.equal(fixture.requests.filter(r=>r.method==='POST'&&r.path==='/api/v1/auth/login').length,1,'Real process restoration never replays a password login');
    await stopOwnedProcess();const reads=fixture.requests.length;assert.match(await instrument(['-e','mode','login-signedout'],'signedout-instrumentation.log'),/PASS: native login phase login-signedout/);assert.equal(fixture.requests.length,reads,'Logged-out startup cannot contact the old service');
    run(['pull','/sdcard/Android/data/com.railgunhamster.rhfiles/files/rhvideo-login-receipt.json',path.join(artifact,'receipt.json')]);const receipt=JSON.parse(fs.readFileSync(path.join(artifact,'receipt.json'),'utf8'));assert.notEqual(receipt.pid,receipt.restoredPid);assert.equal(receipt.logout,true);assert.equal(receipt.coverPixelsVerified,true,'A decoded image is not proof that native pixels appeared');
  }
  if(exportsMode){
    await stopOwnedProcess();
    const before=fixture.requests.filter(r=>r.path.endsWith('/download')).length;
    const recovered=await instrument(['-e','mode','exports-recover'],'recovery-instrumentation.log');assert.match(recovered,/PASS: favorite exports interrupted recovery/);
    assert.equal(fixture.requests.filter(r=>r.path.endsWith('/download')).length,before,'Process restart must not replay an interrupted ZIP download');
    run(['pull','/sdcard/Android/data/com.railgunhamster.rhfiles/files/rhvideo-export-receipt.json',path.join(artifact,'receipt.json')]);
    run(['pull','/sdcard/Android/data/com.railgunhamster.rhfiles/files/rhvideo-export-qa.zip',path.join(artifact,'saved.zip')]);
    const receipt=JSON.parse(fs.readFileSync(path.join(artifact,'receipt.json'),'utf8')),archive=path.join(fixture.directory,'temp/favorite-exports',receipt.exportId,'favorites.zip'),hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    assert.deepEqual(new Set(receipt.concurrentStates),new Set(['saved','failed']),'Both concurrent saves have terminal outcomes, not just one finished file');
    assert.equal(hash(archive),receipt.sha256);assert.equal(hash(path.join(artifact,'saved.zip')),receipt.sha256);assert.equal(receipt.concurrentHash,receipt.sha256);execFileSync(sevenZip,['t',path.join(artifact,'saved.zip')],{windowsHide:true,stdio:'pipe'});
    const manifest=JSON.parse(execFileSync(sevenZip,['e','-so',archive,'导出清单.json'],{windowsHide:true,encoding:'utf8'}));assert.deepEqual(new Set(manifest.files.map(v=>v.type)),new Set(['video','picture','novel']));assert(manifest.files.every(v=>v.status==='included'&&v.bytes>0));
    assert.equal(fixture.requests.filter(r=>r.method==='POST'&&r.path==='/api/v1/favorite-exports').length,2,'Filtered and all-favorite UI buttons submit exactly once');
    assert.equal(fixture.requests.filter(r=>r.path.startsWith('/api/v1/trash/')).length,0,'Exports never stage or delete a media source');
    for(const [file,expected] of Object.entries(fixture.sourceHashes))assert.equal(hash(path.join(fixture.directory,file)),expected,'Source remains unchanged byte-for-byte: '+file);
  }
  assert.doesNotMatch(run(['shell','dumpsys','window','windows']),/Application Not Responding:|Application Error:/,'A system/app dialog invalidates visual acceptance');
  if(rulesMode)run(['pull','/sdcard/Android/data/com.railgunhamster.rhfiles/files/rhvideo-rules-qa.png',path.join(artifact,'rhvideo-rules-qa.png')]);
  if(!rulesMode)
  for(const name of loginMode?['rhvideo-login-connected-qa.png','rhvideo-login-restored-qa.png','rhvideo-login-signedout-qa.png']:exportsMode?['rhvideo-export-qa.png','rhvideo-export-recovery-qa.png']:gridRotationMode?['rhvideo-grid-rotation-qa.png']:gridRestoreMode?['rhvideo-grid-restore-qa.png']:gridMode?['rhvideo-grid-qa.png','rhvideo-grid-error-qa.png','rhvideo-grid-favorite-error-qa.png']:playlistMode?['rhvideo-playlist-qa.png']:previewMode?['rhvideo-parent-qa.png','rhvideo-preview-result-qa.png','rhvideo-favorite-error-qa.png']:singleMode?['rhvideo-single-qa.png','rhvideo-image-content-qa.png','rhvideo-favorite-slideshow-qa.png']:favoritesMode?['rhvideo-favorite-picture-qa.png','rhvideo-favorite-video-qa.png']:stripMode?['rhvideo-strip-picture-qa.png','rhvideo-strip-rows-qa.png']:ticketsMode?[]:rotationMode?['rhvideo-rotation-on-qa.png','rhvideo-rotation-off-qa.png']:['rhvideo-library-qa.png','rhvideo-player-qa.png','rhvideo-grid-qa.png'])run(['pull','/sdcard/Android/data/com.railgunhamster.rhfiles/files/'+name,path.join(artifact,name)]);
  verifyContractTraffic(fixture,{actualMode,rulesMode,mediaMode,ticketsMode,stripMode});
  if(stripMode){assert.equal(fixture.requests.filter(r=>r.method==='PUT'&&r.path.startsWith('/api/v1/favorites/picture/')).length,1,'One actual strip star -> one write');assert.equal(fixture.requests.filter(r=>r.method==='POST'&&r.path.startsWith('/api/v1/trash/picture/')).length,1,'Closing another strip cannot replay a staged source');}
  if(previewMode){
    for(const id of ['video-0','video-2'])assert.equal(fixture.requests.filter(r=>r.method==='POST'&&r.path==='/api/v1/trash/video/'+id).length,1,'Closing another preview cannot replay '+id);
    assert.equal(fixture.requests.filter(r=>r.method==='POST'&&r.path==='/api/v1/trash/video/video-1').length,0,'Logout discards uncommitted old-account marks');
    assert.equal(fixture.requests.filter(r=>r.method==='PUT'&&r.path==='/api/v1/favorites/video/video-3').length,1,'A failed favorite is not retried');
    assert(fixture.requests.some(r=>r.method==='PUT'&&r.path==='/api/v1/favorites/video/video-0'));
  }
  if(gridMode&&!gridRestoreMode&&!gridRotationMode){
    assert.equal(fixture.requests.filter(r=>r.method==='PUT'&&r.path==='/api/v1/favorites/video/video-0').length,1,'One native favorite button -> one server write');
    assert.equal(fixture.requests.filter(r=>r.method==='DELETE'&&r.path==='/api/v1/favorites/video/video-0').length,1,'Unfavorite uses the same visible control');
    assert.equal(fixture.requests.filter(r=>r.method==='PUT'&&r.path==='/api/v1/favorites/video/video-3').length,1,'A failed grid favorite cannot be retried on close');
    assert.deepEqual(fixture.requests.filter(r=>r.method==='POST'&&r.path.startsWith('/api/v1/trash/')).map(r=>r.path),['/api/v1/trash/video/video-5'],'Unmarked/stale inputs never submit; final viewer close commits once');
  }
  if(failedFixture){const reads=failedFixture.requests.filter(r=>r.path.endsWith('/play')).length;assert(reads>=2&&reads<=4,'Failed grid inputs must have bounded reads');await new Promise(resolve=>setTimeout(resolve,2000));assert.equal(failedFixture.requests.filter(r=>r.path.endsWith('/play')).length,reads,'No hidden traffic loop after terminal grid errors');}
  console.log('PASS: release APK end-to-end, artifacts '+artifact);
}finally{
  releaseGallery?.();
  // Keep transport evidence on failure too; never persist bearer/passwords.
  fs.writeFileSync(path.join(artifact,'requests.json'),JSON.stringify(fixture.requests.map(({method,path,query,range})=>({method,path,query,range})),null,2));
  // Preserve native codec/lifecycle evidence even when an assertion prevents
  // the success-only screenshot pull. This is the owned QA emulator only.
  for(const [name,args]of [['native-logcat.log',['logcat','-d','-v','threadtime','-t','6000']],['native-resources.txt',['shell','dumpsys','media.resource_manager']]])try{
    const value=execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:16*1024*1024});fs.writeFileSync(path.join(artifact,name),value);
  }catch(error){console.error('Native diagnostics unavailable: '+name+' — '+error.message);}
  if((singleMode||playlistMode)&&fs.existsSync(path.join(artifact,'instrumentation.log'))&&fs.readFileSync(path.join(artifact,'instrumentation.log'),'utf8').includes('Native controller menu item not available:'))try{run(['pull','/sdcard/Android/data/com.railgunhamster.rhfiles/files/rhvideo-menu-failure-qa.png',path.join(artifact,'rhvideo-menu-failure-qa.png')]);}catch{}
  if((singleMode||playlistMode)&&fs.existsSync(path.join(artifact,'instrumentation.log'))&&fs.readFileSync(path.join(artifact,'instrumentation.log'),'utf8').includes('FAIL:'))for(const name of ['rhvideo-native-touch-failure-qa.png','rhvideo-failure-qa.png'])try{run(['pull','/sdcard/Android/data/com.railgunhamster.rhfiles/files/'+name,path.join(artifact,name)]);}catch{}
  try{run(['reverse','--remove','tcp:'+port]);if(failedPort)run(['reverse','--remove','tcp:'+failedPort]);}catch{}await fixture.close();await failedFixture?.close();if(actualMode){fs.copyFileSync(path.join(fixture.directory,'service.log'),path.join(artifact,'actual-service.log'));const transport=path.join(fixture.directory,'zip-transport.jsonl');if(fs.existsSync(transport))fs.copyFileSync(transport,path.join(artifact,'zip-transport.jsonl'));}fs.rmSync(temporary,{recursive:true,force:true});
}
