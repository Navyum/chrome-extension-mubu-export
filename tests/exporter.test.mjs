import test from 'node:test';
import assert from 'node:assert/strict';
import { installStorage } from './fixtures.mjs';
import { registerRuntimeHandlers } from '../src/core/exporter.js';
import * as state from '../src/core/state.js';
import { MUBU_API } from '../src/core/constants.js';

test('旧 getFileInfo/startExport/getUiState 消息可完整执行全量 Markdown 导出', async () => {
  state.resetExportState();
  const disk = installStorage({ subfolder: '原有备份' });
  const downloads = [];
  let handler;
  let finish;
  const completed = new Promise(resolve => { finish = resolve; });
  chrome.cookies = { get: async () => ({ value: 'test-token' }) };
  chrome.runtime = {
    onMessage: { addListener: callback => { handler = callback; } },
    sendMessage: async message => { if (message.action === 'exportComplete') finish(); }
  };
  chrome.downloads = { download: async options => { downloads.push(options); return 1; } };
  const previousFetch = globalThis.fetch;
  const previousTimer = globalThis.setTimeout;
  globalThis.setTimeout = (callback, _delay, ...args) => previousTimer(callback, 0, ...args);
  globalThis.fetch = async url => ({ ok: true, json: async () => ({ code: 0, data:
    url === MUBU_API.LIST ? { folders: [{ id: 'f', name: '目录', folderId: 0 }], documents: [{ id: 'd', name: '文档', folderId: 'f' }] } :
      url === MUBU_API.LIST_GET_FOLDER ? [] :
        url === MUBU_API.DOC_DETAIL ? { definition: JSON.stringify({ nodes: [{ text: '内容' }] }) } :
          { folders: [], documents: [] }
  }) });
  const request = (action, data) => new Promise(resolve => handler({ action, data }, {}, resolve));
  try {
    registerRuntimeHandlers();
    const info = await request('getFileInfo');
    assert.equal(info.success, true);
    assert.equal(info.data.fileList[0].folderPath, '目录');
    assert.equal(info.data.fileList[0].folderId, 'f');
    assert.equal(state.catalog.documents[0].status, undefined);
    const start = await request('startExport', { exportType: 'md' });
    assert.equal(start.success, true);
    await completed;
    const ui = await request('getUiState');
    assert.equal(ui.data.isExporting, false);
    assert.equal(ui.data.fileList[0].status, 'success');
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].filename, '原有备份/目录/文档.md');
    assert.equal(downloads[0].conflictAction, 'uniquify');
    assert.equal(state.catalog.documents[0].status, undefined);
    assert.equal(disk.read().exportTask.fileList[0].status, 'success');
    assert.equal(disk.read().catalog.documents[0].status, undefined);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.setTimeout = previousTimer;
  }
});
