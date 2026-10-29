// Source inventory only: runtime and hardware acceptance remain separate tests.
import fs from 'node:fs';
import path from 'node:path';
import {parse} from 'acorn';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const mapping=JSON.parse(fs.readFileSync(path.join(root,'scripts/testing/rhvideo-control-map.json'),'utf8'));
export function referenceControls(html){
  return [...new Set([...html.matchAll(/\bon(?:click|change|input|keydown|dblclick|wheel)="([^"]+)"/g)].flatMap(m=>[...m[1].matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g)].map(v=>v[1])))].filter(v=>!v.startsWith('event.')&&!v.startsWith('document.')).sort();
}
export function registrations(){
  const found=new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(root,'src/rhvideo-operations.json'),'utf8')).operations).map(v=>'remote.'+v));
  function value(node,env){if(!node)return;if(node.type==='Literal')return node.value;if(node.type==='Identifier')return env[node.name];if(node.type==='ArrayExpression')return node.elements.map(v=>value(v,env));if(node.type==='BinaryExpression'&&node.operator==='+'){const a=value(node.left,env),b=value(node.right,env);if(a!==undefined&&b!==undefined)return a+b;}}
  function walk(node,env,prefix){
    if(!node||typeof node!=='object')return;
    if(node.type==='ForOfStatement'){
      const values=value(node.right,env),pattern=node.left.declarations?.[0]?.id||node.left;
      if(Array.isArray(values)){for(const v of values){const scope={...env};if(pattern.type==='Identifier')scope[pattern.name]=v;if(pattern.type==='ArrayPattern')pattern.elements.forEach((n,i)=>{if(n?.name)scope[n.name]=v?.[i];});walk(node.body,scope,prefix);}return;}
    }
    if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&['action','register'].includes(node.callee.name)){
      const name=value(node.arguments[0],env);if(typeof name==='string')found.add((node.callee.name==='register'?prefix:'')+name);
    }
    for(const [key,v] of Object.entries(node))if(!['start','end'].includes(key)){if(Array.isArray(v))v.forEach(n=>walk(n,env,prefix));else if(v&&typeof v==='object')walk(v,env,prefix);}
  }
for(const [name,prefix]of [['rhvideo-client.js',''],['rhvideo-configuration.js',''],['rhvideo-exports.js',''],['rhvideo-rules.js',''],['rhvideo-workbench.js',''],['rhvideo-player.js','player.'],['rhvideo-grid.js','grid.']])walk(parse(fs.readFileSync(path.join(root,'src/js',name),'utf8'),{ecmaVersion:'latest',sourceType:'script'}),{},prefix);
  return found;
}
export function audit(reference){
  const apis=registrations(),mapped=mapping.groups.flatMap(g=>g.reference),known=new Set([...mapped,...mapping.ignoredHelpers]);
  const controls=referenceControls(fs.readFileSync(path.join(reference,'static/index.html'),'utf8'));
  return {referenceCommit:mapping.referenceCommit,actualCommit:execFileSync('git',['-C',reference,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),referenceControls:controls.length,features:mapping.groups.length,missingControls:controls.filter(v=>!known.has(v)),staleMappings:mapped.filter(v=>!controls.includes(v)),missingAPIs:mapping.groups.flatMap(g=>g.api.filter(id=>!apis.has(id)).map(id=>({feature:g.feature,api:'rhvideo.'+id}))),modules:mapping.modules.map(m=>({...m,matched:fs.existsSync(path.join(reference,m.file))&&createHash('sha256').update(fs.readFileSync(path.join(reference,m.file))).digest('hex')===m.sha256}))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const reference=process.argv[2];if(!reference)throw Error('Usage: node scripts/testing/rhvideo-reference-audit.mjs D:/git/RHVideo');
  const result=audit(reference);console.log(JSON.stringify(result,null,2));if(result.actualCommit!==result.referenceCommit||result.missingControls.length||result.staleMappings.length||result.missingAPIs.length||result.modules.some(m=>!m.matched))process.exitCode=1;
}
