const {test}=require('node:test'),assert=require('node:assert/strict'),notes=require('../js/changelog.js');
test('number paragraphs and split historical Chinese notes, preserving literal paths/HTML as text',()=>{
 assert.equal(notes.format('改进一。改进二。\r\n<img onerror=alert(1)>'),'1. 改进一。\n2. 改进二。\n3. <img onerror=alert(1)>');
 assert.equal(notes.format('1. 已编号\n2. 不重复'),'1. 已编号\n2. 不重复');
 assert.equal(notes.format('甲\\n乙'),'1. 甲\n2. 乙');
 assert.equal(notes.format('访问 192.168.1.20 和 0.1.18。'),'1. 访问 192.168.1.20 和 0.1.18。');
});
test('permanent history separates versions and resets numbering',()=>{
 const history=notes.sections('RHFiles Android 0.1.18\n\n1. 第一项\n2. 第二项\n\n此前版本改进 / Previous improvements (0.1.17):\n旧项一。旧项二。');
 assert.equal(history.length,2);assert.match(history[0].title,/0\.1\.18/);assert.equal(history[1].text,'1. 旧项一。\n2. 旧项二。');assert.equal(notes.format(null),'');
});
test('Markdown bilingual release files remain separate versions, with readable unnumbered language headings',()=>{
 const versions=notes.sections('\ufeff# RHFiles Android 0.1.37\r\n\r\n## 中文\r\n1. 新功能\r\n\r\n## English\r\n1. New feature\r\n\r\n# RHFiles Android 0.1.36\r\n旧功能。');
 assert.equal(versions.length,2);assert.equal(versions[0].title,'RHFiles Android 0.1.37');assert.match(versions[0].text,/^中文\n1\. 新功能/);assert.match(versions[0].text,/English\n1\. New feature/);assert.doesNotMatch(versions[0].text,/#|0\.1\.36/);assert.equal(versions[1].text,'1. 旧功能。');
});
