import { sanitizePathComponent } from './utils.js';

export const MODEL_VERSION = 2;
export const ROOT_FOLDER_ID = '0';

export function normalizeId(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function createEmptyCatalog() {
  return {
    schemaVersion: MODEL_VERSION, revision: null, fetchedAt: null,
    folders: [], documents: [], issues: [], complete: false, needsRefresh: true
  };
}

// Missing relationships remain unknown (null), rather than being guessed from names.
export function createCatalog(rawFolders, rawDocuments, { revision, fetchedAt = null, issues = [] } = {}) {
  if (!normalizeId(revision)) throw new Error('目录缺少版本号。');
  const problems = structuredClone(issues);
  const report = (code, kind, id, incomplete = true) => problems.push({ code, kind, id, incomplete });
  const collect = (records, kind) => {
    const map = new Map();
    if (!Array.isArray(records)) {
      report('invalid-list', kind, null);
      return map;
    }
    for (const raw of records) {
      const id = normalizeId(raw?.id);
      if (!id || (kind === 'folder' && id === ROOT_FOLDER_ID)) {
        report('invalid-id', kind, id);
        continue;
      }
      const previous = map.get(id) || {};
      const record = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined));
      const oldRelation = normalizeId(previous.parentId ?? previous.folderId ?? previous.folder_id);
      const newRelation = normalizeId(raw.parentId ?? raw.folderId ?? raw.folder_id);
      if (oldRelation && newRelation && oldRelation !== newRelation) report('conflicting-relation', kind, id);
      map.set(id, { ...previous, ...record, id });
    }
    return map;
  };
  const folderRecords = collect(rawFolders, 'folder');
  const documentRecords = collect(rawDocuments, 'document');
  const readRelation = (raw, kind) => {
    const values = (kind === 'folder' ? [raw.parentId, raw.folderId, raw.folder_id] : [raw.folderId, raw.folder_id])
      .filter(value => value !== undefined && value !== null && value !== '');
    const ids = values.map(normalizeId);
    if (ids.some(id => !id)) report('invalid-relation', kind, raw.id);
    if (new Set(ids.filter(Boolean)).size > 1) report('conflicting-relation', kind, raw.id);
    return ids.find(Boolean) || null;
  };
  const folders = [...folderRecords.values()].map(raw => {
    const parentId = readRelation(raw, 'folder');
    if (!parentId) report('missing-parent', 'folder', raw.id);
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name : '未命名文件夹';
    if (name === '未命名文件夹' && !raw.name) report('missing-name', 'folder', raw.id, false);
    return { id: raw.id, parentId, name, folderPath: '', locationValid: false };
  });
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  // Iterative traversal avoids stack overflow for deeply nested folders.
  const resolved = new Set();
  for (const folder of folders) {
    const chain = [];
    const visiting = new Set();
    let cursor = folder;
    let parentPath = '';
    let valid = true;
    while (cursor && !resolved.has(cursor.id)) {
      if (visiting.has(cursor.id)) {
        report('folder-cycle', 'folder', cursor.id);
        valid = false;
        break;
      }
      visiting.add(cursor.id);
      chain.push(cursor);
      if (cursor.parentId === ROOT_FOLDER_ID) break;
      const parent = byId.get(cursor.parentId);
      if (!parent) {
        if (cursor.parentId) report('unknown-parent', 'folder', cursor.id);
        valid = false;
        break;
      }
      cursor = parent;
    }
    if (cursor && resolved.has(cursor.id)) {
      parentPath = cursor.folderPath;
      valid = cursor.locationValid;
    }
    for (const entry of chain.reverse()) {
      const name = sanitizePathComponent(entry.name) || entry.id;
      parentPath = parentPath ? `${parentPath}/${name}` : name;
      entry.folderPath = parentPath;
      entry.locationValid = valid;
      resolved.add(entry.id);
    }
  }
  const documents = [...documentRecords.values()].map(raw => {
    const folderId = readRelation(raw, 'document');
    const folder = byId.get(folderId);
    if (!folderId) report('missing-folder', 'document', raw.id);
    else if (folderId !== ROOT_FOLDER_ID && !folder) report('unknown-folder', 'document', raw.id);
    return {
      id: raw.id, folderId,
      title: typeof raw.name === 'string' && raw.name.trim() ? raw.name :
        (typeof raw.title === 'string' && raw.title.trim() ? raw.title : '未命名文档'),
      type: raw.type,
      folderPath: folder?.folderPath || '',
      locationValid: folderId === ROOT_FOLDER_ID || Boolean(folder?.locationValid)
    };
  });
  return {
    schemaVersion: MODEL_VERSION, revision: normalizeId(revision), fetchedAt,
    folders, documents, issues: problems,
    complete: !problems.some(issue => issue.incomplete !== false), needsRefresh: false
  };
}

// Synthetic UI keys are namespaced; they never replace real folder/document IDs.
export function buildCatalogTree(catalog) {
  const root = { key: 'root', kind: 'root', children: [] };
  const unresolved = { key: 'unresolved', kind: 'unresolved', children: [] };
  const folders = new Map(catalog.folders.map(folder => [folder.id, {
    key: `folder:${folder.id}`, kind: 'folder', ...folder, children: []
  }]));
  for (const folder of folders.values()) {
    const parent = folder.locationValid
      ? (folder.parentId === ROOT_FOLDER_ID ? root : folders.get(folder.parentId))
      : unresolved;
    (parent || unresolved).children.push(folder);
  }
  for (const doc of catalog.documents) {
    const parent = doc.folderId === ROOT_FOLDER_ID ? root : folders.get(doc.folderId);
    (parent || unresolved).children.push({ key: `doc:${doc.id}`, kind: 'document', ...doc });
  }
  if (unresolved.children.length) root.children.push(unresolved);
  return root;
}
