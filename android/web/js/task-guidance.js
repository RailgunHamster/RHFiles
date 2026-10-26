(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.fileTaskGuidance=value;})(globalThis,()=>{
  // Advice is presentation, never a retry or an authorization change.
  function forTask(job){
    if(!job||!['failed','interrupted','canceled'].includes(job.state))return null;
    const message=[job.message,...(job.failures||[]).slice(0,20).map(f=>f.message)].filter(Boolean).join('\n').slice(0,16000);
    if(/HTTP\s*[:：]?\s*403\b|permission.denied|未.*授予.*权限|权限不足|拒绝访问/i.test(message))return {code:'permission',title:'访问权限不足',steps:['在被访问的设备检查此设备组的写入、重命名权限；删除需要单独开启永久删除权限。','修改权限后重新选择当前文件发起新操作，不重放本条旧请求。']};
    if(/HTTP\s*[:：]?\s*401\b|会话.*失效|授权.*撤销|认证失败/i.test(message))return {code:'authorization',title:'连接授权已失效',steps:['先在设备组确认双方仍是有效成员，再重新连接。','若设备曾被移除，需要在被访问的设备上手动恢复或重新批准加入；换地址不能绕过授权。']};
    if(/ENOSPC|no space left|disk.*full|空间不足|存储.*已满/i.test(message))return {code:'space',title:'目标存储空间不足',steps:['检查目标设备和目标目录所在磁盘的剩余空间。','清理后先核对已发布的输出，再重新选择当前文件发起新操作。']};
    if(/HTTP\s*[:：]?\s*416\b/i.test(message))return {code:'range',title:'服务器拒绝了文件读取范围（HTTP 416）',steps:['先核对目标位置已有的副本，不要反复重做整个移动任务。','保留本条错误和设备组连接诊断；若升级后仍复现，请提交诊断以检查文件大小变化或读取范围处理。']};
    if(/timed?.?out|timeout|unreachable|connection|网络|超时|无法连接|不可达|断开/i.test(message))return {code:'connection',title:'连接未完成或中断',steps:['确认目标设备在线、RHFiles 文件服务正在运行；使用移动网络时确认 Tailscale 已连接。','查看“设备组 → 连接诊断”，确认本次尝试及失败原因。','重新执行移动、删除等写入前先核对目标，结果不明的操作不会自动重放。']};
    if(job.state==='interrupted')return {code:'interrupted',title:'上次运行中断',steps:['先检查来源及目标中已经发布的输出；应用不会自动重做删除或移动。','需要继续时重新选择当前文件发起新操作，本条记录仅保留历史结果。']};
    if(job.state==='canceled')return {code:'canceled',title:'任务已取消',steps:['已完成的输出会保留；需要继续时先核对输出，再重新选择当前文件。']};
    return {code:'unknown',title:'需要核对具体错误',steps:['查看本条记录中的失败原因和输出位置；先核对已有输出，再决定是否重新操作。','可将具体错误及设备组连接诊断反馈给开发者；无需先重启、清数据或重装。']};
  }
  return {forTask};
});
