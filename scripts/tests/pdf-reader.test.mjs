import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
test('desktop and Android share the same offline PDF renderer and reader surface',()=>{
 const a='src/vendor/pdfjs',b='android/web/vendor/pdfjs',manifest=JSON.parse(fs.readFileSync(path.join(a,'manifest.json')));assert.equal(manifest.version,JSON.parse(fs.readFileSync('package.json')).devDependencies['pdfjs-dist']);assert.match(fs.readFileSync(path.join(a,'LICENSE'),'utf8'),/Apache License/);
 for(const [file,hash]of Object.entries(manifest.files)){for(const root of [a,b])assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,root+'/'+file);}
 assert.equal(fs.readFileSync('src/js/pdf-reader.js','utf8'),fs.readFileSync('android/web/js/pdf-reader.js','utf8'));
});
