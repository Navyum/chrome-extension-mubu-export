import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleCatalog, installStorage } from './fixtures.mjs';
import * as state from '../src/core/state.js';
import { registerRuntimeHandlers, maybeResumeExport } from '../src/core/exporter.js';
import { buildExportTask } from '../src/core/task-builder.js';
import { MUBU_API } from '../src/core/constants.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function waitFor(predicate) {
  const end = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('Timed out waiting for task state');
    await new Promise(resolve => setImmediate(resolve));
  }
}
async function withRuntime(body, { ready, definitionHook, downloadHook } = {}) {
  state.resetExportState();
  const storage = installStorage({ subfolder: '备份' });
  state.replaceCatalog(sampleCatalog());
  const definitions = [];
  const downloads = [];
  const events = [];
  const failing = new Set();
  let listener;
  chrome.cookies = { get: async () => ({ value: 'fake-token' }) };
  chrome.runtime = {
    onMessage: { addListener: callback => { listener = callback; } },
    sendMessage: async message => { events.push(structuredClone(message)); }
  };
  chrome.downloads = { download: async options => {
    downloads.push(options);
    if (downloadHook) await downloadHook(options);
    return downloads.length;
  } };
  const originalFetch = globalThis.fetch;
  const originalTimer = globalThis.setTimeout;
  globalThis.setTimeout = (callback, ms, ...args) => originalTimer(callback, ms >= 1000 ? 0 : ms, ...args);
  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    if (url === MUBU_API.DOC_DETAIL) {
      definitions.push(payload.docId);
      if (definitionHook) await definitionHook(payload.docId);
      if (failing.has(payload.docId)) throw new Error('mock document error');
      return { ok: true, json: async () => ({ code: 0, data: { definition: '{"nodes":[{"text":"synthetic content"}]}' } }) };
    }
    if (url === MUBU_API.CONVERT_EXPORT) return { ok: true, blob: async () => new Blob(['fake pdf']) };
    const data = url === MUBU_API.LIST
      ? { folders: [{ id: 'f', folderId: 0, name: '新目录' }], documents: [{ id: 'new', folderId: 'f', name: '新文档' }] }
      : url === MUBU_API.LIST_GET_FOLDER ? [] : { folders: [], documents: [] };
    return { ok: true, json: async () => ({ code: 0, data }) };
  };
  registerRuntimeHandlers(ready);
  const request = (action, data) => new Promise(resolve => listener({ action, data }, {}, resolve));
  const selected = (ids, extra = {}) => request('startExport', {
    scope: 'selected', exportType: 'md', catalogRevision: state.catalog.revision, selectedDocumentIds: ids, ...extra
  });
  const settled = async () => {
    await waitFor(() => !state.exportTask.isExporting);
    await new Promise(resolve => setImmediate(resolve));
  };
  try { await body({ request, selected, settled, definitions, downloads, failing, events, storage }); }
  finally {
    await request('resetExport');
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalTimer;
  }
}

test('目录和草稿接口等待初始化，持久化并校验版本及未知 ID', async () => {
  const gate = deferred();
  await withRuntime(async ({ request, storage }) => {
    let responded = false;
    const pending = request('getCatalog').then(value => { responded = true; return value; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(responded, false);
    gate.resolve();
    const catalog = (await pending).data;
    assert.equal(catalog.folders[0].id, 'a');
    const saved = await request('saveSelectionDraft', { catalogRevision: catalog.revision, selectedDocumentIds: ['a-doc', 'a-doc', 'b-doc'] });
    assert.equal(saved.success, true);
    assert.deepEqual((await request('getSelectionDraft')).data.selectedDocumentIds, ['a-doc', 'b-doc']);
    await state.loadState();
    assert.deepEqual(state.selectionDraft.selectedDocumentIds, ['a-doc', 'b-doc']);
    assert.deepEqual(storage.read().selectionDraft.selectedDocumentIds, ['a-doc', 'b-doc']);
    assert.equal((await request('saveSelectionDraft', { catalogRevision: 'old', selectedDocumentIds: [] })).success, false);
    assert.equal((await request('saveSelectionDraft', { catalogRevision: catalog.revision, selectedDocumentIds: ['unknown'] })).success, false);
  }, { ready: gate.promise });
});

test('仅选中文档请求详情和下载；不信任前端路径', async () => {
  await withRuntime(async ({ selected, settled, definitions, downloads }) => {
    assert.equal((await selected(['child-doc', 'b-doc', 'child-doc'], { subfolder: 'injected', fileList: [{ id: 'root-doc', folderPath: 'evil' }] })).success, true);
    await settled();
    assert.deepEqual(definitions, ['child-doc', 'b-doc']);
    assert.equal(downloads.length, 2);
    assert.equal(downloads[0].filename, '备份/同名/子目录/子文档.md');
    assert.equal(state.exportTask.totalFiles, 2);
    assert.equal(state.catalog.documents.length, 4);
  });
});

test('全量旧入口每次创建新 pending 队列，换格式也不继承 success', async () => {
  await withRuntime(async ({ request, settled, definitions, downloads }) => {
    assert.equal((await request('startExport', { exportType: 'md' })).success, true);
    await settled();
    const first = state.exportTask.taskId;
    assert.equal((await request('startExport', { scope: 'all', exportType: 'json' })).success, true);
    await settled();
    assert.notEqual(state.exportTask.taskId, first);
    assert.equal(definitions.length, 8);
    assert.equal(downloads.length, 8);
    assert.ok(downloads.slice(4).every(download => download.filename.endsWith('.json')));
  });
});

test('无效范围、空选择、旧版本和不完整目录不能启动任务', async () => {
  await withRuntime(async ({ selected, request, definitions }) => {
    for (const [ids, extra] of [[[], {}], [['unknown'], {}], [['a-doc'], { catalogRevision: 'old' }],
      [['a-doc'], { catalogRevision: undefined }], [['a-doc'], { exportType: 'unsupported' }]]) {
      assert.equal((await selected(ids, extra)).success, false);
    }
    assert.equal((await request('startExport', { scope: 'unknown' })).success, false);
    const incomplete = sampleCatalog();
    incomplete.complete = false;
    state.replaceCatalog(incomplete);
    assert.equal((await selected(['a-doc'])).success, false);
    assert.equal(definitions.length, 0);
  });
});

test('重复开始被拒绝，暂停不允许覆盖，草稿变化不影响任务', async () => {
  const gate = deferred();
  await withRuntime(async ({ selected, request, definitions, settled }) => {
    const results = await Promise.all([selected(['a-doc', 'child-doc']), selected(['b-doc'])]);
    assert.deepEqual(results.map(result => result.success), [true, false]);
    await waitFor(() => definitions.length === 1);
    const taskId = state.exportTask.taskId;
    await request('togglePause', { isPaused: true });
    assert.equal((await selected(['b-doc'])).success, false);
    assert.equal((await request('getFileInfo')).success, false);
    assert.equal((await request('retryFailedFiles')).success, false);
    await request('saveSelectionDraft', { catalogRevision: state.catalog.revision, selectedDocumentIds: ['b-doc'] });
    await chrome.storage.local.set({ subfolder: 'changed-setting' });
    gate.resolve();
    await waitFor(() => state.exportTask.fileList[0].status === 'success');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(definitions.length, 1);
    await request('resumeExport');
    await settled();
    assert.equal(state.exportTask.taskId, taskId);
    assert.equal(state.exportTask.subfolder, '备份');
    assert.deepEqual(definitions, ['a-doc', 'child-doc']);
  }, { definitionHook: () => gate.promise });
});

test('失败计入已处理数量，重试只处理原任务失败项并保留原参数', async () => {
  await withRuntime(async ({ selected, settled, definitions, failing, events, request, downloads }) => {
    failing.add('child-doc');
    await selected(['a-doc', 'child-doc']);
    await settled();
    const summary = (await request('getUiState')).data;
    assert.equal(summary.processedFiles, 2);
    assert.equal(summary.successCount, 1);
    assert.equal(summary.failedCount, 1);
    assert.equal(summary.pendingCount, 0);
    assert.ok(events.some(event => event.action === 'exportProgress' && event.data.failedCount === 1 && event.data.processedFiles === 2));
    const taskId = summary.taskId;
    failing.clear();
    await chrome.storage.local.set({ subfolder: 'new-setting' });
    await request('saveSelectionDraft', { catalogRevision: state.catalog.revision, selectedDocumentIds: ['b-doc'] });
    assert.equal((await request('retryFailedFiles')).success, true);
    await settled();
    assert.equal(state.exportTask.taskId, taskId);
    assert.deepEqual(definitions, ['a-doc', 'child-doc', 'child-doc', 'child-doc']);
    assert.equal(downloads.at(-1).filename, '备份/同名/子目录/子文档.md');
    assert.equal(state.exportTask.fileList.every(file => file.status === 'success'), true);
  });
});

test('重启后不猜测处理中项成功，暂停任务可以由用户继续并重试', async () => {
  await withRuntime(async ({ request, settled, definitions }) => {
    const task = buildExportTask(state.catalog, { taskId: 'recovered', scope: 'selected', selectedDocumentIds: ['a-doc', 'child-doc'], subfolder: '原输出', exportType: 'opml' });
    task.isExporting = true;
    task.isPaused = true;
    task.fileList[0].status = 'in_progress';
    state.replaceExportTask(task);
    await state.saveState();
    await state.loadState();
    await maybeResumeExport();
    assert.equal(state.exportTask.fileList[0].status, 'failed');
    assert.equal(state.exportTask.isPaused, true);
    assert.match(state.exportTask.recoveryNotice, /待确认/);
    assert.equal(definitions.length, 0);
    await request('togglePause', { isPaused: false });
    await settled();
    assert.deepEqual(definitions, ['child-doc']);
    assert.equal(state.exportTask.exportType, 'opml');
    await request('retryFailedFiles');
    await settled();
    assert.deepEqual(definitions, ['child-doc', 'a-doc']);
  });
});

test('重置后旧详情回调不能下载或污染新任务', async () => {
  const oldRequest = deferred();
  await withRuntime(async ({ selected, request, settled, definitions, downloads }) => {
    await selected(['a-doc']);
    await waitFor(() => definitions.length === 1);
    await request('resetExport');
    state.replaceCatalog(sampleCatalog());
    await selected(['b-doc']);
    oldRequest.resolve();
    await settled();
    assert.equal(downloads.length, 1);
    assert.ok(downloads[0].filename.endsWith('B 文档.md'));
    assert.deepEqual(state.exportTask.fileList.map(file => file.id), ['b-doc']);
    assert.equal(state.exportTask.fileList[0].status, 'success');
  }, { definitionHook: id => id === 'a-doc' ? oldRequest.promise : undefined });
});

test('重置后旧下载返回不能将新任务标记成功', async () => {
  const oldDownload = deferred();
  let first = true;
  await withRuntime(async ({ selected, request, settled, downloads }) => {
    await selected(['a-doc']);
    await waitFor(() => downloads.length === 1);
    await request('resetExport');
    state.replaceCatalog(sampleCatalog());
    await selected(['b-doc']);
    oldDownload.resolve();
    await settled();
    assert.equal(state.exportTask.fileList.length, 1);
    assert.equal(state.exportTask.fileList[0].id, 'b-doc');
    assert.ok(state.exportTask.fileList[0].localPath.endsWith('B 文档.md'));
  }, { downloadHook: () => { if (first) { first = false; return oldDownload.promise; } } });
});

test('旧 catalog 不完整的历史安装仍可通过原入口重新全量导出', async () => {
  await withRuntime(async ({ request, settled, definitions }) => {
    const runtimeApis = { runtime: chrome.runtime, downloads: chrome.downloads, cookies: chrome.cookies };
    const storage = installStorage({ exportState: { fileList: [{ id: 'legacy', title: '旧文档', folderPath: '旧目录', status: 'success' }], exportType: 'md' } });
    Object.assign(chrome, runtimeApis);
    await state.loadState();
    assert.equal((await request('startExport', { exportType: 'json' })).success, true);
    await settled();
    assert.deepEqual(definitions, ['legacy']);
    assert.equal(storage.read().exportTask.fileList[0].status, 'success');
  });
});

test('页面没有接收端时后台仍完成任务', async () => {
  await withRuntime(async ({ selected, settled, downloads }) => {
    chrome.runtime.sendMessage = async () => { throw new Error('Receiving end does not exist'); };
    await selected(['a-doc', 'b-doc']);
    await settled();
    assert.equal(downloads.length, 2);
    assert.ok(state.exportTask.fileList.every(file => file.status === 'success'));
  });
});

test('新任务持久化失败不启动执行器，也不覆盖原任务', async () => {
  await withRuntime(async ({ selected, settled, definitions }) => {
    const originalSet = chrome.storage.local.set;
    chrome.storage.local.set = async () => { throw new Error('mock storage failure'); };
    assert.equal((await selected(['a-doc'])).success, false);
    assert.equal(state.exportTask.taskId, null);
    assert.equal(definitions.length, 0);
    chrome.storage.local.set = originalSet;
    await selected(['b-doc']);
    await settled();
    assert.deepEqual(definitions, ['b-doc']);
  });
});

test('继续时存储失败保留暂停状态，恢复存储后可以再次继续', async () => {
  await withRuntime(async ({ request, settled, definitions }) => {
    const task = buildExportTask(state.catalog, { taskId: 'paused', scope: 'selected', selectedDocumentIds: ['a-doc'] });
    Object.assign(task, { hasStarted: true, isExporting: true, isPaused: true });
    state.replaceExportTask(task);
    const originalSet = chrome.storage.local.set;
    chrome.storage.local.set = async () => { throw new Error('mock storage failure'); };
    assert.equal((await request('resumeExport')).success, false);
    assert.equal(state.exportTask.isPaused, true);
    assert.equal(definitions.length, 0);
    chrome.storage.local.set = originalSet;
    assert.equal((await request('resumeExport')).success, true);
    await settled();
    assert.deepEqual(definitions, ['a-doc']);
  });
});
