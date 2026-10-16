// Drives the shipped Rust command + hidden WebView2 printer, not a PDF mock.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {launchApp} from './testing/app-session.mjs';
import {until} from './testing/app-session.mjs';
import {pathToFileURL} from 'node:url';
const app=await launchApp();
try{
  const input=path.join(app.directory,'中文 Markdown.md'),output=path.join(app.directory,'中文 Markdown.pdf');
  fs.copyFileSync('android/src-tauri/icons/128x128.png',path.join(app.directory,'图标.png'));
  const text='# RHFiles 中文 PDF 测试\n\n中文、English、数字 123，标点与路径 `C:\\资料\\文件.md`。\n\n## 表格与链接\n\n| 项目 | 内容 |\n| --- | --- |\n| 中文文件 | 正常显示 |\n| English | readable |\n\n- 第一项\n- 第二项\n\n> 引用：只在本机转换，不上传内容。\n\n```js\nconst message = "中文代码";\nconsole.log(message);\n```\n\n![RHFiles 图标](图标.png)\n\n<script>throw new Error("must not run")</script>\n\n'+Array.from({length:45},(_,i)=>`### 第 ${i+1} 节\n\n这是用于检查分页、中文排版与段落留白的测试。内容应保持可读，不能重叠或被裁切。\n\n`).join('');
  fs.writeFileSync(input,text);
  const info=await app.evaluate("call('document_converters')");assert.ok(info.converters.some(c=>c.kind==='builtin'));
  await app.evaluate(`navigateAddressInput(${JSON.stringify(pathToFileURL(input).href)},false)`);
  await app.evaluate('showContextMenu(120,120,false)');
  assert.equal(await app.evaluate("document.querySelectorAll('.context-menu > .ctx-item:has(> .ctx-item-main > .ctx-icon-document)').length"),1);
  await app.hover('.context-menu > .ctx-item:has(> .ctx-item-main > .ctx-icon-document)');
  await until(()=>app.evaluate("(()=>{const item=document.querySelector('.ctx-submenu .ctx-item:has(.ctx-icon-document)');return !!item?.getBoundingClientRect().width})()"),'PDF submenu visible after hover');
  await app.click('.ctx-submenu .ctx-item:has(.ctx-icon-document)');
  await until(()=>app.evaluate("!document.getElementById('markdown-pdf-start').disabled"),'converter dialog ready');
  assert.equal(await app.evaluate("document.getElementById('markdown-pdf-name').value"),path.basename(output));
  await app.screenshot('markdown-pdf-dialog');
  await app.evaluate('startMarkdownPdf()');
  assert.equal(fs.readFileSync(output).subarray(0,5).toString(),'%PDF-');
  const noStaging=async()=>{await until(()=>!fs.existsSync(info.cachePath)||fs.readdirSync(info.cachePath).length===0,'staging cleanup');assert.ok(!fs.readdirSync(app.directory).some(name=>name.startsWith('.rhfiles-pdf-')));};
  await noStaging();
  const digest=()=>crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex');const before=digest();
  const error=await app.evaluate(`call('convert_markdown_pdf',${JSON.stringify({inputPath:input,outputPath:output,converterId:'builtin',operationId:'pdf-collision-qa'})}).then(()=>null,e=>String(e))`);
  assert.ok(error?.includes('never overwritten'));assert.equal(digest(),before);
  // A separate program reads the generated HTML, receives Unicode paths as
  // individual arguments and reports errors through the production IPC path.
  fs.copyFileSync(output,input+'.reference.pdf');
  const fixture=path.resolve('scripts/testing/pdf-command-fixture.ps1');
  const command={id:'command-test',name:'Command QA',kind:'command',executable:process.env.SystemRoot+'\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',arguments:['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fixture,'-InputFile','{input}','-OutputFile','{output}','-HtmlFile','{html}','-Mode','ok'],timeoutSeconds:30};
  const save=mode=>{command.arguments[command.arguments.length-1]=mode;fs.writeFileSync(info.path,JSON.stringify({schemaVersion:1,default:command.id,converters:[command]}));};
  save('ok');const reloaded=await app.evaluate("call('document_converters')");assert.equal(reloaded.default,command.id);
  const custom=path.join(app.directory,'external 中文.pdf');
  await app.evaluate(`call('convert_markdown_pdf',${JSON.stringify({inputPath:input,outputPath:custom,converterId:command.id,operationId:'pdf-command-qa'})})`);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(custom)).digest('hex'),before);
  await noStaging();
  for(const mode of ['fail','invalid']){
    save(mode);const destination=path.join(app.directory,mode+'.pdf');
    const failure=await app.evaluate(`call('convert_markdown_pdf',${JSON.stringify({inputPath:input,outputPath:destination,converterId:command.id,operationId:'pdf-'+mode+'-qa'})}).then(()=>null,e=>String(e))`);
    assert.ok(failure?.includes(mode==='fail'?'fixture-converter-error':'not a valid'));assert.ok(!fs.existsSync(destination),'Failed conversion must not publish an output');
    await noStaging();
  }
  save('wait');const canceledOutput=path.join(app.directory,'canceled.pdf');
  await app.evaluate(`window.__pdfCancel=call('convert_markdown_pdf',${JSON.stringify({inputPath:input,outputPath:canceledOutput,converterId:command.id,operationId:'pdf-cancel-qa'})}).then(()=>null,e=>String(e));true`);
  await until(()=>fs.existsSync(info.cachePath)&&fs.readdirSync(info.cachePath).some(name=>fs.existsSync(path.join(info.cachePath,name,'document.html'))),'cancel conversion started');
  await app.evaluate("call('cancel_operation',{operationId:'pdf-cancel-qa'})");
  assert.match(await app.evaluate('window.__pdfCancel'),/cancelled/i);assert.ok(!fs.existsSync(canceledOutput));await noStaging();
  fs.copyFileSync(output,path.join(app.artifactDir,'markdown-output.pdf'));fs.copyFileSync(input,path.join(app.artifactDir,'source.md'));
  console.log(JSON.stringify({pass:true,pdf:path.join(app.artifactDir,'markdown-output.pdf'),bytes:fs.statSync(output).size,configPath:info.path,collisionProtected:true,commandProvider:true,errorAndInvalidOutput:true},null,2));
}finally{app.close();}
