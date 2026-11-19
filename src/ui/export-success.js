import { applyI18n, i18n } from './i18n.js';
import { REVIEW_URL } from './constants.js';
import { showConfetti } from './confetti.js';

// Estimate hands-on repetition avoided, not measured export/download speed.
// Include single-document exports in the same per-document estimate.
export function estimateManualTimeSaved(count) {
  if (!Number.isSafeInteger(count) || count < 1) return null;
  const seconds = count * 15;
  if (seconds < 60) return { value: seconds, unit: 'successSavedSeconds' };
  if (seconds < 3600) return { value: Math.floor(seconds / 60), unit: 'successSavedMinutes' };
  return { value: Math.floor(seconds / 360) / 10, unit: 'successSavedHours' };
}

export function initExportSuccess() {
  const dialog = document.getElementById('export-success');
  applyI18n(dialog);
  const reviewHint = document.getElementById('export-success-review-hint');
  const dismissButton = document.getElementById('export-success-dismiss');
  const error = document.getElementById('export-success-error');
  let generation = 0;

  function setReviewDismissed(dismissed) {
    // The passive review link stays available even when invitations are dismissed.
    reviewHint.hidden = dismissed;
    dismissButton.hidden = dismissed;
  }

  dialog.querySelectorAll('[data-success-close]').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    generation++;
    // Keep the five-second celebration running when the confirmation is closed early.
    const confetti = dialog.querySelector('.confetti-container');
    if (confetti) document.body.appendChild(confetti);
    // The export button may have been disabled when the dialog opened.
    const start = document.querySelector('#select-export.active #start');
    if (start && !start.disabled) start.focus({ preventScroll: true });
  });
  window.addEventListener('hashchange', () => { if (dialog.open) dialog.close(); });

  async function dismissReview() {
    await chrome.storage.local.set({ ratingDismissed: true });
    setReviewDismissed(true);
    document.getElementById('export-success-done').focus();
  }
  dismissButton.addEventListener('click', async () => {
    try { await dismissReview(); }
    catch { error.textContent = i18n('successPreferenceFailed'); }
  });
  document.getElementById('export-success-rate').addEventListener('click', async () => {
    try {
      await chrome.tabs.create({ url: REVIEW_URL });
      // Opening the review page is enough to stop asking; no review is submitted here.
      await dismissReview();
    } catch { error.textContent = i18n('successReviewFailed'); }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.ratingDismissed?.newValue) {
      const restoreFocus = document.activeElement === dismissButton;
      setReviewDismissed(true);
      if (dialog.open && restoreFocus) document.getElementById('export-success-done').focus();
    }
  });

  return async function showExportSuccess(task) {
    const current = ++generation;
    setReviewDismissed(true);
    error.textContent = '';
    document.getElementById('export-success-summary').textContent = i18n('successExportCount', [String(task.successCount)]);
    const estimate = estimateManualTimeSaved(task.successCount);
    document.getElementById('export-success-savings').hidden = !estimate;
    document.getElementById('export-success-saved-time').textContent = estimate
      ? i18n(estimate.unit, [String(estimate.value)]) : '';
    if (!dialog.open) dialog.showModal();
    showConfetti({ count: 140, host: dialog });
    try {
      const { ratingDismissed } = await chrome.storage.local.get(['ratingDismissed']);
      if (current === generation && dialog.open) setReviewDismissed(Boolean(ratingDismissed));
    } catch {
      // A preferences read failure must not interfere with the success confirmation.
    }
  };
}
