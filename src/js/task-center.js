// task-center.js — concurrent, task-scoped file-operation progress

const _operationTasks = new Map();
let _operationTaskSequence = 0;
let _legacyProgressTaskId = null;
let _updateProgressTaskId = null;
let _operationCenterCollapsed = localStorage.getItem('rhfiles-operation-center-collapsed') === '1';

function createOperationTaskId() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  _operationTaskSequence += 1;
  return 'rhfiles-' + Date.now() + '-' + _operationTaskSequence;
}

function formatOperationDuration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  if (value < 60) return t('tasks.seconds', {count: value});
  if (value < 3600) return t('tasks.minutes', {count: Math.ceil(value / 60)});
  const hours = Math.floor(value / 3600);
  const minutes = Math.ceil((value % 3600) / 60);
  return minutes ? t('tasks.hoursMinutes', {hours, minutes}) : t('tasks.hours', {count: hours});
}

function operationStatusText(task) {
  if (task.status === 'complete') return t('tasks.complete');
  if (task.status === 'failed') return t('tasks.failed');
  if (task.status === 'warning') return t('tasks.attention');
  if (task.status === 'cancelled') return t('tasks.cancelled');
  if (task.cancelRequested) return t('tasks.cancelling');
  if (task.backendStatus === 'calculating') return t('tasks.calculating');
  if (task.backendStatus === 'preparing') return t('tasks.preparing');
  if (task.backendStatus === 'cleaning') return t('tasks.finishing');
  return '';
}

function renderOperationCenter() {
  const center = document.getElementById('operation-center');
  const list = document.getElementById('operation-task-list');
  if (!center || !list) return;
  const tasks = Array.from(_operationTasks.values())
    .sort(function(left, right) { return right.createdAt - left.createdAt; });
  center.hidden = tasks.length === 0;
  center.classList.toggle('collapsed', _operationCenterCollapsed);
  const toggle = document.getElementById('operation-center-toggle');
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(!_operationCenterCollapsed));
    toggle.title = _operationCenterCollapsed ? t('tasks.expand') : t('tasks.collapse');
  }
  const activeCount = tasks.filter(function(task) { return task.status === 'running'; }).length;
  const failedCount = tasks.filter(function(task) {
    return task.status === 'failed' || task.status === 'warning';
  }).length;
  const finishedCount = tasks.length - activeCount;
  const summaryParts = [];
  if (activeCount) summaryParts.push(t('tasks.activeCount', {count: activeCount}));
  if (failedCount) summaryParts.push(t('tasks.failedCount', {count: failedCount}));
  if (!activeCount && !failedCount && finishedCount) {
    summaryParts.push(t('tasks.finishedCount', {count: finishedCount}));
  }
  const summary = document.getElementById('operation-center-summary');
  if (summary) summary.textContent = summaryParts.join(' · ') || t('tasks.noActive');
  const clear = document.getElementById('operation-center-clear');
  if (clear) clear.hidden = finishedCount === 0;

  const fragment = document.createDocumentFragment();
  tasks.forEach(function(task) {
    const card = document.createElement('article');
    card.className = 'operation-task ' + task.status;
    card.dataset.taskId = task.id;

    const heading = document.createElement('div');
    heading.className = 'operation-task-row';
    const state = document.createElement('span');
    state.className = 'operation-task-state';
    state.setAttribute('aria-hidden', 'true');
    const title = document.createElement('span');
    title.className = 'operation-task-title';
    title.textContent = task.title;
    title.title = task.title;
    const percent = document.createElement('span');
    percent.className = 'operation-task-percent';
    const isIndeterminate = task.status === 'running' && task.indeterminate;
    percent.textContent = isIndeterminate
      ? '…'
      : Math.max(0, Math.min(100, Math.round(task.percentage || 0))) + '%';
    heading.append(state, title, percent);
    if (task.status !== 'running') {
      const dismiss = document.createElement('button');
      dismiss.className = 'operation-task-dismiss';
      dismiss.type = 'button';
      dismiss.title = t('tasks.dismiss');
      dismiss.setAttribute('aria-label', dismiss.title);
      dismiss.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8m0-8-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
      dismiss.addEventListener('click', function() { dismissOperationTask(task.id); });
      heading.appendChild(dismiss);
    }
    card.appendChild(heading);

    const statusText = operationStatusText(task);
    const current = document.createElement('div');
    current.className = 'operation-task-current';
    current.textContent = task.currentName || statusText || t('tasks.waiting');
    current.title = task.currentPath || current.textContent;
    card.appendChild(current);

    const countParts = [];
    if (task.totalItems > 1) {
      countParts.push(t('tasks.itemCount', {
        current: Math.min(task.currentIndex || 1, task.totalItems),
        total: task.totalItems,
      }));
    }
    if (task.totalEntries > 0) {
      countParts.push(t('tasks.entryCount', {
        completed: Math.min(task.entriesCompleted || 0, task.totalEntries),
        total: task.totalEntries,
      }));
    } else if (task.backendStatus === 'calculating' && task.entriesCompleted > 0) {
      countParts.push(t('tasks.scannedCount', {count: task.entriesCompleted}));
    }
    if (statusText && task.currentName) countParts.push(statusText);
    if (countParts.length) {
      const counts = document.createElement('div');
      counts.className = 'operation-task-counts';
      counts.textContent = countParts.join(' · ');
      card.appendChild(counts);
    }

    const barContainer = document.createElement('div');
    barContainer.className = 'progress-bar-container';
    const bar = document.createElement('div');
    bar.className = 'progress-bar' + (isIndeterminate ? ' indeterminate' : '');
    bar.style.width = Math.max(0, Math.min(100, task.percentage || 0)) + '%';
    barContainer.appendChild(bar);
    card.appendChild(barContainer);

    const stats = document.createElement('div');
    stats.className = 'operation-task-stats';
    const bytes = document.createElement('span');
    bytes.textContent = task.totalBytes > 0
      ? fmtSize(task.bytesTransferred || 0) + ' / ' + fmtSize(task.totalBytes)
      : task.backendStatus === 'calculating' && task.bytesTransferred > 0
        ? t('tasks.scannedSize', {size: fmtSize(task.bytesTransferred)})
        : '';
    const speed = document.createElement('span');
    speed.textContent = task.speed > 0 ? fmtSize(task.speed) + '/s' : '';
    const eta = document.createElement('span');
    eta.textContent = task.etaSeconds > 0 && task.status === 'running'
      ? t('tasks.remaining', {time: formatOperationDuration(task.etaSeconds)})
      : '';
    stats.append(bytes, speed, eta);
    card.appendChild(stats);

    if (task.error) {
      const error = document.createElement('div');
      error.className = 'operation-task-error';
      error.textContent = task.error;
      card.appendChild(error);
    }
    if (task.status === 'running' && task.cancellable) {
      const actions = document.createElement('div');
      actions.className = 'operation-task-actions';
      const cancelButton = document.createElement('button');
      cancelButton.className = 'dialog-btn operation-task-cancel';
      cancelButton.type = 'button';
      cancelButton.textContent = task.cancelRequested ? t('tasks.cancelling') : t('btn.cancel');
      cancelButton.disabled = !!task.cancelRequested;
      cancelButton.addEventListener('click', function() { cancelOperation(task.id); });
      actions.appendChild(cancelButton);
      card.appendChild(actions);
    }
    fragment.appendChild(card);
  });
  list.replaceChildren(fragment);
}

function toggleOperationCenter(forceExpanded) {
  _operationCenterCollapsed = typeof forceExpanded === 'boolean'
    ? !forceExpanded
    : !_operationCenterCollapsed;
  localStorage.setItem(
    'rhfiles-operation-center-collapsed',
    _operationCenterCollapsed ? '1' : '0'
  );
  renderOperationCenter();
}

function dismissOperationTask(taskId) {
  const task = _operationTasks.get(taskId);
  if (!task || task.status === 'running') return;
  _operationTasks.delete(taskId);
  if (_legacyProgressTaskId === taskId) _legacyProgressTaskId = null;
  renderOperationCenter();
}

function clearFinishedOperationTasks() {
  _operationTasks.forEach(function(task, taskId) {
    if (task.status !== 'running') _operationTasks.delete(taskId);
  });
  if (_legacyProgressTaskId && !_operationTasks.has(_legacyProgressTaskId)) {
    _legacyProgressTaskId = null;
  }
  renderOperationCenter();
}

function setupProgressListener() {
  if (!window.__TAURI_INTERNALS__) return;
  const listen = (window.__TAURI_INTERNALS__.event || {}).listen;
  if (!listen) return;
  listen('op-progress', function(event) {
    if (event.payload) updateProgress(event.payload);
  });
  listen('update-progress', function(event) {
    if (!event.payload) return;
    updateProgress({
      percentage: Math.max(0, Math.min(100, Number(event.payload.percentage) || 0)),
      speed: 0,
      totalBytes: 0,
      bytesTransferred: 0,
    }, _updateProgressTaskId);
  });
}

function showProgress(title, options) {
  options = options || {};
  const taskId = options.taskId || createOperationTaskId();
  const existing = _operationTasks.get(taskId);
  const totalItems = Math.max(1, Number(options.totalItems) || (existing && existing.totalItems) || 1);
  const currentIndex = Math.max(1, Number(options.currentIndex) || (existing && existing.currentIndex) || 1);
  const basePercentage = totalItems > 1 ? ((currentIndex - 1) / totalItems) * 100 : 0;
  const task = {
    id: taskId,
    title: title,
    status: 'running',
    backendStatus: options.indeterminate ? 'preparing' : 'progress',
    indeterminate: !!options.indeterminate,
    cancellable: options.cancellable !== false,
    cancelRequested: existing ? !!existing.cancelRequested : false,
    percentage: options.keepProgress && existing ? existing.percentage : basePercentage,
    currentName: options.currentName || (existing && existing.currentName) || '',
    currentPath: options.currentPath || (existing && existing.currentPath) || '',
    currentIndex: currentIndex,
    totalItems: totalItems,
    aggregateProgress: !!options.aggregateProgress,
    bytesTransferred: 0,
    totalBytes: 0,
    entriesCompleted: 0,
    totalEntries: 0,
    speed: 0,
    etaSeconds: 0,
    error: '',
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now(),
  };
  _operationTasks.set(taskId, task);
  _legacyProgressTaskId = taskId;
  renderOperationCenter();
  return taskId;
}

function isOperationCancellationRequested(taskId) {
  const task = _operationTasks.get(taskId);
  return !!task && (task.cancelRequested || task.status === 'cancelled');
}

function updateProgress(data, explicitTaskId) {
  data = data || {};
  const taskId = data.operationId || explicitTaskId || _legacyProgressTaskId;
  if (!taskId) return;
  const task = _operationTasks.get(taskId);
  // App-wide events reach every RHFiles window; only the originating window
  // has a matching task card.
  if (!task) return;
  const sourcePercentage = Math.max(0, Math.min(100, Number(data.percentage) || 0));
  if (Number(data.batchTotal) > 0) task.totalItems = Number(data.batchTotal);
  if (Number(data.batchIndex) > 0) task.currentIndex = Number(data.batchIndex);
  task.percentage = task.totalItems > 1 && !task.aggregateProgress
    ? Math.min(100, ((task.currentIndex - 1) + sourcePercentage / 100) / task.totalItems * 100)
    : sourcePercentage;
  task.backendStatus = data.status || 'progress';
  task.indeterminate = (task.backendStatus === 'calculating' || task.backendStatus === 'preparing')
    && !(Number(data.totalBytes) > 0 || Number(data.totalEntries) > 0);
  if (task.backendStatus === 'cleaning') task.indeterminate = false;
  if (data.currentName) task.currentName = String(data.currentName);
  if (data.currentPath) task.currentPath = String(data.currentPath);
  task.bytesTransferred = Math.max(0, Number(data.bytesTransferred) || 0);
  task.totalBytes = Math.max(0, Number(data.totalBytes) || 0);
  task.entriesCompleted = Math.max(0, Number(data.entriesCompleted) || 0);
  task.totalEntries = Math.max(0, Number(data.totalEntries) || 0);
  task.speed = Math.max(0, Number(data.speed) || 0);
  task.etaSeconds = task.speed > 0 && task.totalBytes > task.bytesTransferred
    ? (task.totalBytes - task.bytesTransferred) / task.speed
    : 0;
  task.updatedAt = Date.now();
  if (task.backendStatus === 'cancelled') task.status = 'cancelled';
  renderOperationCenter();
}

function completeOperationTask(taskId, options) {
  options = options || {};
  const task = _operationTasks.get(taskId);
  if (!task) return;
  task.status = options.status || 'complete';
  task.backendStatus = task.status;
  task.indeterminate = false;
  task.cancellable = false;
  task.cancelRequested = false;
  if (task.status === 'complete') task.percentage = 100;
  if (options.currentName !== undefined) task.currentName = options.currentName;
  task.error = options.error ? String(options.error) : '';
  task.updatedAt = Date.now();
  renderOperationCenter();
}

function failOperationTask(taskId, errors) {
  const values = (Array.isArray(errors) ? errors : [errors]).filter(function(value) {
    return value !== undefined && value !== null && String(value);
  });
  completeOperationTask(taskId, {
    status: 'failed',
    error: values.map(String).join('\n'),
  });
}

function cancelOperationTask(taskId, detail) {
  completeOperationTask(taskId, {status: 'cancelled', error: detail || ''});
}

function hideProgress(taskId, options) {
  const resolvedId = taskId || _legacyProgressTaskId;
  options = options || {};
  if (!resolvedId) return;
  if (options.error) failOperationTask(resolvedId, options.error);
  else if (options.cancelled) cancelOperationTask(resolvedId, options.detail);
  else completeOperationTask(resolvedId, options);
}

async function cancelOperation(taskId) {
  const resolvedId = taskId || _legacyProgressTaskId;
  const task = resolvedId ? _operationTasks.get(resolvedId) : null;
  if (!task || task.status !== 'running' || task.cancelRequested) return;
  task.cancelRequested = true;
  task.backendStatus = 'cancelling';
  renderOperationCenter();
  try {
    await call('cancel_operation', {operationId: resolvedId});
  } catch (error) {
    failOperationTask(resolvedId, error);
  }
}

async function loadInterruptedOperationReports() {
  let reports = [];
  try {
    reports = await call('recover_interrupted_operations', {});
  } catch (error) {
    return;
  }
  (Array.isArray(reports) ? reports : []).forEach(function(report) {
    let operation = t('status.deleting');
    if (report.operation === 'move') operation = t('status.moving');
    else if (report.operation === 'copy') operation = t('status.copying');
    else if (report.operation === 'deletePermanent') operation = t('status.deletingPermanently');
    const taskId = 'recovered-' + (report.operationId || createOperationTaskId());
    const outcomeKey = 'tasks.recovery.' + report.outcome;
    const localized = t(outcomeKey, {
      source: displayPath(report.source || ''),
      destination: displayPath(report.destination || ''),
      completed: report.completedItems || 0,
      total: report.totalItems || 0,
    });
    const detail = localized === outcomeKey ? String(report.detail || '') : localized;
    _operationTasks.set(taskId, {
      id: taskId,
      title: t('tasks.interruptedTitle', {operation: operation.replace(/\.{3}$/, '')}),
      status: report.outcome === 'recoveryFailed' ? 'failed' : 'warning',
      backendStatus: 'warning',
      indeterminate: false,
      cancellable: false,
      cancelRequested: false,
      percentage: report.outcome === 'partialRemoved' ? 0 : 100,
      currentName: report.source
        ? String(report.source).split(/[\\/]/).pop()
        : t('tasks.recovered'),
      currentPath: report.source || report.destination || '',
      currentIndex: 1,
      totalItems: 1,
      aggregateProgress: true,
      bytesTransferred: 0,
      totalBytes: 0,
      entriesCompleted: 0,
      totalEntries: 0,
      speed: 0,
      etaSeconds: 0,
      error: detail,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  if (reports.length) {
    _operationCenterCollapsed = false;
    renderOperationCenter();
  }
}
