// Read-only geometry for the native screenshot probe. Never hide controls to
// make a screenshot pass: sample the source pixels not covered by those controls.
(() => {
  const box = node => {const r=node.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
  const intersect = (a,b) => {const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);return {x,y,w:Math.max(0,Math.min(a.x+a.w,b.x+b.w)-x),h:Math.max(0,Math.min(a.y+a.h,b.y+b.h)-y)};};
  const area = r => r.w*r.h;
  function subtract(region,control) {
    const cut=intersect(region,control);
    if(!area(cut))return [region];
    return [
      {x:region.x,y:region.y,w:region.w,h:cut.y-region.y},
      {x:region.x,y:cut.y+cut.h,w:region.w,h:region.y+region.h-cut.y-cut.h},
      {x:region.x,y:cut.y,w:cut.x-region.x,h:cut.h},
      {x:cut.x+cut.w,y:cut.y,w:region.x+region.w-cut.x-cut.w,h:cut.h},
    ].filter(r=>r.w>2&&r.h>2);
  }
  function samples(full,paint,controls) {
    const regions=[];
    for(let quadrant=0;quadrant<4;quadrant++) {
      let parts=[intersect(paint,{x:full.x+(quadrant%2)*full.w/2,y:full.y+(quadrant<2?0:full.h/2),w:full.w/2,h:full.h/2})].filter(r=>r.w>2&&r.h>2);
      for(const control of controls)parts=parts.flatMap(part=>subtract(part,control));
      parts.sort((a,b)=>area(b)-area(a));
      if(parts[0])regions.push({...parts[0],quadrant});
    }
    const points=regions.map(r=>({x:r.x+r.w/2,y:r.y+r.h/2,quadrant:r.quadrant}));
    // A clipped long picture can expose fewer than four source quadrants.
    // Still require four genuine, independently sampled source-pixel positions.
    for(const r of regions)for(const fraction of [.2,.4,.6,.8])if(points.length<4)points.push({x:r.x+r.w*fraction,y:r.y+r.h*fraction,quadrant:r.quadrant});
    return points.length===4?points:[];
  }
  return {viewport:innerWidth,rows:[...document.querySelectorAll('.wb-strip-row')].map(row=>{
    const clip=box(row),items=[...row.querySelectorAll('.wb-strip-tile>img')].map(image=>{
      const full=box(image),tile=box(image.parentElement),ratio=image.naturalWidth/image.naturalHeight;
      if(getComputedStyle(image).objectFit==='contain'&&ratio>0){const w=Math.min(full.w,full.h*ratio),h=w/ratio;full.x+=(full.w-w)/2;full.y+=(full.h-h)/2;full.w=w;full.h=h;}
      const paint=intersect(intersect(intersect(full,tile),clip),{x:0,y:0,w:innerWidth,h:innerHeight});
      // Conservatively reserve even fading controls, with a two-pixel margin.
      const controls=[...image.parentElement.querySelectorAll('button')].map(button=>{const r=box(button);return {x:r.x-2,y:r.y-2,w:r.w+4,h:r.h+4};});
      return {area:area(paint),loaded:image.complete&&image.naturalWidth>0,path:image.parentElement.dataset.mediaPath,points:samples(full,paint,controls)};
    }).sort((a,b)=>b.area-a.area);
    return items[0]||null;
  })};
})()
