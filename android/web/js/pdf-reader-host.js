/* The native bridge returns bounded chunks, using SMB/FTP/HTTP Range access. */
const androidPdfReader=(()=>{
 RHFilesPdfReader.register(RHFilesAPI);
 async function open(entry){
  if(!ui.openSheet('',[]))return {opened:false};
  const panel=document.getElementById('sheet-panel');panel.classList.add('pdf-viewer-sheet');
  const host=ui.el('div','pdf-host');panel.append(host);let id=null,closed=false;
  const release=()=>{closed=true;const token=id;id=null;return token?api.native('pdf.close',{id:token}):undefined;};
  ui.onClosed(()=>{RHFilesPdfReader.destroy();void Promise.resolve(release()).catch(()=>{});});
  return RHFilesPdfReader.open(host,{path:entry.path,name:entry.name,mobile:true,language:'zh',api:RHFilesAPI,
   async source(){const source=await api.native('pdf.open',{path:entry.path});if(closed){void api.native('pdf.close',{id:source.id});throw Error('PDF 已关闭');}id=source.id;return {length:source.length,async readRange(offset,length){if(closed||!id)throw Error('PDF 已关闭');const result=await api.native('pdf.read',{id,offset,length});if(result.offset!==offset)throw Error('PDF 分段偏移不一致');return Uint8Array.from(atob(result.data),c=>c.charCodeAt(0));}};},
   release,systemOpen:()=>api.systemOpen(entry.path),close:()=>ui.closeSheet()
  }).then(()=>RHFilesPdfReader.state());
 }
 return {open};
})();
