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
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>s.copied=value}});
  localStorage.setItem('rhfiles-settings',JSON.stringify({language:'en'}));localStorage.setItem('rhfiles-lang','zh');
  window.__TAURI__={core:{
    convertFileSrc:path=>{
      const entry=entries.find(entry=>entry.path===path);
      return 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${entry.width}" height="${entry.height}"><rect width="100%" height="100%" fill="teal"/><rect x="2" y="2" width="${entry.width-4}" height="${entry.height-4}" fill="none" stroke="coral" stroke-width="4"/></svg>`);
    },
    invoke:async(command,input={})=>{
      const {action,args={}}=input;s.calls.push({command,action,args:command==='file_viewer_request'?args:input});
      if(command==='open_file')return true;
      if(command!=='file_viewer_request')throw Error('Unexpected native command');
      const value=()=>JSON.parse(JSON.stringify({generation:s.generation,selection:s.selection,index:s.index,kind:s.kind,mode:s.mode,entries:s.entries}));
      if(action==='state')return value();
      if(args.generation!==s.generation||args.selection!==s.selection)throw Error('Stale scope');
      if(action==='select'){s.index=args.index;s.selection++;return value();}
      if(action==='mode'){s.mode=args.mode;return value();}
      if(action==='close')return {closed:true};
      if(action==='image.saveAs'){if(s.savePending)return new Promise(resolve=>s.finishSave=()=>resolve({saved:true,path:'D:\\Saved\\'+entries[args.index].name}));return {saved:true,path:'D:\\Saved\\'+entries[args.index].name};}
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
  check(await page.locator('#system').textContent()==='系统应用'&&await page.locator('#close').getAttribute('title')==='关闭','viewer uses the actual main language instead of a stale settings copy');
  await page.evaluate(()=>{localStorage.setItem('rhfiles-lang','en');dispatchEvent(new StorageEvent('storage',{key:'rhfiles-lang'}));});check(await page.locator('#fit').textContent()==='Fit window'&&await page.locator('#image-seek').getAttribute('aria-label')==='Image progress: drag to jump','visible labels, tooltips and progress accessibility labels switch to English');
  await page.evaluate(()=>{localStorage.setItem('rhfiles-lang','zh');dispatchEvent(new StorageEvent('storage',{key:'rhfiles-lang'}));});
  check((await call('media.viewer.state')).mode==='paged','Windows viewer defaults to paged images');
  check(await page.locator('#mode select').count()===0&&await page.locator('#mode-paged').getAttribute('aria-pressed')==='true','browsing modes are directly visible segmented buttons');
  await call('media.viewer.seek',{index:3});await call('media.viewer.next');check((await call('media.viewer.state')).index===0,'next at the last image wraps to the first');check((await call('media.viewer.state')).loopBoundary.notice==='已回到第一张','forward wrapping displays the first-image cue');await call('media.viewer.previous');check((await call('media.viewer.state')).index===3,'previous at the first wraps to the last');check((await call('media.viewer.state')).loopBoundary.notice==='已回到最后一张','backward wrapping displays the last-image cue');await call('media.viewer.seek',{index:1});
  const requests=await page.evaluate(()=>__viewerQA.calls.filter(c=>c.action==='select').length);
  await page.locator('#image-seek').evaluate(e=>{e.value='3';e.dispatchEvent(new Event('input',{bubbles:true}));});check((await call('media.viewer.state')).index===1&&(await call('media.viewer.state')).progress.previewIndex===3&&await page.evaluate(()=>__viewerQA.calls.filter(c=>c.action==='select').length)===requests,'progress dragging previews its target without loading files');
  await page.locator('#image-seek').dispatchEvent('change');await page.waitForFunction(()=>document.getElementById('title').textContent==='d.jpg');check((await call('media.viewer.state')).index===3,'releasing progress jumps to the selected image');
  await Promise.all([call('media.viewer.seek',{index:0}),call('media.viewer.seek',{index:2}),call('media.viewer.seek',{index:1})]);check((await call('media.viewer.state')).index===1,'rapid seeks are serialized and retain the final requested target');
  await fits('large portrait fits on first open');
  await page.locator('#next').click();await page.waitForFunction(()=>document.getElementById('title').textContent==='c.jpg');
  check((await call('media.viewer.state')).index===2,'physical next button follows directory order');
  await call('media.viewer.previous');await call('media.viewer.mode.set',{mode:'continuous'});await loaded();
  const viewport=page.locator('#viewport');
  await viewport.dispatchEvent('pointerdown',{pointerId:7,pointerType:'touch',button:0,clientX:700,clientY:300});
  await viewport.dispatchEvent('pointermove',{pointerId:7,pointerType:'touch',clientX:620,clientY:300});
  await viewport.dispatchEvent('pointerup',{pointerId:7,pointerType:'touch',clientX:620,clientY:300});
  const state=await call('media.viewer.state');
  check(state.position>1&&state.position<2,'short continuous drag keeps a fractional position');
  await page.waitForTimeout(600);assert.equal((await call('media.viewer.state')).position,state.position);
  check(await page.locator('.image-page').count()<=32,'only a bounded visible image neighborhood stays mounted');
  await loaded();
  const gaps=await page.evaluate(()=>{const images=[...document.querySelectorAll('.image-page img')].sort((a,b)=>Number(a.parentElement.dataset.slot??a.parentElement.dataset.index)-Number(b.parentElement.dataset.slot??b.parentElement.dataset.index)).map(image=>{const r=image.getBoundingClientRect(),w=Math.min(r.width,r.height*image.naturalWidth/image.naturalHeight);return {left:r.left+(r.width-w)/2,right:r.left+(r.width+w)/2};});return images.slice(1).map((image,i)=>image.left-images[i].right);});
  check(gaps.length>0&&gaps.every(gap=>Math.abs(gap)<1),'actual fitted picture edges meet, including portrait letterboxing');
  await call('media.viewer.auto.speed.set',{speed:120});await call('media.viewer.auto.start');await page.waitForTimeout(250);check((await call('media.viewer.state')).position>state.position,'continuous images auto-scroll at the selected speed');
  await page.locator('#auto-scroll').click();const paused=await call('media.viewer.state');await page.waitForTimeout(200);check(!paused.autoScroll.running&&(await call('media.viewer.state')).position===paused.position,'physical pause button stops automatic movement');
  await call('media.viewer.seek',{index:1});await loaded();
  const target=await page.evaluate(()=>{const viewport=document.getElementById('viewport').getBoundingClientRect(),current=1;for(const page of document.querySelectorAll('.image-page')){const index=Number(page.dataset.index),image=page.querySelector('img'),r=RHFilesImageStrip.imageBounds(image),left=Math.max(viewport.left,r.left),right=Math.min(viewport.right,r.right);if(index!==current&&right-left>20)return {index,x:(left+right)/2,y:Math.max(viewport.top,r.top)+Math.min(viewport.bottom,r.bottom,r.top+r.height/2)-Math.max(viewport.top,r.top),bounds:r};}throw Error('No visible neighbor');});
  const originalPosition=(await call('media.viewer.state')).position;await page.mouse.move(target.x,target.y);
  check((await call('media.viewer.state')).caption.index===target.index&&(await call('media.viewer.state')).position===originalPosition,'hovering a neighboring image changes only the title, not navigation position');
  const blank=await page.evaluate(()=>{const viewport=document.getElementById('viewport').getBoundingClientRect();for(const page of document.querySelectorAll('.image-page')){const r=RHFilesImageStrip.imageBounds(page.querySelector('img')),left=Math.max(viewport.left,r.left),right=Math.min(viewport.right,r.right);if(right-left>10&&r.top>viewport.top+8)return {x:(left+right)/2,y:viewport.top+4};}throw Error('No visible letterbox');});await page.mouse.move(blank.x,blank.y);check((await call('media.viewer.state')).caption.source==='position','letterbox space uses the scroll position rather than a nearby image');
  await page.mouse.move(target.x,target.y);await page.mouse.click(target.x,target.y,{button:'right'});
  let menuState=await call('media.viewer.state');check(menuState.contextMenu.index===target.index&&!menuState.autoScroll.running,'right-click pins the actual neighboring picture and pauses automatic movement');
  const outline=await page.locator('#image-selection').boundingBox(),content=target.bounds;check(Math.abs(outline.x-content.left)<1&&Math.abs(outline.y-content.top)<1&&Math.abs(outline.width-content.width)<1&&Math.abs(outline.height-content.height)<1,'context selection outlines the whole picture rather than its page or click point');
  await page.screenshot({path:'test-artifacts/windows-viewer-image-context.png'});
  await page.getByRole('menuitem',{name:'复制文件路径',exact:true}).click();check(await page.evaluate(()=>__viewerQA.copied)===menuState.entries[target.index].path&&await page.locator('#image-menu').isHidden(),'copy-path uses the right-clicked picture and dismisses its highlight');
  await page.mouse.click(target.x,target.y,{button:'right'});await page.keyboard.press('Escape');check(!(await call('media.viewer.state')).contextMenu&&!await page.evaluate(()=>__viewerQA.calls.some(c=>c.action==='close')),'Escape closes the image menu before closing the viewer');
  await page.mouse.click(target.x,target.y,{button:'right'});await page.keyboard.press('ArrowDown');await page.keyboard.press('End');await page.keyboard.press('Enter');check(await page.evaluate(()=>__viewerQA.calls.filter(c=>c.command==='open_file').at(-1).args.path)===menuState.entries[target.index].path,'keyboard menu navigation opens the pinned picture in the system app');
  await page.evaluate(()=>__viewerQA.savePending=true);await page.mouse.click(target.x,target.y,{button:'right'});await page.getByRole('menuitem',{name:'另存为…',exact:true}).click();await page.waitForFunction(()=>!!__viewerQA.finishSave);
  const save=(await call('media.viewer.state')).saveTask;await page.evaluate(id=>__viewerQA.events['op-progress']({payload:{operationId:id,status:'running',percentage:37,speed:2097152}}),save.id);
  check(await page.locator('#image-save-detail').textContent()==='正在保存 · 37% · 2.0 MB/s','saving reports intermediate progress inside the viewer');
  await assert.rejects(()=>call('media.viewer.saveAs',{index:1}),/正在保存/);await page.evaluate(()=>__viewerQA.finishSave());await page.waitForFunction(()=>document.getElementById('image-save-detail').textContent==='已保存');
  check((await call('media.viewer.state')).saveTask.index===target.index,'save-as keeps the pinned image for the full asynchronous operation');await page.locator('#image-save-dismiss').click();
  await page.mouse.move(0,0);await page.locator('#viewport').focus();await page.keyboard.press('Space');check((await call('media.viewer.state')).autoScroll.running,'Space starts continuous auto scroll');await page.keyboard.down('Space');await page.keyboard.down('Space');check(!(await call('media.viewer.state')).autoScroll.running,'holding Space does not repeatedly toggle');await page.keyboard.up('Space');
  await page.locator('#auto-scroll').focus();await page.keyboard.press('Space');await page.waitForTimeout(80);check((await call('media.viewer.state')).autoScroll.running,'Space on the auto-scroll button toggles exactly once');await page.keyboard.press('Space');
  await page.locator('#auto-speed-number').fill('6000');await page.locator('#auto-speed-number').press('Tab');check((await call('media.viewer.state')).autoScroll.speed===6000,'precise speed input accepts 6000 pixels per second');await assert.rejects(()=>call('media.viewer.auto.speed.set',{speed:6001}));
  await page.locator('#auto-speed-number').focus();await page.keyboard.press('Space');check(!(await call('media.viewer.state')).autoScroll.running,'Space while editing speed does not start movement');
  await call('media.viewer.auto.speed.set',{speed:120});await page.locator('#mode-paged').click();check((await call('media.viewer.state')).mode==='paged'&&await page.locator('#mode-paged').getAttribute('aria-pressed')==='true','segmented button switches back to paged mode');await page.locator('#mode-continuous').click();
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
  await call('media.viewer.mode.set',{mode:'continuous'});await call('media.viewer.seek',{index:3});await loaded();
  const seamDelta=await page.evaluate(()=>Number(document.querySelector('.image-page[data-slot="4"]').style.left.slice(0,-2))-document.getElementById('viewport').clientWidth/2);
  await viewport.dispatchEvent('wheel',{deltaX:seamDelta,deltaY:0});await page.locator('.image-loop-seam').waitFor();
  const seam=await page.locator('.image-loop-seam').boundingBox(),view=await viewport.boundingBox();check(Math.abs(seam.x-(view.x+view.width/2))<2,'only the final-to-first joint has a viewport-aligned seam overlay');
  check(await page.locator('.image-loop-seam').textContent()==='末张 · 首张'&&(await call('media.viewer.state')).loopBoundary.visible,'the seam is visible and exposed by the viewer state API');
  await call('media.viewer.zoomIn');check(!(await call('media.viewer.state')).loopBoundary.visible,'zooming hides the seam in both UI and API');await call('media.viewer.fit');
  await page.screenshot({path:'test-artifacts/windows-viewer-120-loop-seam.png'});
  await page.evaluate(()=>dispatchEvent(new StorageEvent('storage',{key:'rhfiles-lang',newValue:'en'})));check(await page.locator('.image-loop-seam').textContent()==='Last · First','the visible seam follows viewer language changes');
  await page.evaluate(()=>dispatchEvent(new StorageEvent('storage',{key:'rhfiles-lang',newValue:'zh'})));
  await page.evaluate(()=>{__viewerQA.entries.reverse();__viewerQA.index=3;__viewerQA.generation++;__viewerQA.selection++;__viewerQA.events['file-viewer-changed']();});await page.waitForFunction(()=>document.getElementById('title').textContent==='a.jpg');await call('media.viewer.next');check((await call('media.viewer.state')).path.endsWith('d.jpg'),'looping follows the supplied reversed queue instead of sorting names again');
  await page.screenshot({path:'test-artifacts/windows-viewer-119-progress.png'});
  await page.evaluate(()=>{__viewerQA.entries=__viewerQA.entries.slice(0,1);__viewerQA.index=0;__viewerQA.generation++;__viewerQA.selection++;__viewerQA.events['file-viewer-changed']();});await page.waitForFunction(()=>document.getElementById('image-seek').disabled);check(await page.locator('#next').isDisabled()&&await page.locator('#previous').isDisabled(),'a single image disables paging and progress seeking');check(!(await call('media.viewer.state')).loopBoundary.visible&&await page.locator('.image-loop-seam').count()===0,'one image has no artificial loop boundary');
  check(errors.length===0,'no unhandled viewer errors');
  console.log('PASS '+checks+' Windows viewer UI checks (native decoding tested separately)');
}finally{await context.close();await fixture.close();}
