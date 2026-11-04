// Ordinary library workflows begin only after native restoration and startup
// hooks settle. API registration alone is not the application's ready signal.
// Startup/restore race tests deliberately continue using the raw CDP session.
import {cdpSession as rawSession} from '../rhfiles-api.mjs';

export async function waitForLibraryReady(session,timeout=30000){
  if(!Number.isSafeInteger(timeout)||timeout<1||timeout>60000)throw Error('Invalid library readiness timeout');
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    if(await session.evaluate('globalThis.RHFilesAPI?.snapshot().state.application?.ready===true'))return;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw Error('Library application never reported ready; no business action was submitted');
}

export async function cdpSession(target,timeout,options){
  const session=await rawSession(target,timeout,options);
  try{
    if(['/rhvideo.html','/rhvideo-shared.html'].includes(new URL(target.url).pathname))await waitForLibraryReady(session,timeout);
    return session;
  }catch(error){session.close();throw error;}
}
