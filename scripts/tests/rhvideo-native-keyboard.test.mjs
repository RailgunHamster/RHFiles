import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {parse} from 'acorn';

function keyboard(file,id){
  const source=fs.readFileSync(new URL('../../src/js/'+file,import.meta.url),'utf8');let handler;
  const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&node.callee?.object?.name==='RHFilesUI'&&node.callee.property?.name==='listen'&&node.arguments[0]?.name==='document'&&node.arguments[1]?.value==='keydown'&&node.arguments[4]?.value===id)handler=source.slice(node.arguments[2].start,node.arguments[2].end);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);};
  visit(parse(source,{ecmaVersion:'latest'}));assert(handler,'Use the actual '+id+' listener');return handler;
}
const handlers={player:keyboard('rhvideo-player.js','rhvideo.player.keyboard'),grid:keyboard('rhvideo-grid.js','rhvideo.grid.keyboard')};
function fixture(kind,{origin='frame',reference=true,editing=false,cells=true}={}){
  const calls=[],context=vm.createContext({state:{queue:{options:{reference,origin}},cells:cells?[{inputId:19}]:[]},api:{invoke:(name,args)=>{calls.push({name,args:JSON.parse(JSON.stringify(args??{}))});return Promise.resolve();}},call:(name,args)=>{calls.push({name,args:JSON.parse(JSON.stringify(args))});return Promise.resolve();},toggleCommand:()=> 'pause',error(){}}),run=vm.runInContext('('+handlers[kind]+')',context);
  return {calls,dispatch(values={}){const event={key:'End',code:'End',ctrlKey:false,altKey:false,shiftKey:false,metaKey:false,repeat:false,target:{matches:()=>editing,closest:()=>editing,isContentEditable:editing},preventDefault(){this.defaultPrevented=true;},...values};run(event);return event;}};
}
for(const kind of ['player','grid'])for(const [key,code]of [['Home',''],['End',''],['Home','Numpad7'],['End','Numpad1']])test(`${kind} uses semantic ${key} with code ${JSON.stringify(code)}`,()=>{
  const qa=fixture(kind),event=qa.dispatch({key,code});assert.equal(event.defaultPrevented,true);
  assert.deepEqual(qa.calls,kind==='player'?[{name:'rhvideo.player.seekQueue',args:{ratio:key==='Home'?0:1}}]:[{name:'input',args:{inputId:19,target:0,intent:key==='Home'?'first':'last'}}]);
});
for(const kind of ['player','grid'])test(`${kind} does not interpret a NumLock digit or remapped physical key as navigation`,()=>{
  for(const [key,code]of [['1','Numpad1'],['7','Home'],['a','Space'],['a','ArrowRight']]){const qa=fixture(kind);qa.dispatch({key,code});assert.deepEqual(qa.calls,[]);}
});
for(const kind of ['player','grid'])test(`${kind} accepts semantic arrows and Space without physical code`,()=>{
  for(const [key,name]of [['ArrowLeft','previous'],['ArrowRight','next'],[' ','toggle']]){const qa=fixture(kind),event=qa.dispatch({key,code:''});assert.equal(event.defaultPrevented,true);assert.deepEqual(qa.calls,kind==='player'?[{name:'rhvideo.player.'+(name==='toggle'?'control':name),args:name==='toggle'?{command:'pause'}:{}}]:[{name:'input',args:{inputId:19,target:0,intent:name}}]);}
});
for(const kind of ['player','grid'])test(`${kind} retains legacy code-only and Unidentified navigation`,()=>{
  for(const key of ['',undefined,'Unidentified']){const qa=fixture(kind);qa.dispatch({key,code:'End'});assert.equal(qa.calls.length,1);}
});
test('native player semantic navigation preserves favorite parent and non-queue boundaries',()=>{
  const favorite=fixture('player',{origin:'favorite',reference:false});favorite.dispatch({key:'Home',code:''});assert.deepEqual(favorite.calls,[{name:'rhvideo.player.seekParent',args:{ratio:0}}]);
  const single=fixture('player',{origin:'video',reference:false});single.dispatch({key:'End',code:''});assert.deepEqual(single.calls,[]);
  const editor=fixture('player',{editing:true});editor.dispatch({key:'End',code:''});assert.deepEqual(editor.calls,[]);
  const close=fixture('player',{editing:true});close.dispatch({key:'Escape',code:''});assert.deepEqual(close.calls,[{name:'rhvideo.player.close',args:{}}]);
  for(const field of ['ctrlKey','altKey','shiftKey','metaKey','repeat']){const qa=fixture('player');qa.dispatch({key:'Delete',code:'Delete',[field]:true});assert.deepEqual(qa.calls,[]);}
});
test('native grid preserves editor, modifier, repeat and uninitialized-input boundaries',()=>{
  for(const options of [{editing:true},{cells:false}]){const qa=fixture('grid',options);qa.dispatch({key:'End',code:''});assert.deepEqual(qa.calls,[]);}
  for(const field of ['ctrlKey','altKey','metaKey','repeat']){const qa=fixture('grid');qa.dispatch({key:'End',code:'End',[field]:true});assert.deepEqual(qa.calls,[]);}
});
const reference=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html');
test('differential: native player and grid named navigation match the actual reference key handlers',{skip:!fs.existsSync(reference)},()=>{
  const originals={};for(const script of fs.readFileSync(reference,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))for(const node of parse(script[1],{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration'&&['playlistKeyHandler','gridKeyHandler'].includes(node.id?.name))originals[node.id.name]=script[1].slice(node.start,node.end);
  for(const kind of ['player','grid'])for(const [key,code]of [['Home',''],['End','Numpad1'],['ArrowLeft',''],['ArrowRight',''],['1','Numpad1']]){
    const name=kind==='player'?'playlistKeyHandler':'gridKeyHandler';assert(originals[name]);const expected=[],context=vm.createContext({document:{getElementById:()=>({classList:{contains:()=>false}})},playlistNav:delta=>expected.push(delta<0?'previous':'next'),gridPlayNav:delta=>expected.push(delta<0?'previous':'next'),playlistProgressCommit:args=>expected.push(Number(args.value)===0?'first':'last'),gridProgressCommit:args=>expected.push(Number(args.value)===0?'first':'last')});
    vm.runInContext('('+originals[name]+')',context)({key,code,target:{closest:()=>null},preventDefault(){}});const qa=fixture(kind);qa.dispatch({key,code});assert.deepEqual(qa.calls.map(call=>kind==='grid'?call.args.intent:call.name.endsWith('seekQueue')?(call.args.ratio===0?'first':'last'):call.name.split('.').at(-1)),expected);
  }
});
