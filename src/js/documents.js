// Provider selection is read from the profile JSON on every dialog/conversion.
let markdownPdfFile=null;
function markdownPdfError(message){const e=document.getElementById('markdown-pdf-error');e.textContent=message;e.hidden=!message;}
async function showMarkdownPdfDialog(file){
  markdownPdfFile=file;
  const dialog=document.getElementById('markdown-pdf-dialog');dialog.style.display='flex';
  document.getElementById('markdown-pdf-source').textContent=file.path;
  document.getElementById('markdown-pdf-name').value=file.name.replace(/\.(md|markdown)$/i,'')+'.pdf';
  markdownPdfError('');document.getElementById('markdown-pdf-start').disabled=true;
  RHFilesUI.assign(dialog,"keydown",event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMarkdownPdfDialog();}else if(event.key==='Enter' && event.target.id==='markdown-pdf-name' && !document.getElementById('markdown-pdf-start').disabled){event.preventDefault();startMarkdownPdf();}},"src.js.documents.showMarkdownPdfDialog.38773c978419");
  try{
    const info=await call('document_converters'),select=document.getElementById('markdown-pdf-provider');select.replaceChildren();
    for(const provider of info.converters){const option=document.createElement('option');option.value=provider.id;option.textContent=provider.name;select.append(option);}
    select.value=info.default;document.getElementById('markdown-pdf-config').textContent=info.path;
    document.getElementById('markdown-pdf-start').disabled=false;
    if(dialog.style.display!=='none'){document.getElementById('markdown-pdf-name').focus();document.getElementById('markdown-pdf-name').select();}
  }catch(error){markdownPdfError(String(error));}
}
function closeMarkdownPdfDialog(){document.getElementById('markdown-pdf-dialog').style.display='none';}
async function editDocumentConverterConfig(){try{const info=await call('document_converters');await call('open_file',{path:info.path});}catch(error){showNotice(String(error));}}
async function startMarkdownPdf(){
  const name=document.getElementById('markdown-pdf-name').value.trim();
  if(!name || /[\\/:*?"<>|]/.test(name) || !name.toLowerCase().endsWith('.pdf')){markdownPdfError(t('pdf.invalidName'));return;}
  const file=markdownPdfFile,folder=parentFolderPath(file.path),output=joinFolderPath(folder,name),provider=document.getElementById('markdown-pdf-provider').value;
  const operationId=createOperationTaskId();closeMarkdownPdfDialog();
  showProgress(t('pdf.task',{name:file.name}),{taskId:operationId,indeterminate:true,cancellable:true,currentName:name,currentPath:output});
  try{
    await call('convert_markdown_pdf',{inputPath:file.path,outputPath:output,converterId:provider,operationId});
    completeOperationTask(operationId,{currentName:name});await broadcastMediaConversion(folder);showNotice(t('pdf.complete',{name}));
  }catch(error){if(isOperationCancellationRequested(operationId)||/cancelled/i.test(String(error)))cancelOperationTask(operationId);else{failOperationTask(operationId,error);showNotice(String(error));}}
}
