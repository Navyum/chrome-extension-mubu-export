import test from 'node:test';
import assert from 'node:assert/strict';
import { installStorage } from './fixtures.mjs';
import { pdfBytes } from './validity-fixtures.mjs';
import { createCatalog } from '../src/core/catalog.js';
import * as state from '../src/core/state.js';
import { registerRuntimeHandlers } from '../src/core/exporter.js';
import { MUBU_API, EXPORT_FORMATS } from '../src/core/constants.js';

// Uses only synthetic documents and in-memory storage. Never connects to Mubu.
async function withRuntime(body) {
  const originals = { fetch: globalThis.fetch, chrome: globalThis.chrome,
    timer: globalThis.setTimeout, reader: globalThis.FileReader };
  state.resetExportState();
  const storage = installStorage({ subfolder: 'Synthetic backup' });
  state.replaceCatalog(createCatalog([], [{ id: 'synthetic-doc', folderId: '0', name: 'Synthetic' }], { revision: 'r1' }));
  let listener;
  chrome.cookies = { get: async () => ({ value: 'synthetic-token' }) };
  chrome.runtime = { onMessage: { addListener: callback => { listener = callback; } }, sendMessage: async () => {} };
  const downloads = [];
  chrome.downloads = { download: async options => { downloads.push(options); return downloads.length; } };
  const responses = {
    detail: () => Response.json({ code: 0, data: { definition: '{"nodes":[{"text":"synthetic"}]}' } }),
    pdf: () => new Response(pdfBytes(), { headers: { 'Content-Type': 'application/pdf' } })
  };
  const calls = { detail: 0, pdf: 0 };
  globalThis.fetch = async url => {
    if (url === MUBU_API.DOC_DETAIL) { calls.detail++; return responses.detail(); }
    if (url === MUBU_API.CONVERT_EXPORT) { calls.pdf++; return responses.pdf(); }
    throw new Error('Unexpected network request');
  };
  globalThis.setTimeout = (callback, ms, ...args) => originals.timer(callback, ms >= 1000 ? 0 : ms, ...args);
  globalThis.FileReader = class {
    readAsDataURL(blob) {
      blob.arrayBuffer().then(bytes => {
        this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
        this.onloadend();
      }).catch(() => this.onerror());
    }
  };
  registerRuntimeHandlers();
  const request = (action, data) => new Promise(resolve => listener({ action, data }, {}, resolve));
  const start = (scope, exportType = 'md') => request('startExport', {
    scope, exportType, catalogRevision: 'r1', selectedDocumentIds: ['synthetic-doc']
  });
  const settled = async () => {
    const end = Date.now() + 3000;
    while (state.exportTask.isExporting) {
      if (Date.now() > end) throw new Error('Timed out waiting for synthetic task');
      await new Promise(resolve => setImmediate(resolve));
    }
    await new Promise(resolve => setImmediate(resolve));
  };
  try { await body({ responses, calls, downloads, storage, request, start, settled }); }
  finally {
    await request('resetExport'); // Resets only this test's in-memory chrome.storage stub.
    globalThis.fetch = originals.fetch;
    globalThis.chrome = originals.chrome;
    globalThis.setTimeout = originals.timer;
    if (originals.reader === undefined) delete globalThis.FileReader;
    else globalThis.FileReader = originals.reader;
  }
}

async function assertFailed(runtime, code) {
  await runtime.settled();
  assert.equal(runtime.downloads.length, 0);
  assert.equal(runtime.calls.detail, 2); // Existing initial attempt + one automatic retry.
  const file = state.exportTask.fileList[0];
  assert.equal(file.status, 'failed');
  assert.equal(file.retryCount, 1);
  assert.equal(file.localPath, '');
  assert.match(file.error, code);
  const summary = (await runtime.request('getUiState')).data;
  assert.equal(summary.successCount, 0);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.processedFiles, 1);
  assert.equal(runtime.storage.read().exportTask.fileList[0].status, 'failed');
}

for (const scope of ['all', 'selected']) {
  for (const [name, data, code] of [
    ['缺失', {}, /DEFINITION_MISSING/],
    ['非法 JSON', { definition: '{private-marker' }, /DEFINITION_JSON/],
    ['无效结构', { definition: '{"nodes":{}}' }, /DEFINITION_STRUCTURE/]
  ]) {
    test(`${scope}: definition ${name} 不下载、不成功，保留任务供失败重试`, async () => {
      await withRuntime(async runtime => {
        runtime.responses.detail = () => Response.json({ code: 0, data });
        assert.equal((await runtime.start(scope)).success, true);
        await assertFailed(runtime, code);
        assert.ok(!state.exportTask.fileList[0].error.includes('private-marker'));
        const taskId = state.exportTask.taskId;
        runtime.responses.detail = () => Response.json({ code: 0, data: { definition: '{"nodes":[]}' } });
        assert.equal((await runtime.request('retryFailedFiles')).success, true);
        await runtime.settled();
        assert.equal(state.exportTask.taskId, taskId);
        assert.equal(runtime.downloads.length, 1);
        assert.equal(state.exportTask.fileList[0].status, 'success');
      });
    });
  }

  for (const [name, pdfResponse] of [
    ['HTTP 503', () => new Response('unavailable', { status: 503 })],
    ['JSON', () => Response.json({ error: 'synthetic failure' })],
    ['HTML', () => new Response('<html>Error</html>', { headers: { 'Content-Type': 'text/html' } })],
    ['纯文本', () => new Response('Error', { headers: { 'Content-Type': 'text/plain' } })],
    ['空数据', () => new Response(new Uint8Array())],
    ['截断', () => new Response(Buffer.from('%PDF-1.7\ntruncated'))],
    ['伪装二进制', () => new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'application/pdf' } })]
  ]) {
    test(`${scope}: PDF ${name} 错误不下载，现有失败重试可恢复`, async () => {
      await withRuntime(async runtime => {
        runtime.responses.pdf = pdfResponse;
        assert.equal((await runtime.start(scope, 'pdf')).success, true);
        await assertFailed(runtime, /HTTP 503|PDF_CONTENT_TYPE|PDF_HEADER|PDF_EMPTY|PDF_EOF/);
        assert.equal(runtime.calls.pdf, 2);
        const taskId = state.exportTask.taskId;
        runtime.responses.pdf = () => new Response(pdfBytes()); // Missing MIME is supported.
        assert.equal((await runtime.request('retryFailedFiles')).success, true);
        await runtime.settled();
        assert.equal(state.exportTask.taskId, taskId);
        assert.equal(state.exportTask.exportType, 'pdf');
        assert.equal(runtime.downloads.length, 1);
        assert.equal(state.exportTask.fileList[0].status, 'success');
      });
    });
  }

  test(`${scope}: 无效 definition 不进入 PDF 转换接口`, async () => {
    await withRuntime(async runtime => {
      runtime.responses.detail = () => Response.json({ code: 0, data: {} });
      await runtime.start(scope, 'pdf');
      await assertFailed(runtime, /DEFINITION_MISSING/);
      assert.equal(runtime.calls.pdf, 0);
    });
  });

  test(`${scope}: 所有格式的正常及空文档继续共用任务流程`, async () => {
    await withRuntime(async runtime => {
      for (const nodes of [[{ text: 'synthetic', children: [{ text: 'child' }] }], []]) {
        runtime.responses.detail = () => Response.json({ code: 0, data: { definition: JSON.stringify({ nodes }) } });
        for (const [format, config] of Object.entries(EXPORT_FORMATS)) {
          const before = runtime.downloads.length;
          assert.equal((await runtime.start(scope, format)).success, true);
          await runtime.settled();
          assert.equal(state.exportTask.fileList[0].status, 'success', `${format}, nodes=${nodes.length}`);
          assert.equal(runtime.downloads.length, before + 1);
          assert.ok(runtime.downloads.at(-1).filename.endsWith(`.${config.extension}`));
        }
      }
    });
  });
}

test('首次 definition 解析失败后自动重试成功，仅创建一次下载', async () => {
  await withRuntime(async runtime => {
    runtime.responses.detail = () => Response.json({ code: 0, data: {
      definition: runtime.calls.detail === 1 ? '{invalid' : '{"nodes":[]}'
    } });
    await runtime.start('selected');
    await runtime.settled();
    assert.equal(runtime.calls.detail, 2);
    assert.equal(runtime.downloads.length, 1);
    assert.equal(state.exportTask.fileList[0].retryCount, 1);
    assert.equal(state.exportTask.fileList[0].status, 'success');
  });
});
