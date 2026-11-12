import test from 'node:test';
import assert from 'node:assert/strict';
import {launchApp} from '../testing/app-session.mjs';

test('Preview settings follow the active language and preserve media preferences',{timeout:60000},async t=>{
  const app=await launchApp();
  t.after(()=>app.close());
  await app.evaluate(`(async()=>{
    setLang('en');
    await RHFilesAPI.invoke('media.preferences.set',{imageBrowseMode:'continuous',videoDefaultVolume:42});
    openSettings();
    switchSettingsSection('preview');
  })()`);
  const read=()=>app.evaluate(`(()=>{
    const page=document.getElementById('settings-page-preview');
    const card=page.querySelector('.settings-card');
    const text=selector=>[...card.querySelectorAll(selector)].map(node=>node.textContent);
    const mode=card.querySelector('#settings-imageBrowseMode');
    return {
      visible:!page.hidden,title:text('.settings-card-title')[0],labels:text('label'),
      options:text('option, [data-media-mode]'),modeLabel:mode.getAttribute('aria-label'),
      selectedMode:mode.querySelector('[aria-pressed=true]').dataset.mediaMode,
      volume:card.querySelector('#settings-videoDefaultVolume').valueAsNumber,
    };
  })()`);
  const en={
    visible:true,title:'File readers and players',
    labels:['Open PDFs','Open images','Open videos','Image browsing','Arrow-key seek interval (seconds)','Player default volume (%)'],
    options:['RHFiles PDF reader','System default app','RHFiles image viewer','System default app','RHFiles built-in player','System default app','Paged','Continuous scrolling'],
    modeLabel:'Image browsing',selectedMode:'continuous',volume:42,
  };
  const zh={
    visible:true,title:'文件阅读与播放',
    labels:['打开 PDF','打开图片','打开视频','图片浏览模式','方向键快进／快退（秒）','播放器默认音量（%）'],
    options:['RHFiles PDF 阅读器','系统默认应用','RHFiles 图片查看器','系统默认应用','RHFiles 内置播放器','系统默认应用','逐张翻页','连续滚动'],
    modeLabel:'图片浏览模式',selectedMode:'continuous',volume:42,
  };
  await app.evaluate("setLang('zh')");
  assert.equal(await app.evaluate("document.querySelector('#settings-page-preview h2').textContent"),'预览');
  assert.deepEqual(await read(),zh);
  await app.evaluate("setLang('en')");
  assert.deepEqual(await read(),en);
  await app.evaluate("setLang('zh')");
  assert.deepEqual(await read(),zh);
});
