/* Touch-sized fast scrolling, independent of virtualized file rows. */
const androidFileScroll=(()=>{
  let current=null;
  function attach(list){
    const rail=document.createElement('div'),thumb=document.createElement('div'),label=document.createElement('span');
    rail.className='file-fast-scroll';rail.hidden=true;thumb.className='file-fast-scroll-thumb';thumb.tabIndex=0;
    thumb.setAttribute('role','scrollbar');thumb.setAttribute('aria-label','快速滚动文件');thumb.setAttribute('aria-controls',list.id);thumb.setAttribute('aria-orientation','vertical');thumb.setAttribute('aria-valuemin','0');thumb.setAttribute('aria-valuemax','100');label.className='file-fast-scroll-label';label.hidden=true;
    thumb.append(label);rail.append(thumb);list.parentElement.append(rail);
    let drag=null,scheduled=false;
    function state(){const max=Math.max(0,list.scrollHeight-list.clientHeight);return {visible:!rail.hidden,scrollTop:list.scrollTop,maxScroll:max,ratio:max?list.scrollTop/max:0};}
    function refresh(){
      scheduled=false;const max=list.scrollHeight-list.clientHeight,visible=!list.hidden&&list.clientHeight>0&&max>1;
      rail.hidden=!visible;if(list.classList.contains('has-fast-scroll')!==visible)list.classList.toggle('has-fast-scroll',visible);
      if(!visible){drag=null;label.hidden=true;return;}
      const height=Math.min(rail.clientHeight,Math.max(56,rail.clientHeight*list.clientHeight/list.scrollHeight)),ratio=list.scrollTop/max;
      thumb.style.height=height+'px';thumb.style.transform=`translateY(${ratio*(rail.clientHeight-height)}px)`;
      const percent=Math.round(ratio*100);thumb.setAttribute('aria-valuenow',String(percent));label.textContent=percent+'%';
    }
    function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(refresh);}}
    function to(ratio){if(!Number.isFinite(ratio)||ratio<0||ratio>1)throw Error('滚动位置必须介于 0 和 1');list.scrollTop=ratio*Math.max(0,list.scrollHeight-list.clientHeight);refresh();return state();}
    RHFilesUI.listen(list,'scroll',schedule,{passive:true},'android.files.scroll.observe');
    RHFilesUI.listen(thumb,'pointerdown',event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();refresh();drag={id:event.pointerId,y:event.clientY,ratio:state().ratio};thumb.setPointerCapture(event.pointerId);label.hidden=false;},undefined,'android.files.scroll.start');
    RHFilesUI.listen(thumb,'pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();const travel=rail.clientHeight-thumb.offsetHeight;if(travel>0)to(Math.max(0,Math.min(1,drag.ratio+(event.clientY-drag.y)/travel)));},undefined,'android.files.scroll.drag');
    function finish(event){if(!drag||event.pointerId!==drag.id)return;drag=null;label.hidden=true;try{thumb.releasePointerCapture(event.pointerId);}catch{}}
    RHFilesUI.listen(thumb,'pointerup',finish,undefined,'android.files.scroll.end');RHFilesUI.listen(thumb,'pointercancel',finish,undefined,'android.files.scroll.cancel');
    RHFilesUI.listen(thumb,'keydown',event=>{const steps={ArrowDown:.02,ArrowUp:-.02,PageDown:.15,PageUp:-.15};if(event.key==='Home'||event.key==='End'||event.key in steps){event.preventDefault();to(event.key==='Home'?0:event.key==='End'?1:Math.max(0,Math.min(1,state().ratio+steps[event.key])));}},undefined,'android.files.scroll.keys');
    new ResizeObserver(schedule).observe(list);new MutationObserver(schedule).observe(list,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','style','class']});
    current={state,to};refresh();return current;
  }
  RHFilesUI.listen(document,'DOMContentLoaded',()=>{const list=document.getElementById('filelist');if(list)attach(list);},undefined,'android.files.scroll.init');
  return {state:()=>current?.state()||{visible:false,scrollTop:0,maxScroll:0,ratio:0},to:ratio=>{if(!current)throw Error('文件列表尚未就绪');return current.to(ratio);}};
})();
