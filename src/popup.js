import { START_BUTTON_DEFAULT_TEXT, DEFAULT_EXPORT_TYPE } from './ui/constants.js';
import { cacheDomElements, domRefs } from './ui/dom.js';
import {
  addLog,
  enhanceSelectInteraction,
  setStartButtonLabel,
  syncUiWithState
} from './ui/ui.js';
import {
  handleGetFileInfo,
  handlePause,
  handleReset,
  handleRetryFailed,
  handleStart,
  saveSettings
} from './ui/actions.js';
import { initSponsorInteractions } from './ui/sponsor.js';
import { initRatingModal } from './ui/rating.js';
import { initRuntimeMessaging } from './ui/messaging.js';
import { applyI18n } from './ui/i18n.js';

document.addEventListener('DOMContentLoaded', async () => {
  applyI18n();
  cacheDomElements();
  setStartButtonLabel(START_BUTTON_DEFAULT_TEXT());
  if (domRefs.exportTypeSelect) {
    domRefs.exportTypeSelect.value = DEFAULT_EXPORT_TYPE;
  }

  await restorePersistedState();
  bindEventListeners();
  enhanceSelectInteraction();
  initSponsorInteractions();
  initRatingModal();
  initRuntimeMessaging();
});

async function restorePersistedState() {
  try {
    const { exportType } = await chrome.storage.local.get(['exportType']);
    const nextExportType = exportType || DEFAULT_EXPORT_TYPE;
    if (!exportType) {
      chrome.storage.local.set({ exportType: nextExportType });
    }
    if (domRefs.exportTypeSelect) {
      domRefs.exportTypeSelect.value = nextExportType;
    }
    
    const response = await chrome.runtime.sendMessage({ action: 'getUiState' });
    if (response?.success) {
      syncUiWithState(response.data);
    }
  } catch (error) {
    addLog(chrome.i18n.getMessage('restoreStateFailed'));
  }
}

function bindEventListeners() {
  const {
    getInfoBtn,
    startBtn,
    pauseBtn,
    exportTypeSelect,
    resetBtn,
    settingsBtn,
    loginBtn,
    retryFailedBtn
  } = domRefs;

  getInfoBtn?.addEventListener('click', handleGetFileInfo);
  startBtn?.addEventListener('click', handleStart);
  pauseBtn?.addEventListener('click', handlePause);
  exportTypeSelect?.addEventListener('change', saveSettings);
  resetBtn?.addEventListener('click', handleReset);

  settingsBtn?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  loginBtn?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://mubu.com/login' });
  });

  retryFailedBtn?.addEventListener('click', handleRetryFailed);
}
