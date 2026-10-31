// Physical size of the contained source image, not its letterboxed element or
// decorated window. No media resize/transcode and no DOM mutations here.
export function containedOutputGeometry(canvas,source,box=null){
 if(![canvas?.width,canvas?.height].every(v=>Number.isInteger(v)&&v>0&&v<=4096)||![source?.width,source?.height].every(v=>Number.isFinite(v)&&v>0&&v<=16384))throw Error('Invalid physical output geometry');
 const rect=box?.rect??{x:0,y:0,width:canvas.width,height:canvas.height},viewport=box?.viewport??canvas;
 if(box&&(box.objectFit!=='contain'||box.objectPosition!=='50% 50%'||box.transform!=='none'))throw Error('Output matching requires untransformed centered contain');
 if(![rect.x,rect.y,rect.width,rect.height,viewport.width,viewport.height].every(Number.isFinite)||rect.x<0||rect.y<0||rect.width<=0||rect.height<=0||viewport.width<=0||viewport.height<=0||rect.x+rect.width>viewport.width||rect.y+rect.height>viewport.height)throw Error('Output geometry leaves its actual viewport');
 const scaleX=canvas.width/viewport.width,scaleY=canvas.height/viewport.height;
 if(Math.abs(scaleX-scaleY)>.01)throw Error('Output canvas and actual viewport scales differ');
 const fit=Math.min(rect.width/source.width,rect.height/source.height);
 return {left:(rect.x+(rect.width-source.width*fit)/2)*scaleX,top:(rect.y+(rect.height-source.height*fit)/2)*scaleY,width:source.width*fit*scaleX,height:source.height*fit*scaleY};
}
export function requireMatchedOutputGeometry(actual,expected){
 if(![actual?.width,actual?.height,expected?.width,expected?.height].every(v=>Number.isFinite(v)&&v>0)||Math.abs(actual.width-expected.width)>1||Math.abs(actual.height-expected.height)>1)throw Error('Actual contained video sizes do not match within one physical pixel');
 return true;
}
