import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root} from '../testing/source.mjs';

test('Windows SFTP uses self-contained OpenSSL instead of the intermittent WinCNG DH backend',()=>{
  const manifest=fs.readFileSync(path.join(root,'src-tauri/Cargo.toml'),'utf8');
  const windows=manifest.split("[target.'cfg(windows)'.dependencies]")[1]?.split('\n[')[0];
  assert.match(windows,/ssh2\s*=.*openssl-on-win32.*vendored-openssl/);
  const pack=fs.readFileSync(path.join(root,'scripts/package-velopack.ps1'),'utf8');
  assert(pack.includes('docs\\thirdparty\\openssl\\LICENSE.txt'));
  assert(pack.includes('OpenSSL-LICENSE.txt'));
  assert.match(fs.readFileSync(path.join(root,'docs/thirdparty/openssl/LICENSE.txt'),'utf8'),/END OF TERMS AND CONDITIONS/);
});
