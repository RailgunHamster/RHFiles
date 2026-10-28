import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {createRequire} from 'node:module';
import {listenBrowserLoopback} from '../../../scripts/testing/browser-loopback.mjs';
const require=createRequire(import.meta.url);let pw;
for(const name of [process.env.PLAYWRIGHT_MODULE,'playwright','playwright-core','C:/Users/Administrator/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright'].filter(Boolean)){try{pw=require(name);break;}catch{}}
export async function browserFixture(root,custom=()=>false){
  if(!pw)throw Error('Playwright required; skipping is not a pass');
  const server=http.createServer((req,res)=>{if(custom(req,res))return;const pathname=new URL(req.url,'http://localhost').pathname;const target=path.resolve(root,'.'+decodeURIComponent(pathname));if(!target.startsWith(root+path.sep)&&target!==root)return res.writeHead(403).end();const file=target===root?path.join(root,'index.html'):target;fs.readFile(file,(e,data)=>e?res.writeHead(404).end():res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream'}).end(data));});
  await listenBrowserLoopback(server);
  const cache=path.join(process.env.LOCALAPPDATA||'','ms-playwright'),executablePath=process.env.CHROMIUM_PATH||(fs.existsSync(cache)?fs.readdirSync(cache).filter(n=>n.startsWith('chromium-')).sort().reverse().map(n=>path.join(cache,n,'chrome-win64','chrome.exe')).find(p=>fs.existsSync(p)):undefined);
  const browser=await pw.chromium.launch({headless:true,executablePath});return {browser,url:`http://127.0.0.1:${server.address().port}`,async close(){await browser.close();await new Promise(resolve=>server.close(resolve));}};
}
