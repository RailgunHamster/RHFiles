import path from 'node:path';
import assert from 'node:assert/strict';
import {browserFixture} from '../../android/web/tests/browser-fixture.mjs';

const fixture=await browserFixture(path.resolve('src'));
const context=await fixture.browser.newContext({viewport:{width:1000,height:750},hasTouch:true});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await context.addInitScript(()=>{
  const sizes=[[6000,4000],[4000,6000],[10000,1000],[40,30]];
  const entries=['a.jpg','b.jpg','c.jpg','d.jpg'].map((name,index)=>({name,path:'D:\\QA\\'+name,width:sizes[index][0],height:sizes[index][1]}));
  const s=window.__viewerQA={generation:1,selection:1,index:1,kind:'image',mode:'paged',entries,calls:[],fullscreen:false,events:{}};
  localStorage.setItem('rhfiles-settings',JSON.stringify({language:'zh'}));
  window.__TAURI__={core:{
    convertFileSrc:path=>{
      const entry=entries.find(entry=>entry.path===path);
      return 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${entry.width}" height="${entry.height}"><rect width="100%" height="100%" fill="teal"/><rect x="2" y="2" width="${entry.width-4}" height="${entry.height-4}" fill="none" stroke="coral" stroke-width="4"/></svg>`);
    },
    invoke:async(command,{action,args={}}={})=>{
      s.calls.push({command,action,args});
      if(command==='open_file')return true;
      if(command!=='file_viewer_request')throw Error('Unexpected native command');
      const value=()=>JSON.parse(JSON.stringify({generation:s.generation,selection:s.selection,index:s.index,kind:s.kind,mode:s.mode,entries:s.entries}));
      if(action==='state')return value();
      if(args.generation!==s.generation||args.selection!==s.selection)throw Error('Stale scope');
      if(action==='select'){s.index=args.index;s.selection++;return value();}
      if(action==='mode'){s.mode=args.mode;return value();}
      if(action==='close')return {closed:true};
      throw Error('Unexpected native action '+action);
    }
  },window:{getCurrentWindow:()=>({isFullscreen:async()=>s.fullscreen,setFullscreen:async value=>s.fullscreen=value})},event:{listen:async(name,fn)=>{s.events[name]=fn;return()=>delete s.events[name];}}};
});
const call=(name,args={})=>page.evaluate(({name,args})=>RHFilesAPI.invoke(name,args),{name,args});
let checks=0;
const check=(value,label)=>{assert.ok(value,label);console.log('ok '+(++checks)+' - '+label);};
async function loaded(){await page.waitForFunction(()=>[...document.querySelectorAll('.image-page img')].length>0&&[...document.querySelectorAll('.image-page img')].every(image=>image.naturalWidth>0));}
async function fits(label){
  await loaded();
  const bounds=await page.evaluate(async()=>{
    const state=await RHFilesAPI.invoke('media.viewer.state');
    const image=document.querySelector(`.image-page[data-index="${state.index}"] img`),viewport=document.getElementById('viewport');
    const box=image.getBoundingClientRect(),frame=viewport.getBoundingClientRect();
    return {box:{left:box.left,top:box.top,right:box.right,bottom:box.bottom},frame:{left:frame.left,top:frame.top,right:frame.right,bottom:frame.bottom},fit:getComputedStyle(image).objectFit,zoom:state.zoom,angle:state.angle,natural:[image.naturalWidth,image.naturalHeight]};
  });
  assert.equal(bounds.fit,'contain',label);assert.equal(bounds.zoom,1,label);
  const {box,frame}=bounds;
  assert.ok(box.left>=frame.left-1&&box.top>=frame.top-1&&box.right<=frame.right+1&&box.bottom<=frame.bottom+1,label+': '+JSON.stringify(bounds));
  check(true,label);
}
try{
  await page.goto(fixture.url+'/file-viewer.html');await loaded();
  check((await call('media.viewer.state')).mode==='paged','Windows viewer defaults to paged images');
  await fits('large portrait fits on first open');
  await page.locator('#next').click();await page.waitForFunction(()=>document.getElementById('title').textContent==='c.jpg');
  check((await call('media.viewer.state')).index===2,'physical next button follows directory order');
  await call('media.viewer.previous');await call('media.viewer.mode.set',{mode:'continuous'});
  const viewport=page.locator('#viewport');
  await viewport.dispatchEvent('pointerdown',{pointerId:7,pointerType:'touch',button:0,clientX:700,clientY:300});
  await viewport.dispatchEvent('pointermove',{pointerId:7,pointerType:'touch',clientX:620,clientY:300});
  await viewport.dispatchEvent('pointerup',{pointerId:7,pointerType:'touch',clientX:620,clientY:300});
  const state=await call('media.viewer.state');
  check(state.position>1&&state.position<2,'short continuous drag keeps a fractional position');
  await page.waitForTimeout(600);assert.equal((await call('media.viewer.state')).position,state.position);
  check(await page.locator('.image-page').count()<=3,'only the current image and neighbors stay mounted');
  await call('media.viewer.zoomIn');check((await call('media.viewer.state')).zoom>1,'zoom controls expose semantic actions');
  await call('media.viewer.fit');await call('media.viewer.rotate');assert.equal((await call('media.viewer.state')).angle,90);
  await call('media.viewer.fullscreen');check(await page.evaluate(()=>__viewerQA.fullscreen),'fullscreen uses the application window');
  await call('media.viewer.systemOpen');check(await page.evaluate(()=>__viewerQA.calls.some(c=>c.command==='open_file')),'system application remains available from the viewer');
  // Large intrinsic sizes must not enlarge an implicit grid row. Exercise the
  // real stylesheet with all rotations, shapes, modes, and window proportions.
  for(const mode of ['paged','continuous']){
    await call('media.viewer.mode.set',{mode});
    for(const size of [{width:1000,height:750},{width:620,height:900}]){
      await page.setViewportSize(size);
      for(let at=0;at<4;at++){
        await call('media.viewer.previous');
        while((await call('media.viewer.state')).index>0)await call('media.viewer.previous');
        for(let n=0;n<at;n++)await call('media.viewer.next');
        for(let turn=0;turn<4;turn++){
          if(turn)await call('media.viewer.rotate');
          await call('media.viewer.zoomIn');await call('media.viewer.fit');
          assert.equal((await call('media.viewer.state')).angle,turn*90,'fit preserves the chosen rotation');
          await fits(`${mode}, ${size.width}x${size.height}, image ${at}, rotation ${turn*90}: complete image remains inside viewport`);
        }
      }
    }
  }
  await page.screenshot({path:'test-artifacts/windows-image-fit-browser.png'});
  check(errors.length===0,'no unhandled viewer errors');
  console.log('PASS '+checks+' Windows viewer UI checks (native decoding tested separately)');
}finally{await context.close();await fixture.close();}
