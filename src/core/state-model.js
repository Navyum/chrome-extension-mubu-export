import { createEmptyCatalog, MODEL_VERSION, normalizeId } from './catalog.js';
import { createSelectionDraft } from './selection.js';
import { createInitialTask } from './task-builder.js';

function normalizeTask(raw = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('任务状态损坏。');
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== MODEL_VERSION) throw new Error('不支持的任务版本。');
  const task = { ...createInitialTask(), ...structuredClone(raw), schemaVersion: MODEL_VERSION };
  if (!Array.isArray(task.fileList) || !Array.isArray(task.logs)) throw new Error('任务列表或日志损坏。');
  const seen = new Set();
  for (const file of task.fileList) {
    const id = normalizeId(file?.id);
    if (!id || seen.has(id)) throw new Error('历史任务含缺失或重复文档 ID，请重新获取文件信息。');
    seen.add(id);
    file.id = id;
    file.status = file.status || 'pending';
    if (!['pending', 'in_progress', 'success', 'failed'].includes(file.status)) throw new Error('任务文档状态损坏。');
  }
  task.totalFiles = task.fileList.length;
  if (!Number.isInteger(task.currentFileIndex) || task.currentFileIndex < 0) task.currentFileIndex = 0;
  task.currentFileIndex = Math.min(task.currentFileIndex, task.totalFiles);
  return task;
}

// Pure migration: no missing folder identities are invented. In-progress/paused
// statuses are preserved; execution recovery belongs to milestone 3.
export function migrateStoredState(stored = {}) {
  if (stored.stateVersion !== undefined && stored.stateVersion !== MODEL_VERSION) {
    throw new Error(`不支持的状态版本：${stored.stateVersion}`);
  }
  if (stored.stateVersion === MODEL_VERSION) {
    const catalog = structuredClone(stored.catalog);
    if (!catalog || catalog.schemaVersion !== MODEL_VERSION ||
        !Array.isArray(catalog.folders) || !Array.isArray(catalog.documents)) {
      throw new Error('目录缓存损坏，请重新获取文件信息。');
    }
    for (const records of [catalog.folders, catalog.documents]) {
      const ids = records.map(record => normalizeId(record?.id));
      if (ids.some(id => !id) || new Set(ids).size !== ids.length ||
          records.some((record, index) => record.id !== ids[index])) {
        throw new Error('目录缓存 ID 损坏，请重新获取文件信息。');
      }
    }
    if (!stored.exportTask) throw new Error('任务缓存缺失。');
    const draft = stored.selectionDraft;
    const selectionDraft = createSelectionDraft(catalog,
      draft?.catalogRevision === catalog.revision && Array.isArray(draft.selectedDocumentIds)
        ? draft.selectedDocumentIds : []);
    return { stateVersion: MODEL_VERSION, catalog, selectionDraft,
      exportTask: normalizeTask(stored.exportTask), migrated: false };
  }

  // An explicit empty task wins over stale fileInfo left behind by the old reset.
  let legacy = stored.exportState !== undefined ? stored.exportState : (stored.fileInfo || {});
  // Old releases also supported tasks whose list lived only in fileInfo. An active
  // flag is evidence of such a task; an inactive explicit [] remains a reset.
  if (legacy?.isExporting === true && Array.isArray(legacy.fileList) && !legacy.fileList.length &&
      Array.isArray(stored.fileInfo?.fileList) && stored.fileInfo.fileList.length) {
    legacy = { ...legacy, fileList: stored.fileInfo.fileList,
      folderCount: stored.fileInfo.folderCount ?? legacy.folderCount };
  }
  const exportTask = normalizeTask(legacy);
  exportTask.scope = 'all';
  exportTask.catalogRevision = null;
  exportTask.taskId = exportTask.fileList.length ? 'legacy-task' : null;
  const catalog = createEmptyCatalog();
  catalog.documents = exportTask.fileList.map(file => ({
    id: file.id, folderId: normalizeId(file.folderId ?? file.folder_id),
    title: file.title || '未命名文档', type: file.type,
    folderPath: file.folderPath || '', locationValid: false
  }));
  if (catalog.documents.length) catalog.issues.push({ code: 'legacy-catalog-needs-refresh', incomplete: true });
  return { stateVersion: MODEL_VERSION, catalog,
    selectionDraft: createSelectionDraft(catalog), exportTask,
    migrated: stored.exportState !== undefined || stored.fileInfo !== undefined };
}
