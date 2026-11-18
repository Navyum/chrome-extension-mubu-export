import { exportState } from './state.js';
import { summarizeTask } from './task-summary.js';

export function sendProgress() {
  sendMessageToPopup({
    action: 'exportProgress',
    data: {
      ...summarizeTask(exportState), taskId: exportState.taskId,
      isExporting: exportState.isExporting, isPaused: exportState.isPaused
    }
  });
}

export function sendComplete() {
  sendMessageToPopup({ action: 'exportComplete' });
}

export function sendError(error) {
  sendMessageToPopup({
    action: 'exportError',
    data: { error }
  });
}

export function sendLog(message) {
  const timestampedMessage = `[${new Date().toLocaleTimeString()}] ${message}`;
  exportState.logs.push(timestampedMessage);
  if (exportState.logs.length > 200) {
    exportState.logs.shift();
  }
  sendMessageToPopup({
    action: 'exportLog',
    data: { message: timestampedMessage }
  });
}

export async function sendMessageToPopup(payload) {
  try {
    await chrome.runtime.sendMessage(payload);
  } catch (error) {
    if (!error?.message?.includes('Receiving end does not exist')) {
      console.warn('向 popup 发送消息失败:', error);
    }
  }
}

