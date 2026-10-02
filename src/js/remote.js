// FTP is a separate filesystem: never pass a remote URI to Windows APIs.
function isFtpPath(path) { return /^ftp:\/\//i.test(String(path || '')); }
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
  if (IS_MAC && !isFtpPath(path)) return String(path).replace(/\/+$/, '').split('/').pop();
  const leaf = String(path).replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  return isFtpPath(path) ? decodeURIComponent(leaf) : leaf;
}
async function ftpEntries(path) {
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
  const location = ftpLocation(path);
  const info = await remoteInfo(path);
  if (info.is_dir) for (const entry of await ftpEntries(path)) await removeRemote(entry.path);
  return call('ftp_delete', {...location, remotePath: location.path, isDir: !!info.is_dir});
}
async function transferRemote(source, target) {
  const info = await remoteInfo(source);
  if (await call('path_exists', {path: target})) throw new Error(t('ftp.targetExists'));
  if (info.is_dir) {
    if (isFtpPath(target)) {
      const location = ftpLocation(target);
      await call('ftp_mkdir', {...location, remotePath: location.path});
    } else {
      await call('create_new_file', {parent: parentFolderPath(target), template: 'folder', name: pathLeaf(target)});
    }
    for (const child of await listPathEntries(source, '')) await transferRemote(child.path, joinFolderPath(target, child.name));
  } else if (isFtpPath(source) && !isFtpPath(target)) {
    const location = ftpLocation(source);
    await call('ftp_download', {...location, remotePath: location.path, localPath: target});
  } else if (!isFtpPath(source) && isFtpPath(target)) {
    const location = ftpLocation(parentFolderPath(target));
    await call('ftp_upload', {...location, localPath: source, remoteDir: location.path, remoteName: pathLeaf(target)});
  } else {
    throw new Error(t('ftp.serverCopyUnsupported'));
  }
}

async function routeFtpCommand(cmd, args) {
  if (cmd.startsWith('ftp_')) return null;
  const paths = [args.path, args.parent, args.src, args.dest, ...(args.paths || [])];
  if (!paths.some(isFtpPath)) return null;
  let value;
  switch (cmd) {
    case 'list_dir': value = await ftpEntries(args.path); break;
    case 'parent_path': value = parentFolderPath(args.path); break;
    case 'get_file_info': value = await remoteInfo(args.path); break;
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
      const location = ftpLocation(value);
      await call('ftp_mkdir', {...location, remotePath: location.path});
      break;
    }
    case 'rename_file': {
      const location = ftpLocation(args.path);
      await call('ftp_rename', {...location, oldPath: location.path, newName: args.newName});
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
        if (isFtpPath(target)) await removeRemote(target); else await call('delete_file', {path: target});
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
    case 'open_file': {
      const root = await call('get_env', {key: 'TEMP'});
      if (!root) throw new Error(t('ftp.localOnly'));
      const local = joinFolderPath(root, 'rhfiles-ftp-' + crypto.randomUUID() + '-' + pathLeaf(args.path));
      await transferRemote(args.path, local);
      await call('open_file', {path: local});
      break;
    }
    case 'git_status': case 'svn_status': value = {}; break;
    case 'get_dir_tree': value = []; break;
    default: throw new Error(t('ftp.localOnly'));
  }
  return {value};
}
