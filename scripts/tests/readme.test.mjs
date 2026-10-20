import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root} from '../testing/source.mjs';
const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');
test('single bilingual README leads with Chinese then English and introduces all platforms',()=>{
  assert.ok(readme.indexOf('## 中文')>0&&readme.indexOf('## English')>readme.indexOf('## 中文'));
  const intro=readme.slice(0,readme.indexOf('### 下载'));for(const platform of ['Windows','Android','macOS'])assert.ok(intro.includes(platform));
  assert.ok(!fs.existsSync(path.join(root,'README.zh-CN.md')));assert.doesNotMatch(readme,/README\.zh-CN\.md/);
});
test('both language sections expose distinct mobile/desktop downloads and preview limits',()=>{
  for(const section of readme.split(/^## (?:中文|English)\s*$/m).slice(1)){
    assert.match(section,/releases\/latest/);assert.match(section,/releases\?q=android-v/);assert.match(section,/gitee\.com/);assert.match(section,/actions\/workflows\/macos\.yml/);assert.match(section,/Apple Silicon/);assert.match(section,/docs\/RELEASING\.md/);assert.match(section,/docs\/ANDROID\.md/);
  }
});
test('README local documentation and license links resolve',()=>{
  for(const [,target] of readme.matchAll(/\]\(([^)]+)\)/g)){if(/^(https?:|#)/.test(target))continue;assert.ok(fs.existsSync(path.resolve(root,target.split('#')[0])),'Broken README target: '+target);}
});
test('README shares one screenshot gallery before both language sections',()=>{
  const gallery=readme.indexOf('## 界面预览 / Screenshots');
  assert.ok(gallery>0&&gallery<readme.indexOf('## 中文'));
  assert.equal((readme.match(/^## 界面预览 \/ Screenshots$/gm)||[]).length,1);
  const images=[...readme.matchAll(/(?:\]\(|\bsrc=")(docs\/screenshots\/[^)"]+\.png)/g)].map(match=>match[1]);
  assert.equal(images.length,4);assert.equal(new Set(images).size,4);
  assert.match(readme,/截图使用示例数据/);
  for(const image of images){
    const bytes=fs.readFileSync(path.join(root,image));
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',image+' must be a real PNG');
    assert.ok(bytes.readUInt32BE(16)>=800&&bytes.readUInt32BE(20)>=800,image+' needs readable resolution');
    assert.ok(bytes.length<600_000,image+' should remain lightweight');
    assert.ok(readme.indexOf(image)<readme.indexOf('## 中文'),'Do not repeat screenshots per language');
  }
});
