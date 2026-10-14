// Generates RHFiles-owned test data with a locally installed WinRAR; no RAR
// software is redistributed. Committed volumes let CI test extraction with 7z.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {root} from './source.mjs';
const output=path.join(root,'scripts/testing/fixtures/split-rar');
if(fs.existsSync(output)) throw Error('Fixture directory already exists; refusing to replace it');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'rhfiles-rar-fixture-'));
let state=0x12345678;
const payload=Buffer.alloc(16384);
for(let i=0;i<payload.length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;payload[i]=state & 255;}
fs.writeFileSync(path.join(temporary,'payload.bin'),payload);
const result=spawnSync('C:\\Program Files\\WinRAR\\Rar.exe',['a','-v4k','-m0','-ep','-idq','-y',path.join(temporary,'sample.rar'),path.join(temporary,'payload.bin')],{windowsHide:true,encoding:'utf8'});
if(result.status!==0)throw Error(result.stdout+result.stderr);
fs.mkdirSync(output,{recursive:true});
for(const name of fs.readdirSync(temporary).filter(name=>/\.part\d+\.rar$/.test(name))) {
  const padded=name.replace(/\.part(\d+)\.rar$/,(_,part)=>'.part'+part.padStart(2,'0')+'.rar');
  fs.copyFileSync(path.join(temporary,name),path.join(output,padded));
}
console.log(JSON.stringify({output,volumes:fs.readdirSync(output)},null,2));
