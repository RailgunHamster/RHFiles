// Auto-selected HTTP/CDP test ports must work in both Chromium and Node Fetch.
// Never disable port blocking or change the machine's ephemeral-port range.
// https://fetch.spec.whatwg.org/#port-blocking
// https://github.com/nodejs/undici/blob/main/lib/web/fetch/constants.js
const blocked=new Set([1719,1720,1723,2049,3659,4045,4190,5060,5061,6000,6566,6665,6666,6667,6668,6669,6679,6697,10080]);
export function browserPort(port){return Number.isSafeInteger(port)&&port>=1024&&port<=65535&&!blocked.has(port);}
export async function listenBrowserLoopback(server){
  if(server.listening)throw Error('Expected an owned, unbound test server');
  for(let attempt=0;attempt<16;attempt++){
    let failed;
    try{await new Promise((resolve,reject)=>{failed=reject;server.once('error',failed);server.listen(0,'127.0.0.1',resolve);});}
    finally{server.off('error',failed);}
    const address=server.address();
    if(address?.address==='127.0.0.1'&&browserPort(address.port))return address;
    // Only an unexposed listener owned by this caller is closed and rebound.
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
  throw Error('No browser-compatible loopback port in the allocation budget');
}
