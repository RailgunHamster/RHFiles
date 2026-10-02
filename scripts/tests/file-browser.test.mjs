// Business invariants adapted for RHFiles; see docs/TESTING.md for source mapping.
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {context,load,plain,propertyOptions} from '../testing/source.mjs';

function paths() {
  const ctx=context({t:x=>x});
  load(ctx,'common.js',['decodeFileUriPath','normalizeWindowsPathInput','displayPath','parentFolderPath']);
  load(ctx,'remote.js',['isFtpPath','ftpUrl','pathLeaf']);
  load(ctx,'ops.js',['joinFolderPath','windowsPathKey']);
  return ctx;
}
const names=['中文 文件.txt','emoji 📁.json','report#1%.txt','a+b.txt',"O'Brien.txt",'.gitignore','a..b.txt','résumé.txt','e\u0301.txt'];
for (const name of names) test(`address-bar file URI preserves filename: ${name}`,()=>{
  const ctx=paths();
  assert.equal(ctx.normalizeWindowsPathInput('file:///C:/data/'+encodeURIComponent(name)),'C:\\data\\'+name);
  assert.equal(ctx.normalizeWindowsPathInput('file://server/share/'+encodeURIComponent(name)),'\\\\server\\share\\'+name);
});
for (const [input,want] of [
  ['C:','C:\\'],[' "C:/some folder/a.txt" ','C:\\some folder\\a.txt'],
  ['\\\\server\\share\\folder','\\\\server\\share\\folder'],['///server/share/','\\\\server\\share'],
  ['file://localhost/C:/a.txt','C:\\a.txt'],['file:///C:/a%2520b.txt','C:\\a%20b.txt'],
  ['home://','home://'],['ftp://host/a%20b','ftp://host/a%20b'],
]) test(`address-bar canonicalization: ${input}`,()=>assert.equal(paths().normalizeWindowsPathInput(input),want));

test('pasted path normalization is idempotent across Unicode names',()=>{
  const ctx=paths();
  fc.assert(fc.property(fc.array(fc.constantFrom(...names),{minLength:1,maxLength:5}),parts=>{
    const input='file:///D:/'+parts.map(encodeURIComponent).join('/');
    const normalized=ctx.normalizeWindowsPathInput(input);
    assert.equal(ctx.normalizeWindowsPathInput(normalized),normalized);
    assert.equal(ctx.pathLeaf(normalized),parts.at(-1));
  }),propertyOptions());
});

function sorting() {
  const ctx=context();
  load(ctx,'filelist.js',['naturalCompare','sortableDateValue','sortEntriesList','sortStateEntries']);
  return ctx;
}

test('grid arrow navigation stays in bounds and follows visual rows and columns',()=>{
  const ctx=context();load(ctx,'keyboard.js',['gridNavigationIndex']);
  fc.assert(fc.property(fc.integer({min:1,max:200}),fc.integer({min:1,max:12}),fc.nat(),(count,columns,n)=>{
    const current=n%count;
    for(const key of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']){
      const next=ctx.gridNavigationIndex(current,key,count,columns);assert.ok(next>=0&&next<count);
      if(key==='ArrowLeft')assert.equal(next,Math.max(0,current-1));
      if(key==='ArrowRight')assert.equal(next,Math.min(count-1,current+1));
      if(key==='ArrowUp')assert.equal(next,current>=columns?current-columns:current);
      if(key==='ArrowDown')assert.equal(next,current+columns<count?current+columns:current);
    }
    assert.equal(ctx.gridNavigationIndex(-1,'ArrowUp',count,columns),count-1);
    assert.equal(ctx.gridNavigationIndex(-1,'ArrowRight',count,columns),0);
    assert.equal(ctx.gridNavigationIndex(0,'ArrowRight',0,columns),-1);
  }),propertyOptions());
});
const entryArb=fc.record({name:fc.constantFrom(...names,'file2.txt','file10.txt'),is_dir:fc.boolean(),
  size:fc.integer({min:0,max:2**31}),modified_ts:fc.integer({min:1,max:2**31}),created_ts:fc.integer({min:1,max:2**31}),
  extension:fc.constantFrom('txt','JSON','','RDC')});
for(const field of ['name','size','modified','created','type']) for(const asc of [true,false]) {
  test(`sort ${field} ${asc?'ascending':'descending'} retains selection, focus and folder-first grouping`,()=>{
    const ctx=sorting();
    fc.assert(fc.property(fc.array(entryArb,{minLength:2,maxLength:40}),rows=>{
      const entries=rows.map((row,i)=>({...row,path:'C:\\data\\'+i}));
      const state={entries,sel:new Set([0,entries.length-1]),lastIdx:entries.length-1};
      ctx.sortStateEntries(state,field,asc);
      assert.deepEqual([...state.sel].map(i=>state.entries[i].path).sort(),[entries[0].path,entries.at(-1).path].sort());
      assert.equal(state.entries[state.lastIdx].path,entries.at(-1).path);
      assert.deepEqual(plain(state.entries.map(e=>e.path).sort()),entries.map(e=>e.path).sort());
      const firstFile=state.entries.findIndex(e=>!e.is_dir);
      if(firstFile>=0) assert.ok(state.entries.slice(firstFile).every(e=>!e.is_dir));
      assert.deepEqual(plain(ctx.sortEntriesList(state.entries,field,asc)),plain(state.entries),'sorting twice must not reshuffle');
      for(let i=1;i<state.entries.length;i++) {
        const a=state.entries[i-1],b=state.entries[i];if(a.is_dir!==b.is_dir)continue;
        if(field==='name') assert.ok(ctx.naturalCompare(a.name.toLowerCase(),b.name.toLowerCase())*(asc?1:-1)<=0);
        else {const key={size:'size',modified:'modified_ts',created:'created_ts',type:'extension'}[field];
          const av=field==='type'?a[key].toLowerCase():a[key],bv=field==='type'?b[key].toLowerCase():b[key];
          assert.ok(asc?av<=bv:av>=bv);}
      }
    }),propertyOptions());
  });
}
test('natural name sorting puts file2 before file10',()=>assert.deepEqual(plain(sorting().sortEntriesList(
  ['file10','file2','file1'].map(name=>({name,is_dir:false})),'name',true)).map(e=>e.name),['file1','file2','file10']));

test('tab drag reordering never loses tabs or crosses the pinned boundary',()=>{
  const ctx=context();load(ctx,'tabs.js',['reorderTabsByDrop','normalizePinnedTabOrder']);
  fc.assert(fc.property(fc.array(fc.boolean(),{minLength:2,maxLength:30}),fc.nat(),fc.nat(),fc.boolean(),(pins,a,b,after)=>{
    const tabs=pins.map((p,id)=>({id,pinned:p}));ctx.normalizePinnedTabOrder(tabs);
    const before=JSON.stringify(tabs),from=tabs[a%tabs.length],to=tabs[b%tabs.length];
    const changed=ctx.reorderTabsByDrop(tabs,from.id,to.id,after);
    assert.deepEqual(tabs.map(t=>t.id).sort((x,y)=>x-y),pins.map((_,i)=>i));
    if(from.pinned!==to.pinned || from.id===to.id) {assert.equal(changed,false);assert.equal(JSON.stringify(tabs),before);}
    const split=tabs.findIndex(t=>!t.pinned);if(split>=0)assert.ok(tabs.slice(split).every(t=>!t.pinned));
    if(changed) assert.equal(tabs.findIndex(t=>t.id===from.id),tabs.findIndex(t=>t.id===to.id)+(after?1:-1));
  }),propertyOptions());
});
test('close-other and close-to-right protect pinned tabs',()=>{
  const ctx=context();load(ctx,'tabs.js',['tabsKeptAfterCloseOthers','closableTabIdsToRight']);
  const tabs=[{id:1,pinned:true},{id:2},{id:3,pinned:true},{id:4}];
  assert.deepEqual(plain(ctx.tabsKeptAfterCloseOthers(tabs,2)).map(t=>t.id),[1,2,3]);
  assert.deepEqual([...ctx.closableTabIdsToRight(tabs,2)],[4]);
});
for(const name of ['a.txt','.gitignore','archive.tar.gz','中文 (1).txt']) test('keep-both preserves extension and avoids every collision: '+name,()=>{
  const ctx=context();load(ctx,'conflict.js',['fileNameKey','generateUniqueName']);
  const used=new Set([name]);
  for(let i=0;i<100;i++){const next=ctx.generateUniqueName('C:\\dest',name,used);assert.ok(!used.has(next));
    if(name==='archive.tar.gz')assert.ok(next.endsWith('.gz'));used.add(next);}
});
for(const [label,text] of [['long line','x'.repeat(40001)],['many lines','a\n'.repeat(1300)],['CRLF','a\r\n'.repeat(1300)],['empty','']]) {
  test('text preview has bounded output: '+label,()=>{
    const ctx=context();load(ctx,'pane.js',['TEXT_PREVIEW_MAX_CHARS','TEXT_PREVIEW_MAX_LINES','truncatePreviewText']);
    const out=ctx.truncatePreviewText(text);assert.ok(text.startsWith(out.text));assert.ok(out.text.length<=40000);
    assert.ok(out.text.split('\n').length<=1200);assert.equal(out.truncated,out.text.length<text.length);assert.equal(out.totalChars,text.length);
  });
}
