// Source inventory only: runtime and hardware acceptance remain separate tests.
import fs from 'node:fs';
import path from 'node:path';
import {parse} from 'acorn';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const mapping=JSON.parse(fs.readFileSync(path.join(root,'scripts/testing/rhvideo-control-map.json'),'utf8'));
export const sourceHash=source=>createHash('sha256').update(source.toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
export function referenceControls(html){
  return [...new Set([...html.matchAll(/\bon(?:click|change|input|keydown|dblclick|wheel)="([^"]+)"/g)].flatMap(m=>[...m[1].matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g)].map(v=>v[1])))].filter(v=>!v.startsWith('event.')&&!v.startsWith('document.')).sort();
}
// A new external module can reuse an existing inline switchTab handler. The
// inline control count alone would miss that entire new business feature.
export function referenceScriptModules(html){
  const modules=new Set();
  for(const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1/gi)){
    try{const url=new URL(match[2],'http://rhvideo.invalid/');if(url.origin==='http://rhvideo.invalid'&&url.pathname.startsWith('/static/')&&url.pathname.endsWith('.js'))modules.add(decodeURIComponent(url.pathname.slice(1)));}catch{}
  }
  return [...modules].sort();
}
export function unmappedReferenceModules(html,contract,inventory){
  const declared=new Set([...Object.keys(contract.sources||{}),...(contract.script_order||[]),...referenceScriptModules(html)]);
  const known=new Set(inventory.map(module=>module.file));
  return [...declared].filter(file=>!known.has(file)).sort();
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
    const registration=node.type==='CallExpression'&&(node.callee.type==='Identifier'?node.callee.name:node.callee.type==='MemberExpression'&&node.callee.object?.name==='ctx'&&node.callee.property?.name==='action'?'action':null);
    if(['action','register'].includes(registration)){
      const name=value(node.arguments[0],env);if(typeof name==='string')found.add((registration==='register'?prefix:'')+name);
    }
    for(const [key,v] of Object.entries(node))if(!['start','end'].includes(key)){if(Array.isArray(v))v.forEach(n=>walk(n,env,prefix));else if(v&&typeof v==='object')walk(v,env,prefix);}
  }
for(const [name,prefix]of [['rhvideo-client.js',''],['rhvideo-configuration.js',''],['rhvideo-exports.js',''],['rhvideo-duplicates.js',''],['rhvideo-task-priority.js',''],['rhvideo-task-presentation.js',''],['rhvideo-task-center.js',''],['rhvideo-rules.js',''],['rhvideo-workbench.js',''],['rhvideo-player.js','player.'],['rhvideo-grid.js','grid.']])walk(parse(fs.readFileSync(path.join(root,'src/js',name),'utf8'),{ecmaVersion:'latest',sourceType:'script'}),{},prefix);
  return found;
}
export function audit(reference){
  if(mapping.sourceHash!=='sha256-utf8-lf')throw Error('Unknown reference source hash mode');
  const apis=registrations(),mapped=mapping.groups.flatMap(g=>g.reference),known=new Set([...mapped,...mapping.ignoredHelpers]);
  const html=fs.readFileSync(path.join(reference,'static/index.html'),'utf8'),controls=referenceControls(html);
  const contract=JSON.parse(fs.readFileSync(path.join(reference,'static/operation-contract.json'),'utf8'));
  const moduleFeatures=mapping.modules.filter(module=>module.api?.length),features=[...mapping.groups,...moduleFeatures];
  return {referenceCommit:mapping.referenceCommit,actualCommit:execFileSync('git',['-C',reference,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),sourceHash:mapping.sourceHash,referenceControls:controls.length,features:features.length,missingControls:controls.filter(v=>!known.has(v)),staleMappings:mapped.filter(v=>!controls.includes(v)),missingAPIs:features.flatMap(g=>g.api.filter(id=>!apis.has(id)).map(id=>({feature:g.feature,api:'rhvideo.'+id}))),unmappedModules:unmappedReferenceModules(html,contract,mapping.modules),modules:mapping.modules.map(m=>({...m,matched:fs.existsSync(path.join(reference,m.file))&&sourceHash(fs.readFileSync(path.join(reference,m.file)))===m.sha256}))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const reference=process.argv[2];if(!reference)throw Error('Usage: node scripts/testing/rhvideo-reference-audit.mjs D:/git/RHVideo');
  const result=audit(reference);console.log(JSON.stringify(result,null,2));if(result.actualCommit!==result.referenceCommit||result.missingControls.length||result.staleMappings.length||result.missingAPIs.length||result.unmappedModules.length||result.modules.some(m=>!m.matched))process.exitCode=1;
}
