const test=require('node:test'),assert=require('node:assert/strict'),preview=require('../js/text-preview.js');
test('text routing includes agreed formats and rejects executable/archive/media extensions',()=>{
  for(const name of ['a.JSON','a.md','a.markdown','a.txt','a.log','a.csv','a.tsv','a.xml','a.yaml','a.yml','a.ini','a.env','a.tsx','a.cpp','a.rs','a.ps1','README','Dockerfile','.gitignore'])assert(preview.supports(name),name);
  for(const name of ['a.dll','a.jar','a.apk','a.zip','a.mp4','a.png','README.apk','LICENSE.jar'])assert(!preview.supports(name),name);
});
test('bounded text parts preserve every character and never split a surrogate pair',()=>{
  for(const text of ['', '中文 🙂\n'.repeat(50000),'a'.repeat(32767)+'🙂'+'b'.repeat(100000),'\n'.repeat(100000)]){
    const parts=preview.parts(text);assert(parts.length);assert.equal(parts.map(([a,b])=>text.slice(a,b)).join(''),text);
    for(const [a,b]of parts){assert(b-a<=32769);assert(text.slice(a,b).split('\n').length<=401);if(b<text.length)assert(!(text.charCodeAt(b-1)>=0xd800&&text.charCodeAt(b-1)<=0xdbff));}
  }
});
