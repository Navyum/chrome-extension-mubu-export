import { domRefs } from './dom.js';
import { uiState, updateUiState } from './state.js';
import {
  addLog,
  resetUiToIdle,
  setButtonState,
  setStartButtonLabel,
  showStatus,
  syncUiWithState
} from './ui.js';
import { START_BUTTON_DEFAULT_TEXT } from './constants.js';
import { i18n } from './i18n.js';

export async function handleGetFileInfo() {
  const { getInfoBtn, logContainer } = domRefs;
  if (!getInfoBtn) return;

  getInfoBtn.disabled = true;
  getInfoBtn.textContent = i18n('gettingInfo');
  showStatus(i18n('gettingFileInfo'), 'info');
  if (logContainer) {
    logContainer.style.display = 'block';
  }
  addLog(i18n('startGettingInfo'));

  try {
    const response = await chrome.runtime.sendMessage({ action: 'getFileInfo' });
    if (response && response.success) {
      showStatus(i18n('fileInfoSuccess'), 'success');
      addLog(i18n('foundFiles', [String(response.data.totalFiles)]));
      // Preserve the user's current export type selection when fetching file info
      const currentExportType = domRefs.exportTypeSelect ? domRefs.exportTypeSelect.value : undefined;
      syncUiWithState({ ...response.data, isExporting: false, isPaused: false, exportType: currentExportType });
      setStartButtonLabel(START_BUTTON_DEFAULT_TEXT());
      restoreGetInfoButton();
    } else {
      throw new Error(response ? response.error : i18n('unknownError'));
    }
  } catch (error) {
    showStatus(i18n('getInfoFailed', [error.message]), 'error');
    addLog(i18n('errorPrefix', [error.message]));
    handleGetInfoErrorState(error);
  }
}

export async function handleStart() {
  if (!uiState.fileInfo || !uiState.fileInfo.fileList || uiState.fileInfo.fileList.length === 0) {
    showStatus(i18n('pleaseGetInfoFirst'), 'error');
    return;
  }

  const { exportTypeSelect } = domRefs;
  const exportType = exportTypeSelect ? exportTypeSelect.value : 'md';

  showStatus(i18n('startingExport'), 'info');
  addLog(i18n('startExportLog'));

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'startExport',
      data: { exportType }
    });
    if (!response?.success) {
      throw new Error(response?.error || i18n('unknownError'));
    }

    const uiStateResponse = await chrome.runtime.sendMessage({ action: 'getUiState' });
    if (uiStateResponse?.success) {
      syncUiWithState(uiStateResponse.data);
    }
  } catch (error) {
    showStatus(i18n('startExportFailed', [error.message]), 'error');
    resetUiToIdle();
  }
}

export function handlePause() {
  if (!uiState.isExporting) {
    addLog(i18n('noTaskToToggle'));
    return;
  }

  const { pauseBtn } = domRefs;
  const nextPaused = !uiState.isPaused;
  updateUiState({ isPaused: nextPaused });

  addLog(nextPaused ? i18n('exportPaused') : i18n('exportResumed'));
  setButtonState(pauseBtn, nextPaused ? i18n('resumeExport') : i18n('pauseExport'), nextPaused ? 'btn-continue' : 'btn-pause');

  chrome.runtime.sendMessage({
    action: 'togglePause',
    data: { isPaused: nextPaused }
  });
}

export async function handleReset() {
  addLog(i18n('requestingReset'));
  try {
    const response = await chrome.runtime.sendMessage({ action: 'resetExport' });
    if (response && response.success) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      window.close();
      return;
    }
    throw new Error(i18n('resetNotSuccessful'));
  } catch (error) {
    showStatus(i18n('resetFailed', [error.message]), 'error');
    addLog(i18n('resetFailed', [error.message]));
  }
}

export async function handleRetryFailed() {
  const { retryFailedBtn } = domRefs;
  if (!retryFailedBtn) return;

  retryFailedBtn.disabled = true;
  retryFailedBtn.textContent = i18n('retrying');

  try {
    const response = await chrome.runtime.sendMessage({ action: 'retryFailedFiles' });
    if (response && response.success) {
      addLog(i18n('retryingFailed'));
      const newState = await chrome.runtime.sendMessage({ action: 'getUiState' });
      if (newState?.success) {
        syncUiWithState(newState.data);
      }
    } else {
      throw new Error(response?.error || i18n('unknownError'));
    }
  } catch (error) {
    showStatus(i18n('retryFailed2', [error.message]), 'error');
    addLog(i18n('retryFailed2', [error.message]));
  } finally {
    retryFailedBtn.disabled = false;
    retryFailedBtn.textContent = i18n('retryFailedFiles');
  }
}

export function saveSettings() {
  const { exportTypeSelect } = domRefs;
  if (!exportTypeSelect) return;
  chrome.storage.local.set({
    exportType: exportTypeSelect.value
  });
}

function restoreGetInfoButton() {
  const { getInfoBtn } = domRefs;
  if (!getInfoBtn) return;
  getInfoBtn.textContent = i18n('getFileInfo');
  getInfoBtn.disabled = false;
  getInfoBtn.onclick = null;
  getInfoBtn.removeAttribute('data-login');
}

function handleGetInfoErrorState(error) {
  const { getInfoBtn } = domRefs;
  if (!getInfoBtn) return;

  if (error.message.includes('幕布') || error.message.includes('登录') || error.message.includes('Jwt-Token') || error.message.includes('login')) {
    getInfoBtn.textContent = i18n('clickToLoginMubu');
    getInfoBtn.disabled = false;
    getInfoBtn.onclick = () => {
      window.open('https://mubu.com/login', '_blank');
    };
    getInfoBtn.setAttribute('data-login', 'true');
  } else {
    restoreGetInfoButton();
  }
}

