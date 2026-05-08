import { MUBU_API } from './constants.js';
import { getAbortSignal } from './task-controller.js';
import { sanitizePathComponent } from './utils.js';

export async function fetchAllDocuments(jwtToken) {
  const folders = new Map();
  const documents = new Map();

  await fetchDocumentsPageData(jwtToken, folders, documents);
  await fetchFolderList(jwtToken, folders);
  await fetchRecursiveListData(jwtToken, folders, documents);

  const folderPathMap = buildFolderPathMap(folders);
  const files = buildFlatDocumentList(folders, documents, folderPathMap);

  return { files, folderCount: folders.size };
}

export async function fetchDocumentDefinition(docId, jwtToken) {
  const data = await requestMubuJson(MUBU_API.DOC_DETAIL, jwtToken, {
    docId,
    password: '',
    isFromDocDir: true
  });

  const definitionString = data?.definition || '{"nodes": []}';
  try {
    return JSON.parse(definitionString);
  } catch (error) {
    return { nodes: [] };
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

  const result = await response.json();
  if (typeof result.code !== 'undefined' && result.code !== 0) {
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

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error('PDF 导出返回空数据');
  }
  return blob;
}

async function fetchDocumentsPageData(jwtToken, folderMap, docMap) {
  let start = '';
  let guard = 0;

  while (true) {
    guard += 1;
    if (guard > 50) {
      break;
    }

    const data = await requestMubuJson(MUBU_API.LIST, jwtToken, { start });
    mergeFolders(folderMap, data.folders);
    mergeDocuments(docMap, data.documents);

    const nextStart = data.nextStart ?? data.next_start ?? data.next ?? '';
    if (!nextStart || nextStart === start) {
      break;
    }
    start = nextStart;
  }
}

async function fetchFolderList(jwtToken, folderMap) {
  const data = await requestMubuJson(MUBU_API.LIST_GET_FOLDER, jwtToken, {});
  mergeFolders(folderMap, Array.isArray(data) ? data : []);
}

async function fetchRecursiveListData(jwtToken, folderMap, docMap) {
  const pendingFolderIds = ['0'];
  const visitedFolderIds = new Set();

  while (pendingFolderIds.length) {
    const folderId = pendingFolderIds.shift();
    if (visitedFolderIds.has(folderId)) {
      continue;
    }
    visitedFolderIds.add(folderId);

    const payload = folderId === '0' ? {} : { folderId };
    const data = await requestMubuJson(MUBU_API.LIST_GET, jwtToken, payload);
    const folders = Array.isArray(data.folders) ? data.folders : [];

    mergeFolders(folderMap, folders);
    mergeDocuments(docMap, data.documents);

    folders.forEach(folder => {
      if (folder?.id && !visitedFolderIds.has(folder.id)) {
        pendingFolderIds.push(folder.id);
      }
    });
  }
}

function mergeFolders(folderMap, folders) {
  (Array.isArray(folders) ? folders : []).forEach(folder => {
    if (folder?.id) {
      folderMap.set(folder.id, folder);
    }
  });
}

function mergeDocuments(docMap, documents) {
  (Array.isArray(documents) ? documents : []).forEach(doc => {
    if (doc?.id) {
      docMap.set(doc.id, doc);
    }
  });
}

function buildFolderPathMap(folderMap) {
  const pathMap = new Map();

  const buildPath = (folderId, visiting = new Set()) => {
    if (!folderId || folderId === '0') {
      return '';
    }
    if (pathMap.has(folderId)) {
      return pathMap.get(folderId);
    }
    if (visiting.has(folderId)) {
      return '';
    }

    const folder = folderMap.get(folderId);
    if (!folder) {
      return '';
    }

    visiting.add(folderId);

    const parentId = getFolderParentId(folder);
    const parentPath = buildPath(parentId, visiting);
    const folderName = sanitizePathComponent(folder.name || '未命名文件夹') || folder.id;
    const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;

    visiting.delete(folderId);
    pathMap.set(folderId, folderPath);
    return folderPath;
  };

  for (const folderId of folderMap.keys()) {
    buildPath(folderId);
  }

  return pathMap;
}

function buildFlatDocumentList(folderMap, docMap, folderPathMap) {
  const files = [];

  for (const doc of docMap.values()) {
    const folderId = getDocumentFolderId(doc);
    const folderPath = folderId && folderMap.has(folderId)
      ? folderPathMap.get(folderId) || ''
      : '';

    files.push({
      id: doc.id,
      title: doc.name || '未命名文档',
      type: doc.type,
      folderPath,
      localPath: ''
    });
  }

  return files;
}

function getDocumentFolderId(doc) {
  return doc?.folderId ?? doc?.folder_id ?? '';
}

function getFolderParentId(folder) {
  return folder?.folderId ?? folder?.folder_id ?? '';
}
