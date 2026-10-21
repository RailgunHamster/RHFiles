import './vendor/foliate/view.js';
import {EPUB} from './vendor/foliate/epub.js';
import {MOBI,isMOBI} from './vendor/foliate/mobi.js';
import {makeFB2} from './vendor/foliate/fb2.js';
import {makeComicBook} from './vendor/foliate/comic-book.js';
import {unzlibSync} from './vendor/foliate/vendor/fflate.js';
import {syncReaderSettings,saveReaderSetting,readerRequest} from './settings-sync.js';

const $=id=>document.getElementById(id),abort=new AbortController();
const icons={contents:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',theme:'<path d="M20 14a8 8 0 0 1-10-10A8 8 0 1 0 20 14z"/>',bookmark:'<path d="M6 3h12v18l-6-4-6 4z"/>',flow:'<path d="M5 5h14M5 10h14M5 15h9M5 20h9m3-5 3 3 3-3M20 12v6"/>',previous:'<path d="m15 5-7 7 7 7"/>',next:'<path d="m9 5 7 7-7 7"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',trash:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.bookmark}</svg>`;
for(const node of document.querySelectorAll('[data-icon]'))node.innerHTML=icon(node.dataset.icon);
const native=(action,args={})=>window.RHFilesReader?.postMessage(JSON.stringify({action,...args}));
let view,meta,bookState={},location,restoring=true,noticeTimer;
let options={font:18,theme:'light',flow:'paginated'};
try{options={...options,...JSON.parse(localStorage.getItem('rhfiles.reader.options')||'{}')}}catch{}
options.font=Math.max(12,Math.min(30,Number(options.font)||18));
options.theme=['light','sepia','dark'].includes(options.theme)?options.theme:'light';options.flow=options.flow==='scrolled'?'scrolled':'paginated';
function toast(message){$('notice').textContent=message;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,2600)}
function store(key,value){try{const json=JSON.stringify(value);localStorage.setItem(key,json);saveReaderSetting(key,json).catch(()=>toast('阅读配置保存失败，请重试'))}catch{toast('无法保存阅读设置或位置，存储空间可能不足')}}
function saveBook(){if(meta&&!restoring)store('rhfiles.reader.book.'+meta.key,bookState)}
function text(value){if(typeof value==='string')return value;if(Array.isArray(value))return value.map(text).join('、');if(value&&typeof value==='object')return text(value['zh-CN']||value.zh||value.name||Object.values(value)[0]);return ''}
function openContents(show){$('contents').hidden=!show;$('scrim').hidden=!show}
window.rhfilesReaderBack=()=>{if(!$('contents').hidden){openContents(false);return true}return false};
RHFilesUI.assign($('toc-toggle'),"click",()=>openContents(true),"android.reader.reader.top.3a5c60dc8648");RHFilesUI.assign($('toc-close'),"click",()=>openContents(false),"android.reader.reader.top.0668912ccb7f");RHFilesUI.assign($('scrim'),"click",()=>openContents(false),"android.reader.reader.top.d24c76763dab");
function tab(name){for(const id of ['toc','bookmarks']){$(id).hidden=id!==name;$(id+'-tab').classList.toggle('active',id===name)}}
RHFilesUI.assign($('toc-tab'),"click",()=>tab('toc'),"android.reader.reader.top.21fab7867f23");RHFilesUI.assign($('bookmarks-tab'),"click",()=>{renderBookmarks();tab('bookmarks')},"android.reader.reader.top.6f7b28953e82");
async function request(url){const response=await fetch(url,{signal:abort.signal});if(!response.ok){let error;try{error=(await response.json()).error}catch{}throw Error(error||'读取失败（'+response.status+'）')}return response}
function applyOptions(){
  document.documentElement.dataset.theme=options.theme;native('theme',{theme:options.theme});
  if(view?.renderer){
    const colors={light:['#ffffff','#272b31','#326ca6'],sepia:['#f8f1e2','#443c2f','#78603d'],dark:['#1c2026','#e8ecf1','#9bbde3']}[options.theme];
    view.renderer.setAttribute('flow',options.flow);view.renderer.setAttribute('max-column-count','2');view.renderer.setAttribute('max-inline-size','680px');view.renderer.setAttribute('margin','16px');view.renderer.setAttribute('gap','8%');view.renderer.setAttribute('animated','');
    view.renderer.setStyles?.(`html,body{background:${colors[0]}!important;color:${colors[1]}!important}body{font-size:${options.font}px!important;font-family:serif!important;line-height:1.75!important}p,li,blockquote,dd{line-height:1.75!important}a{color:${colors[2]}!important}img,svg{max-width:100%;max-height:100%}pre{white-space:pre-wrap!important;overflow-wrap:anywhere}script,form,object,embed,iframe{display:none!important}`);
  }
  $('font-minus').disabled=options.font<=12;$('font-plus').disabled=options.font>=30;$('flow-toggle').classList.toggle('active',options.flow==='scrolled');$('flow-toggle').setAttribute('aria-label',options.flow==='scrolled'?'切换翻页阅读':'切换滚动阅读');
}
function changeOptions(change){options={...options,...change};store('rhfiles.reader.options',options);applyOptions()}
RHFilesUI.assign($('font-minus'),"click",()=>changeOptions({font:Math.max(12,options.font-2)}),"android.reader.reader.top.2322ee5de401");RHFilesUI.assign($('font-plus'),"click",()=>changeOptions({font:Math.min(30,options.font+2)}),"android.reader.reader.top.7203f91a4ca4");
RHFilesUI.assign($('theme-toggle'),"click",()=>{const themes=['light','sepia','dark'],next=themes[(themes.indexOf(options.theme)+1)%3];changeOptions({theme:next});toast({light:'明亮配色',sepia:'护眼配色',dark:'夜间配色'}[next])},"android.reader.reader.top.9aaba9251f5b");
RHFilesUI.assign($('flow-toggle'),"click",()=>changeOptions({flow:options.flow==='scrolled'?'paginated':'scrolled'}),"android.reader.reader.top.d519a5078f87");
const failed=error=>{const message=String(error?.message||error);$('status').hidden=false;$('status').classList.add('failed');$('status').replaceChildren();const copy=document.createElement('div');copy.textContent='无法打开电子书\n'+(/DRM|encrypt|加密/i.test(message)?'此书可能受 DRM 保护；请使用获得授权的阅读软件。':message)+'\n原文件不会被修改。';const other=document.createElement('button');other.textContent='使用其他应用打开';RHFilesUI.assign(other,"click",()=>native('other'),"android.reader.reader.failed.84328ebc1eef");$('status').append(copy,other);$('previous').disabled=$('next').disabled=true};
const navigate=fn=>Promise.resolve().then(fn).catch(error=>toast('无法跳转：'+(error?.message||error)));
RHFilesUI.assign($('previous'),"click",()=>navigate(()=>view.prev()),"android.reader.reader.top.bcd9d4d49191");RHFilesUI.assign($('next'),"click",()=>navigate(()=>view.next()),"android.reader.reader.top.e0403efe73f0");RHFilesUI.assign($('progress'),"change",()=>navigate(()=>view.goToFraction(Number($('progress').value)/1000)),"android.reader.reader.top.cfa3635ee9ff");
function renderBookmarks(){
  const list=$('bookmarks');list.replaceChildren();
  if(!bookState.bookmarks?.length){const p=document.createElement('p');p.textContent='暂无书签。阅读时点书签按钮即可保存。';list.append(p);return}
  for(const mark of bookState.bookmarks){const row=document.createElement('div');row.className='bookmark-row';const jump=document.createElement('button');jump.className='bookmark-entry';jump.textContent=mark.label;RHFilesUI.assign(jump,"click",()=>{openContents(false);navigate(()=>view.goTo(mark.cfi))},"android.reader.reader.renderBookmarks.8141e6ff019f");const remove=document.createElement('button');remove.setAttribute('aria-label','删除书签');remove.innerHTML=icon('trash');RHFilesUI.assign(remove,"click",()=>{bookState.bookmarks=bookState.bookmarks.filter(m=>m!==mark);saveBook();renderBookmarks();updateBookmark()},"android.reader.reader.renderBookmarks.ef0764411a48");row.append(jump,remove);list.append(row)}
}
function updateBookmark(){const exists=bookState.bookmarks?.some(mark=>mark.cfi===location?.cfi);$('bookmark-toggle').classList.toggle('active',!!exists);$('bookmark-toggle').setAttribute('aria-label',exists?'移除此页书签':'添加书签')}
RHFilesUI.assign($('bookmark-toggle'),"click",()=>{if(!location?.cfi)return;bookState.bookmarks||=[];if(bookState.bookmarks.some(mark=>mark.cfi===location.cfi))bookState.bookmarks=bookState.bookmarks.filter(mark=>mark.cfi!==location.cfi);else{if(bookState.bookmarks.length>=100)return toast('本书最多保存 100 个书签，请先删除不用的书签');bookState.bookmarks.push({cfi:location.cfi,label:$('location').textContent})}saveBook();updateBookmark();toast('书签已更新')},"android.reader.reader.top.aa3272403b96");
function renderTOC(items,depth=0){
  for(const item of items||[]){const button=document.createElement('button');button.textContent=text(item.label)||'未命名章节';button.style.paddingLeft=(12+Math.min(depth,8)*14)+'px';RHFilesUI.assign(button,"click",()=>{openContents(false);navigate(()=>view.goTo(item.href))},"android.reader.reader.renderTOC.689a3787b0fb");$('toc').append(button);if(depth<24)renderTOC(item.subitems,depth+1)}
}
async function open(){
  await syncReaderSettings();
  try{options={...options,...JSON.parse(localStorage.getItem('rhfiles.reader.options')||'{}')}}catch{}
  options.font=Math.max(12,Math.min(30,Number(options.font)||18));options.theme=['light','sepia','dark'].includes(options.theme)?options.theme:'light';options.flow=options.flow==='scrolled'?'scrolled':'paginated';
  meta=await(await request('/book/meta')).json();
  if(!localStorage.getItem('rhfiles.reader.options')&&meta.theme==='dark')options.theme='dark';applyOptions();
  try{bookState=JSON.parse(localStorage.getItem('rhfiles.reader.book.'+meta.key)||'{}')}catch{}
  if(!bookState||typeof bookState!=='object'||Array.isArray(bookState))bookState={};
  bookState.bookmarks=Array.isArray(bookState.bookmarks)?bookState.bookmarks.filter(mark=>typeof mark?.cfi==='string'&&mark.cfi.length<4096&&typeof mark.label==='string').slice(0,100):[];
  if(typeof bookState.cfi!=='string'||bookState.cfi.length>4096)delete bookState.cfi;
  let book;
  if(['epub','cbz'].includes(meta.format)){
    const entries=new Map(meta.entries.map(e=>[e.filename,e]));const url=(name,asText)=>'/book/resource?name='+encodeURIComponent(name)+(asText?'&text=1':'');
    const loader={entries:meta.entries,getSize:name=>entries.get(name)?.size||0,loadText:async name=>entries.has(name)?(await request(url(name,true))).text():null,loadBlob:async(name,type)=>entries.has(name)?new Blob([await(await request(url(name,false))).arrayBuffer()],{type:type||'application/octet-stream'}):null};
    book=meta.format==='epub'?await new EPUB(loader).init():makeComicBook(loader,{name:meta.name});
  }else{
    const file=new File([await(await request('/book/raw')).blob()],meta.name.toLowerCase());
    if(meta.format==='fb2')book=await makeFB2(file);else{
      if(!await isMOBI(file))throw Error('文件不是有效的 MOBI/AZW3 电子书');
      const table=new DataView(await file.slice(78,82).arrayBuffer()),record=table.getUint32(0),header=new DataView(await file.slice(record,record+16).arrayBuffer());
      if(header.getUint16(12)!==0)throw Error('DRM encrypted MOBI');
      book=await new MOBI({unzlib:unzlibSync}).open(file);
    }
  }
  if(!book.sections?.length)throw Error('电子书没有可阅读的章节');
  native('title',{title:text(book.metadata?.title)||meta.name});
  view=document.createElement('foliate-view');$('canvas').append(view);
  view.addEventListener('external-link',event=>{event.preventDefault();toast('阅读器已阻止外部链接，可使用其他应用打开此书')});
  view.addEventListener('load',({detail:{doc}})=>{RHFilesUI.listen(doc,'keydown',keys,undefined,"android.reader.reader.open.104e6a4b1335")});
  view.addEventListener('relocate',({detail})=>{
    location=detail;const fraction=Number.isFinite(detail.fraction)?Math.max(0,Math.min(1,detail.fraction)):null;
    $('location').textContent=(fraction===null?'':Math.round(fraction*100)+'% · ')+(text(detail.tocItem?.label)||'正文');$('progress').disabled=fraction===null;if(fraction!==null)$('progress').value=Math.round(fraction*1000);
    if(typeof detail.cfi==='string'&&detail.cfi.length<4096){bookState.cfi=detail.cfi;bookState.fraction=fraction;saveBook()}updateBookmark();
  });
  await view.open(book);applyOptions();renderTOC(book.toc);if(!$('toc').childElementCount){const p=document.createElement('p');p.textContent='本书没有目录，可使用翻页或进度条阅读。';$('toc').append(p)}
  try{await view.init({lastLocation:bookState.cfi||null})}catch{toast('上次阅读位置已失效，已回到开头');await view.init({})}
  restoring=false;if(location?.cfi){bookState.cfi=location.cfi;saveBook()}
  $('status').hidden=true;$('previous').disabled=$('next').disabled=false;updateBookmark();
}
function keys(event){if(event.key==='ArrowLeft'){event.preventDefault();navigate(()=>view.goLeft())}if(event.key==='ArrowRight'){event.preventDefault();navigate(()=>view.goRight())}if(event.key==='Escape')window.rhfilesReaderBack()}
RHFilesUI.listen(document,'keydown',keys,undefined,"android.reader.reader.top.ea5a60ea371d");
window.addEventListener('pagehide',()=>{saveBook();abort.abort();view?.close()});
// Restricted reader scope: book documents never receive the manager's IPC/API.
RHFilesAPI.provideState('reader',()=>({ready:!!view&&!restoring,name:meta?.name??null,options:{...options},fraction:location?.fraction??null,contents:!$('contents').hidden}));
const readerSchema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const readerAction=(name,params,handler)=>RHFilesAPI.register(name,handler,{params});
for(const [name,handler]of Object.entries({next:()=>view?.next(),previous:()=>view?.prev(),close:()=>native('close'),external:()=>native('other')}))readerAction('reader.'+name,readerSchema(),async()=>{if(!view&&!['close','external'].includes(name))throw new RHFilesAutomationCore.ActionError('NOT_READY','Reader is loading');await handler();return {accepted:true};});
readerAction('reader.options',readerSchema({font:{type:'integer',minimum:12,maximum:30},theme:{type:'string',enum:['light','sepia','dark']},flow:{type:'string',enum:['scrolled','paginated']}}),p=>{changeOptions(p);return {...options};});
readerAction('reader.seek',readerSchema({fraction:{type:'number',minimum:0,maximum:1}},['fraction']),async p=>{if(!view||restoring)throw new RHFilesAutomationCore.ActionError('NOT_READY','Reader is loading');await view.goToFraction(p.fraction);return {accepted:true};});
readerAction('native.ui.list',readerSchema(),()=>readerRequest('automation',{command:'automation.ui.list'}));
readerAction('native.ui.invoke',readerSchema({controlId:{type:'string'},acknowledge:{type:'boolean'},confirmationToken:{type:'string'}},['controlId']),args=>readerRequest('automation',{command:'automation.ui.invoke',args}));
open().catch(failed);
