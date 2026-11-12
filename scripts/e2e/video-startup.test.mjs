import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {launchApp, until} from '../testing/app-session.mjs';
import {launchRemoteWindowsApp} from '../testing/remote-windows-app.mjs';
import {cdpSession} from '../rhfiles-api.mjs';

const api = (app, id, args = {}) => app.evaluate(`RHFilesAPI.invoke(${JSON.stringify(id)},${JSON.stringify(args)})`);
const native = (app, id, args = {}) => app.evaluate(`call(${JSON.stringify(id)},${JSON.stringify(args)})`);
const cold = process.env.RHFILES_VIDEO_QA_COLD === '1';

test('Windows playback reports startup stages and reuses the player for a different input', {timeout: 240000}, async () => {
  const app = await launchApp();
  let remote, page;
  const artifacts = path.resolve('test-artifacts');
  const directory = await fs.mkdtemp(path.join(artifacts, 'video-startup-fixtures-'));
  const names = ['fixture-head.mp4', 'fixture-tail.mp4'];
  const files = names.map(name => path.join(directory, name));
  const timings = [];
  try {
    const ffmpeg = process.env.FFMPEG || path.resolve('src-tauri/thirdparty/ffmpeg.exe');
    for (const [index, file] of files.entries()) {
      execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=size=640x${index === 0 ? 360 : 352}:rate=24`,
        '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '30', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac',
        ...(index === 0 ? ['-movflags', '+faststart'] : []), file], {windowsHide: true, timeout: 20000});
    }
    await app.evaluate("setLang('zh');G.settings.autoUpdateEnabled=false;G.previewOn=false;true");
    if (cold) {
      // Explicit viewer opens still work with the system-player preference.
      await api(app, 'media.preferences.set', {videoOpenWith: 'system'});
    } else {
      await app.evaluate(`{
        const original = call;
        call = async (...args) => {
          const result = await original(...args);
          if (args[0] === 'file_viewer_request' && args[1]?.action === 'video.prewarm') window.prewarmFinished = true;
          return result;
        };
        true;
      }`);
    }
    await api(app, 'navigation.open', {path: directory});
    if (!cold) await until(() => app.evaluate('window.prewarmFinished === true'), 'listing triggers VLC DLL prewarm');
    const viewerTarget = async () => (await (await fetch(`http://127.0.0.1:${app.port}/json/list`)).json())
      .find(row => new URL(row.url).pathname === '/file-viewer.html');

    async function closeViewer() {
      await api(page, 'media.viewer.close').catch(() => {});
      await until(async () => !(await viewerTarget()), 'playback window closed');
      page.close();
      page = null;
    }

    async function play(file, transport, previousInput) {
      const started = performance.now();
      assert.equal((await api(app, 'media.viewer.open', {path: file})).opened, true);
      if (!page) {
        let target;
        try {
          target = await until(viewerTarget, 'owned playback window');
        } catch (error) {
          const targets = await (await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();
          const viewer = await native(app, 'file_viewer_request', {action: 'state', args: {}}).catch(() => null);
          throw Error(`${error.message}. Targets: ${targets.map(row => row.url).join(', ')}. Session: ${viewer?.generation ?? 'absent'}`, {cause: error});
        }
        page = await cdpSession(target, 30000);
      }
      const state = await until(async () => {
        const current = await api(page, 'media.viewer.state');
        if (current.path === file && current.video?.startup?.phase === 'failed') {
          throw Error(current.video.startup.error);
        }
        return current.path === file && current.rendered && current.video?.inputId !== previousInput && current;
      }, `${transport} first frame for ${path.basename(file)}`, 25000);
      const result = state.video.startup;
      assert.equal(state.video.videoHeight, file.endsWith(names[0]) ? 360 : 352, 'first frame belongs to the new video');
      assert.equal(result.phase, 'ready');
      assert.equal(result.transport, transport);
      assert.equal(result.reused, previousInput !== undefined);
      assert.ok(Number.isInteger(result.windowMs) && Number.isInteger(result.sourceMs));
      assert.ok(result.inputToFrameMs > 0 && result.totalMs >= result.inputToFrameMs);
      assert.equal(result.playerInitMs === null, result.reused);
      assert.equal(result.vlcInit === null, result.reused);
      assert.equal(result.surfaceMs === null, result.reused);
      assert.equal(result.surfaceMode, result.reused ? 'reused' : result.surfaceInlineError ? 'queued' : 'inline');
      assert.equal(result.firstFrameTimeoutMs, null);
      if (!result.reused) {
        const init = result.vlcInit;
        const needsLoad = cold && timings.length === 0;
        assert.equal(init.libraryReused, !needsLoad);
        for (const key of ['workerQueueMs', 'instanceMs', 'playerCreateMs']) assert.ok(Number.isInteger(init[key]), `${key} is measured`);
        for (const key of ['runtimeLookupMs', 'dllLoadMs', 'apiSetupMs']) {
          assert.equal(Number.isInteger(init[key]), needsLoad, `${key} belongs to the cold DLL load`);
          if (!cold) assert.ok(Number.isInteger(init.prewarm?.[key]), `${key} is recorded for prewarm`);
        }
        assert.ok(result.playerInitMs >= init.instanceMs + init.playerCreateMs + (init.dllLoadMs ?? 0));
        if (result.surfaceMode === 'inline') assert.equal(result.surfaceQueueMs, 0);
        else assert.ok(Number.isInteger(result.surfaceQueueMs), 'canvas recovery records the dispatch wait');
        assert.ok(result.surfaceInitMs >= result.surfaceCreateWindowMs);
        assert.ok(Number.isInteger(result.stages?.videoOutputSetupMs), 'a new VLC video output records module initialization');
      }
      if (!cold) {
        const warmup = result.pluginWarmup;
        assert.ok(warmup, 'Prewarm requires the bundled VLC runtime next to RHFiles.exe');
        assert.ok(warmup.filesRead > 0 && Number.isInteger(warmup.elapsedMs), 'Bundled VLC plugin prewarm completed');
      }
      for (const key of ['firstReadMs', 'bufferingMs', 'decoderInitMs', 'decodeMs', 'decodedAtMs', 'outputMs']) {
        assert.ok(Number.isInteger(result.stages?.[key]), `${key} is measured for ${transport}: ${JSON.stringify(result.stages)}`);
      }
      for (const key of ['layoutQueueMs', 'layoutMs', 'revealMs']) assert.ok(Number.isInteger(result[key]), `${key} is measured`);
      assert.ok(['initialCanvas', 'native', 'viewport'].includes(result.revealOrigin), 'first reveal records who displayed the surface');
      if (result.revealOrigin === 'initialCanvas') assert.equal(result.layoutQueueMs, 0, 'the already visible canvas does not wait for a reveal task');
      assert.ok(result.layoutConfiguredAtMs <= result.totalMs);
      assert.equal(Number.isInteger(result.firstRemoteByteMs), transport === 'device');
      timings.push({transport, file: path.basename(file), renderer: state.video.renderer, observedMs: Math.round(performance.now() - started), ...result});
      console.log('VIDEO_STARTUP ' + JSON.stringify(timings.at(-1)));
      await until(async () => Number.isInteger((await api(page, 'media.viewer.state')).video?.startup?.frontendViewportAtMs), 'WebView supplies measured viewport after early native reveal');
      return state;
    }

    let playback = await play(files[0], 'local');
    await api(page, 'media.viewer.video.diagnostics.set', {open: true});
    assert.match(await page.evaluate("document.getElementById('video-diagnostics').innerText"), /首帧就绪.*加载 VLC DLL.*创建 VLC 实例.*创建 VLC 播放器.*画布排队.*播放缓冲.*视频解码器加载与初始化.*视频输出初始化.*解码至检测到 VLC 输出.*总等待/s);
    playback = await play(files[1], 'local', playback.video.inputId);
    assert.equal((await api(page, 'media.viewer.video.diagnostics')).startup.reused, true);
    await closeViewer();
    playback = await play(files[0], 'local');

    const smbRoot = process.env.RHFILES_VIDEO_SMB_ROOT;
    if (smbRoot) {
      assert.match(smbRoot, /^\\\\[^\\]+\\[^\\]+/);
      await closeViewer();
      playback = undefined;
      for (const file of files) {
        const unc = path.win32.join(smbRoot, path.relative(artifacts, file));
        assert.equal((await fs.stat(unc)).size, (await fs.stat(file)).size);
        playback = await play(unc, 'smb', playback?.video.inputId);
      }
    }

    if (process.env.RHFILES_REMOTE_WINDOWS_QA === '1') {
      await closeViewer();
      playback = undefined;
      remote = await launchRemoteWindowsApp();
      const remoteFiles = [];
      for (const [index, file] of files.entries()) remoteFiles.push(await remote.uploadFixture(file, names[index]));
      const group = await native(remote, 'device_groups', {command: 'create', args: {name: 'Owned playback QA', deviceName: 'Remote QA host'}});
      await native(remote, 'device_groups', {command: 'configure', args: {id: group, enabled: true, permissions: {write: false, delete: false}}});
      const service = await native(remote, 'lan_service_start', {config: {port: 0, shares: [{name: 'Media', path: path.win32.dirname(remoteFiles[0])}]}});
      let endpoint;
      if (process.env.RHFILES_VIDEO_QA_SSH_TUNNEL === '1') {
        endpoint = await remote.forwardFixturePort(service.port);
      } else {
        const lanServer = process.env.RHFILES_VIDEO_QA_LAN_SERVER;
        endpoint = service.endpoints.find(value => lanServer
          ? new URL(value).hostname === lanServer
          : /^https:\/\/100\./.test(value));
        assert.ok(endpoint, 'remote Windows host advertises the selected test route');
        const clientIp = lanServer ? process.env.RHFILES_VIDEO_QA_LAN_CLIENT
          : execFileSync('tailscale', ['ip', '-4'], {encoding: 'utf8', windowsHide: true}).trim();
        await remote.allowInboundTestConnection({serverIp: new URL(endpoint).hostname, clientIp, port: service.port});
      }
      const peer = (await native(remote, 'device_groups', {command: 'state', args: {}})).deviceId;
      const request = await native(app, 'device_groups', {command: 'request', args: {deviceName: 'Playback QA client'}});
      const approval = await native(remote, 'device_groups', {command: 'approve', args: {id: group, uri: request.uri, canInvite: false}});
      await native(app, 'device_groups', {command: 'join', args: {uri: approval.uri, confirmed: true}});
      const connected = await native(app, 'device_groups', {command: 'connect', args: {id: group, peer, endpoint}});
      assert.equal(connected.outcome, 'connected', JSON.stringify(connected.steps));
      for (const name of names) playback = await play(`rhfiles-device://${group}/${peer}/Media/${name}`, 'device', playback?.video.inputId);
      await api(page, 'media.viewer.video.control', {command: 'seek', value: 20000});
      await until(async () => (await api(page, 'media.viewer.state')).video?.positionMs >= 19500, 'seek through a real device range');
    }
    const mislabeled = path.join(directory, 'matroska-with-mp4-extension.mp4');
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', files[1],
      '-map', '0', '-c', 'copy', '-f', 'matroska', mislabeled], {windowsHide: true, timeout: 20000});
    await play(mislabeled, 'local', playback.video.inputId);

    const malformed = path.join(directory, 'malformed.mp4');
    await fs.writeFile(malformed, 'This is not an MP4 file.');
    await api(app, 'media.viewer.open', {path: malformed});
    const failed = await until(async () => {
      const state = await api(page, 'media.viewer.state');
      return state.path === malformed && state.video?.startup?.phase === 'failed' && state;
    }, 'an unreadable video shows the first-frame error', 25000);
    assert.ok(failed.video.startup.error);
    assert.equal(failed.rendered, false);
    await fs.writeFile(path.join(app.artifactDir, 'video-startup-timings.json'), JSON.stringify(timings, null, 2));
  } finally {
    page?.close();
    if (remote) {
      await native(remote, 'lan_service_stop').catch(() => {});
      await remote.close();
    }
    await app.close();
    assert.equal(path.dirname(directory), artifacts);
    await fs.rm(directory, {recursive: true, force: true});
  }
});
