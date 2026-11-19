import { createExportFormatSelect } from './ui/export-format-select.js';
import { selectAll, clearSelection } from './core/selection.js';
import { createSelectionTree } from './ui/selection-tree.js';
import { applyI18n, i18n as t } from './ui/i18n.js';
import { initExportSuccess } from './ui/export-success.js';

export async function initSelectExport(root) {
  const showExportSuccess = initExportSuccess();
  const byId = id => root.querySelector(`#${id}`);
  let formatControl;
  let catalog;
  let selected = new Set();
  let tree;
  let task = {};
  let busy = false;
  let saveQueue = Promise.resolve();
  let saveGeneration = 0;
  let draftError = false;

  async function request(action, data) {
    const result = await chrome.runtime.sendMessage({ action, data });
    if (!result?.success) throw new Error(result?.error || t('unknownError'));
    return result.data;
  }
  function showError(text = '') {
    byId('task-error').textContent = text;
    byId('task-error').hidden = !text;
  }
  function renderControls() {
    const usable = catalog && !catalog.needsRefresh && catalog.complete;
    byId('counts').textContent = t('selectionCounts', [String(catalog?.documents.length || 0), String(selected.size)]);
    byId('start').disabled = busy || draftError || !usable || !selected.size || task.isExporting;
    byId('refresh').disabled = busy || task.isExporting;
    byId('select-all').disabled = busy || !usable;
    byId('clear').disabled = busy || !usable;
    byId('format').disabled = busy || task.isExporting;
    formatControl?.sync();
    tree?.setDisabled(busy || !usable);
  }
  function renderTask(next) {
    // Celebrate only a live task's successful finish, never restored history.
    const justSucceeded = task.taskId && task.taskId === next.taskId && task.isExporting &&
      next.hasStarted && !next.isExporting && !next.isPaused && next.totalFiles > 0 &&
      next.successCount === next.totalFiles && !next.failedCount && !next.pendingCount && !next.inProgressCount;
    task = next;
    if (justSucceeded && root.classList.contains('active')) void showExportSuccess(next);
    if (next.isExporting) byId('format').value = next.exportType;
    const total = next.totalFiles || 0;
    byId('task-state').textContent = t(!next.hasStarted ? 'selectionNoTask' :
      next.isPaused ? 'selectionPaused' : next.isExporting ? 'selectionRunning' :
        next.pendingCount ? 'selectionInterrupted' : next.failedCount ? 'selectionHasFailures' : 'selectionFinished');
    byId('task-config').textContent = next.hasStarted
      ? t('selectionTaskConfig', [next.scope === 'selected' ? t('selectionScopeSelected') : t('selectionScopeAll'), next.exportType, next.subfolder || '']) : '';
    byId('progress').max = total || 1;
    byId('progress').value = next.processedFiles || 0;
    byId('task-counts').textContent = t('selectionTaskCounts', [String(total), String(next.successCount || 0),
      String(next.failedCount || 0), String(next.inProgressCount || 0), String(next.pendingCount || 0)]);
    byId('pause').hidden = !next.isExporting || next.isPaused;
    byId('resume').hidden = !(next.isPaused || (!next.isExporting && next.canResume));
    byId('retry').hidden = next.isExporting || !next.failedCount;
    for (const id of ['pause', 'resume', 'retry']) byId(id).disabled = busy;
    byId('recovery').textContent = next.recoveryNotice || '';
    byId('recovery').hidden = !next.recoveryNotice;
    renderControls();
  }
  function persistSelection(ids) {
    selected = new Set(ids);
    tree?.setSelection(selected);
    const generation = ++saveGeneration;
    const payload = { catalogRevision: catalog.revision, selectedDocumentIds: [...selected] };
    draftError = false;
    byId('selection-save-error').hidden = true;
    // Send each click immediately; the backend serializes writes. Closing the page
    // must not strand the latest selection behind an unsent client-side queue.
    const write = request('saveSelectionDraft', payload);
    saveQueue = Promise.all([saveQueue.catch(() => {}), write]).catch(() => {
      if (generation === saveGeneration) {
        draftError = true;
        byId('selection-save-error').textContent = t('selectionSaveFailed');
        byId('selection-save-error').hidden = false;
        renderControls();
      }
    });
    renderControls();
  }
  async function loadCatalog() {
    await saveQueue;
    const [nextCatalog, draft] = await Promise.all([request('getCatalog'), request('getSelectionDraft')]);
    catalog = nextCatalog;
    selected = new Set(draft.catalogRevision === catalog.revision ? draft.selectedDocumentIds : []);
    const warning = catalog.needsRefresh ? t('selectionNeedsScan') : !catalog.complete
      ? t('selectionIncomplete', [String(catalog.issues.length)]) : '';
    byId('catalog-warning').textContent = warning;
    byId('catalog-warning').hidden = !warning;
    tree = createSelectionTree(byId('tree'), catalog, {
      selectedIds: selected, disabled: busy || !catalog.complete || catalog.needsRefresh,
      onChange: persistSelection, labels: {
        more: t('selectionMore'), unresolved: t('selectionUnresolved'), expand: t('selectionExpand'),
        documentCount: count => t('selectionFolderDocuments', [String(count)])
      }
    });
    renderControls();
  }
  async function perform(operation) {
    if (busy) return;
    busy = true;
    showError();
    renderTask(task);
    try { await operation(); }
    catch (error) { showError(error.message); }
    finally {
      busy = false;
      try { renderTask(await request('getUiState')); } catch (error) { showError(error.message); }
    }
  }

  applyI18n(root);
  formatControl = createExportFormatSelect(root.querySelector('.select-container'));
  byId('select-all').addEventListener('click', () => persistSelection(selectAll(catalog)));
  byId('clear').addEventListener('click', () => persistSelection(clearSelection()));
  byId('refresh').addEventListener('click', () => perform(async () => {
    await saveQueue;
    await request('getFileInfo');
    await loadCatalog();
  }));
  byId('start').addEventListener('click', () => perform(async () => {
    await saveQueue;
    if (draftError) throw new Error(t('selectionSaveFailed'));
    await request('startExport', { scope: 'selected', exportType: byId('format').value,
      selectedDocumentIds: [...selected], catalogRevision: catalog.revision });
  }));
  byId('pause').addEventListener('click', () => perform(() => request('togglePause', { isPaused: true })));
  byId('resume').addEventListener('click', () => perform(() => request('resumeExport')));
  byId('retry').addEventListener('click', () => perform(() => request('retryFailedFiles')));
  byId('format').addEventListener('change', () => {
    showError();
    void chrome.storage.local.set({ exportType: byId('format').value }).catch(error => showError(error.message));
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message.action === 'taskStateChanged') renderTask(message.data);
    if (message.action === 'exportProgress' && message.data.taskId === task.taskId) renderTask({ ...task, ...message.data });
    if (message.action === 'exportError') showError(message.data.error);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.catalog && changes.catalog.newValue?.revision !== catalog?.revision) {
      void loadCatalog().catch(error => showError(error.message));
    } else if (changes.selectionDraft && !busy) {
      // Own writes are already reflected locally; only apply other-window updates
      // once our queued selection writes have settled.
      const generation = saveGeneration;
      void saveQueue.then(async () => {
        const draft = await request('getSelectionDraft');
        if (generation === saveGeneration && draft?.catalogRevision === catalog?.revision) {
          selected = new Set(draft.selectedDocumentIds);
          tree?.setSelection(selected);
          renderControls();
        }
      }).catch(error => showError(error.message));
    }
  });
  await perform(async () => {
    const settings = await chrome.storage.local.get(['exportType']);
    if (settings.exportType) byId('format').value = settings.exportType;
    await loadCatalog();
  });
}
