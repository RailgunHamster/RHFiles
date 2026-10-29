// Four source markers inside the real reference <video>'s contained rectangle,
// sampled only from our owned native main-window DIB. No screen/foreign HWND.
export function referencePixels(bytes,box,source){
  if(bytes.length<54||bytes.subarray(0,2).toString()!=='BM'||bytes.readUInt32LE(10)!==54||bytes.readUInt32LE(14)!==40||bytes.readUInt16LE(26)!==1||bytes.readUInt16LE(28)!==32||bytes.readUInt32LE(30)!==0)throw Error('Unsupported owned reference DIB');
  const width=bytes.readInt32LE(18),height=-bytes.readInt32LE(22);
  if(width<1||height<1||width>4096||height>4096||bytes.length!==54+width*height*4)throw Error('Invalid owned reference canvas');
  const {rect,viewport,objectFit,objectPosition}=box||{};
  if(objectFit!=='contain'||objectPosition!=='50% 50%')throw Error('Reference pixel sampling requires the actual centered contain layout');
  if(![rect?.x,rect?.y,rect?.width,rect?.height,viewport?.width,viewport?.height,source?.width,source?.height].every(Number.isFinite)||rect.x<0||rect.y<0||rect.width<=0||rect.height<=0||viewport.width<=0||viewport.height<=0||source.width<=0||source.height<=0||rect.x+rect.width>viewport.width||rect.y+rect.height>viewport.height)throw Error('Reference video geometry is not inside its owned viewport');
  const scaleX=width/viewport.width,scaleY=height/viewport.height;
  if(Math.abs(scaleX-scaleY)>.01)throw Error('Reference native canvas and WebView viewport do not align');
  const fit=Math.min(rect.width/source.width,rect.height/source.height),left=rect.x+(rect.width-source.width*fit)/2,top=rect.y+(rect.height-source.height*fit)/2,colors=[];
  for(let i=0;i<4;i++){
    const x=Math.round((left+source.width*(i%2?.9:.1)*fit)*scaleX),y=Math.round((top+source.height*(i<2?.1:.9)*fit)*scaleY);
    if(x<0||x>=width||y<0||y>=height)throw Error('Reference marker lies outside its owned native canvas');
    const offset=54+(y*width+x)*4,[b,g,r]=bytes.subarray(offset,offset+3);colors.push([r,g,b]);
  }
  const visible=colors.every(([r,g,b],i)=>i===0?r>160&&g<90&&b<90:i===1?g>160&&r<90&&b<90:i===2?b>160&&r<90&&g<90:r>160&&g>160&&b<90);
  return {width,height,colors,visible};
}
