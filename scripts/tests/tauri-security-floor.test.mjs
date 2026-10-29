import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {root} from '../testing/source.mjs';
import path from 'node:path';
// GHSA-w28w-mhc8-qvjv: >=2.0.0 through 2.11.5 lack channel-owner isolation.
const patched=version=>{const m=/^2\.(\d+)\.(\d+)$/.exec(version);return !!m&&(Number(m[1])>11||Number(m[1])===11&&Number(m[2])>=6);};
const locked=source=>source.split('[[package]]').filter(block=>/^\s*name = "tauri"\s*$/m.test(block)).map(block=>/^version = "([^"]+)"/m.exec(block)?.[1]);

test('the SDK security floor rejects affected versions and pre-release substitutions',()=>{
 for(const version of ['2.0.0','2.10.3','2.11.5','2.11.6-beta.1','3.0.0','bad'])assert.equal(patched(version),false,version);
 for(const version of ['2.11.6','2.11.7','2.12.1'])assert.equal(patched(version),true,version);
});
test('both platform locks select one patched Tauri SDK',()=>{
 for(const relative of ['Cargo.lock','android/src-tauri/Cargo.lock']){
  const versions=locked(fs.readFileSync(path.join(root,relative),'utf8'));assert.equal(versions.length,1,relative);assert(versions.every(patched),relative+': affected SDK '+versions.join(','));
 }
});
test('desktop, Android and Android tests pin the same coordinated patched SDK',()=>{
 const versions=[];
 for(const [relative,count] of [['src-tauri/Cargo.toml',1],['android/src-tauri/Cargo.toml',2]]){
  const declarations=[...fs.readFileSync(path.join(root,relative),'utf8').matchAll(/^tauri = \{ version = "=([^"]+)"/gm)].map(v=>v[1]);assert.equal(declarations.length,count,relative);assert(declarations.every(patched),relative);versions.push(...declarations);
 }
 assert.equal(new Set(versions).size,1,'The Android test runtime cannot silently retain an older SDK');
});
