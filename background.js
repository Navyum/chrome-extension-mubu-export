const MUBU_API = {
  LIST: 'https://api2.mubu.com/v3/api/list/get_all_documents_page',
  DOC_DETAIL: 'https://api2.mubu.com/v3/api/document/edit/get'
};

const EXPORT_FORMATS = {
  md: { extension: 'md', mime: 'text/markdown' },
  opml: { extension: 'opml', mime: 'text/xml' },
  json: { extension: 'json', mime: 'application/json' }
};

let exportState = {
  isExporting: false,
  isPaused: false,
  totalFiles: 0,
  folderCount: 0,
  currentFileIndex: 0,
  fileList: [],
  exportType: 'md',
  subfolder: '',
  logs: []
};

const defaultState = JSON.parse(JSON.stringify(exportState));
let abortController = new AbortController();

// ---- 初始化状态 ----
(async () => {
  await loadState();
  if (exportState.isExporting && !exportState.isPaused) {
    sendLog('检测到中断的导出任务，正在尝试恢复...');
    exportFiles();
  }
})();

// ---- 消息路由 ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getFileInfo':
      handleGetFileInfo(sendResponse);
      return true;
    case 'startExport':
      handleStartExport(message.data, sendResponse);
      return true;
    case 'togglePause':
      handleTogglePause(message.data);
      return false;
    case 'getUiState':
      sendResponse({ success: true, data: exportState });
      return false;
    case 'retryFailedFiles':
      handleRetryFailedFiles(sendResponse);
      return true;
    case 'resetExport':
      handleResetExport(sendResponse);
      return true;
    default:
      return false;
  }
});

// ---- 核心流程 ----
async function handleGetFileInfo(sendResponse) {
  try {
    const jwtToken = await getJwtTokenOrThrow();
    sendLog('开始获取幕布文件列表...');
    const { files, folderCount } = await fetchAllDocuments(jwtToken);

    if (files.length === 0) {
      throw new Error('未获取到任何文档，请确认账号下是否存在内容。');
    }

    exportState.fileList = files.map(file => ({ ...file, status: 'pending', localPath: '' }));
    exportState.totalFiles = files.length;
    exportState.folderCount = folderCount;
    exportState.currentFileIndex = 0;
    exportState.logs = [];

    await saveState();
    sendLog(`成功获取 ${files.length} 个文档，${folderCount} 个文件夹。`);
    sendResponse({ success: true, data: exportState });
  } catch (error) {
    const message = error.message.includes('Jwt-Token')
      ? '未检测到 Jwt-Token，请确认已在 https://mubu.com 登录后重试。'
      : error.message;
    sendLog(`获取文件信息失败: ${message}`);
    sendResponse({ success: false, error: message });
  }
}

async function handleStartExport(data, sendResponse) {
  if (!exportState.fileList.length) {
    sendResponse({ success: false, error: '文件列表为空，请先获取文件信息。' });
    return;
  }

  try {
    await getJwtTokenOrThrow(); // 仅用于提前校验
    const settings = await chrome.storage.local.get(['subfolder']);

    exportState.isExporting = true;
    exportState.isPaused = false;
    exportState.currentFileIndex = 0;
    exportState.exportType = data?.exportType || 'md';
    exportState.subfolder = settings.subfolder || '';
    exportState.logs = [];

    exportState.fileList.forEach(file => {
      if (file.status !== 'success') {
        file.status = 'pending';
      }
    });

    abortController.abort();
    abortController = new AbortController();

    await saveState();
    sendResponse({ success: true });
    exportFiles();
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleRetryFailedFiles(sendResponse) {
  if (exportState.isExporting) {
    sendResponse({ success: false, error: '当前有任务正在运行，请先暂停或重置。' });
    return;
  }

  const failedFiles = exportState.fileList.filter(file => file.status === 'failed');
  if (!failedFiles.length) {
    sendResponse({ success: false, error: '没有失败的文件需要重试。' });
    return;
  }

  try {
    await getJwtTokenOrThrow();
    const settings = await chrome.storage.local.get(['subfolder']);

    exportState.fileList.forEach(file => {
      if (file.status === 'failed') {
        file.status = 'pending';
      }
    });

    exportState.isExporting = true;
    exportState.isPaused = false;
    exportState.currentFileIndex = 0;
    exportState.subfolder = settings.subfolder || '';
    exportState.logs = [];

    abortController.abort();
    abortController = new AbortController();

    await saveState();
    sendResponse({ success: true });
    exportFiles();
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleResetExport(sendResponse) {
  exportState.isExporting = false;
  exportState.isPaused = false;
  abortController.abort();
  abortController = new AbortController();

  exportState = JSON.parse(JSON.stringify(defaultState));
  await chrome.storage.local.set({ exportState });
  sendResponse({ success: true, data: exportState });
}

async function handleTogglePause(data) {
  if (!exportState.isExporting) {
    sendLog('没有正在进行的任务，忽略暂停/继续指令。');
    return;
  }
  exportState.isPaused = data?.isPaused ?? false;
  sendLog(exportState.isPaused ? '导出已暂停。' : '导出已继续。');
  await saveState();
}

async function exportFiles() {
  try {
    const jwtToken = await getJwtTokenOrThrow();
    const filesToProcess = exportState.fileList;
    const totalCount = filesToProcess.length;

    for (let i = exportState.currentFileIndex; i < totalCount; i++) {
      if (!exportState.isExporting) {
        sendLog('导出流程已被取消。');
        return;
      }

      await waitIfPaused();

      const file = filesToProcess[i];
      exportState.currentFileIndex = i;

      if (file.status !== 'pending') {
        continue;
      }

      file.status = 'in_progress';
      file.startTime = Date.now();
      file.retryCount = 0;
      file.exportUrl = `mubu://${file.id}`;
      file.downloadUrl = '';
      await saveState();
      sendLog(`(进度 ${i + 1}/${totalCount}) 处理 ${file.title}...`);

      const MAX_RETRIES = 1;
      let success = false;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            sendLog(`重试第 ${attempt} 次: ${file.title}`);
            await delay(2000);
          }

          file.retryCount = attempt;
          const definition = await fetchDocumentDefinition(file.id, jwtToken);
          const exportPayload = buildExportPayload(definition, exportState.exportType);
          const savedPath = await saveContentToDisk(exportPayload, file);

          file.status = 'success';
          file.localPath = savedPath;
          file.endTime = Date.now();
          file.duration = file.endTime - file.startTime;
          sendLog(`导出完成: ${file.title} (耗时 ${(file.duration / 1000).toFixed(2)}s)`);
          sendProgress();
          success = true;
          break;
        } catch (error) {
          if (error.name === 'AbortError') {
            sendLog('检测到中止信号，结束导出流程。');
            return;
          }
          sendLog(`导出失败: ${file.title} -> ${error.message}`);
        }
      }

      if (!success) {
        file.status = 'failed';
        file.endTime = Date.now();
        file.duration = file.endTime - file.startTime;
        sendLog(`已将 ${file.title} 标记为失败。`);
      }

      await saveState();
      await delay(1200 + Math.random() * 800);
    }

    if (!exportState.isExporting) {
      sendLog('导出被外部中止，跳过收尾。');
      return;
    }

    exportState.isExporting = false;
    await saveState();

    const failedCount = exportState.fileList.filter(file => file.status === 'failed').length;
    if (failedCount > 0) {
      sendLog(`导出完成，但仍有 ${failedCount} 个文档失败。请稍后重试。`);
    } else {
      sendLog('所有幕布文档均已成功导出！');
    }

    sendComplete();
  } catch (error) {
    if (error.name === 'AbortError') {
      sendLog('导出流程已被重置。');
      return;
    }
    exportState.isExporting = false;
    await saveState();
    sendLog(`导出流程发生异常: ${error.message}`);
    sendError(error.message);
  }
}

// ---- 幕布 API 相关 ----
async function fetchAllDocuments(jwtToken) {
  const folders = new Map();
  const documents = new Map();
  let rootRelation = null;
  let start = '';
  let guard = 0;

  while (true) {
    guard += 1;
    if (guard > 50) {
      break;
    }

    const data = await requestMubuJson(MUBU_API.LIST, jwtToken, { start });

    if (!rootRelation && data.root_relation) {
      rootRelation = data.root_relation;
    }

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

  const { files, folderCount, seenIds } = buildFlatDocumentList(rootRelation, folders, documents);

  for (const doc of documents.values()) {
    if (!seenIds.has(doc.id)) {
      files.push({
        id: doc.id,
        title: doc.name || '未命名文档',
        type: doc.type,
        folderPath: '',
        localPath: ''
      });
    }
  }

  return { files, folderCount };
}

async function fetchDocumentDefinition(docId, jwtToken) {
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

async function makeMubuRequest(url, jwtToken, payload = {}) {
  const headers = {
    'Content-Type': 'application/json;charset=UTF-8',
    'Origin': 'https://mubu.com',
    'Referer': 'https://mubu.com/list',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'jwt-token': jwtToken
  };

  return fetch(url, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers,
    credentials: 'include',
    signal: abortController.signal
  });
}

// ---- 导出格式转换 ----
function buildExportPayload(definition, exportType) {
  const format = EXPORT_FORMATS[exportType] || EXPORT_FORMATS.md;
  let content = '';

  switch (exportType) {
    case 'opml':
      content = definitionToOpml(definition);
      break;
    case 'json':
      content = JSON.stringify(definition, null, 2);
      break;
    default:
      content = definitionToMarkdown(definition);
  }

  if (!content.endsWith('\n')) {
    content += '\n';
  }

  return {
    content,
    extension: format.extension,
    mime: format.mime
  };
}

function definitionToMarkdown(definition) {
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  if (!nodes.length) return '';

  const lines = [];

  const traverse = (items, depth) => {
    items.forEach(node => {
      const text = htmlToPlainText(node.text) || '(空)';
      const prefix = `${'  '.repeat(depth)}- `;
      lines.push(`${prefix}${text}`);

      if (node.note) {
        const note = htmlToPlainText(node.note);
        if (note) {
          lines.push(`${'  '.repeat(depth + 1)}> ${note}`);
        }
      }

      if (Array.isArray(node.children) && node.children.length) {
        traverse(node.children, depth + 1);
      }
    });
  };

  traverse(nodes, 0);
  return lines.join('\n');
}

function definitionToOpml(definition) {
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head><title>Mubu Export</title></head>',
    '  <body>'
  ];

  const traverse = (items, depth) => {
    items.forEach(node => {
      const indent = '  '.repeat(depth + 1);
      const text = escapeXml(htmlToPlainText(node.text) || '空节点');
      lines.push(`${indent}<outline text="${text}">`);

      if (node.note) {
        const note = escapeXml(htmlToPlainText(node.note));
        if (note) {
          lines.push(`${indent}  <note>${note}</note>`);
        }
      }

      if (Array.isArray(node.children) && node.children.length) {
        traverse(node.children, depth + 1);
      }

      lines.push(`${indent}</outline>`);
    });
  };

  traverse(nodes, 0);
  lines.push('  </body>', '</opml>');
  return lines.join('\n');
}

// ---- 工具函数 ----
async function saveContentToDisk(exportPayload, file) {
  let fileName = sanitizePathComponent(file.title) || '未命名文档';
  fileName = `${fileName}.${exportPayload.extension}`;

  const parts = [];
  if (exportState.subfolder) {
    parts.push(sanitizePathComponent(exportState.subfolder));
  }
  if (file.folderPath) {
    parts.push(file.folderPath);
  }
  parts.push(fileName);

  let relativePath = parts.filter(Boolean).join('/');
  relativePath = relativePath.replace(/^[/\\]+/, '');

  const dataUrl = `data:${exportPayload.mime};charset=utf-8,${encodeURIComponent(exportPayload.content)}`;

  try {
    await chrome.downloads.download({
      url: dataUrl,
      filename: relativePath,
      saveAs: false,
      conflictAction: 'uniquify'
    });
  } finally {
  }

  return relativePath;
}

function buildFlatDocumentList(rootRelation, folderMap, docMap) {
  const files = [];
  const seenIds = new Set();
  let folderCount = 0;

  const walk = (relationInput, currentPath) => {
    const relation = parseRelation(relationInput);
    if (!relation.length) {
      return;
    }

    relation.forEach(item => {
      if (item.type === 'folder') {
        const folder = folderMap.get(item.id);
        if (!folder) return;

        folderCount += 1;
        const folderName = sanitizePathComponent(folder.name || `文件夹${folderCount}`) || `folder-${folderCount}`;
        const nextPath = currentPath ? `${currentPath}/${folderName}` : folderName;
        walk(folder.relation, nextPath);
      } else {
        const doc = docMap.get(item.id);
        if (!doc || seenIds.has(doc.id)) {
          return;
        }
        seenIds.add(doc.id);
        files.push({
          id: doc.id,
          title: doc.name || '未命名文档',
          type: doc.type,
          folderPath: currentPath || '',
          localPath: ''
        });
      }
    });
  };

  if (rootRelation) {
    walk(rootRelation, '');
  }

  return { files, folderCount, seenIds };
}

function parseRelation(relationInput) {
  if (!relationInput) return [];
  if (Array.isArray(relationInput)) return relationInput;
  try {
    return JSON.parse(relationInput);
  } catch (error) {
    return [];
  }
}

function sanitizePathComponent(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }
  return name
    .replace(/[\\/<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '');
}

function htmlToPlainText(input = '') {
  if (!input) return '';
  let text = input;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|li|h\d)>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '\n- ');
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, '\'');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/\r/g, '');
  text = text.replace(/\u00a0/g, ' ');

  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
}

function escapeXml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitIfPaused() {
  if (!exportState.isPaused) return;
  sendLog('导出已暂停，等待继续...');
  while (exportState.isPaused) {
    await delay(1000);
    if (!exportState.isExporting) {
      throw new Error('导出已被取消');
    }
  }
  sendLog('检测到继续指令，恢复导出。');
}

async function getJwtTokenOrThrow() {
  const cookie = await chrome.cookies.get({
    url: 'https://mubu.com',
    name: 'Jwt-Token'
  });
  const token = (cookie && cookie.value ? cookie.value.trim() : '');
  if (!token) {
    throw new Error('未检测到 Jwt-Token，请先在 https://mubu.com 登录账号后重试。');
  }
  return token;
}

// ---- 状态管理 & 通信 ----
async function saveState() {
  await chrome.storage.local.set({ exportState });
  if (exportState.fileList && exportState.fileList.length > 0) {
    await chrome.storage.local.set({
      fileInfo: {
        totalFiles: exportState.totalFiles,
        folderCount: exportState.folderCount || 0,
        fileList: exportState.fileList
      },
      totalFiles: exportState.totalFiles,
      folderCount: exportState.folderCount || 0
    });
  }
}

async function loadState() {
  try {
    const result = await chrome.storage.local.get(['exportState', 'fileInfo']);
    if (result.exportState) {
      Object.assign(exportState, result.exportState);
      if ((!exportState.fileList || !exportState.fileList.length) && result.fileInfo) {
        exportState.fileList = result.fileInfo.fileList || [];
        exportState.totalFiles = result.fileInfo.totalFiles || 0;
        exportState.folderCount = result.fileInfo.folderCount || 0;
      }
      sendLog('已从存储中恢复任务状态。');
    }
  } catch (error) {
    sendLog('恢复任务状态失败，请重新获取文件信息。');
  }
}

function sendProgress() {
  const exportedCount = exportState.fileList.filter(file => file.status === 'success').length;
  sendMessageToPopup({
    action: 'exportProgress',
    data: {
      exportedFiles: exportedCount,
      totalFiles: exportState.totalFiles
    }
  });
}

function sendComplete() {
  sendMessageToPopup({ action: 'exportComplete' });
}

function sendError(error) {
  sendMessageToPopup({
    action: 'exportError',
    data: { error }
  });
}

function sendLog(message) {
  const timestampedMessage = `[${new Date().toLocaleTimeString()}] ${message}`;
  exportState.logs.push(timestampedMessage);
  if (exportState.logs.length > 200) {
    exportState.logs.shift();
  }
  sendMessageToPopup({
    action: 'exportLog',
    data: { message: timestampedMessage }
  });
}

async function sendMessageToPopup(payload) {
  try {
    await chrome.runtime.sendMessage(payload);
  } catch (error) {
    if (!error?.message?.includes('Receiving end does not exist')) {
      console.warn('向 popup 发送消息失败:', error);
    }
  }
}

