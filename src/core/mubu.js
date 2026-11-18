import { MUBU_API } from './constants.js';
import { getAbortSignal } from './task-controller.js';
import { createCatalog, normalizeId } from './catalog.js';

export async function fetchAllDocuments(jwtToken) {
  const folders = new Map();
  const documents = new Map();
  const issues = [];

  await fetchDocumentsPageData(jwtToken, folders, documents, issues);
  await fetchFolderList(jwtToken, folders, issues);
  await fetchRecursiveListData(jwtToken, folders, documents, issues);

  const catalog = createCatalog([...folders.values()], [...documents.values()], {
    revision: crypto.randomUUID(), fetchedAt: Date.now(), issues
  });
  const files = catalog.documents.map(doc => ({ ...doc, localPath: '' }));

  // Preserve the existing API; consumers can opt into the complete catalog.
  return { files, folderCount: catalog.folders.length, catalog };
}

export async function fetchDocumentDefinition(docId, jwtToken) {
  const data = await requestMubuJson(MUBU_API.DOC_DETAIL, jwtToken, {
    docId,
    password: '',
    isFromDocDir: true
  });

  if (!isRecord(data) || !Object.hasOwn(data, 'definition') || data.definition === undefined) {
    throw new Error('[DEFINITION_MISSING] 文档详情缺少 definition 字段，请重试。');
  }
  let definition = data.definition;
  if (typeof definition === 'string') {
    try {
      definition = JSON.parse(definition);
    } catch {
      // Native JSON errors may include excerpts of the document. Never propagate them.
      throw new Error('[DEFINITION_JSON] 文档 definition 不是有效 JSON，请重试。');
    }
  }
  validateDefinition(definition);
  return definition;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateDefinition(definition) {
  if (!isRecord(definition) || !Array.isArray(definition.nodes)) {
    throw new Error('[DEFINITION_STRUCTURE] 文档 definition 必须包含 nodes 数组。');
  }
  // Only validate the tree contract shared by all current formats. Blank/image-only
  // nodes, optional null children and unknown rich-content metadata remain intact.
  // Iteration avoids adding another recursive depth limit before conversion.
  const pending = [definition.nodes];
  const seen = new WeakSet();
  while (pending.length) {
    for (const node of pending.pop()) {
      if (!isRecord(node) || seen.has(node)) {
        throw new Error('[DEFINITION_NODE] 文档包含无效节点或循环引用。');
      }
      seen.add(node);
      if (node.children != null) {
        if (!Array.isArray(node.children)) {
          throw new Error('[DEFINITION_CHILDREN] 文档节点的 children 必须为数组或空值。');
        }
        pending.push(node.children);
      }
    }
  }
}

export async function getJwtTokenOrThrow() {
  const cookie = await chrome.cookies.get({
    url: MUBU_API.HOME_PAGE,
    name: 'Jwt-Token'
  });
  const token = (cookie && cookie.value ? cookie.value.trim() : '');
  if (!token) {
    throw new Error(`未检测到 Jwt-Token，请先在 ${MUBU_API.HOME_PAGE} 登录账号后重试。`);
  }
  return token;
}

async function requestMubuJson(url, jwtToken, payload) {
  const response = await makeMubuRequest(url, jwtToken, payload);
  if (!response.ok) {
    throw new Error(`接口请求失败: HTTP ${response.status}`);
  }

  const documentDetail = url === MUBU_API.DOC_DETAIL;
  let result;
  try {
    result = await response.json();
  } catch (error) {
    if (!documentDetail || error.name === 'AbortError') throw error;
    throw new Error('[DOCUMENT_RESPONSE_JSON] 文档详情响应不是有效 JSON，请重试。');
  }
  if (documentDetail && !isRecord(result)) {
    throw new Error('[DOCUMENT_RESPONSE_STRUCTURE] 文档详情响应结构无效，请重试。');
  }
  if (typeof result.code !== 'undefined' && result.code !== 0) {
    if (documentDetail) {
      // API-provided message strings are untrusted and may contain private data.
      throw new Error('[DOCUMENT_RESPONSE_ERROR] 文档详情接口返回失败状态，请检查登录状态或稍后重试。');
    }
    const msg = result.msg || result.message || `接口返回 code=${result.code}`;
    throw new Error(msg);
  }

  return result.data || {};
}

function makeMubuRequest(url, jwtToken, payload = {}) {
  const headers = {
    'Content-Type': 'application/json;charset=UTF-8',
    'Origin': MUBU_API.HOME_PAGE,
    'Referer': MUBU_API.HOME_PAGE,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'jwt-token': jwtToken
  };

  return fetch(url, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers,
    credentials: 'include',
    signal: getAbortSignal()
  });
}

export async function fetchRemoteExportBlob(definition, exportType, jwtToken, fileMeta = {}) {
  const payload = {
    type: exportType,
    definition: JSON.stringify(definition),
    showMask: true,
    title: fileMeta.title || '未命名文档'
  };

  const response = await fetch(MUBU_API.CONVERT_EXPORT, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Origin': MUBU_API.HOME_PAGE,
      'Referer': `${MUBU_API.HOME_PAGE}/app/edit/home`,
      'osversion': '147.0.0.0',
      'platform': 'web',
      'pragma': 'no-cache',
      'jwt-token': jwtToken
    },
    credentials: 'include',
    signal: getAbortSignal()
  });

  if (!response.ok) {
    throw new Error(`PDF 导出接口失败: HTTP ${response.status}`);
  }

  const contentType = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (contentType.startsWith('text/') || contentType === 'application/json' ||
      contentType.endsWith('+json') || contentType === 'application/xhtml+xml') {
    throw new Error('[PDF_CONTENT_TYPE] PDF 导出接口返回文本或错误响应，未创建下载。');
  }
  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error('[PDF_EMPTY] PDF 导出返回空数据，未创建下载。');
  }
  // Bounded Web API reads work in an MV3 service worker. Keep the original Blob;
  // do not decode/copy the entire file just to validate it before downloading.
  const header = String.fromCharCode(...new Uint8Array(await blob.slice(0, 9).arrayBuffer()));
  if (!/^%PDF-\d\.\d[\r\n]/.test(header)) {
    throw new Error('[PDF_HEADER] PDF 导出结果缺少有效文件头，未创建下载。');
  }
  const tail = String.fromCharCode(...new Uint8Array(await blob.slice(-1024).arrayBuffer()));
  if (!/(?:^|[\r\n])%%EOF[\x00\t\n\f\r ]*$/.test(tail)) {
    throw new Error('[PDF_EOF] PDF 导出结果缺少尾部结束标记，可能已截断，未创建下载。');
  }
  // Header/EOF checks are a format sanity check, not an object/xref/page validator.
  return blob;
}

async function fetchDocumentsPageData(jwtToken, folderMap, docMap, issues) {
  let start = '';
  let guard = 0;
  const cursors = new Set();

  while (true) {
    guard += 1;
    if (guard > 50) {
      issues.push({ code: 'page-limit', incomplete: true });
      break;
    }

    const data = await requestMubuJson(MUBU_API.LIST, jwtToken, { start });
    mergeRecords(folderMap, data.folders, 'folder', issues);
    mergeRecords(docMap, data.documents, 'document', issues);

    const nextStart = data.nextStart ?? data.next_start ?? data.next ?? '';
    if (!nextStart) break;
    if (nextStart === start || cursors.has(nextStart)) {
      issues.push({ code: 'repeated-cursor', incomplete: true });
      break;
    }
    cursors.add(nextStart);
    start = nextStart;
  }
}

async function fetchFolderList(jwtToken, folderMap, issues) {
  const data = await requestMubuJson(MUBU_API.LIST_GET_FOLDER, jwtToken, {});
  mergeRecords(folderMap, Array.isArray(data) ? data : data.folders, 'folder', issues);
}

async function fetchRecursiveListData(jwtToken, folderMap, docMap, issues) {
  const pendingFolderIds = ['0', ...folderMap.keys()];
  const queuedFolderIds = new Set(pendingFolderIds);
  const visitedFolderIds = new Set();

  for (let index = 0; index < pendingFolderIds.length; index++) {
    const folderId = pendingFolderIds[index];
    if (visitedFolderIds.has(folderId)) {
      continue;
    }
    visitedFolderIds.add(folderId);

    const payload = folderId === '0' ? {} : { folderId };
    const data = await requestMubuJson(MUBU_API.LIST_GET, jwtToken, payload);
    mergeRecords(folderMap, data.folders, 'folder', issues, folderId);
    mergeRecords(docMap, data.documents, 'document', issues, folderId);

    for (const id of folderMap.keys()) {
      if (!queuedFolderIds.has(id)) {
        queuedFolderIds.add(id);
        pendingFolderIds.push(id);
      }
    }
  }
}

function mergeRecords(map, records, kind, issues, containerId) {
  if (!Array.isArray(records)) {
    issues.push({ code: 'missing-or-invalid-list', kind, incomplete: true });
    return;
  }
  for (const raw of records) {
    const id = normalizeId(raw?.id);
    if (!id || (kind === 'folder' && id === '0')) {
      issues.push({ code: 'invalid-id', kind, id, incomplete: true });
      continue;
    }
    const record = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined));
    const values = [raw.folderId, raw.folder_id].filter(value => value !== undefined && value !== null && value !== '');
    const relations = values.map(normalizeId);
    if (relations.some(id => !id)) issues.push({ code: 'invalid-relation', kind, id, incomplete: true });
    if (new Set(relations.filter(Boolean)).size > 1) issues.push({ code: 'conflicting-relation', kind, id, incomplete: true });
    const relation = relations.find(Boolean);
    const previous = map.get(id);
    const previousRelation = normalizeId(previous?.folderId ?? previous?.folder_id);
    const observedRelation = relation || containerId;
    if (previousRelation && observedRelation && previousRelation !== observedRelation) {
      issues.push({ code: 'relationship-changed-during-scan', kind, id, incomplete: true });
    }
    // The containing list is evidence only when the endpoint is list/get.
    // A missing field in global pagination is NOT proof of root membership.
    if (!relation && containerId !== undefined) record.folderId = containerId;
    else if (relation) record.folderId = relation;
    map.set(id, { ...map.get(id), ...record, id });
  }
}
