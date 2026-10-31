import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {parse} from 'acorn';
const source=fs.readFileSync(new URL('../../src/js/rhvideo-workbench.js',import.meta.url),'utf8'),functions=new Map();
function visit(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration')functions.set(node.id.name,node);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}visit(parse(source,{ecmaVersion:'latest'}));
function fixture({mobile=true}={}){
 class Node{constructor(tag,text,cls){this.tagName=tag;this.textContent=text;this.className=cls||'';this.dataset={};this.attributes={};this.children=[];}setAttribute(k,v){this.attributes[k]=v;}replaceChildren(...nodes){this.children=nodes;}querySelector(selector){return this.children.find(n=>n.className===selector.slice(1))||null;}}
 const calls=[],names=['imageTool','imageToolLabel'],definitions=names.map(name=>{const node=functions.get(name);assert(node,'Actual toolbar helper missing: '+name);return source.slice(node.start,node.end);}).join('\n');
 const ctx=vm.createContext({ctx:{mobile},el:(tag,text,cls)=>new Node(tag,text,cls),icon:name=>'<svg data-generated="'+name+'"></svg>',button:(text,name,args,cls)=>{calls.push({text,name,args,cls});const node=new Node('button',text,cls);node.dataset.apiAction='rhvideo.'+name;return node;}});vm.runInContext(definitions,ctx);return {tool:ctx.imageTool,label:ctx.imageToolLabel,calls};
}
test('image tools retain the original action, arguments and full accessible label while adding an independent glyph',()=>{
 const p=fixture(),args={super:true},node=p.tool('超压播放此刻','image.playFrame',args,'play-super','wb-frame-play-low');assert.equal(node.id,'wb-frame-play-low');assert.equal(node.dataset.apiAction,'rhvideo.image.playFrame');assert.equal(p.calls[0].args,args);assert.match(node.className,/image-tool-button/);assert.equal(node.children.length,2);assert.equal(node.children[0].attributes['aria-hidden'],'true');assert.equal(node.children[1].textContent,'超压播放此刻');assert.equal(node.attributes['aria-label'],'超压播放此刻');assert.equal(node.title,'超压播放此刻');
});
test('favorite repaint updates labels without destroying its SVG or changing its action identity',()=>{
 const p=fixture(),node=p.tool('收藏','image.favorite',{},'heart','wb-image-favorite'),glyph=node.children[0];p.label(node,'取消收藏');assert.equal(node.children[0],glyph);assert.equal(glyph.innerHTML,'<svg data-generated="heart"></svg>');assert.equal(node.children[1].textContent,'取消收藏');assert.equal(node.attributes['aria-label'],'取消收藏');assert.equal(node.title,'取消收藏');assert.equal(node.dataset.apiAction,'rhvideo.image.favorite');
 const paint=functions.get('refreshImage');assert(paint);const body=source.slice(paint.start,paint.end);assert.match(body,/imageToolLabel\(favorite,/);assert.doesNotMatch(body,/favorite\.textContent\s*=/);
});
test('desktop keeps its existing plain-text toolbar, including later favorite state updates',()=>{
 const p=fixture({mobile:false}),node=p.tool('收藏','image.favorite',{},'heart','wb-image-favorite');assert.equal(node.textContent,'收藏');assert.equal(node.children.length,0);assert.equal(node.className,'text-button');p.label(node,'取消收藏');assert.equal(node.textContent,'取消收藏');assert.equal(node.children.length,0);
});
test('compact mobile tools preserve desktop labels, existing touch scrolling and visible fit/percentage feedback',()=>{
 const base=fs.readFileSync(new URL('../../src/css/rhvideo-workbench.css',import.meta.url),'utf8'),mobile=fs.readFileSync(new URL('../../android/web/css/rhvideo-mobile.css',import.meta.url),'utf8');assert.match(base,/\.image-tool-glyph\s*\{\s*display:\s*none/);assert.match(mobile,/\.mobile-client \.image-dialog \.image-tool-label\s*\{[^}]*clip-path:\s*inset\(50%\)/);assert.match(mobile,/\.mobile-client \.image-dialog \.image-tool-glyph\s*\{[^}]*display:\s*grid/);assert.match(mobile,/\.mobile-client \.image-dialog #image-fit\s*\{[^}]*min-width:\s*56px/);assert.match(mobile,/overflow-x:auto/);assert.doesNotMatch(mobile,/\.image-tool-label\s*\{[^}]*display:\s*none/);
});
