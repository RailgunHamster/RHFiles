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
  return {create,autoScroll};
});
