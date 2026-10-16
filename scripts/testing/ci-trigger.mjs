// Deliberately select only public trigger identifiers, never dump the complete
// event payload or environment (both may contain credentials/private content).
import fs from 'node:fs';
const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
console.log(JSON.stringify({run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,
  workflow:process.env.GITHUB_WORKFLOW,event:process.env.GITHUB_EVENT_NAME,
  ref:process.env.GITHUB_REF,sha:process.env.GITHUB_SHA,before:event.before,after:event.after,
  pullRequest:event.pull_request?.number},null,2));
