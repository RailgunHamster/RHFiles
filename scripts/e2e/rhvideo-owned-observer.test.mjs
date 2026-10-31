// The external observer must not turn release acceptance into a desktop-wide
// capture/input tool. Exercise actual compiled guards against our own Node
// processes only, never a real user's RHFiles or another application.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {root} from '../testing/source.mjs';
import {launchApp,until} from '../testing/app-session.mjs';
import {admitOwnedFrameTool,executeOwnedFrame} from '../testing/owned-native-frame.mjs';

test('compiled owned observer refuses parent processes, wrong executable identities and non-RHFiles siblings',async()=>{
  const directory=fs.mkdtempSync(path.join(root,'test-artifacts/rhvideo-observer-guards-'));
  const tool=admitOwnedFrameTool(root,process.env.RHFILES_OWNED_FRAME_TOOL||path.join(root,'test-artifacts/owned-native-frame/owned-native-frame.exe'));
  const child=spawn(process.execPath,['-e','setTimeout(()=>{},15000)'],{cwd:directory,windowsHide:true,stdio:'ignore'});
  try{
    await once(child,'spawn');
    const command=(pid,executable,args)=>executeOwnedFrame(tool,[String(pid),executable,...args],{cwd:directory,windowsHide:true,encoding:'utf8',timeout:4500,maxBuffer:65536});
    for(const args of [['windows'],['main-client-size','1200','678']]){
      await assert.rejects(command(process.pid,process.execPath,args),/not a sibling owned by the fixture/);
      await assert.rejects(command(child.pid,path.join(directory,'not-the-node-executable.exe'),args),/executable identity mismatch/);
      await assert.rejects(command(child.pid,process.execPath,args),/Only an owned RHFiles process/);
    }
    assert.deepEqual(fs.readdirSync(directory),[],'Refusal creates no captures or other files');
    console.log(JSON.stringify({compiledOwnershipGuards:true,scope:'generated Node processes only'}));
  }finally{if(child.exitCode===null){child.kill();await once(child,'close');}}
});

test('compiled owned client sizing changes only the new fixture main viewport and confirms its actual dimensions',{timeout:45000},async()=>{
  const app=await launchApp({emulateFocus:true});
  try{
    const before=await app.evaluate('({width:innerWidth,height:innerHeight})');
    const sized=await app.nativeWindows.sizeMainClient({width:1200,height:678});assert.equal(sized.applied,true);
    const viewport=await until(()=>app.evaluate('innerWidth===1200&&innerHeight===678?{width:innerWidth,height:innerHeight}:null'),'actual owned reference viewport after sizing');
    assert.deepEqual(viewport,{width:1200,height:678});
    await app.nativeWindows.sizeMainClient(before);await until(()=>app.evaluate('innerWidth==='+before.width+'&&innerHeight==='+before.height),'original own viewport restored');
    fs.writeFileSync(path.join(app.artifactDir,'client-size.json'),JSON.stringify({before,sized,viewport,restored:true},null,2));
  }finally{await app.close();}
});
