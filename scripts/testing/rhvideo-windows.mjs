// Full, serial Windows RHVideo acceptance. No silent native-test opt-out or
// system-runtime fallback; keep production installs and profiles out of scope.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {root} from './source.mjs';

export function acceptanceEnvironment(environment,executable,source){
  if(environment.RHFILES_VLC_COMPATIBILITY)throw Error('This entry verifies normal native hardware output, not the compatibility renderer');
  for(const key of ['RHFILES_VLC_NETWORK_CACHE_MS','RHFILES_VLC_DECODE_THREADS','RHFILES_VLC_DEBUG','RHFILES_QA_READBACK','RHFILES_VLC_NATIVE_TRACE','RHFILES_PLAY_NATIVE_TRACE','RHFILES_RECEIPT_TRACE'])
    if(environment[key])throw Error('Do not mix performance/trace experiments into business acceptance: '+key);
  return {...environment,RHFILES_TEST_EXECUTABLE:executable,RHVIDEO_SOURCE:source,RHFILES_NATIVE_PLAYER_QA:'1',RHFILES_EXPECT_BUNDLED_VLC:'3.0.24',RHFILES_EXPECT_ENGINE_VERSION:'3.0.24',RHFILES_EXPECT_RENDERER:'native-hardware-auto'};
}
export function acceptanceSummary(output){
  const summary={};
  for(const name of ['tests','pass','fail','cancelled','skipped','todo']){
    const rows=[...output.matchAll(new RegExp('^# '+name+' (\\d+)\\r?$','gm'))];
    if(!rows.length)throw Error('Missing final TAP summary: '+name);
    summary[name]=Number(rows.at(-1)[1]);
  }
  if(summary.tests<1||summary.pass!==summary.tests||['fail','cancelled','skipped','todo'].some(name=>summary[name]!==0))
    throw Error('Incomplete or failed Windows acceptance: '+JSON.stringify(summary));
  return summary;
}
function inside(directory,file){const relative=path.relative(directory,file);return relative!==''&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);}
export function admittedExecutable(workspace,executable){
  const admitted=path.resolve(workspace,'test-artifacts'),requested=path.resolve(executable),actual=fs.realpathSync(requested);
  if(fs.realpathSync(admitted).toLowerCase()!==admitted.toLowerCase())throw Error('The isolated test-artifacts root cannot be a link');
  if(!inside(admitted,actual)||requested.toLowerCase()!==actual.toLowerCase()||!fs.statSync(actual).isFile()||path.extname(actual).toLowerCase()!=='.exe')
    throw Error('Use a real executable in an isolated test-artifacts snapshot, not target, a link or a production install');
  return actual;
}
export function referenceFingerprint(source,files){
  return Object.fromEntries(files.map(file=>{
    if(typeof file!=='string'||file.includes('\\')||file.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Invalid reference inventory path');
    const actual=fs.realpathSync(path.resolve(source,file));if(!inside(source,actual)||!fs.statSync(actual).isFile())throw Error('Reference file escaped its checkout');
    return [file,createHash('sha256').update(fs.readFileSync(actual)).digest('hex')];
  }));
}
async function main(){
  if(process.platform!=='win32')throw Error('Actual Windows/WebView2 is required');
  if(!process.env.RHFILES_TEST_EXECUTABLE||!process.env.RHVIDEO_SOURCE)throw Error('Set RHFILES_TEST_EXECUTABLE to the isolated app-local 3.0.24 snapshot and RHVIDEO_SOURCE to the actual reference checkout');
  const executable=admittedExecutable(root,process.env.RHFILES_TEST_EXECUTABLE),source=fs.realpathSync(process.env.RHVIDEO_SOURCE);
  if(!fs.statSync(path.join(source,'app/main.py')).isFile())throw Error('Actual RHVideo backend source is required; do not silently skip it');
  const environment=acceptanceEnvironment(process.env,executable,source),bundle=path.join(path.dirname(executable),'vlc');
  const quote=value=>"'"+value.replaceAll("'","''")+"'";
  const command="$ErrorActionPreference='Stop';. "+quote(path.join(root,'scripts/libvlc-bundle.ps1'))+';[void](Assert-RHFilesLibVlcWorkspacePath '+quote(bundle)+' '+quote(root)+');Assert-RHFilesLibVlcBundle '+quote(bundle);
  const verified=spawnSync('pwsh',['-NoProfile','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8',timeout:30000});
  if(verified.error||verified.status!==0)throw Error('App-local runtime admission failed: '+(verified.error||verified.stderr||verified.stdout));
  const cases=fs.readdirSync(path.join(root,'scripts/e2e')).filter(name=>/^rhvideo(?:-[a-z-]+)?\.test\.mjs$/.test(name)).sort();
  if(!cases.length)throw Error('No RHVideo acceptance files found');
  const inventory=JSON.parse(fs.readFileSync(path.join(root,'scripts/testing/rhvideo-control-map.json'),'utf8')).modules.map(row=>row.file),fingerprint=referenceFingerprint(source,inventory);
  const artifact=fs.mkdtempSync(path.join(root,'test-artifacts/rhvideo-windows-')),receipt={executable,executableSha256:createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),source,referenceFiles:fingerprint,renderer:environment.RHFILES_EXPECT_RENDERER,runtime:environment.RHFILES_EXPECT_BUNDLED_VLC,cases,artifact};
  console.log('Serial Windows acceptance: '+artifact);
  const child=spawn(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1',...cases.map(name=>path.join(root,'scripts/e2e',name))],{cwd:root,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',bytes=0,problem,stopping=false;
  const stop=reason=>{problem??=reason;if(stopping)return;stopping=true;if(child.pid&&child.exitCode===null)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});};
  const timer=setTimeout(()=>stop('Suite exceeded its absolute 40-minute budget'),40*60*1000);
  const interrupted=()=>stop('Acceptance interrupted');process.once('SIGINT',interrupted);process.once('SIGTERM',interrupted);
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  const append=(stream,data)=>{bytes+=Buffer.byteLength(data);if(bytes>8*1024*1024){stop('Acceptance output exceeded its bounded log budget');return;}output+=data;stream.write(data);};
  child.stdout.on('data',data=>append(process.stdout,data));child.stderr.on('data',data=>append(process.stderr,data));
  child.on('error',error=>{problem??=String(error);});
  try{
    const {code,signal}=await new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));receipt.exitCode=code;receipt.signal=signal;
    if(problem)throw Error(problem);if(code!==0)throw Error('Windows suite exited '+code);receipt.summary=acceptanceSummary(output);
    if(JSON.stringify(referenceFingerprint(source,inventory))!==JSON.stringify(fingerprint))throw Error('Reference files changed during acceptance');
    if(createHash('sha256').update(fs.readFileSync(executable)).digest('hex')!==receipt.executableSha256)throw Error('The snapshot executable changed during acceptance');
  }catch(error){receipt.failure=String(error);process.exitCode=1;}
  finally{clearTimeout(timer);process.removeListener('SIGINT',interrupted);process.removeListener('SIGTERM',interrupted);fs.writeFileSync(path.join(artifact,'suite.tap'),output);fs.writeFileSync(path.join(artifact,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
