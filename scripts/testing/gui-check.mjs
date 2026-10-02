import fs from 'node:fs';
import path from 'node:path';
import {launchApp,until} from './app-session.mjs';
import {validateReport} from './report.mjs';

const app=await launchApp();
try {
  await until(()=>app.evaluate('typeof window.__runTests === "function"'),'legacy harness ready');
  await app.evaluate('window.__guiDone=null;window.__runTests().then(r=>window.__guiDone=r).catch(e=>window.__guiDone={error:String(e)});true');
  const report=await until(()=>app.evaluate('window.__guiDone'),'legacy GUI suite',120000);
  fs.writeFileSync(path.join(app.artifactDir,'gui-results.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,skipped:report.skipped,total:report.total,
    nonPassing:report.results?.filter(r=>r.status!=='PASS'),artifacts:app.artifactDir},null,2));
  validateReport(report,{allowSkipped:process.argv.includes('--allow-skipped'),minimum:200});
} catch(error) {
  await app.screenshot('gui-failure').catch(()=>{});
  throw error;
} finally {
  app.close();
}
