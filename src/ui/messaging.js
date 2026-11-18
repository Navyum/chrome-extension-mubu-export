import { START_BUTTON_DONE_TEXT } from './constants.js';
import { uiState, updateUiState } from './state.js';
import {
  addLog,
  resetUiToIdle,
  setStartButtonLabel,
  showStatus,
  showConfetti,
  syncUiWithState,
  updateProgress
} from './ui.js';
import { showRatingModalAfterExport } from './rating.js';
import { i18n } from './i18n.js';

let listenerRegistered = false;

export function initRuntimeMessaging() {
  if (listenerRegistered) return;
  listenerRegistered = true;

  chrome.runtime.onMessage.addListener(message => {
    switch (message.action) {
      case 'exportProgress': {
        if (message.data.taskId !== uiState.taskId) break;
        const { exportedFiles, processedFiles, totalFiles } = message.data;
        updateUiState({ totalFiles });
        updateProgress(processedFiles ?? exportedFiles, totalFiles);
        const summary = document.getElementById('taskSummary');
        if (summary) summary.textContent = i18n('selectionTaskCounts', [String(totalFiles),
          String(message.data.successCount), String(message.data.failedCount),
          String(message.data.inProgressCount), String(message.data.pendingCount)]);
        break;
      }
      case 'exportComplete': {
        addLog(i18n('exportCompleteLog'));
        setStartButtonLabel(START_BUTTON_DONE_TEXT());
        updateUiState({ isExporting: false });
        chrome.runtime.sendMessage({ action: 'getUiState' }).then(response => {
          if (response?.success) {
            syncUiWithState(response.data);
            if (response.data.failedCount) showStatus(i18n('selectionHasFailures'), 'error');
            else if (!response.data.isExporting && !response.data.pendingCount) {
              showStatus(i18n('exportCompleteStatus'), 'success');
              showConfetti();
              showRatingModalAfterExport();
            }
          }
        });
        break;
      }
      case 'exportError': {
        const error = message.data.error;
        addLog(i18n('exportErrorLog', [error]));
        showStatus(i18n('exportErrorStatus', [error]), 'error');
        resetUiToIdle();
        break;
      }
      case 'exportLog': {
        addLog(message.data.message);
        break;
      }
      case 'taskStateChanged': {
        syncUiWithState(message.data);
        break;
      }
      default:
        break;
    }
  });
}

