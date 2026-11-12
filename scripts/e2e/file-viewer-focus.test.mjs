import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {launchApp,sleep,until} from '../testing/app-session.mjs';
import {cdpSession} from '../rhfiles-api.mjs';

test('The image viewer first appears maximized and Esc closes it without a mouse click',{
  timeout:60000,
  skip:process.env.RHFILES_NATIVE_PLAYER_QA!=='1'&&'Requires the owned native keyboard adapter',
},async t=>{
  const app=await launchApp();
  let page;
  try{
    const desktop=await app.nativeWindows.inputReady();
    if(!desktop.available){
      t.skip(desktop.reason);
      return;
    }
    const image=path.join(app.directory,'rhfiles-qa-viewer-focus.png');
    fs.writeFileSync(image,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZioAAAAASUVORK5CYII=','base64'));
    const viewerTarget=async()=>(
      await (await fetch('http://127.0.0.1:'+app.port+'/json/list')).json()
    ).find(row=>new URL(row.url).pathname==='/file-viewer.html');
    await app.evaluate(`(async()=>{
      await RHFilesAPI.invoke('navigation.open',{path:${JSON.stringify(app.directory)}});
      await RHFilesAPI.invoke('media.preferences.set',{imageOpenWith:'rhfiles'});
    })()`);
    const [firstShow]=await Promise.all([
      app.nativeWindows.fileViewerFirstShow(),
      sleep(300).then(()=>app.evaluate(`openFileHandler(${JSON.stringify(image)})`)),
    ]);
    const {observedAtMs,...appearance}=firstShow;
    assert.deepEqual(appearance,{maximized:true,fileTitle:true},'The first visible native window is already the maximized image viewer');
    page=await cdpSession(await until(viewerTarget,'image viewer WebView'),15000);
    await until(()=>page.evaluate('!!document.querySelector(".image-page img")?.naturalWidth'),'image rendered');
    const pageReadyAtMs=await page.evaluate("Math.floor(performance.timeOrigin+performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd)");
    assert.ok(observedAtMs>=pageReadyAtMs,'The viewer page is initialized before the first visible native window');
    t.diagnostic(JSON.stringify({firstShow,pageReadyAtMs}));

    let windows;
    await until(async()=>{
      windows=await app.nativeWindows.windows();
      return windows.find(row=>row.label==='window-file-viewer'&&row.foreground&&row.inputFocus);
    },'native viewer activation',5000).catch(async error=>{
      t.diagnostic(JSON.stringify({document:await page.evaluate('document.hasFocus()'),windows}));
      throw error;
    });
    const focus={document:await page.evaluate('document.hasFocus()'),windows};
    t.diagnostic(JSON.stringify(focus));
    await app.nativeWindows.fileViewerEscape();
    await until(async()=>!(await viewerTarget()),'real Esc closes the viewer without a click',5000);
    assert.equal(focus.document,true,'The opened viewer WebView2 received keyboard focus');
  }finally{
    page?.close();
    await app.close();
  }
});
