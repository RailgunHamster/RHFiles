// Owned native OLE target. Mouse input must be real (e.g. Windows Computer Use),
// not CDP Input.dispatchMouseEvent, which doesn't hold a Windows mouse button.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {launchApp} from './app-session.mjs';
const app=await launchApp();
try {
  const directory=path.join(app.directory,'external-drag-fixtures');fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory,'外拖测试.txt'),'RHFiles owned drag acceptance.\n');
  fs.mkdirSync(path.join(directory,'Nested folder'));fs.writeFileSync(path.join(directory,'Nested folder','child.txt'),'nested fixture');
  await app.evaluate(`RHFilesAPI.invoke('navigation.open',{path:${JSON.stringify(directory)}})`);
  await app.evaluate(`RHFilesAPI.invoke('selection.set',{paths:${JSON.stringify([path.join(directory,'外拖测试.txt'),path.join(directory,'Nested folder')])}})`);
  await app.evaluate('call("native_drag_test_target",{})');
  console.log(JSON.stringify({ready:true,artifactDir:app.artifactDir,directory}));
  const input=readline.createInterface({input:process.stdin});
  for await(const line of input){
    if(line.trim()==='close')break;
    if(line.trim()==='result'){
      const drops=await app.evaluate('call("native_drag_test_drops",{})');
      const result={drops,sourcesExist:fs.existsSync(path.join(directory,'外拖测试.txt'))&&fs.existsSync(path.join(directory,'Nested folder','child.txt'))};
      fs.writeFileSync(path.join(app.artifactDir,'external-native-drag.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
    }
  }
} finally {await app.close();}
