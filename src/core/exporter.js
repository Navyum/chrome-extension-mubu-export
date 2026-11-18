import {
  exportState, catalog, selectionDraft, resetExportState, saveState,
  replaceCatalog, replaceExportTask, setSelectionDraft
} from './state.js';
import { buildExportTask, createInitialTask } from './task-builder.js';
import { normalizeId } from './catalog.js';
import { summarizeTask } from './task-summary.js';
import { sendLog, sendProgress, sendComplete, sendError, sendMessageToPopup } from './messaging.js';
import { fetchAllDocuments, fetchDocumentDefinition, fetchRemoteExportBlob, getJwtTokenOrThrow } from './mubu.js';
import { buildExportPayload } from './formatters.js';
import { saveContentToDisk, saveBlobToDisk } from './downloads.js';
import { delay } from './utils.js';
import { refreshAbortController, abortActiveTasks } from './task-controller.js';
import { DEFAULT_DOWNLOAD_SUBFOLDER, REMOTE_EXPORT_FORMATS, EXPORT_FORMATS } from './constants.js';

let activeRun = null;
const actions = new Set([
  'getFileInfo', 'getCatalog', 'getSelectionDraft', 'saveSelectionDraft',
  'startExport', 'togglePause', 'resumeExport', 'getUiState', 'retryFailedFiles', 'resetExport'
]);

export function getUiState() {
  return structuredClone({
    ...exportState, ...summarizeTask(exportState),
    catalogTotalFiles: catalog.documents.length, catalogFolderCount: catalog.folders.length,
    failedFiles: exportState.fileList.filter(file => file.status === 'failed'),
    canResume: Boolean(exportState.hasStarted && exportState.fileList.some(file => file.status === 'pending'))
  });
}

function notifyState() {
  sendMessageToPopup({ action: 'taskStateChanged', data: getUiState() });
}

// Serialize commands, not the long-running export loop. Every message waits for
// bootstrap, while pause/reset remain available during document requests.
export function registerRuntimeHandlers(ready = Promise.resolve()) {
  let commands = Promise.resolve();
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!actions.has(message?.action)) return false;
    const command = commands.then(() => ready).then(() => handleMessage(message));
    commands = command.catch(() => {});
    command.then(data => sendResponse({ success: true, data }),
      error => sendResponse({ success: false, error: error.message }));
    return true;
  });
}

// A previous in-flight download cannot yet be verified (milestone 3). Keep it
// failed, with an explicit warning, and wait for the user before any more work.
export async function maybeResumeExport() {
  exportState.hasStarted ??= Boolean(exportState.isExporting || exportState.isPaused ||
    exportState.fileList.some(file => file.status !== 'pending'));
  let interrupted = false;
  for (const file of exportState.fileList) {
    if (file.status === 'in_progress') {
      file.status = 'failed';
      file.error = '上次处理被中断，下载结果待确认。重试可能生成同名副本。';
      interrupted = true;
    }
  }
  if (exportState.isExporting || exportState.isPaused || interrupted) {
    exportState.hasStarted = true;
    exportState.currentFileIndex = 0;
    exportState.isExporting = exportState.fileList.some(file => file.status === 'pending');
    exportState.isPaused = exportState.isExporting;
    exportState.recoveryNotice = interrupted
      ? '上次处理中断，部分下载结果待确认。请先检查下载目录，再继续或重试失败项；重试可能生成副本。'
      : '已恢复原任务，请点击继续。任务范围、格式和输出目录保持不变。';
    sendLog(exportState.recoveryNotice);
    await saveState();
  }
}

function requireIdle() {
  if (exportState.isExporting || activeRun) throw new Error('当前任务正在运行或暂停，请先完成或重置，不能覆盖任务。');
}

function validateSelection(data) {
  if (!data || data.catalogRevision !== catalog.revision || !catalog.revision) {
    throw new Error('目录版本已变化，请重新读取目录。');
  }
  if (!Array.isArray(data.selectedDocumentIds)) throw new Error('选择范围必须是文档 ID 数组。');
  const known = new Set(catalog.documents.map(doc => doc.id));
  if (data.selectedDocumentIds.some(id => !normalizeId(id) || !known.has(normalizeId(id)))) {
    throw new Error('选择范围包含不存在的文档。');
  }
}

async function handleMessage({ action, data }) {
  switch (action) {
    case 'getUiState': return getUiState();
    case 'getCatalog': return structuredClone(catalog);
    case 'getSelectionDraft': return structuredClone(selectionDraft);
    case 'saveSelectionDraft': {
      validateSelection(data);
      const previous = structuredClone(selectionDraft);
      setSelectionDraft(data.selectedDocumentIds);
      try { await saveState(); }
      catch (error) {
        setSelectionDraft(previous.selectedDocumentIds);
        // A runner may have queued a snapshot while this write was pending.
        await saveState().catch(() => {});
        throw error;
      }
      return structuredClone(selectionDraft);
    }
    case 'getFileInfo': {
      requireIdle();
      refreshAbortController();
      const token = await getJwtTokenOrThrow();
      const result = await fetchAllDocuments(token);
      if (!result.files.length) throw new Error('未获取到任何文档，请确认账号下是否存在内容。');
      const previousCatalog = structuredClone(catalog);
      const previousDraft = structuredClone(selectionDraft);
      const previousTask = structuredClone(exportState);
      replaceCatalog(result.catalog);
      if (!exportState.fileList.length) {
        replaceExportTask(buildExportTask(catalog, { taskId: crypto.randomUUID() }));
      }
      try { await saveState(); }
      catch (error) {
        replaceCatalog(previousCatalog);
        setSelectionDraft(previousDraft.selectedDocumentIds);
        replaceExportTask(previousTask);
        throw error;
      }
      sendLog(`成功获取 ${result.files.length} 个文档，${result.folderCount} 个文件夹。`);
      if (!catalog.complete) sendLog('目录含未确认字段或异常关系，请重新扫描；旧全量导出仍可使用。');
      notifyState();
      return getUiState();
    }
    case 'startExport': {
      requireIdle();
      const scope = data?.scope ?? 'all';
      const exportType = data?.exportType ?? 'md';
      if (!Object.hasOwn(EXPORT_FORMATS, exportType)) throw new Error('不支持的导出格式。');
      if (scope === 'selected') validateSelection(data);
      // Build from trusted catalog, never from UI titles, paths or queue objects.
      let next;
      const settings = await chrome.storage.local.get(['subfolder']);
      const subfolder = typeof settings.subfolder === 'string' && settings.subfolder.trim()
        ? settings.subfolder.trim() : DEFAULT_DOWNLOAD_SUBFOLDER;
      if (scope === 'all' && catalog.needsRefresh && exportState.fileList.length) {
        // Legacy installations can still export their trusted saved list before a rescan.
        next = { ...createInitialTask(), taskId: crypto.randomUUID(), exportType, subfolder,
          folderCount: exportState.folderCount,
          fileList: exportState.fileList.map(file => ({
            id: file.id, title: file.title, type: file.type, folderId: file.folderId,
            folderPath: file.folderPath, status: 'pending', localPath: ''
          })) };
        next.totalFiles = next.fileList.length;
      } else {
        next = buildExportTask(catalog, {
          taskId: crypto.randomUUID(), scope, exportType, subfolder,
          catalogRevision: data?.catalogRevision ?? catalog.revision,
          selectedDocumentIds: data?.selectedDocumentIds ?? []
        });
      }
      await getJwtTokenOrThrow();
      next.hasStarted = true;
      next.isExporting = true;
      await commitTask(next);
      launchRunner();
      notifyState();
      return getUiState();
    }
    case 'togglePause': {
      if (!(data?.isPaused ?? false)) return resumeTask();
      if (!exportState.isExporting) throw new Error('没有正在进行的任务。');
      exportState.isPaused = true;
      await saveState();
      notifyState();
      return getUiState();
    }
    case 'resumeExport': return resumeTask();
    case 'retryFailedFiles': {
      requireIdle();
      const failed = exportState.fileList.filter(file => file.status === 'failed');
      if (!failed.length) throw new Error('没有失败的文件需要重试。');
      await getJwtTokenOrThrow();
      const next = structuredClone(exportState);
      next.runDocumentIds = failed.map(file => file.id);
      next.fileList.forEach(file => {
        if (file.status === 'failed') { file.status = 'pending'; delete file.error; }
      });
      next.isExporting = true;
      next.isPaused = false;
      next.hasStarted = true;
      next.currentFileIndex = 0;
      await commitTask(next);
      launchRunner();
      notifyState();
      return getUiState();
    }
    case 'resetExport': {
      activeRun = null; // Invalidate callbacks before aborting their requests.
      abortActiveTasks();
      resetExportState();
      await saveState();
      notifyState();
      return getUiState();
    }
  }
}

async function commitTask(next) {
  const previous = structuredClone(exportState);
  replaceExportTask(next);
  try { await saveState(); }
  catch (error) { replaceExportTask(previous); throw error; }
}

async function resumeTask() {
  if (!exportState.taskId || !exportState.hasStarted) throw new Error('没有可继续的原任务。');
  if (!exportState.isExporting && !exportState.fileList.some(file => file.status === 'pending')) {
    throw new Error('原任务没有待处理文档，请使用失败重试或新建导出。');
  }
  await getJwtTokenOrThrow();
  const previous = { isExporting: exportState.isExporting, isPaused: exportState.isPaused,
    currentFileIndex: exportState.currentFileIndex };
  exportState.isExporting = true;
  exportState.isPaused = false;
  exportState.currentFileIndex = 0;
  try { await saveState(); }
  catch (error) {
    if (exportState.isExporting) Object.assign(exportState, previous);
    throw error;
  }
  launchRunner();
  notifyState();
  return getUiState();
}

function launchRunner() {
  if (activeRun || !exportState.isExporting || exportState.isPaused) return;
  refreshAbortController();
  const run = { taskId: exportState.taskId };
  activeRun = run;
  // The run token also isolates two attempts of the same task (retry/resume).
  void exportFiles(run);
}

async function exportFiles(run) {
  const isActive = () => activeRun === run && exportState.taskId === run.taskId;
  const files = exportState.fileList;
  const exportType = exportState.exportType;
  const context = { subfolder: exportState.subfolder, isActive };
  const allowed = exportState.runDocumentIds ? new Set(exportState.runDocumentIds) : null;
  try {
    const token = await getJwtTokenOrThrow();
    if (!isActive()) return;
    for (let i = 0; i < files.length; i++) {
      if (!isActive() || exportState.isPaused) return;
      const file = files[i];
      if (file.status !== 'pending' || (allowed && !allowed.has(file.id))) continue;
      exportState.currentFileIndex = i;
      file.status = 'in_progress';
      file.startTime = Date.now();
      file.exportUrl = `mubu://${file.id}`;
      file.downloadUrl = '';
      await saveState();
      if (!isActive()) return;
      sendProgress();
      // Pause takes effect after the current document, including its retry.
      for (let attempt = 0; attempt <= 1; attempt++) {
        try {
          if (attempt) await delay(2000);
          if (!isActive()) return;
          file.retryCount = attempt;
          const definition = await fetchDocumentDefinition(file.id, token);
          if (!isActive()) return;
          let path;
          if (REMOTE_EXPORT_FORMATS.has(exportType)) {
            const blob = await fetchRemoteExportBlob(definition, exportType, token, { title: file.title });
            if (!isActive()) return;
            path = await saveBlobToDisk(blob, file, EXPORT_FORMATS[exportType].extension, context);
          } else {
            path = await saveContentToDisk(buildExportPayload(definition, exportType, file), file, context);
          }
          if (!isActive()) return;
          file.status = 'success'; // Existing download-creation semantics; completion is milestone 3.
          file.localPath = path;
          delete file.error;
          break;
        } catch (error) {
          if (!isActive()) return;
          if (attempt === 1 || error.name === 'AbortError') {
            file.status = 'failed';
            file.error = error.message;
            break;
          }
        }
      }
      if (!isActive()) return;
      file.endTime = Date.now();
      file.duration = file.endTime - file.startTime;
      await saveState();
      if (!isActive()) return;
      sendProgress();
      await delay(1200 + Math.random() * 800);
    }
    if (!isActive()) return;
    exportState.isExporting = false;
    exportState.isPaused = false;
    delete exportState.runDocumentIds;
    if (!files.some(file => file.status === 'failed')) delete exportState.recoveryNotice;
    await saveState();
    if (!isActive()) return;
    sendComplete();
    notifyState();
  } catch (error) {
    if (!isActive()) return;
    // Do not leave an ambiguous in_progress item looking successful.
    for (const file of files) if (file.status === 'in_progress') {
      file.status = 'failed';
      file.error = '处理状态待确认，请检查下载目录后再重试。';
    }
    exportState.isExporting = false;
    exportState.isPaused = false;
    try { await saveState(); } catch { /* Keep memory conservative if storage is unavailable. */ }
    if (isActive()) { sendError(error.message); notifyState(); }
  } finally {
    if (activeRun === run) activeRun = null;
  }
}
