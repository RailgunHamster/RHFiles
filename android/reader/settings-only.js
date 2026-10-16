import {syncReaderSettings} from './settings-sync.js';
syncReaderSettings(true).catch(error=>{document.getElementById('sync-status').textContent='阅读配置整理失败：'+error.message;window.RHFilesReader?.postMessage(JSON.stringify({action:'settingsFailed',message:error.message}));});
