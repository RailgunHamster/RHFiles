import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {acceptanceEnvironment,acceptanceSummary,admittedExecutable,referenceFingerprint,runtimeAdmissionCommand} from '../testing/rhvideo-windows.mjs';
import * as windowsRunner from '../testing/rhvideo-windows.mjs';
import {parse} from 'acorn';

const summary=(values={})=>Object.entries({tests:103,pass:103,fail:0,cancelled:0,skipped:0,todo:0,...values}).map(([name,value])=>'# '+name+' '+value).join('\r\n');
// macOS may expose os.tmpdir() through /var -> /private/var. The strict
// admission gate intentionally takes a canonical workspace, not a root alias.
const temporary=prefix=>fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),prefix)));

test('business media fixtures use the current snapshot generator bytes, never a PATH fallback',()=>{
 assert.equal(typeof windowsRunner.mediaGeneratorAdmission,'function');
 const directory=temporary('rhvideo-generator-');try{
  const tools=path.join(directory,'src-tauri/thirdparty');fs.mkdirSync(tools,{recursive:true});const tool=path.join(tools,'ffmpeg.exe');fs.writeFileSync(tool,'owned non-executable fixture');
  const first=windowsRunner.mediaGeneratorAdmission(directory);assert.equal(first.executable,fs.realpathSync(tool));assert.match(first.sha256,/^[a-f0-9]{64}$/);assert.deepEqual(windowsRunner.mediaGeneratorAdmission(directory,tool),first);
  fs.writeFileSync(tool,'different owned fixture');assert.notEqual(windowsRunner.mediaGeneratorAdmission(directory).sha256,first.sha256);
 }finally{fs.rmSync(directory,{recursive:true});}
});
test('business generator admission rejects relative, external, missing, directory and linked tools without executing them',()=>{
 assert.equal(typeof windowsRunner.mediaGeneratorAdmission,'function');
 const directory=temporary('rhvideo-generator-negative-');try{
  const tools=path.join(directory,'src-tauri/thirdparty');fs.mkdirSync(tools,{recursive:true});const tool=path.join(tools,'ffmpeg.exe'),outside=path.join(directory,'outside.exe');fs.writeFileSync(outside,'not executable');
  assert.throws(()=>windowsRunner.mediaGeneratorAdmission(directory));fs.mkdirSync(tool);assert.throws(()=>windowsRunner.mediaGeneratorAdmission(directory));fs.rmdirSync(tool);fs.writeFileSync(tool,'not executable');
  for(const candidate of ['ffmpeg','src-tauri/thirdparty/ffmpeg.exe',outside])assert.throws(()=>windowsRunner.mediaGeneratorAdmission(directory,candidate));
  fs.unlinkSync(tool);fs.rmdirSync(tools);const externalTools=path.join(directory,'outside-tools');fs.mkdirSync(externalTools);fs.writeFileSync(path.join(externalTools,'ffmpeg.exe'),'not executable');fs.symlinkSync(externalTools,tools,process.platform==='win32'?'junction':'dir');assert.throws(()=>windowsRunner.mediaGeneratorAdmission(directory));
 }finally{fs.rmSync(directory,{recursive:true});}
});
test('the full runner actually injects and verifies its admitted generator around the child suite',()=>{
 const source=fs.readFileSync(new URL('../testing/rhvideo-windows.mjs',import.meta.url),'utf8');
 assert.match(source,/mediaGenerator=mediaGeneratorAdmission\(root,process\.env\.FFMPEG\)/);assert.match(source,/FFMPEG:mediaGenerator\.executable/);assert.match(source,/referenceFiles:fingerprint,mediaGenerator,/);assert.match(source,/mediaGeneratorAdmission\(root,environment\.FFMPEG\)/);
 const admission=source.indexOf('mediaGenerator=mediaGeneratorAdmission(root,process.env.FFMPEG)'),child=source.indexOf("const child=spawn(process.execPath");assert(admission>=0&&child>admission);
});
test('actual RHVideo E2E ffmpeg calls honor the runner selection rather than silently using PATH',()=>{
 const directory=new URL('../e2e/',import.meta.url),files=fs.readdirSync(directory).filter(name=>/^rhvideo(?:-[a-z-]+)?\.test\.mjs$/.test(name)),violations=[];let producers=0;
 for(const file of files){const source=fs.readFileSync(new URL(file,directory),'utf8');
  function isTool(node){if(!node||typeof node!=='object')return false;if(node.type==='Literal'&&typeof node.value==='string'&&/(^|[\\/])ffmpeg(?:\.exe)?$/i.test(node.value))return true;return Object.values(node).some(v=>Array.isArray(v)?v.some(isTool):isTool(v));}
  function visit(node){if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&['execFileSync','execFile','spawnSync','spawn'].includes(node.callee?.name)&&isTool(node.arguments[0])){producers++;const arg=node.arguments[0];if(arg.type!=='LogicalExpression'||arg.operator!=='||'||source.slice(arg.left.start,arg.left.end)!=='process.env.FFMPEG')violations.push(file+':'+(source.slice(0,arg.start).split('\n').length));}for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else visit(value);}
  visit(parse(source,{ecmaVersion:'latest',sourceType:'module'}));
 }
 assert(producers>=20,'Do not silently stop finding actual media fixture calls');assert.deepEqual(violations,[],'Fixture producers must use the admitted FFMPEG supplied by the real runner');
});
test('runtime admission accepts verified packaged epochs without removing workspace or full bundle validation',()=>{
 const workspace=path.join(os.tmpdir(),"RHFiles O'Brien"),bundle=path.join(workspace,'test-artifacts/runtime/vlc'),quote=value=>"'"+value.replaceAll("'","''")+"'";
 const command=runtimeAdmissionCommand(workspace,bundle);
 assert(command.includes(';[void](Assert-RHFilesLibVlcWorkspacePath '+quote(bundle)+' '+quote(workspace)+')'));
 assert(command.endsWith(';Assert-RHFilesLibVlcBundle '+quote(bundle)+" 'velopack'"));
 assert(command.includes(quote(path.join(workspace,'scripts/libvlc-bundle.ps1'))));
 const runner=fs.readFileSync(new URL('../testing/rhvideo-windows.mjs',import.meta.url),'utf8');assert.match(runner,/timeout:30000/,'Keep the original admission budget');
});

test('full Windows acceptance always enables actual native cases and the exact app-local runtime',()=>{
 const env=acceptanceEnvironment({PATH:'owned',RHFILES_NATIVE_PLAYER_QA:'0',RHFILES_EXPECT_RENDERER:'wrong'},'owned.exe','reference');
 assert.equal(env.RHFILES_NATIVE_PLAYER_QA,'1');assert.equal(env.RHFILES_EXPECT_BUNDLED_VLC,'3.0.24');assert.equal(env.RHFILES_EXPECT_ENGINE_VERSION,'3.0.24');assert.equal(env.RHFILES_EXPECT_RENDERER,'native-hardware-auto');assert.equal(env.PATH,'owned');assert.equal(env.RHFILES_TEST_EXECUTABLE,'owned.exe');assert.equal(env.RHVIDEO_SOURCE,'reference');
});
test('hardware business acceptance cannot silently include compatibility or timing experiments',()=>{
 for(const key of ['RHFILES_VLC_COMPATIBILITY','RHFILES_VLC_NETWORK_CACHE_MS','RHFILES_VLC_DECODE_THREADS','RHFILES_VLC_DEBUG','RHFILES_QA_READBACK','RHFILES_VLC_NATIVE_TRACE','RHFILES_PLAY_NATIVE_TRACE','RHFILES_RECEIPT_TRACE','RHFILES_QA_RECEIPT_WINDOW_PING','RHFILES_QA_WRY_DISPATCH_TRACE'])assert.throws(()=>acceptanceEnvironment({[key]:'1'},'owned.exe','reference'),/compatibility|experiment/);
});
test('final TAP requires every case to pass with no skips or incomplete results',()=>{
 assert.deepEqual(acceptanceSummary('TAP version 13\n'+summary()),{tests:103,pass:103,fail:0,cancelled:0,skipped:0,todo:0});
 for(const values of [{tests:0,pass:0},{pass:102},{fail:1},{skipped:1},{cancelled:1},{todo:1}])assert.throws(()=>acceptanceSummary(summary(values)),/Incomplete or failed/);
 assert.throws(()=>acceptanceSummary('TAP version 13\n# pass 103'),/Missing/);
 assert.throws(()=>acceptanceSummary(summary()+'\n'+summary({tests:2,pass:1,fail:1})),/Incomplete or failed/);
});
test('snapshot admission rejects production, missing, non-executable, target and linked inputs',()=>{
 const directory=temporary('rhvideo-runner-');try{
  const snapshots=path.join(directory,'test-artifacts');fs.mkdirSync(snapshots);fs.mkdirSync(path.join(directory,'target'));const owned=path.join(snapshots,'rhfiles.exe');fs.writeFileSync(owned,'owned fixture');
  assert.equal(admittedExecutable(directory,owned),fs.realpathSync(owned));
  for(const file of [path.join(directory,'production.exe'),path.join(directory,'target/rhfiles.exe'),path.join(snapshots,'missing.exe'),path.join(snapshots,'not-an-executable.txt')]){if(!file.includes('missing'))fs.writeFileSync(file,'fixture');assert.throws(()=>admittedExecutable(directory,file));}
  fs.mkdirSync(path.join(directory,'external'));fs.writeFileSync(path.join(directory,'external/app.exe'),'fixture');fs.symlinkSync(path.join(directory,'external'),path.join(snapshots,'linked'),process.platform==='win32'?'junction':'dir');assert.throws(()=>admittedExecutable(directory,path.join(snapshots,'linked/app.exe')),/isolated/);
  const other=path.join(directory,'linked-root');fs.mkdirSync(other);fs.symlinkSync(path.join(directory,'external'),path.join(other,'test-artifacts'),process.platform==='win32'?'junction':'dir');assert.throws(()=>admittedExecutable(other,path.join(directory,'external/app.exe')),/cannot be a link/);
 }finally{fs.rmSync(directory,{recursive:true});}
});
test('reference evidence fingerprints actual bytes and rejects missing, escaping and linked inputs',()=>{
 const directory=temporary('rhvideo-reference-fingerprint-');try{
  const source=path.join(directory,'source');fs.mkdirSync(source);fs.writeFileSync(path.join(source,'owned.js'),'first');fs.writeFileSync(path.join(directory,'outside.js'),'outside');
  const first=referenceFingerprint(source,['owned.js']);assert.match(first['owned.js'],/^[a-f0-9]{64}$/);fs.writeFileSync(path.join(source,'owned.js'),'second');assert.notDeepEqual(referenceFingerprint(source,['owned.js']),first);
  for(const file of ['missing.js','../outside.js','/outside.js','sub/../owned.js','sub\\owned.js'])assert.throws(()=>referenceFingerprint(source,[file]));
  fs.mkdirSync(path.join(directory,'external'));fs.writeFileSync(path.join(directory,'external/linked.js'),'external');fs.symlinkSync(path.join(directory,'external'),path.join(source,'linked'),process.platform==='win32'?'junction':'dir');assert.throws(()=>referenceFingerprint(source,['linked/linked.js']),/escaped/);
 }finally{fs.rmSync(directory,{recursive:true});}
});

test('normalizing the workspace root never admits symlinked snapshot or reference children',()=>{
 const directory=temporary('rhvideo-runner-alias-');try{
  const actual=path.join(directory,'actual'),alias=path.join(directory,'workspace-alias');fs.mkdirSync(actual);fs.mkdirSync(path.join(actual,'test-artifacts'));fs.writeFileSync(path.join(actual,'test-artifacts/app.exe'),'owned');fs.writeFileSync(path.join(actual,'reference.js'),'reference');
  fs.symlinkSync(actual,alias,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>admittedExecutable(alias,path.join(alias,'test-artifacts/app.exe')),/cannot be a link/,'Implicit workspace aliases remain rejected');
  const canonical=fs.realpathSync(alias);assert.equal(admittedExecutable(canonical,path.join(canonical,'test-artifacts/app.exe')),fs.realpathSync(path.join(actual,'test-artifacts/app.exe')));assert.match(referenceFingerprint(canonical,['reference.js'])['reference.js'],/^[a-f0-9]{64}$/);
  fs.mkdirSync(path.join(directory,'outside'));fs.writeFileSync(path.join(directory,'outside/app.exe'),'not owned');fs.writeFileSync(path.join(directory,'outside/reference.js'),'not reference');fs.symlinkSync(path.join(directory,'outside'),path.join(canonical,'test-artifacts/linked'),process.platform==='win32'?'junction':'dir');fs.symlinkSync(path.join(directory,'outside'),path.join(canonical,'linked'),process.platform==='win32'?'junction':'dir');
  assert.throws(()=>admittedExecutable(canonical,path.join(canonical,'test-artifacts/linked/app.exe')),/isolated/);assert.throws(()=>referenceFingerprint(canonical,['linked/reference.js']),/escaped/);
 }finally{fs.rmSync(directory,{recursive:true});}
});
