// The action runtime is identical on desktop and Android; generated mirrors
// are compared byte-for-byte by the automation coverage test.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const name of ['automation-core.js','nearby-ui.js']){
  const source=path.join(root,'src/js',name),target=path.join(root,'android/web/js',name);
  if(!fs.existsSync(target)||!fs.readFileSync(target).equals(fs.readFileSync(source)))fs.copyFileSync(source,target);
}
fs.copyFileSync(path.join(root,'src/js/automation-core.js'),path.join(root,'android/reader/automation-core.js'));
