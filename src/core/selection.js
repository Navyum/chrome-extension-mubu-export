import { normalizeId, ROOT_FOLDER_ID } from './catalog.js';

// Sets are returned afresh. Callers' selections and catalog records are never mutated.
export function normalizeSelection(catalog, selectedIds = []) {
  const known = new Set(catalog.documents.map(doc => doc.id));
  return new Set([...selectedIds].map(normalizeId).filter(id => known.has(id)));
}

export function selectAll(catalog) {
  return new Set(catalog.documents.map(doc => doc.id));
}

export function clearSelection() {
  return new Set();
}

export function getFolderDocumentIds(catalog, folderId = ROOT_FOLDER_ID) {
  const id = normalizeId(folderId);
  if (id === ROOT_FOLDER_ID) return selectAll(catalog);
  if (!catalog.folders.some(folder => folder.id === id)) throw new Error('文件夹不存在。');
  const children = new Map();
  for (const folder of catalog.folders) {
    if (!children.has(folder.parentId)) children.set(folder.parentId, []);
    children.get(folder.parentId).push(folder.id);
  }
  const descendants = new Set();
  const pending = [id];
  while (pending.length) {
    const current = pending.pop();
    if (descendants.has(current)) continue;
    descendants.add(current);
    pending.push(...(children.get(current) || []));
  }
  return new Set(catalog.documents.filter(doc => descendants.has(doc.folderId)).map(doc => doc.id));
}

export function setDocumentSelected(catalog, selectedIds, documentId, checked) {
  const id = normalizeId(documentId);
  if (!catalog.documents.some(doc => doc.id === id)) throw new Error('文档不存在。');
  const next = normalizeSelection(catalog, selectedIds);
  if (checked) next.add(id);
  else next.delete(id);
  return next;
}

export function setFolderSelected(catalog, selectedIds, folderId, checked) {
  const next = normalizeSelection(catalog, selectedIds);
  for (const id of getFolderDocumentIds(catalog, folderId)) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function getFolderSelectionState(catalog, selectedIds, folderId = ROOT_FOLDER_ID) {
  const documents = getFolderDocumentIds(catalog, folderId);
  const selected = normalizeSelection(catalog, selectedIds);
  let selectedCount = 0;
  for (const id of documents) if (selected.has(id)) selectedCount++;
  return {
    totalCount: documents.size, selectedCount,
    checked: documents.size > 0 && selectedCount === documents.size,
    indeterminate: selectedCount > 0 && selectedCount < documents.size,
    disabled: documents.size === 0
  };
}

export function createSelectionDraft(catalog, selectedIds = []) {
  return { schemaVersion: 2, catalogRevision: catalog.revision,
    selectedDocumentIds: [...normalizeSelection(catalog, selectedIds)] };
}
