// Mechanical migration and permanent coverage gate for first-party UI bindings.
// This never rewrites third-party renderers, generated assets, or tests.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const rootIndex=process.argv.indexOf('--root');
const root=rootIndex>=0?path.resolve(process.argv[rootIndex+1]):path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),{parse}=require('acorn');
const excluded=new Set(['automation-core.js','automation-desktop.js','automation-android.js','test-harness.js','preview3d.bundle.js']);
const events=new Set(['click','dblclick','auxclick','contextmenu','input','beforeinput','change','submit','reset','focus','blur','focusin','focusout','select','keydown','keyup','pointerdown','pointermove','pointerup','pointercancel','pointerenter','pointerleave','pointerover','pointerout','mousedown','mousemove','mouseup','mouseenter','mouseleave','mouseover','mouseout','touchstart','touchmove','touchend','touchcancel','dragstart','dragover','dragenter','dragleave','drop','dragend','wheel','toggle']);
const sources=['src/js','android/web/js'].flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(name=>name.endsWith('.js')&&!excluded.has(name)&&name!=='nearby-ui.js').map(name=>dir+'/'+name));
// The canonical Nearby UI is shared by desktop/Android and synced separately.
sources.push('src/js/nearby-ui.js');
sources.push('android/reader/reader.js');
function walk(node,visit,parents=[]){if(!node||typeof node!=='object')return;if(node.type)visit(node,parents);for(const [key,value]of Object.entries(node)){if(['start','end','loc'].includes(key))continue;if(Array.isArray(value))for(const child of value)walk(child,visit,[...parents,node]);else if(value&&typeof value==='object')walk(value,visit,[...parents,node]);}}
const property=n=>n?.computed?n.property?.type==='Literal'?n.property.value:null:n?.property?.name;
const issues=[],counts={files:sources.length,listeners:0,properties:0,migrated:0};
for(const file of sources){
  const full=path.join(root,file),source=fs.readFileSync(full,'utf8'),tree=parse(source,{ecmaVersion:'latest',sourceType:'module',allowReturnOutsideFunction:true}),edits=[];
  const site=(node,parents)=>{
    const owner=[...parents].reverse().find(p=>p.type==='FunctionDeclaration'||p.type==='MethodDefinition'||p.type==='VariableDeclarator'&&['FunctionExpression','ArrowFunctionExpression'].includes(p.init?.type));
    const name=owner?.id?.name||owner?.key?.name||'top';const target=source.slice(node.type==='AssignmentExpression'?node.left.object.start:node.callee.object.start,node.type==='AssignmentExpression'?node.left.object.end:node.callee.object.end).replace(/\s+/g,' ');
    return file.replace(/\.js$/,'').replaceAll('/','.')+'.'+name+'.'+createHash('sha256').update(target+':'+(node.type==='AssignmentExpression'?property(node.left):source.slice(node.arguments[0]?.start,node.arguments[0]?.end))).digest('hex').slice(0,12);
  };
  walk(tree,(node,parents)=>{
    if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&['addEventListener','removeEventListener'].includes(property(node.callee))){
      const type=node.arguments[0];if(type?.type==='Literal'&&!events.has(type.value))return;
      const operation=property(node.callee)==='addEventListener'?'listen':'remove';counts.listeners++;issues.push({file,line:source.slice(0,node.start).split('\n').length,kind:operation});
      edits.push({start:node.callee.start,end:node.callee.end,text:'RHFilesUI.'+operation}, {start:node.callee.end+1,end:node.callee.end+1,text:source.slice(node.callee.object.start,node.callee.object.end)+','});
      if(operation==='listen')edits.push({start:node.end-1,end:node.end-1,text:(node.arguments.length<3?',undefined':'')+','+JSON.stringify(site(node,parents))});
    }
    if(node.type==='AssignmentExpression'&&node.operator==='='&&node.left.type==='MemberExpression'){
      const name=property(node.left);if(typeof name!=='string'||!name.startsWith('on')||!events.has(name.slice(2)))return;
      counts.properties++;issues.push({file,line:source.slice(0,node.start).split('\n').length,kind:name});
      edits.push({start:node.start,end:node.right.start,text:'RHFilesUI.assign('+source.slice(node.left.object.start,node.left.object.end)+','+JSON.stringify(name.slice(2))+','},{start:node.end,end:node.end,text:','+JSON.stringify(site(node,parents))+')'});
    }
  });
  if(process.argv.includes('--write')&&edits.length){
    // Right-to-left edits preserve closures, callback bodies, this and options.
    edits.sort((a,b)=>b.start-a.start||b.end-a.end);let value=source;for(const e of edits)value=value.slice(0,e.start)+e.text+value.slice(e.end);parse(value,{ecmaVersion:'latest',sourceType:'module',allowReturnOutsideFunction:true});fs.writeFileSync(full,value);counts.migrated+=issues.filter(i=>i.file===file).length;
  }
}
if(process.argv.includes('--write'))console.log(JSON.stringify({migration:counts}));
else if(issues.length){console.error(JSON.stringify({unregisteredUIBindings:issues,summary:counts},null,2));process.exitCode=1;}
else console.log(JSON.stringify({pass:true,summary:counts,inlineHandlers:'registered by automation-core surface scanner',excluded:['third-party bundles','system-owned UI','lifecycle and storage notifications']}));
