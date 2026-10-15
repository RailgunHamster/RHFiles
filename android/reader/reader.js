import './vendor/foliate/view.js';
import {EPUB} from './vendor/foliate/epub.js';
import {MOBI,isMOBI} from './vendor/foliate/mobi.js';
import {makeFB2} from './vendor/foliate/fb2.js';
import {makeComicBook} from './vendor/foliate/comic-book.js';
import {unzlibSync} from './vendor/foliate/vendor/fflate.js';

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
function store(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{toast('无法保存阅读设置或位置，存储空间可能不足')}}
function saveBook(){if(meta&&!restoring)store('rhfiles.reader.book.'+meta.key,bookState)}
function text(value){if(typeof value==='string')return value;if(Array.isArray(value))return value.map(text).join('、');if(value&&typeof value==='object')return text(value['zh-CN']||value.zh||value.name||Object.values(value)[0]);return ''}
function openContents(show){$('contents').hidden=!show;$('scrim').hidden=!show}
window.rhfilesReaderBack=()=>{if(!$('contents').hidden){openContents(false);return true}return false};
$('toc-toggle').onclick=()=>openContents(true);$('toc-close').onclick=()=>openContents(false);$('scrim').onclick=()=>openContents(false);
function tab(name){for(const id of ['toc','bookmarks']){$(id).hidden=id!==name;$(id+'-tab').classList.toggle('active',id===name)}}
$('toc-tab').onclick=()=>tab('toc');$('bookmarks-tab').onclick=()=>{renderBookmarks();tab('bookmarks')};
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
$('font-minus').onclick=()=>changeOptions({font:Math.max(12,options.font-2)});$('font-plus').onclick=()=>changeOptions({font:Math.min(30,options.font+2)});
$('theme-toggle').onclick=()=>{const themes=['light','sepia','dark'],next=themes[(themes.indexOf(options.theme)+1)%3];changeOptions({theme:next});toast({light:'明亮配色',sepia:'护眼配色',dark:'夜间配色'}[next])};
$('flow-toggle').onclick=()=>changeOptions({flow:options.flow==='scrolled'?'paginated':'scrolled'});
const failed=error=>{const message=String(error?.message||error);$('status').hidden=false;$('status').classList.add('failed');$('status').replaceChildren();const copy=document.createElement('div');copy.textContent='无法打开电子书\n'+(/DRM|encrypt|加密/i.test(message)?'此书可能受 DRM 保护；请使用获得授权的阅读软件。':message)+'\n原文件不会被修改。';const other=document.createElement('button');other.textContent='使用其他应用打开';other.onclick=()=>native('other');$('status').append(copy,other);$('previous').disabled=$('next').disabled=true};
const navigate=fn=>Promise.resolve().then(fn).catch(error=>toast('无法跳转：'+(error?.message||error)));
$('previous').onclick=()=>navigate(()=>view.prev());$('next').onclick=()=>navigate(()=>view.next());$('progress').onchange=()=>navigate(()=>view.goToFraction(Number($('progress').value)/1000));
function renderBookmarks(){
  const list=$('bookmarks');list.replaceChildren();
  if(!bookState.bookmarks?.length){const p=document.createElement('p');p.textContent='暂无书签。阅读时点书签按钮即可保存。';list.append(p);return}
  for(const mark of bookState.bookmarks){const row=document.createElement('div');row.className='bookmark-row';const jump=document.createElement('button');jump.className='bookmark-entry';jump.textContent=mark.label;jump.onclick=()=>{openContents(false);navigate(()=>view.goTo(mark.cfi))};const remove=document.createElement('button');remove.setAttribute('aria-label','删除书签');remove.innerHTML=icon('trash');remove.onclick=()=>{bookState.bookmarks=bookState.bookmarks.filter(m=>m!==mark);saveBook();renderBookmarks();updateBookmark()};row.append(jump,remove);list.append(row)}
}
function updateBookmark(){const exists=bookState.bookmarks?.some(mark=>mark.cfi===location?.cfi);$('bookmark-toggle').classList.toggle('active',!!exists);$('bookmark-toggle').setAttribute('aria-label',exists?'移除此页书签':'添加书签')}
$('bookmark-toggle').onclick=()=>{if(!location?.cfi)return;bookState.bookmarks||=[];if(bookState.bookmarks.some(mark=>mark.cfi===location.cfi))bookState.bookmarks=bookState.bookmarks.filter(mark=>mark.cfi!==location.cfi);else{if(bookState.bookmarks.length>=100)return toast('本书最多保存 100 个书签，请先删除不用的书签');bookState.bookmarks.push({cfi:location.cfi,label:$('location').textContent})}saveBook();updateBookmark();toast('书签已更新')};
function renderTOC(items,depth=0){
  for(const item of items||[]){const button=document.createElement('button');button.textContent=text(item.label)||'未命名章节';button.style.paddingLeft=(12+Math.min(depth,8)*14)+'px';button.onclick=()=>{openContents(false);navigate(()=>view.goTo(item.href))};$('toc').append(button);if(depth<24)renderTOC(item.subitems,depth+1)}
}
async function open(){
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
  view.addEventListener('load',({detail:{doc}})=>{doc.addEventListener('keydown',keys)});
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
document.addEventListener('keydown',keys);
window.addEventListener('pagehide',()=>{saveBook();abort.abort();view?.close()});
open().catch(failed);
