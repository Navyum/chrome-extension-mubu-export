import { MODEL_VERSION, normalizeId } from './catalog.js';
import { EXPORT_FORMATS } from './constants.js';

export function createInitialTask() {
  return {
    schemaVersion: MODEL_VERSION, taskId: null, scope: 'all', catalogRevision: null,
    isExporting: false, isPaused: false, totalFiles: 0, folderCount: 0,
    currentFileIndex: 0, fileList: [], exportType: 'md', subfolder: '', logs: []
  };
}

// Only data preparation: no IO, token reads, runner, or download side effects.
export function buildExportTask(catalog, {
  taskId, scope = 'all', catalogRevision = catalog.revision,
  selectedDocumentIds = [], exportType = 'md', subfolder = ''
} = {}) {
  if (!normalizeId(taskId)) throw new Error('任务缺少 ID。');
  if (scope !== 'all' && scope !== 'selected') throw new Error('未知导出范围。');
  if (!Object.hasOwn(EXPORT_FORMATS, exportType)) throw new Error('不支持的导出格式。');
  if (catalogRevision !== catalog.revision) throw new Error('目录版本已变化，请刷新后重试。');
  if (catalog.needsRefresh || !catalog.revision) throw new Error('请重新获取文件信息。');
  if (scope === 'selected' && !catalog.complete) throw new Error('目录存在未确认的数据，不能创建选择性导出任务。');
  if (!Array.isArray(selectedDocumentIds) && !(selectedDocumentIds instanceof Set)) {
    throw new Error('选择范围必须是文档 ID 集合。');
  }
  const known = new Set(catalog.documents.map(doc => doc.id));
  const selected = new Set([...selectedDocumentIds].map(normalizeId));
  if (scope === 'selected' && [...selected].some(id => !id || !known.has(id))) {
    throw new Error('选择范围包含不存在的文档。');
  }
  const seen = new Set();
  const documents = catalog.documents.filter(doc => {
    if (seen.has(doc.id) || (scope === 'selected' && !selected.has(doc.id))) return false;
    seen.add(doc.id);
    return true;
  });
  if (!documents.length) throw new Error('没有可导出的文档。');
  return {
    ...createInitialTask(), taskId: normalizeId(taskId), scope,
    catalogRevision: catalog.revision, exportType, subfolder,
    totalFiles: documents.length, folderCount: catalog.folders.length,
    fileList: structuredClone(documents).map(doc => ({ ...doc, status: 'pending', localPath: '' }))
  };
}
