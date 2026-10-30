import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {parse} from 'acorn';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8');
let listener;
function visit(node){if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&node.callee?.name==='listen'&&node.arguments[0]?.name==='document'&&node.arguments[1]?.value==='keydown'&&node.arguments[3]?.value==='keyboard')listener=source.slice(node.arguments[2].start,node.arguments[2].end);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
visit(parse(source,{ecmaVersion:'latest'}));assert(listener,'Execute the actual workbench keyboard handler');
function fixture({scope='viewer',editing=false,blocked=false,shortcuts={}}={}){
  const calls=[],context=vm.createContext({$:id=>({open:id===({'viewer':'wb-viewer','reader':'reader-dialog','image':'image-dialog'})[scope]||blocked&&id==='wb-confirm'}),invoke:(name,args)=>{calls.push({name,args:JSON.parse(JSON.stringify(args))});return Promise.resolve();},notice(){},shortcutDefaults:{viewer:{toggle:'Space',previous:'ArrowLeft',next:'ArrowRight'},reader:{previous:'ArrowLeft',next:'ArrowRight'},image:{previous:'ArrowLeft',next:'ArrowRight'}},prefs:{shortcuts}});
  const handler=vm.runInContext('('+listener+')',context);
  return {calls,dispatch(values){const event={key:'End',code:'End',ctrlKey:false,altKey:false,shiftKey:false,metaKey:false,defaultPrevented:false,target:{closest:()=>editing},preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...values};handler(event);return event;}};
}
for(const key of ['Home','End'])for(const code of [key,'','Unidentified',key==='Home'?'Numpad7':'Numpad1'])test(`viewer ${key} is semantic navigation with code ${JSON.stringify(code)}`,()=>{
  const qa=fixture(),event=qa.dispatch({key,code});assert.deepEqual(qa.calls,[{name:'viewer.seek',args:{ratio:key==='Home'?0:1}}]);assert.equal(event.defaultPrevented,true);assert.equal(event.stopped,true);
});
test('named navigation does not reinterpret a NumLock digit or a remapped key as Home',()=>{
  for(const code of ['Numpad7','Home']){const qa=fixture();qa.dispatch({key:'7',code});assert.deepEqual(qa.calls,[]);}
});
test('legacy code-only Home and End still work without semantic key information',()=>{
  for(const key of ['Home','End']){const qa=fixture();qa.dispatch({key:'',code:key});assert.deepEqual(qa.calls,[{name:'viewer.seek',args:{ratio:key==='Home'?0:1}}]);}
});
test('navigation keeps modifier, editor, confirmation and non-viewer boundaries',()=>{
  for(const field of ['ctrlKey','shiftKey','altKey','metaKey','defaultPrevented']){const qa=fixture();qa.dispatch({[field]:true});assert.deepEqual(qa.calls,[]);}
  for(const options of [{editing:true},{blocked:true},{scope:'reader'},{scope:'image'},{scope:null}]){const qa=fixture(options);qa.dispatch({key:'End',code:''});assert.deepEqual(qa.calls,[]);}
});
test('ordinary configured physical shortcuts are unchanged',()=>{
  const qa=fixture({shortcuts:{viewer:{next:'KeyQ'}}});qa.dispatch({key:'й',code:'KeyQ'});assert.deepEqual(qa.calls,[{name:'viewer.step',args:{direction:1}}]);
});
const reference=path.join(process.env.RHVIDEO_SOURCE||path.resolve('../RHVideo'),'static/index.html');
test('differential: original favorite slideshow accepts semantic Home/End, including keypad navigation',{skip:!fs.existsSync(reference)},()=>{
  let original;for(const script of fs.readFileSync(reference,'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))for(const node of parse(script[1],{ecmaVersion:'latest'}).body)if(node.type==='FunctionDeclaration'&&node.id?.name==='favshowKeyHandler')original=script[1].slice(node.start,node.end);assert(original);
  for(const [key,code]of [['Home',''],['End',''],['Home','Numpad7'],['End','Numpad1'],['7','Numpad7']]){
    const expected=[],context=vm.createContext({document:{getElementById:()=>({classList:{contains:()=>false}})},favshowProgressCommit:args=>expected.push(Number(args.value)/1000)}),run=vm.runInContext('('+original+')',context);
    run({key,code,preventDefault(){}});const qa=fixture();qa.dispatch({key,code});assert.deepEqual(qa.calls.map(call=>call.args.ratio),expected);
  }
});
