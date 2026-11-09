/* Pixel geometry for an edge-to-edge strip of fully fitted images. */
(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.RHFilesImageStrip=value;})(globalThis,()=>{
  function create(count){
    const sizes=new Map(),widths=new Float64Array(count),heights=new Float64Array(count),imageWidths=new Float64Array(count),imageHeights=new Float64Array(count),centers=new Float64Array(count);let width=1,height=1,rotation=0,dirty=true;
    const clamp=value=>Math.max(0,Math.min(Math.max(0,count-1),value));
    function build(){
      if(!dirty)return;dirty=false;
      for(let i=0;i<count;i++){
        const known=sizes.get(i),w=known?known[0]:width,h=known?known[1]:height,quarter=rotation%180!==0;
        const scale=Math.min(width/(quarter?h:w),height/(quarter?w:h));
        imageWidths[i]=w*scale;imageHeights[i]=h*scale;widths[i]=(quarter?h:w)*scale;heights[i]=(quarter?w:h)*scale;
        centers[i]=i?centers[i-1]+(widths[i-1]+widths[i])/2:0;
      }
    }
    function offset(position){build();const p=clamp(position),at=Math.floor(p);return count?centers[at]+(p-at)*((centers[at+1]??centers[at])-centers[at]):0;}
    function positionAt(pixel){
      build();if(count<2||pixel<=0)return 0;if(pixel>=centers[count-1])return count-1;
      let lo=0,hi=count-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(centers[mid]<=pixel)lo=mid;else hi=mid;}
      return lo+(pixel-centers[lo])/(centers[hi]-centers[lo]);
    }
    function resize(w,h,angle=0){w=Math.max(1,w);h=Math.max(1,h);if(width!==w||height!==h||rotation!==angle){width=w;height=h;rotation=angle;dirty=true;}}
    function measure(at,w,h){if(!(w>0&&h>0)||at<0||at>=count)return;const old=sizes.get(at);if(!old||old[0]!==w||old[1]!==h){sizes.set(at,[w,h]);dirty=true;}}
    function layout(position){
      build();if(!count)return[];const origin=offset(position),left=origin-width/2,right=origin+width/2;
      let first=Math.floor(positionAt(left)),last=Math.ceil(positionAt(right));
      while(first<last&&centers[first]+widths[first]/2<=left)first++;
      while(last>first&&centers[last]-widths[last]/2>=right)last--;
      while(first>0&&centers[first]-widths[first]/2>left)first--;
      while(last<count-1&&centers[last]+widths[last]/2<right)last++;
      first=Math.max(0,first-1);last=Math.min(count-1,last+1);
      // A pathological album of hairline strips must not mount every file.
      if(last-first>=32){first=Math.max(first,Math.round(clamp(position))-15);last=Math.min(last,first+31);}
      return Array.from({length:last-first+1},(_,n)=>{const i=first+n;return {index:i,width:widths[i],height:heights[i],imageWidth:imageWidths[i],imageHeight:imageHeights[i],left:width/2+centers[i]-origin-widths[i]/2};});
    }
    return {resize,measure,offset,move:(position,pixels)=>positionAt(offset(position)+pixels),layout};
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
