// Reproducible offline reader; the npm lock pins the upstream renderer.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),source=path.join(root,'node_modules/pdfjs-dist');
const version=JSON.parse(fs.readFileSync(path.join(source,'package.json'))).version;
const files=new Map([['pdf.mjs','legacy/build/pdf.min.mjs'],['pdf.worker.mjs','legacy/build/pdf.worker.min.mjs'],['pdf_viewer.mjs','legacy/web/pdf_viewer.mjs'],['pdf_viewer.css','legacy/web/pdf_viewer.css'],['LICENSE','LICENSE']]);
for(const folder of ['cmaps','standard_fonts','iccs','wasm','web/images'])for(const entry of fs.readdirSync(path.join(source,folder),{withFileTypes:true}))if(entry.isFile())files.set(folder.replace('web/','')+'/'+entry.name,folder+'/'+entry.name);
for(const target of ['src/vendor/pdfjs','android/web/vendor/pdfjs']){
 const directory=path.join(root,target);fs.mkdirSync(directory,{recursive:true});const manifest={version,upstream:'https://github.com/mozilla/pdf.js',files:{}};
 for(const [name,input]of files){const bytes=fs.readFileSync(path.join(source,input)),output=path.join(directory,name);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,bytes);manifest.files[name]=createHash('sha256').update(bytes).digest('hex');}
 fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
}
console.log('Vendored PDF.js '+version+' for desktop and Android (offline fonts, CMaps and decoders included)');
