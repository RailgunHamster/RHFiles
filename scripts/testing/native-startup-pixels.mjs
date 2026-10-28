// Read the owned, top-down BGRX diagnostic DIB. This is image evidence, not
// libVLC's periodically refreshed displayed-picture counter.
export function markerPixels(bytes,sourceWidth,sourceHeight){
  if(bytes.length<54||bytes.subarray(0,2).toString()!=='BM'||bytes.readUInt32LE(10)!==54||bytes.readUInt32LE(14)!==40||bytes.readUInt16LE(28)!==32||bytes.readUInt32LE(30)!==0)throw Error('Unsupported native diagnostic bitmap');
  const width=bytes.readInt32LE(18),height=-bytes.readInt32LE(22);
  if(width<=0||height<=0||width>4096||height>4096||bytes.length!==54+width*height*4)throw Error('Invalid native diagnostic dimensions');
  if(!(sourceWidth>0&&sourceHeight>0))throw Error('Invalid source dimensions');
  const scale=Math.min(width/sourceWidth,height/sourceHeight),left=(width-sourceWidth*scale)/2,top=(height-sourceHeight*scale)/2;
  const colors=[];
  for(let i=0;i<4;i++){
    const x=Math.round(left+sourceWidth*(i%2?.9:.1)*scale),y=Math.round(top+sourceHeight*(i<2?.1:.9)*scale);
    if(x<0||y<0||x>=width||y>=height)throw Error('Marker lies outside its native canvas');
    const offset=54+(y*width+x)*4,[b,g,r]=bytes.subarray(offset,offset+3);colors.push([r,g,b]);
  }
  const visible=colors.every(([r,g,b],i)=>i===0?r>160&&g<90&&b<90:i===1?g>160&&r<90&&b<90:i===2?b>160&&r<90&&g<90:r>160&&g>160&&b<90);
  return {width,height,colors,visible};
}
