import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {readProcessReceipt} from '../rhfiles-receipts.mjs';
const transport={type:'windows-pipe',path:'\\\\.\\pipe\\RHFiles.receipts.'+'a'.repeat(32),secret:'b'.repeat(64)};
for(const reason of ['abort','deadline'])test('a read ended before connect cannot send a late authenticated query: '+reason,async()=>{
 const socket=new EventEmitter(),controller=new AbortController();let written=0,destroyed=0;socket.write=()=>written++;socket.destroy=()=>destroyed++;
 const pending=readProcessReceipt(transport,{runId:'generated:1'},Date.now()+(reason==='deadline'?10:1000),{signal:controller.signal,platform:'win32',connect:()=>socket});if(reason==='abort')controller.abort();await assert.rejects(pending,{code:reason==='abort'?'READ_ABORTED':'REQUEST_TIMEOUT'});assert.equal(destroyed,1);socket.emit('connect');assert.equal(written,0,'Ended receipt reads must not send on a late connect event');
});
