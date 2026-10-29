import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
import {createRequire} from 'node:module';
const RHVideoTaskPriority=createRequire(import.meta.url)('../../src/js/rhvideo-task-priority.js');

const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8');let handler;
function walk(node){if(!node||typeof node!=='object')return;if(node.type==='CallExpression'&&node.callee.name==='action'&&node.arguments[0]?.value==='server.filter')handler=node.arguments[2];for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
walk(parse(source,{ecmaVersion:'latest'}));
function fixture(){const server={page:'replacement',queue:'replacement',view:'queued',pageNumber:3,q:'待处理',days:7,status:'all'},scope=vm.createContext({server,renderServer:async()=>{},liveRefresh:{configure(){}},taskPriority:null,RHVideoTaskPriority});return {server,invoke:vm.runInContext('('+source.slice(handler.start,handler.end)+')',scope)};}
test('choosing default tasks from the replacement page actually changes the displayed queue',async()=>{
  const f=fixture();await f.invoke({key:'queue',value:'default'});assert.equal(f.server.queue,'default');assert.equal(f.server.page,'tasks');assert.equal(f.server.pageNumber,1);
});
test('task filtering rejects unsupported fields and values before changing the live filter',async()=>{
  for(const [key,value]of [['queue','all'],['view','nope'],['pageNumber',0],['days',8],['status','running'],['q','x'.repeat(201)],['load',10]]){
    const f=fixture(),before=JSON.stringify(f.server);await assert.rejects(f.invoke({key,value}));assert.equal(JSON.stringify(f.server),before);
  }
});
