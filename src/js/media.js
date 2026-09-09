// media.js — FFmpeg-backed video, audio, and image conversion

const MEDIA_VIDEO_EXTENSIONS = new Set(['mp4','mkv','mov','avi','webm','m4v','wmv','flv','mpeg','mpg','ts','mts']);
const MEDIA_AUDIO_EXTENSIONS = new Set(['mp3','wav','flac','aac','m4a','ogg','opus','wma','ape','alac','aiff']);
const MEDIA_IMAGE_EXTENSIONS = new Set(['png','jpg','jpeg','webp','bmp','tiff','tif','gif','avif']);
const MEDIA_OUTPUT_FORMATS = Object.freeze({
  video: ['mp4','mkv','mov','avi','webm','gif'],
  audio: ['mp3','wav','flac','aac','m4a','ogg','opus'],
  image: ['png','jpg','webp','bmp','tiff','avif'],
});

let _mediaConvertFile = null;
let _mediaConvertKind = null;
let _mediaConvertPreviousFormat = null;
let _mediaConvertFfmpegStatus = null;

function mediaConversionKind(file) {
  if (!file || file.is_dir) return null;
  const extension = String(file.extension || file.name?.split('.').pop() || '').toLowerCase();
  if (MEDIA_VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (MEDIA_AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (MEDIA_IMAGE_EXTENSIONS.has(extension)) return 'image';
  return null;
}

function mediaNameWithFormat(name, format) {
  const text = String(name || 'output');
  const dot = text.lastIndexOf('.');
  const stem = dot > 0 ? text.slice(0, dot) : text;
  const current = dot > 0 ? text.slice(dot + 1).toLowerCase() : '';
  const normalizedFormat = format === 'jpg' ? 'jpg' : format;
  return `${stem}${current === normalizedFormat ? '-converted' : ''}.${normalizedFormat}`;
}

function setMediaOptionVisibility(selector, visible) {
  document.querySelectorAll(selector).forEach(element => { element.hidden = !visible; });
}

function updateMediaConvertControls() {
  if (!_mediaConvertKind) return;
  const format = document.getElementById('media-convert-format')?.value || '';
  const nameInput = document.getElementById('media-convert-name');
  if (nameInput) {
    const previous = _mediaConvertPreviousFormat;
    const value = String(nameInput.value || '');
    if (!value || (previous && value.toLowerCase().endsWith(`.${previous}`))) {
      let stem = value ? value.slice(0, -(previous.length + 1)) : (_mediaConvertFile?.name || 'output').replace(/\.[^.]+$/, '');
      if (`${stem}.${format}`.toLowerCase() === String(_mediaConvertFile?.name || '').toLowerCase()) stem += '-converted';
      nameInput.value = `${stem}.${format}`;
    }
  }
  _mediaConvertPreviousFormat = format;

  const isVideo = _mediaConvertKind === 'video';
  const isAudio = _mediaConvertKind === 'audio';
  const isImage = _mediaConvertKind === 'image';
  const isGif = isVideo && format === 'gif';
  setMediaOptionVisibility('.media-quality-option', isImage || (isVideo && !isGif));
  setMediaOptionVisibility('.media-video-option', isVideo && !isGif);
  setMediaOptionVisibility('.media-audio-option', (isVideo && !isGif) || isAudio);
  setMediaOptionVisibility('.media-audio-only', isAudio);
  setMediaOptionVisibility('.media-image-option', isImage);
}

async function detectConfiguredFfmpeg(statusElement) {
  const element = typeof statusElement === 'string' ? document.getElementById(statusElement) : statusElement;
  if (element) {
    element.classList.remove('ready', 'error');
    element.textContent = t('convert.ffmpegChecking');
  }
  try {
    const status = await call('detect_ffmpeg', {
      configuredPath: String(G.settings.ffmpegPath || '').trim() || null,
    });
    _mediaConvertFfmpegStatus = status;
    if (element) {
      element.classList.toggle('ready', !!status?.available);
      element.classList.toggle('error', !status?.available);
      element.textContent = status?.available
        ? t('convert.ffmpegReady', {path: status.path || 'ffmpeg', version: status.version || ''})
        : t('convert.ffmpegMissing', {error: status?.error || t('convert.ffmpegUnknownError')});
      element.title = status?.error || status?.version || '';
    }
    return status;
  } catch (error) {
    _mediaConvertFfmpegStatus = {available:false, error:String(error)};
    if (element) {
      element.classList.add('error');
      element.textContent = t('convert.ffmpegMissing', {error:String(error)});
    }
    return _mediaConvertFfmpegStatus;
  } finally {
    const start = document.getElementById('media-convert-start');
    if (start) start.disabled = !_mediaConvertFfmpegStatus?.available;
  }
}

async function showMediaConvertDialog(file, isRight) {
  const kind = mediaConversionKind(file);
  if (!kind) return;
  _mediaConvertFile = {...file, _isRight: !!isRight};
  _mediaConvertKind = kind;
  const dialog = document.getElementById('media-convert-dialog');
  const formatSelect = document.getElementById('media-convert-format');
  const source = document.getElementById('media-convert-source');
  const error = document.getElementById('media-convert-error');
  if (!dialog || !formatSelect) return;
  source.textContent = file.path;
  source.title = file.path;
  if (error) { error.hidden = true; error.textContent = ''; }
  document.getElementById('media-convert-overwrite').checked = false;
  const rawInputFormat = String(file.extension || '').toLowerCase();
  const inputFormat = rawInputFormat === 'jpeg' ? 'jpg' : rawInputFormat === 'tif' ? 'tiff' : rawInputFormat;
  const formats = MEDIA_OUTPUT_FORMATS[kind];
  const preferred = ({video:'mp4', audio:'mp3', image:'png'})[kind];
  const defaultFormat = inputFormat === preferred ? formats.find(value => value !== inputFormat) : preferred;
  formatSelect.innerHTML = formats.map(format => `<option value="${format}"${format === defaultFormat ? ' selected' : ''}>${format.toUpperCase()}</option>`).join('');
  _mediaConvertPreviousFormat = defaultFormat;
  document.getElementById('media-convert-name').value = mediaNameWithFormat(file.name, defaultFormat);
  document.getElementById('media-convert-quality').value = kind === 'image' ? '92' : '80';
  document.getElementById('media-convert-codec').value = 'auto';
  document.getElementById('media-convert-preset').value = 'medium';
  document.getElementById('media-convert-resolution').value = 'original';
  document.getElementById('media-convert-bitrate').value = '192k';
  document.getElementById('media-convert-rate').value = 'original';
  document.getElementById('media-convert-channels').value = 'original';
  document.getElementById('media-convert-width').value = 'original';
  updateMediaConvertControls();
  dialog.style.display = 'flex';
  const start = document.getElementById('media-convert-start');
  if (start) start.disabled = true;
  await detectConfiguredFfmpeg('media-convert-ffmpeg');
}

function closeMediaConvertDialog() {
  const dialog = document.getElementById('media-convert-dialog');
  if (dialog) dialog.style.display = 'none';
}

function mediaConversionError(message) {
  const error = document.getElementById('media-convert-error');
  if (!error) return;
  error.textContent = message;
  error.hidden = false;
}

async function broadcastMediaConversion(folder) {
  const emit = window.__TAURI_INTERNALS__?.event?.emit || window.__TAURI__?.event?.emit;
  if (emit) await emit('fs-change', {paths:[folder]}).catch(() => {});
}

async function startMediaConversion() {
  if (!_mediaConvertFile || !_mediaConvertKind) return;
  const outputName = String(document.getElementById('media-convert-name')?.value || '').trim();
  if (!outputName || /[\\/:*?"<>|]/.test(outputName) || outputName === '.' || outputName === '..') {
    mediaConversionError(t('convert.invalidName'));
    return;
  }
  const format = document.getElementById('media-convert-format').value;
  if (!outputName.toLowerCase().endsWith(`.${format}`)) {
    mediaConversionError(t('convert.extensionMismatch', {format}));
    return;
  }
  if (!_mediaConvertFfmpegStatus?.available) {
    mediaConversionError(t('convert.ffmpegRequired'));
    return;
  }

  const input = _mediaConvertFile.path;
  const folder = parentFolderPath(input);
  const output = joinFolderPath(folder, outputName);
  const options = {
    inputPath: input,
    outputPath: output,
    mediaKind: _mediaConvertKind,
    outputFormat: format,
    videoCodec: document.getElementById('media-convert-codec').value,
    quality: Number(document.getElementById('media-convert-quality').value),
    preset: document.getElementById('media-convert-preset').value,
    resolution: document.getElementById('media-convert-resolution').value,
    audioBitrate: document.getElementById('media-convert-bitrate').value,
    sampleRate: document.getElementById('media-convert-rate').value,
    channels: document.getElementById('media-convert-channels').value,
    imageWidth: document.getElementById('media-convert-width').value,
    overwrite: document.getElementById('media-convert-overwrite').checked,
  };
  const operationId = createOperationTaskId();
  closeMediaConvertDialog();
  showProgress(t('convert.taskTitle', {name: _mediaConvertFile.name}), {
    taskId: operationId,
    indeterminate: true,
    cancellable: true,
    currentName: outputName,
    currentPath: output,
  });
  try {
    await call('convert_media', {
      options,
      configuredFfmpegPath: String(G.settings.ffmpegPath || '').trim() || null,
      operationId,
    });
    completeOperationTask(operationId, {currentName: outputName});
    await broadcastMediaConversion(folder);
    showNotice(t('convert.complete', {name: outputName}));
  } catch (error) {
    if (isOperationCancellationRequested(operationId) || String(error).toLowerCase().includes('cancelled')) {
      cancelOperationTask(operationId);
    } else {
      failOperationTask(operationId, error);
      showNotice(t('convert.failedShort'));
    }
  }
}

function setFfmpegPath(value, input) {
  G.settings.ffmpegPath = String(value || '').trim();
  if (input) input.value = G.settings.ffmpegPath;
  saveSettings();
  refreshFfmpegSettingsStatus();
}

async function refreshFfmpegSettingsStatus() {
  const status = await detectConfiguredFfmpeg('settings-ffmpeg-status');
  const input = document.getElementById('settings-ffmpeg-path');
  if (input && status?.available && !G.settings.ffmpegPath && status.source !== 'path') {
    input.placeholder = status.path || input.placeholder;
  }
  return status;
}
