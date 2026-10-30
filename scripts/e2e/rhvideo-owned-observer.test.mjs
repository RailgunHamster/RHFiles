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
import {admitOwnedFrameTool,executeOwnedFrame} from '../testing/owned-native-frame.mjs';

test('compiled owned observer refuses parent processes, wrong executable identities and non-RHFiles siblings',async()=>{
  const directory=fs.mkdtempSync(path.join(root,'test-artifacts/rhvideo-observer-guards-'));
  const tool=admitOwnedFrameTool(root,process.env.RHFILES_OWNED_FRAME_TOOL||path.join(root,'test-artifacts/owned-native-frame/owned-native-frame.exe'));
  const child=spawn(process.execPath,['-e','setTimeout(()=>{},15000)'],{cwd:directory,windowsHide:true,stdio:'ignore'});
  try{
    await once(child,'spawn');
    const command=(pid,executable)=>executeOwnedFrame(tool,[String(pid),executable,'windows'],{cwd:directory,windowsHide:true,encoding:'utf8',timeout:4500,maxBuffer:65536});
    await assert.rejects(command(process.pid,process.execPath),/not a sibling owned by the fixture/);
    await assert.rejects(command(child.pid,path.join(directory,'not-the-node-executable.exe')),/executable identity mismatch/);
    await assert.rejects(command(child.pid,process.execPath),/Only an owned RHFiles process/);
    assert.deepEqual(fs.readdirSync(directory),[],'Refusal creates no captures or other files');
    console.log(JSON.stringify({compiledOwnershipGuards:true,scope:'generated Node processes only'}));
  }finally{if(child.exitCode===null){child.kill();await once(child,'close');}}
});
