import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {parse} from 'acorn';
import {verify,destination} from '../rhvideo-frontend.mjs';

test('canonical frontend artifact is complete, immutable and declares the host protocol',()=>{
 const manifest=verify();assert.equal(manifest.hostProtocol,1);assert(manifest.bindings>250);
 for(const file of ['static/app.js','static/app.css','static/platform.js','static/host-media.js','static/operation-contract.json','static/bindings.js'])assert(manifest.files[file],file);
 const source=fs.readFileSync(path.join(destination,'static/app.js'),'utf8');
 const functions=new Set(parse(source,{ecmaVersion:'latest'}).body.filter(node=>node.type==='FunctionDeclaration').map(node=>node.id.name));
 const contract=JSON.parse(fs.readFileSync(path.join(destination,'static/operation-contract.json'),'utf8'));
 for(const name of contract.app_functions)assert(functions.has(name),'Missing canonical operation '+name);
 const entry=fs.readFileSync(new URL('../../src/rhvideo-shared.html',import.meta.url),'utf8');
 assert(!/script-src[^;]*unsafe-inline/.test(entry));assert(!/\bon(?:click|input|load|error)=/.test(entry));
 assert(!entry.includes('rhvideo-workbench.js'));assert(!entry.includes('rhvideo-client.js'));
});
test('a modified shared file cannot silently pass artifact verification',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rhvideo-frontend-integrity-'));
 try{
  const manifest=verify();fs.writeFileSync(path.join(temp,'manifest.json'),JSON.stringify(manifest));
  for(const name of Object.keys(manifest.files)){const file=path.join(temp,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(destination,name),file);}
  fs.appendFileSync(path.join(temp,'static/app.js'),'\n/* unauthorized local source drift */');
  assert.throws(()=>verify(temp),/does not match/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
