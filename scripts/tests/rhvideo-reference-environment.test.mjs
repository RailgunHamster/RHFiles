import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const moduleUrl=new URL('../testing/rhvideo-reference.mjs',import.meta.url).href;
test('private reference checks explicitly skip absent public-CI sources, but reject an invalid configured source',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-reference-env-')),cwd=path.join(directory,'project');fs.mkdirSync(cwd);
  const run=source=>{const env={...process.env};delete env.RHVIDEO_SOURCE;if(source)env.RHVIDEO_SOURCE=source;return spawnSync(process.execPath,['--input-type=module','-e',`import {rhvideoReferenceSkip} from ${JSON.stringify(moduleUrl)};console.log(JSON.stringify(rhvideoReferenceSkip()));`],{cwd,env,encoding:'utf8'});};
  try{
    let result=run();assert.equal(result.status,0);assert.match(JSON.parse(result.stdout),/Private RHVideo reference is unavailable/);
    const source=path.join(directory,'reference');fs.mkdirSync(path.join(source,'app'),{recursive:true});
    result=run(source);assert.notEqual(result.status,0);assert.match(result.stderr,/Explicit RHVIDEO_SOURCE lacks/);
    fs.writeFileSync(path.join(source,'app/main.py'),'# synthetic presence fixture, never executed');result=run(source);assert.equal(result.status,0);assert.equal(JSON.parse(result.stdout),false);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
