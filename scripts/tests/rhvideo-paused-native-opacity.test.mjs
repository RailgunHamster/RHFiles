import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
import {createRequire} from 'node:module';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8'),I=createRequire(import.meta.url)('../../src/js/rhvideo-index.js');
let slide;
function find(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id?.name==='slide')slide=source.slice(node.start,node.end);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(find);else if(value&&typeof value==='object')find(value);}
find(parse(source,{ecmaVersion:'latest'}));assert(slide,'Execute the actual production slide function');
function fixture(running,{replaceDuringRead=false,replaceTransitionDuringRead=false,replaceDuringBounds=false}={}){
 const calls=[],queue=[{kind:'video',id:'video-0',title:'synthetic only'}],surface={children:[],style:{setProperty(){}},querySelector:()=>null,append(node){this.children.push(node);}},viewer={length:1,queue,surface,source:'favorite',running,videoActive:true};let context;
 const settings={favoriteFadeMs:800,favoriteStay:7,videoStay:15};
 context=vm.createContext({viewer,I,config:()=>settings,performance:{now:()=>1000},refreshViewer(){},paintSlideshowProgress(){},
  slideshowPlan:v=>I.slideshowPlan(v.queue,settings,v.source),el:()=>({style:{setProperty(){}},classList:{toggle(){}}}),
  invoke:async(name,args)=>{calls.push({name,args});},native:async(name,args)=>{calls.push({name,args});if(name==='presentation.state'){if(replaceDuringRead)context.viewer={replacement:true};if(replaceTransitionDuringRead)viewer.transitionTicket++;return {renderedFrames:1};}},syncPresentation:async opacity=>{calls.push({name:'bounds',opacity});if(replaceDuringBounds)context.viewer={replacement:true};}});
 vm.runInContext(slide,context);return {context,viewer,calls};
}
test('manual navigation to a decoded native video while paused makes it fully visible, without starting a hidden fade',async()=>{
 const f=fixture(false);await f.context.slide(0,3);
 assert.deepEqual(f.calls.filter(row=>row.name==='bounds').map(row=>row.opacity),[1]);assert.equal(f.viewer.videoFadeSeconds,0,'Resume must not dim a frame that was already shown paused');
 assert.deepEqual(f.calls.filter(row=>row.name==='presentation.control').map(row=>row.args.command),['pause']);assert.equal(f.viewer.elapsed,3);assert.equal(f.viewer.current.id,'video-0');assert.equal(f.viewer.loadingMedia,false);
});
test('ordinary running mixed-video transitions retain their original fade instead of disabling animation globally',async()=>{
 const f=fixture(true);await f.context.slide(0);
 assert.deepEqual(f.calls.filter(row=>row.name==='bounds').map(row=>row.opacity),[0]);assert.equal(f.viewer.videoFadeSeconds,.8);assert.equal(f.calls.filter(row=>row.name==='presentation.control').length,0);
});
test('a late first-frame read from an old viewer cannot update or pause its replacement',async()=>{
 const f=fixture(false,{replaceDuringRead:true}),result=await f.context.slide(0);
 assert.equal(f.calls.filter(row=>row.name==='bounds'||row.name==='presentation.control').length,0);assert.equal(result?.stale,true);assert.equal(f.viewer.surface.children.length,0);assert.equal(f.context.viewer.replacement,true);
});
test('a newer slide in the same viewer invalidates a late first-frame read',async()=>{
 const f=fixture(false,{replaceTransitionDuringRead:true}),result=await f.context.slide(0);
 assert.equal(f.calls.filter(row=>row.name==='bounds'||row.name==='presentation.control').length,0);assert.equal(result?.stale,true);assert.equal(f.viewer.surface.children.length,0);
});
test('an old bounds completion cannot queue a pause for a replacement viewer',async()=>{
 const f=fixture(false,{replaceDuringBounds:true}),result=await f.context.slide(0);
 assert.equal(f.calls.filter(row=>row.name==='presentation.control').length,0);assert.equal(result?.stale,true);assert.equal(f.viewer.surface.children.length,0);
});
