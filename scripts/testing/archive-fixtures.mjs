import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root} from './source.mjs';

export function archivePayload() {
  const bytes=Buffer.alloc(16384); let state=0x12345678;
  for(let i=0;i<bytes.length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;bytes[i]=state & 255;}
  return bytes;
}
export function run7z(args) {
  const output=spawnSync(path.join(root,'src-tauri/thirdparty/7z.exe'),args,{encoding:'utf8',windowsHide:true,timeout:30000});
  if(output.error || output.status!==0) throw Error(output.error?.message || output.stdout+output.stderr);
  return output.stdout;
}
// Convert an ordinary single-volume ZIP to a valid two-disk ZIP64 set. Disk 0
// contains file data; disk 1 contains the central directory and volume records.
export function splitZip(full, stem) {
  const bytes=fs.readFileSync(full), end=bytes.length-22;
  const count=bytes.readUInt16LE(end+10), directorySize=bytes.readUInt32LE(end+12), cut=bytes.readUInt32LE(end+16);
  const directory=bytes.subarray(cut,end);
  const zip64=Buffer.alloc(56);zip64.writeUInt32LE(0x06064b50);zip64.writeBigUInt64LE(44n,4);
  zip64.writeUInt16LE(45,12);zip64.writeUInt16LE(45,14);zip64.writeUInt32LE(1,16);zip64.writeUInt32LE(1,20);
  zip64.writeBigUInt64LE(BigInt(count),24);zip64.writeBigUInt64LE(BigInt(count),32);zip64.writeBigUInt64LE(BigInt(directorySize),40);
  const locator=Buffer.alloc(20);locator.writeUInt32LE(0x07064b50);locator.writeUInt32LE(1,4);
  locator.writeBigUInt64LE(BigInt(directory.length),8);locator.writeUInt32LE(2,16);
  const eocd=Buffer.from(bytes.subarray(end));eocd.writeUInt16LE(1,4);eocd.writeUInt16LE(1,6);eocd.writeUInt32LE(0xffffffff,16);
  fs.writeFileSync(stem+'.z01',bytes.subarray(0,cut));
  fs.writeFileSync(stem+'.zip',Buffer.concat([directory,zip64,locator,eocd]));
}
