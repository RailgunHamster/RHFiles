// FTP is a separate filesystem: never pass a remote URI to Windows APIs.
function isFtpPath(path) { return /^(?:ftp|remote):\/\//i.test(String(path || '')); }
function isSavedNetworkPath(path) { return /^remote:\/\//i.test(String(path||'')); }
function savedNetworkLocation(path){const u=new URL(path);if(u.username||u.password||u.port||u.search||u.hash)throw Error('Invalid network location');return {id:u.host,path:decodeURIComponent(u.pathname||'/')};}
async function protocolOperation(operation,path,extra={}){
  if(isSavedNetworkPath(path))return call('network_location',{action:'fs',args:{...savedNetworkLocation(path),operation,...extra}});
  const location=ftpLocation(path),command={mkdir:'ftp_mkdir',delete:'ftp_delete',rename:'ftp_rename',download:'ftp_download',upload:'ftp_upload'}[operation];
  if(operation==='list')return call('ftp_list',location);
  return call(command,{...location,remotePath:location.path,oldPath:location.path,...extra});
}
function ftpUrl(host, path) {
  return 'ftp://' + host + '/' + String(path).split('/').filter(Boolean).map(encodeURIComponent).join('/');
}
function ftpLocation(path) {
  const url = new URL(path);
  const connection = G.ftpConnections?.get(url.host.toLowerCase());
  if (!connection) throw new Error(t('ftp.reconnect'));
  return {...connection, host: url.host, path: decodeURIComponent(url.pathname || '/')};
}
function pathLeaf(path) {
  if(/^remote:\/\//i.test(String(path))&&new URL(path).pathname==='/'&&typeof networkLocations!=='undefined')return networkLocations.label(new URL(path).host);
  if(typeof isDevicePath==='function'&&isDevicePath(path)){const p=RHFilesDevicePaths.parse(path);return p.parts.at(-1)||deviceBrowser.name(p.group,p.peer);}
  if (IS_MAC && !isFtpPath(path)) return String(path).replace(/\/+$/, '').split('/').pop();
  const leaf = String(path).replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  return isFtpPath(path) ? decodeURIComponent(leaf) : leaf;
}
async function ftpEntries(path) {
  if(isSavedNetworkPath(path)){
    const entries=await protocolOperation('list',path);
    return entries.map(entry=>({...entry,path:joinFolderPath(path,entry.name)}));
  }
  const location = ftpLocation(path);
  const entries = await call('ftp_list', location);
  return entries.map(entry => ({...entry, path: ftpUrl(location.host, location.path.replace(/\/+$/, '') + '/' + entry.name)}));
}
async function remoteInfo(path) {
  if (!isFtpPath(path)) return call('get_file_info', {path});
  const url = new URL(path);
  if (url.pathname === '/') return {path, name: url.host, is_dir: true};
  const entry = (await ftpEntries(parentFolderPath(path))).find(e => e.name === pathLeaf(path));
  if (!entry) throw new Error('[not_found] ' + path);
  return entry;
}
async function removeRemote(path) {
  const info = await remoteInfo(path);
  if (info.is_dir) for (const entry of await ftpEntries(path)) await removeRemote(entry.path);
  return protocolOperation('delete',path,{isDir:!!info.is_dir});
}
async function transferRemote(source, target) {
  const info = await remoteInfo(source);
  if (await call('path_exists', {path: target})) throw new Error(t('ftp.targetExists'));
  if (info.is_dir) {
    if (isFtpPath(target)) {
      await protocolOperation('mkdir',target);
    } else {
      await call('create_new_file', {parent: parentFolderPath(target), template: 'folder', name: pathLeaf(target)});
    }
    for (const child of await listPathEntries(source, '')) await transferRemote(child.path, joinFolderPath(target, child.name));
  } else if (isFtpPath(source) && !isFtpPath(target)) {
    await protocolOperation('download',source,{localPath:target});
  } else if (!isFtpPath(source) && isFtpPath(target)) {
    if(isSavedNetworkPath(target))await protocolOperation('upload',target,{localPath:source});
    else {const location=ftpLocation(parentFolderPath(target));await call('ftp_upload',{...location,localPath:source,remoteDir:location.path,remoteName:pathLeaf(target)});}
  } else {
    throw new Error(t('ftp.serverCopyUnsupported'));
  }
}

async function routeFtpCommand(cmd, args) {
  if (cmd.startsWith('ftp_')||cmd==='network_location'||cmd.startsWith('db_')||['open_new_window','save_window_state','copy_file_path'].includes(cmd)) return null;
  const paths = [args.path, args.parent, args.src, args.dest, ...(args.paths || [])];
  if (!paths.some(isFtpPath)) return null;
  if(cmd.startsWith('move_')&&paths.some(path=>/^remote:\/\//i.test(String(path||'')))){
    throw Error('[unsupported_safe_move] '+(String(_lang).startsWith('zh')?'此协议暂不支持带版本校验的跨位置移动。请先复制并核对，再手动删除；尚未复制或删除任何文件。':'Version-checked cross-location moves are unavailable for this protocol. Copy and verify first, then delete manually. No files have been copied or deleted.'));
  }
  let value;
  switch (cmd) {
    case 'list_dir': value = await ftpEntries(args.path); break;
    case 'parent_path': value = parentFolderPath(args.path); break;
    case 'get_file_info': value = await remoteInfo(args.path); break;
    case 'inspect_rename_target': {
      if (!args.newName || ['.', '..'].includes(args.newName) || /[\/\0]/.test(args.newName)) throw new Error('Invalid destination name');
      const target = joinFolderPath(parentFolderPath(args.path), args.newName);
      const source = await remoteInfo(args.path);
      let existing;
      try { existing = await remoteInfo(target); }
      catch (error) { if (!String(error).includes('[not_found]')) throw error; }
      value = {path:target, exists:!!existing, sameEntry:target === args.path,
        canMerge:!!source.is_dir && !!existing?.is_dir, isDirectory:!!existing?.is_dir};
      break;
    }
    case 'path_exists':
      try { await remoteInfo(args.path); value = true; }
      catch (error) { if (!String(error).includes('[not_found]')) throw error; value = false; }
      break;
    case 'new_folder': {
      const entries = await ftpEntries(args.parent);
      const used = new Set(entries.map(e => e.name));
      let name = 'New Folder', index = 1;
      while (used.has(name)) name = 'New Folder (' + index++ + ')';
      value = joinFolderPath(args.parent, name);
      await protocolOperation('mkdir',value);
      break;
    }
    case 'rename_file': {
      if(!args.newName||['.','..'].includes(args.newName)||/[\/\\\0]/.test(args.newName))throw Error('Invalid destination name');
      const target=joinFolderPath(parentFolderPath(args.path),args.newName);
      if(target!==args.path&&await call('path_exists',{path:target}))throw Error('[conflict] Destination exists; nothing was replaced');
      await protocolOperation('rename',args.path,{newName:args.newName});
      break;
    }
    case 'delete_file': await removeRemote(args.path); break;
    case 'delete_files': case 'delete_files_permanently': {
      value = {deleted: [], errors: [], cancelled: false};
      for (const path of args.paths) {
        if (args.operationId && isOperationCancellationRequested(args.operationId)) { value.cancelled = true; break; }
        try {
          if (isFtpPath(path)) await removeRemote(path); else await call('delete_file', {path});
          value.deleted.push(path);
        } catch (error) { value.errors.push(path + ': ' + error); }
      }
      break;
    }
    case 'copy_with_progress': case 'move_with_progress': {
      const target = joinFolderPath(args.dest, args.targetName || pathLeaf(args.src));
      if (isFtpPath(args.src) && isFtpPath(target)) throw new Error(t('ftp.serverCopyUnsupported'));
      if (args.overwrite && await call('path_exists', {path: target})) {
        // Legacy FTP deletes before copying. Never do that: failed transfers
        // would destroy the only intact destination. Keep Both remains usable.
        throw new Error('[conflict] '+(String(_lang).startsWith('zh')?'此协议不支持安全替换，请选择保留两者；现有文件未更改。':'Safe replacement is unavailable for this protocol. Choose Keep Both; the existing file was not changed.'));
      }
      await transferRemote(args.src, target);
      if (cmd === 'move_with_progress') {
        if (isFtpPath(args.src)) await removeRemote(args.src); else await call('delete_file', {path: args.src});
      }
      break;
    }
    case 'copy_path_exact': case 'move_path_exact': {
      if (isFtpPath(args.src) && isFtpPath(args.dest)) throw new Error(t('ftp.serverCopyUnsupported'));
      await transferRemote(args.src, args.dest);
      if (cmd === 'move_path_exact') {
        if (isFtpPath(args.src)) await removeRemote(args.src); else await call('delete_file', {path: args.src});
      }
      break;
    }
    case 'open_file': case 'open_with_program': case 'show_open_with_dialog': {
      const root = await call('get_env', {key: 'TEMP'});
      if (!root) throw new Error(t('ftp.localOnly'));
      const local = joinFolderPath(root, 'rhfiles-ftp-' + crypto.randomUUID() + '-' + pathLeaf(args.path));
      await transferRemote(args.path, local);
      await call(cmd, {...args,path: local});
      break;
    }
    case 'get_file_icon': case 'get_thumbnail': value=null; break;
    case 'read_file_preview': value={preview_type:'unsupported',text_content:null,image_data:null,size:(await remoteInfo(args.path)).size};break;
    case 'git_status': case 'svn_status': value = {}; break;
    case 'get_dir_tree': value = []; break;
    default: throw new Error(t('ftp.localOnly'));
  }
  return {value};
}
