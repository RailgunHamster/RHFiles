/* Pixel geometry for an edge-to-edge strip of fully fitted images. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.RHFilesImageStrip=value;})(globalThis,()=>{
  function create(count,{loop=false}={}){
    loop=loop&&count>1;
    const sizes=new Map(),widths=new Float64Array(count),heights=new Float64Array(count),imageWidths=new Float64Array(count),imageHeights=new Float64Array(count),centers=new Float64Array(count);let width=1,height=1,rotation=0,dirty=true,period=0;
    const clamp=value=>Math.max(0,Math.min(Math.max(0,count-1),value));
    const item=value=>count?((value%count)+count)%count:0;
    const normalize=value=>loop?item(value):clamp(value);
    function build(){
      if(!dirty)return;dirty=false;
      for(let i=0;i<count;i++){
        const known=sizes.get(i),w=known?known[0]:width,h=known?known[1]:height,quarter=rotation%180!==0;
        const scale=Math.min(width/(quarter?h:w),height/(quarter?w:h));
        imageWidths[i]=w*scale;imageHeights[i]=h*scale;widths[i]=(quarter?h:w)*scale;heights[i]=(quarter?w:h)*scale;
        centers[i]=i?centers[i-1]+(widths[i-1]+widths[i])/2:0;
      }
      period=count?centers[count-1]+(widths[count-1]+widths[0])/2:0;
    }
    function offset(position){build();if(!count)return 0;let cycle=loop?Math.floor(position/count):0,p=loop?position-cycle*count:clamp(position);if(loop&&p<0){cycle--;p+=count;}if(loop&&p>=count){cycle++;p=0;}const at=Math.floor(p),next=centers[at+1]??(loop?period:centers[at]);return cycle*period+centers[at]+(p-at)*(next-centers[at]);}
    function positionAt(pixel){
      build();if(count<2)return 0;
      const cycle=loop?Math.floor(pixel/period):0;if(loop)pixel-=cycle*period;
      if(!loop&&pixel<=0)return 0;
      if(pixel>=centers[count-1])return loop?cycle*count+count-1+(pixel-centers[count-1])/(period-centers[count-1]):count-1;
      let lo=0,hi=count-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(centers[mid]<=pixel)lo=mid;else hi=mid;}
      return cycle*count+lo+(pixel-centers[lo])/(centers[hi]-centers[lo]);
    }
    function resize(w,h,angle=0){w=Math.max(1,w);h=Math.max(1,h);if(width!==w||height!==h||rotation!==angle){width=w;height=h;rotation=angle;dirty=true;}}
    function measure(at,w,h){if(!(w>0&&h>0)||at<0||at>=count)return;const old=sizes.get(at);if(!old||old[0]!==w||old[1]!==h){sizes.set(at,[w,h]);dirty=true;}}
    function layout(position){
      build();if(!count)return[];const origin=offset(position),left=origin-width/2,right=origin+width/2;
      let first=Math.floor(positionAt(left)),last=Math.ceil(positionAt(right));
      while(first<last&&offset(first)+widths[item(first)]/2<=left)first++;
      while(last>first&&offset(last)-widths[item(last)]/2>=right)last--;
      while((loop||first>0)&&offset(first)-widths[item(first)]/2>left)first--;
      while((loop||last<count-1)&&offset(last)+widths[item(last)]/2<right)last++;
      first=loop?first-1:Math.max(0,first-1);last=loop?last+1:Math.min(count-1,last+1);
      // A pathological album of hairline strips must not mount every file.
      if(last-first>=32){first=Math.max(first,Math.round(loop?position:clamp(position))-15);last=Math.min(last,first+31);}
      return Array.from({length:last-first+1},(_,n)=>{const slot=first+n,i=item(slot);return {slot,index:i,width:widths[i],height:heights[i],imageWidth:imageWidths[i],imageHeight:imageHeights[i],left:width/2+offset(slot)-origin-widths[i]/2};});
    }
    return {resize,measure,offset,item,normalize,move:(position,pixels)=>positionAt(offset(position)+pixels),layout};
  }
  function autoScroll({move,changed=()=>{},speed=60,request=fn=>requestAnimationFrame(fn),cancel=id=>cancelAnimationFrame(id)}){
    let running=false,frame=0,last=null;
    const state=()=>({running,speed});
    function pause(){running=false;if(frame)cancel(frame);frame=0;last=null;changed(state());return state();}
    function tick(now){
      frame=0;if(!running)return;const delta=last===null?0:Math.min(50,Math.max(0,now-last));last=now;
      if(!move(speed*delta/1000)){pause();return;}frame=request(tick);
    }
    function start(){if(!running&&move(0)){running=true;last=null;frame=request(tick);changed(state());}return state();}
    function setSpeed(value){if(!Number.isFinite(value)||value<10||value>600)throw Error('自动滚动速度必须介于 10 和 600 像素/秒');speed=value;changed(state());return state();}
    return {state,start,pause,setSpeed,toggle:()=>running?pause():start()};
  }
  function boundaryLayer(viewport,labels){
    const layer=document.createElement('div'),notice=document.createElement('div'),markers=new Map();let timer=null,cycle=null,direction=1;
    layer.className='image-loop-boundaries';layer.setAttribute('aria-hidden','true');notice.className='image-loop-notice';notice.hidden=true;notice.setAttribute('role','status');viewport.append(layer,notice);
    function badge(text){const span=document.createElement('span'),icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');span.className='image-loop-badge';icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');path.setAttribute('d','M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1');icon.append(path);span.append(icon,document.createTextNode(text));return span;}
    function notify(value){direction=value;clearTimeout(timer);notice.replaceChildren(badge(direction>0?labels.first:labels.last));notice.hidden=false;timer=setTimeout(()=>{notice.hidden=true;timer=null;},1500);}
    function update(frames,{width,count,zoom=1,cycle:nextCycle}){
      if(nextCycle!==undefined){if(cycle!==null&&nextCycle!==cycle&&count>1)notify(Math.sign(nextCycle-cycle));cycle=nextCycle;}
      const visible=zoom<=1&&count>1?frames.filter(frame=>frame.index===0&&frame.left>8&&frame.left<width-8):[];
      const wanted=new Set(visible.map(frame=>frame.slot));for(const [key,node]of markers)if(!wanted.has(key)){node.remove();markers.delete(key);}
      for(const frame of visible){let node=markers.get(frame.slot);if(!node){node=document.createElement('div');node.className='image-loop-seam';node.append(badge(labels.label));markers.set(frame.slot,node);layer.append(node);}node.style.left=frame.left+'px';}
    }
    function clear(){clearTimeout(timer);timer=null;cycle=null;notice.hidden=true;for(const node of markers.values())node.remove();markers.clear();}
    return {update,notify,clear,relabel:()=>{for(const node of markers.values())node.replaceChildren(badge(labels.label));if(!notice.hidden)notice.replaceChildren(badge(direction>0?labels.first:labels.last));},state:()=>({visible:markers.size>0,notice:notice.hidden?'':notice.textContent}),destroy:()=>{clear();layer.remove();notice.remove();}};
  }
  return {create,autoScroll,boundaryLayer};
});
