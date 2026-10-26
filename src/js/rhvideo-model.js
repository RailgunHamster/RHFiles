(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.RHVideoModel=model;})(globalThis,()=>{
  'use strict';
  const kinds=['video','picture','novel','favorite'];
  function clock(seconds){seconds=Math.max(0,Math.floor(Number(seconds)||0));return (seconds>=3600?Math.floor(seconds/3600)+':':'')+String(Math.floor(seconds/60)%60).padStart(seconds>=3600?2:1,'0')+':'+String(seconds%60).padStart(2,'0');}
  function page(total,offset,limit){if(!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>72)throw Error('Invalid pagination');return {number:Math.floor(offset/limit)+1,pages:Math.max(1,Math.ceil(total/limit)),previous:offset>0,next:offset+limit<total};}
  function itemKey(item){return item.kind+':'+item.id;}
  function favoriteSet(value){const set=new Set();for(const kind of ['video','picture','novel'])for(const id of value[kind+'_ids']||[])set.add(kind+':'+id);return set;}
  function validateCatalog(value){if(!value||!Array.isArray(value.items)||!Number.isSafeInteger(value.total)||value.total<0)throw Error('服务器媒体清单无效');for(const item of value.items){if(!['video','picture','novel'].includes(item.kind)||typeof item.id!=='string'||typeof item.title!=='string')throw Error('媒体项目格式无效');}return value;}
  function imageIndex(items,id,delta=0){const images=items.filter(item=>item.kind==='picture'&&item.cover);const index=images.findIndex(item=>item.id===id);if(index<0)throw Error('图片不在当前列表中');return {images,index:Math.min(images.length-1,Math.max(0,index+delta))};}
  return {kinds,clock,page,itemKey,favoriteSet,validateCatalog,imageIndex};
});
