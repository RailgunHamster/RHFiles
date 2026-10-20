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
