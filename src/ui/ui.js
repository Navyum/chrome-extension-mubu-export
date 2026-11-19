export { showConfetti } from './confetti.js';
import { createExportFormatSelect } from './export-format-select.js';
import { domRefs } from './dom.js';
import { uiState, updateUiState } from './state.js';
import { START_BUTTON_DEFAULT_TEXT, DEFAULT_EXPORT_TYPE } from './constants.js';
import { i18n } from './i18n.js';

const STATUS_ICONS = {
  success: '🎉',
  error: '⚠️',
  info: 'ℹ️'
};

let statusHideTimer = null;
let exportFormatControl;

export function syncUiWithState(state) {
  if (!state) return;

  const hasFileList = Array.isArray(state.fileList) && state.fileList.length > 0;
  const nextFileInfo = hasFileList
    ? {
        totalFiles: state.totalFiles,
        fileList: state.fileList,
        folderCount: state.folderCount || 0
      }
    : null;

  updateUiState({
    isExporting: Boolean(state.isExporting),
    isPaused: Boolean(state.isPaused),
    taskId: state.taskId,
    canResume: Boolean(state.canResume),
    totalFiles: state.totalFiles || 0,
    fileInfo: nextFileInfo
  });

  const {
    getInfoBtn,
    exportTypeSelect,
    fileInfoDiv,
    totalFilesSpan,
    folderCountSpan,
    startBtn,
    pauseBtn,
    progressBar,
    logContainer,
    retrySection,
    failedList,
    progressFill,
    progressText
  } = domRefs;

  if (exportTypeSelect) {
    const targetExportType = state.exportType || DEFAULT_EXPORT_TYPE;
    if (exportTypeSelect.value !== targetExportType) {
      exportTypeSelect.value = targetExportType;
    }
    updateExportTypeIcon();
  }

  if (nextFileInfo) {
    if (totalFilesSpan) totalFilesSpan.textContent = state.catalogTotalFiles ?? nextFileInfo.totalFiles;
    if (folderCountSpan) folderCountSpan.textContent = state.catalogFolderCount ?? nextFileInfo.folderCount ?? 0;
    if (fileInfoDiv) fileInfoDiv.style.display = 'block';
  } else {
    if (totalFilesSpan) totalFilesSpan.textContent = '0';
    if (folderCountSpan) folderCountSpan.textContent = '0';
    if (fileInfoDiv) fileInfoDiv.style.display = 'none';
  }

  if (getInfoBtn) getInfoBtn.disabled = uiState.isExporting;
  if (exportTypeSelect) exportTypeSelect.disabled = uiState.isExporting;
  updateExportTypeIcon();

  const summary = document.getElementById('taskSummary');
  if (summary) summary.textContent = state.hasStarted ? i18n('selectionTaskCounts', [
    String(state.totalFiles || 0), String(state.successCount || 0), String(state.failedCount || 0),
    String(state.inProgressCount || 0), String(state.pendingCount || 0)
  ]) + (state.recoveryNotice ? ` · ${state.recoveryNotice}` : '') : '';
  if (state.hasStarted && progressBar) progressBar.style.display = 'block';
  if (state.hasStarted) updateProgress(state.processedFiles || 0, state.totalFiles);

  if (uiState.isExporting) {
    if (startBtn) startBtn.style.display = 'none';
    if (pauseBtn) pauseBtn.style.display = 'inline-block';
    if (progressBar) progressBar.style.display = 'block';
    if (logContainer) logContainer.style.display = 'block';
    if (retrySection) retrySection.style.display = 'none';

    if (uiState.isPaused) {
      setButtonState(pauseBtn, i18n('resumeExport'), 'btn-continue');
    } else {
      setButtonState(pauseBtn, i18n('pauseExport'), 'btn-pause');
    }

    const exportedCount = hasFileList ? state.fileList.filter(f => f.status === 'success').length : 0;
    if (progressFill && progressText) {
      updateProgress(state.processedFiles ?? exportedCount, state.totalFiles);
    }
  } else {
    setStartButtonLabel(START_BUTTON_DEFAULT_TEXT());
    if (startBtn) {
      startBtn.style.display = 'inline-block';
      startBtn.disabled = !nextFileInfo;
    }
    if (pauseBtn) {
      pauseBtn.style.display = state.canResume ? 'inline-block' : 'none';
      if (state.canResume) setButtonState(pauseBtn, i18n('resumeExport'), 'btn-continue');
    }

    if (state.failedFiles && state.failedFiles.length > 0 && retrySection && failedList) {
      retrySection.style.display = 'block';
      failedList.innerHTML = `<strong>${i18n('failedFilesLabel')}</strong>`;
      const ul = document.createElement('ul');
      state.failedFiles.forEach(file => {
        const li = document.createElement('li');
        li.textContent = file.title;
        ul.appendChild(li);
      });
      failedList.appendChild(ul);
    } else if (retrySection) {
      retrySection.style.display = 'none';
    }

    if (!nextFileInfo && progressBar) {
      progressBar.style.display = 'none';
    }
  }

  if (state.logs && state.logs.length > 0 && logContainer) {
    logContainer.innerHTML = '';
    state.logs.forEach(log => {
      const logEntry = document.createElement('div');
      logEntry.className = 'log-entry';
      logEntry.textContent = log;
      logContainer.appendChild(logEntry);
    });
    logContainer.scrollTop = logContainer.scrollHeight;
  }
}

export function resetUiToIdle() {
  const { startBtn, pauseBtn, progressBar } = domRefs;

  updateUiState({ isExporting: false, isPaused: false });

  if (startBtn) {
    startBtn.style.display = 'inline-block';
    startBtn.disabled = !(uiState.fileInfo && uiState.fileInfo.fileList && uiState.fileInfo.fileList.length > 0);
  }
  if (pauseBtn) {
    pauseBtn.style.display = 'none';
  }
  if (progressBar) {
    progressBar.style.display = 'none';
  }
}

export function setButtonState(button, text, className) {
  if (!button) return;
  button.textContent = text;
  button.className = 'btn';
  if (className) {
    button.classList.add(className);
  }
}

export function setStartButtonLabel(text) {
  if (!text) text = START_BUTTON_DEFAULT_TEXT();
  const { startBtn } = domRefs;
  if (!startBtn) return;
  const labelSpan = startBtn.querySelector('span');
  if (labelSpan) {
    labelSpan.textContent = text;
  }
}

export function showStatus(message, type = 'info') {
  const { statusDiv } = domRefs;
  if (!statusDiv) return;

  const icon = STATUS_ICONS[type] || STATUS_ICONS.info;
  statusDiv.textContent = `${icon} ${message}`;
  statusDiv.className = `status status-toast ${type}`;
  statusDiv.style.display = 'block';

  requestAnimationFrame(() => {
    statusDiv.classList.add('is-visible');
  });

  if (statusHideTimer) {
    clearTimeout(statusHideTimer);
  }

  statusHideTimer = setTimeout(() => {
    statusDiv.classList.remove('is-visible');
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 300);
  }, 3000);
}

export function addLog(message) {
  const { logContainer } = domRefs;
  if (!logContainer) return;

  const placeholder = logContainer.querySelector('.log-placeholder');
  if (placeholder) {
    logContainer.innerHTML = '';
  }

  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';
  const content = message.startsWith('[') ? message : `[${new Date().toLocaleTimeString()}] ${message}`;
  logEntry.textContent = content;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

export function updateProgress(exported, total) {
  const { progressFill, progressText } = domRefs;
  if (!progressFill || !progressText) return;
  const percentage = total > 0 ? Math.round((exported / total) * 100) : 0;
  progressFill.style.width = `${percentage}%`;
  progressText.textContent = `${exported}/${total}`;
}

export function toggleSponsorModal(shouldShow, { focusClose = true } = {}) {
  const { sponsorModal, mainContainer, sponsorModalClose, sponsorBtn } = domRefs;
  if (!sponsorModal) return;

  if (shouldShow) {
    sponsorModal.classList.add('is-visible');
    sponsorModal.setAttribute('aria-hidden', 'false');
    sponsorModal.removeAttribute('inert');
    document.body.classList.add('modal-open');
    if (mainContainer) {
      mainContainer.setAttribute('inert', '');
    }
    if (focusClose) {
      setTimeout(() => sponsorModalClose?.focus(), 0);
    }
  } else {
    if (mainContainer) {
      mainContainer.removeAttribute('inert');
    }
    document.body.classList.remove('modal-open');
    if (sponsorBtn) {
      sponsorBtn.focus();
    } else if (mainContainer) {
      mainContainer.focus();
    }
    sponsorModal.classList.remove('is-visible');
    sponsorModal.setAttribute('aria-hidden', 'true');
    sponsorModal.setAttribute('inert', '');
    sponsorModalClose?.blur();
  }
}

export function enhanceSelectInteraction() {
  exportFormatControl ||= createExportFormatSelect(domRefs.selectContainer);
  exportFormatControl?.sync();
}

function updateExportTypeIcon() {
  exportFormatControl?.sync();
}
