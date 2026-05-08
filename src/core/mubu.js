import { MUBU_API } from './constants.js';
import { getAbortSignal } from './task-controller.js';
import { sanitizePathComponent } from './utils.js';

export async function fetchAllDocuments(jwtToken) {
  const folders = new Map();
  const documents = new Map();
  let start = '';
  let guard = 0;

  while (true) {
    guard += 1;
    if (guard > 50) {
      break;
    }

    const data = await requestMubuJson(MUBU_API.LIST, jwtToken, { start });

    (Array.isArray(data.folders) ? data.folders : []).forEach(folder => {
      folders.set(folder.id, folder);
    });

    (Array.isArray(data.documents) ? data.documents : []).forEach(doc => {
      documents.set(doc.id, doc);
    });

    const hasMore = data.hasMore ?? data.has_more ?? false;
    const nextStart = data.nextStart ?? data.next_start ?? data.next ?? '';
    if (!hasMore || !nextStart || nextStart === start) {
      break;
    }
    start = nextStart;
  }

  // 构建文件夹路径映射（通过 folderId 建立父子关系）
  const folderPathMap = buildFolderPathMap(folders);

  // 直接遍历所有文档，根据 folderId 构建路径（不依赖 rootRelation）
  const { files, folderCount } = buildFlatDocumentList(folders, documents, folderPathMap);

  return { files, folderCount };
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

/**
 * 构建文件夹 ID 到路径的映射
 * 直接从 folders 数组的 folderId 字段建立父子关系，递归构建完整路径
 * @param {Map} folderMap - 文件夹 ID 到文件夹对象的映射
 * @returns {Map} 文件夹 ID 到路径的映射
 */
function buildFolderPathMap(folderMap) {
  const pathMap = new Map();

  // 递归构建文件夹路径
  const buildPath = (folderId) => {
    // 已经有路径了，直接返回
    if (pathMap.has(folderId)) {
      return pathMap.get(folderId);
    }

    const folder = folderMap.get(folderId);
    if (!folder) {
      return '';
    }

    // 如果没有父文件夹（folderId 为空、"0" 或根目录），则该文件夹为根目录
    if (!folder.folderId || folder.folderId === '0') {
      const folderName = sanitizePathComponent(folder.name) || folder.name;
      pathMap.set(folderId, folderName);
      return folderName;
    }

    // 递归获取父文件夹路径
    const parentPath = buildPath(folder.folderId);
    const folderName = sanitizePathComponent(folder.name) || folder.name;
    const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;

    pathMap.set(folderId, fullPath);
    return fullPath;
  };

  // 遍历所有文件夹，构建路径
  for (const folderId of folderMap.keys()) {
    buildPath(folderId);
  }

  return pathMap;
}

/**
 * 直接遍历所有文档，根据 folderId 构建路径
 * 不依赖 rootRelation，而是直接从 documents 和 folders 数据中提取信息
 */
function buildFlatDocumentList(folderMap, docMap, folderPathMap) {
  const files = [];
  let folderCount = 0;

  // 遍历所有文档
  for (const [docId, doc] of docMap) {
    const folderId = doc.folderId;
    let folderPath = '';

    if (folderId && folderMap.has(folderId)) {
      // 文档在已知的文件夹中
      folderPath = folderPathMap.get(folderId) || '';
    }

    files.push({
      id: doc.id,
      title: doc.name || '未命名文档',
      type: doc.type,
      folderPath: folderPath,
      localPath: ''
    });
  }

  folderCount = folderMap.size;

  return { files, folderCount };
}



