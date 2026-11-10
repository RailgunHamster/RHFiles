(()=>{'use strict';
 const api=window.RHFilesAPI,core=window.__TAURI__.core,native=(action,args={})=>core.invoke('pdf_viewer_request',{action,args});
 let session=null,epoch=0,ready=false;
 RHFilesPdfReader.register(api);
 api.provideRunLookup(query=>core.invoke('automation_receipt',{query}));api.provideRunTransport(()=>core.invoke('automation_receipt_transport'));
 api.provideState('application',()=>({platform:'desktop',window:'window-pdf-reader',ready}));
 async function load(){const token=++epoch;ready=false;RHFilesPdfReader.destroy();const state=await native('state');if(token!==epoch||state.opened===false)return;session=state;const scope=()=>({generation:state.generation});
  await RHFilesPdfReader.open(document.getElementById('pdf-host'),{path:state.path,name:state.name,language:state.language,api,
   async source(){const data=await native('source',scope());return {url:data.url||core.convertFileSrc(data.path),length:data.size};},
   save:params=>native('saveAs',{...scope(),...params}),systemOpen:()=>native('systemOpen',scope()),close:run=>native('close',{...scope(),...(run?{_automationRun:run}:{})})
  });if(token===epoch)ready=true;
 }
 window.__TAURI__.event.listen('pdf-reader-changed',()=>load().catch(console.error)).catch(console.error);
 load().catch(error=>{document.getElementById('pdf-host').textContent=String(error);ready=true;});
})();
