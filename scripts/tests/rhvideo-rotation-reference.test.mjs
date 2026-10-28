import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {parse} from 'acorn';
import {createRequire} from 'node:module';
import {rhvideoFixture} from '../testing/rhvideo-fixture.mjs';
const model=createRequire(import.meta.url)('../../src/js/rhvideo-model.js');
const reference=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html');

test('native playback scenarios use the published mobile command contract, not a private play alias',()=>{
  const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8');
  const schemas=[];
  function walk(node){
    if(!node||typeof node!=='object')return;
    if(node.type==='CallExpression'&&node.callee.name==='action'&&node.arguments[0]?.value==='player.control')schemas.push(node.arguments[1]);
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
  }
  walk(parse(source,{ecmaVersion:'latest'}));assert.equal(schemas.length,1,'Inspect the actual published mobile schema');
  const property=(node,key)=>node.properties.find(p=>(p.key.name||p.key.value)===key).value;
  const allowed=new Set(property(property(schemas[0].arguments[0],'command'),'enum').elements.map(v=>v.value));
  const probe=fs.readFileSync(new URL('../../android/gradle/app/src/androidTest/java/com/railgunhamster/rhfiles/RhVideoInstrumentation.java',import.meta.url),'utf8');
  function commands(java){
    const result=[];
    for(const match of java.matchAll(/action\(\s*"player\.control"\s*,/g)){
      let depth=0,quote='',escaped=false,end=match.index;
      for(let i=java.indexOf('(',match.index);i<java.length;i++){
        const c=java[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}
        if(c==='"'||c==="'"){quote=c;continue;}if(c==='(')depth++;if(c===')'&&--depth===0){end=i+1;break;}
      }
      const literal=java.slice(match.index,end).match(/\.put\(\s*"command"\s*,\s*"([^"]+)"\s*\)/);if(literal)result.push(literal[1]);
    }
    return result;
  }
  const actual=commands(probe);assert(actual.length>=10,'The scenario extractor cannot silently stop finding controls');assert(actual.includes('resume'));
  assert.deepEqual(actual.filter(command=>!allowed.has(command)),[]);
  const wrong=probe.replace('.put("command","resume")','.put("command","play")');assert.notEqual(wrong,probe);
  assert(commands(wrong).some(command=>!allowed.has(command)),'The regression must catch the invalid command before APK execution');
});

test('account-isolation fixture only accepts explicitly configured users and still rejects incorrect credentials',async()=>{
  for(const users of [['preview'],['preview','other']]){
    const fixture=await rhvideoFixture({loginUsers:users});
    try{
      const login=(username,password='fixture-only')=>fetch(fixture.url+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});
      assert.equal((await login('preview')).status,200);assert.equal((await login('other')).status,users.includes('other')?200:401);assert.equal((await login('preview','incorrect')).status,401);assert.equal((await login('unexpected')).status,401);
    }finally{await fixture.close();}
  }
});

test('single-player rotation is a persistent fit-aware switch, not an angle cycle',async()=>{
  const source=fs.readFileSync(new URL('../../src/js/rhvideo-player.js',import.meta.url),'utf8'),start=source.indexOf("register('rotate',"),end=source.indexOf("register('loop',",start);let handler;const calls=[];
  const context=vm.createContext({register:(_name,_schema,callback)=>handler=callback,object:()=>({}),currentTarget:async()=>({autoRotate:false,rotation:0,inputId:8}),control:async value=>calls.push(value)});
  vm.runInContext(source.slice(start,end),context);await handler({});
  assert.equal(calls[0].command,'autoRotate');assert.equal(calls[0].enabled,true);assert.equal(calls[0].expectedInput,8,'the toggle must retain the input whose switch was read, not rebind after an await');
});

test('smart rotation has no automatic 180/270-degree state and does not rotate square/unknown media',()=>{
  assert.equal(typeof model.rotation,'function');
  for(const [w,h,cw,ch,enabled,angle]of [[360,640,1600,900,true,90],[640,360,1600,900,true,0],[640,360,900,1600,true,90],[360,640,900,1600,true,0],[360,640,1600,900,false,0],[100,100,1600,900,true,0],[0,0,1600,900,true,0]])assert.equal(model.rotation(w,h,cw,ch,enabled).angle,angle);
});

test('differential: compare the actual reference shouldRotate across source/viewport ratios',{skip:!fs.existsSync(reference)},()=>{
  assert.equal(typeof model.rotation,'function');
  const html=fs.readFileSync(reference,'utf8');let fn;
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))for(const node of parse(match[1],{ecmaVersion:'latest',sourceType:'script'}).body)if(node.type==='FunctionDeclaration'&&node.id.name==='shouldRotate')fn=match[1].slice(node.start,node.end);
  assert(fn,'The actual reference oracle must remain available');const viewport={clientWidth:1,clientHeight:1},context=vm.createContext({document:{getElementById:()=>viewport},Math});vm.runInContext(fn,context);
  for(const [w,h]of [[360,640],[640,360],[100,100],[100,101],[100,106],[1080,1920],[1920,1080],[0,0]])for(const [cw,ch]of [[1600,900],[900,1600],[1000,1000],[100,101],[100,106],[320,900],[1600,400]]){
    Object.assign(viewport,{clientWidth:cw,clientHeight:ch});context.video={videoWidth:w,videoHeight:h};const expected=vm.runInContext('shouldRotate(video)',context);
    assert.equal(model.rotation(w,h,cw,ch,true).angle,expected?90:0,`${w}x${h} in ${cw}x${ch}`);
  }
});
