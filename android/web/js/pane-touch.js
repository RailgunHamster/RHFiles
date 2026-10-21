/* Chromium treats concurrent pans in iframe panes as one viewport gesture.
 * Track each contact's starting scroll container instead, never the focused pane.
 * Single-pane scrolling and media-viewer pinch gestures remain native. */
const paneTouch=(()=>{
  function bind({frames,enabled,onScroll,onInteract=()=>{},native=false}){
    const contacts=new Map(),flings=new Map();let animation=0;
    function tick(now){
      animation=0;
      for(const [node,motion] of flings){
        const dt=Math.min(32,now-motion.at);motion.at=now;const before=node.scrollTop;
        node.scrollTop-=motion.speed*dt;motion.speed*=Math.exp(-dt/200);
        if(!enabled()||!node.isConnected||Math.abs(motion.speed)<.025||node.scrollTop===before)flings.delete(node);
      }
      if(flings.size)animation=requestAnimationFrame(tick);
    }
    function locate(x,y){
      for(const frame of frames()){
        const r=frame.getBoundingClientRect();if(frame.hidden||x<r.left||x>=r.right||y<r.top||y>=r.bottom)continue;
        let node=frame.contentDocument.elementFromPoint(x-r.left,y-r.top);const target=node;
        if(node?.closest('.sheet,input,textarea,select'))return null;
        for(;node&&node!==frame.contentDocument.body;node=node.parentElement){
          const style=frame.contentWindow.getComputedStyle(node);
          if(/auto|scroll/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+1)return {node,target,frame};
        }
        return target?{node:null,target,frame}:null;
      }
      return null;
    }
    function handle(owner,kind,event){
      if(!enabled()){contacts.clear();flings.clear();return;}
      const offset=owner?.getBoundingClientRect()||{left:0,top:0},now=performance.now();let prevent=false;
      for(const touch of event.changedTouches){
        const x=touch.clientX+offset.left,y=touch.clientY+offset.top;
        if(kind==='start'){
          const located=locate(x,y);if(!located)continue;flings.delete(located.node);
          onInteract(located.frame);
          if(located.node&&[...contacts.values()].some(p=>p.node===located.node))continue;
          contacts.set(touch.identifier,{...located,x,y,startX:x,startY:y,at:now,speed:0,moved:false,travel:false,secondary:touch.secondary});
          if(contacts.size>1)onScroll();
        }else{
          const point=contacts.get(touch.identifier);if(!point)continue;
          if(kind==='move'){
            const dy=y-point.y,dx=x-point.startX,dt=now-point.at;
            if(Math.hypot(dx,y-point.startY)>8)point.travel=true;
            if(!point.moved&&Math.abs(y-point.startY)>8&&Math.abs(y-point.startY)>Math.abs(dx)){point.moved=true;onScroll();}
            if(point.moved){if(point.node)point.node.scrollTop-=dy;point.speed=dt>0&&dt<100?Math.max(-2.5,Math.min(2.5,dy/dt)):0;prevent=true;}
            point.x=x;point.y=y;point.at=now;
          }else{
            contacts.delete(touch.identifier);
            if(point.moved){prevent=true;if(point.node&&kind==='end'&&now-point.at<100&&Math.abs(point.speed)>.05){flings.set(point.node,{speed:point.speed,at:now});if(!animation)animation=requestAnimationFrame(tick);}}
            else if(kind==='end'&&!point.travel&&point.secondary&&point.target.isConnected){
              const win=point.frame.contentWindow,r=point.frame.getBoundingClientRect(),options={bubbles:true,pointerId:touch.identifier,pointerType:'touch',button:0,clientX:x-r.left,clientY:y-r.top};
              point.target.dispatchEvent(new win.PointerEvent('pointerdown',options));point.target.dispatchEvent(new win.PointerEvent('pointerup',options));point.target.click();
            }
          }
        }
      }
      if(prevent&&event.cancelable)event.preventDefault();
    }
    function attach(frame){
      const starts=new Map();
      for(const [name,kind] of [['touchstart','start'],['touchmove','move'],['touchend','end'],['touchcancel','cancel']])RHFilesUI.listen(frame.contentWindow,name,event=>{
        if(!native)return handle(frame,kind,event);
        if(!enabled()){starts.clear();return;}
        for(const t of event.changedTouches){
          if(kind==='start'&&!t.target.closest('.sheet,input,textarea,select'))starts.set(t.identifier,{x:t.clientX,y:t.clientY,moved:false});
          const p=starts.get(t.identifier);if(!p)continue;
          if(kind==='move'&&Math.abs(t.clientY-p.y)>8&&Math.abs(t.clientY-p.y)>Math.abs(t.clientX-p.x))p.moved=true;
          if(p.moved&&event.cancelable)event.preventDefault();
          if(kind==='end'||kind==='cancel')starts.delete(t.identifier);
        }
      },{capture:true,passive:false},"android.web.js.pane-touch.attach.177f38b5a817");
    }
    function relay(sample){handle(null,sample.phase,{changedTouches:sample.points.map(p=>({identifier:p.id,clientX:p.x*innerWidth,clientY:p.y*innerHeight,secondary:p.secondary})),cancelable:false});}
    function reset(){contacts.clear();flings.clear();if(animation)cancelAnimationFrame(animation);animation=0;}
    return {attach,reset,relay};
  }
  return {bind};
})();
