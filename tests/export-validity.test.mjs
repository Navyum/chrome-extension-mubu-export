import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchDocumentDefinition, fetchRemoteExportBlob } from '../src/core/mubu.js';
import { pdfBytes } from './validity-fixtures.mjs';

async function withResponse(response, body) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => response;
  try { return await body(); }
  finally { globalThis.fetch = original; }
}
const detailResponse = definition => Response.json({ code: 0, data: { definition } });
const readDefinition = response => withResponse(response, () => fetchDocumentDefinition('synthetic-id', 'synthetic-token'));
const readPdf = response => withResponse(response, () => fetchRemoteExportBlob({ nodes: [] }, 'pdf', 'synthetic-token'));

test('definition 保留普通树、富内容、无 ID 节点及额外元数据', async () => {
  const definition = {
    viewType: 'mindmap', customStyle: { futureField: true },
    nodes: [{ text: 'synthetic', note: 'note', children: [{}, { image: { id: 'image' }, children: null }] }]
  };
  assert.deepEqual(await readDefinition(detailResponse(JSON.stringify(definition))), definition);
  assert.deepEqual(await readDefinition(detailResponse(definition)), definition);
});

test('definition 合法空数组及空白节点仍有效', async () => {
  for (const definition of [{ nodes: [] }, { nodes: [{}] }, { nodes: [{ text: '', children: [] }] }]) {
    assert.deepEqual(await readDefinition(detailResponse(JSON.stringify(definition))), definition);
  }
});

test('definition 缺失与非法 JSON 分别报告，消息不包含响应片段', async () => {
  await assert.rejects(readDefinition(Response.json({ code: 0, data: {} })), /DEFINITION_MISSING/);
  await assert.rejects(readDefinition(detailResponse('{private-marker')), error => {
    assert.match(error.message, /DEFINITION_JSON/);
    assert.ok(!error.message.includes('private-marker'));
    return true;
  });
});

test('definition 无效根结构、无效节点和无效子列表被拒绝', async () => {
  for (const definition of [null, false, 42, [], {}, { nodes: null }, { nodes: {} }]) {
    await assert.rejects(readDefinition(detailResponse(JSON.stringify(definition))), /DEFINITION_STRUCTURE/);
  }
  for (const node of [null, 'text', 1, []]) {
    await assert.rejects(readDefinition(detailResponse(JSON.stringify({ nodes: [node] }))), /DEFINITION_NODE/);
  }
  await assert.rejects(readDefinition(detailResponse('{"nodes":[{"children":{}}]}')), /DEFINITION_CHILDREN/);
  await assert.rejects(readDefinition(detailResponse('{"nodes":[{"children":[null]}]}')), /DEFINITION_NODE/);
});

test('文档详情外层无效响应安全报错，不回传正文或服务端错误消息', async () => {
  await assert.rejects(readDefinition(new Response('{private-marker')), /DOCUMENT_RESPONSE_JSON/);
  await assert.rejects(readDefinition(Response.json(null)), /DOCUMENT_RESPONSE_STRUCTURE/);
  await assert.rejects(readDefinition(Response.json({ code: 500, msg: 'private-marker' })), error => {
    assert.match(error.message, /DOCUMENT_RESPONSE_ERROR/);
    assert.ok(!error.message.includes('private-marker'));
    return true;
  });
  await assert.rejects(readDefinition(new Response('', { status: 503 })), /HTTP 503/);
  const abort = new DOMException('cancelled', 'AbortError');
  await assert.rejects(readDefinition({ ok: true, json: async () => { throw abort; } }), error => error === abort);
});

test('合法 PDF 支持标准、通用二进制及缺失 Content-Type', async () => {
  for (const type of ['application/pdf', 'APPLICATION/PDF; charset=binary', 'application/octet-stream', null]) {
    const response = new Response(pdfBytes(), { headers: type ? { 'Content-Type': type } : {} });
    const blob = await readPdf(response);
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), pdfBytes());
  }
});

test('PDF 非 2xx、空 Blob、无效二进制及截断文件被拒绝', async () => {
  await assert.rejects(readPdf(new Response(pdfBytes(), { status: 500 })), /HTTP 500/);
  for (const [bytes, code] of [[new Uint8Array(), 'PDF_EMPTY'], [new Uint8Array([1, 2, 3]), 'PDF_HEADER'],
    [Buffer.from('%PDF-1.7\ntruncated'), 'PDF_EOF']]) {
    await assert.rejects(readPdf(new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } })), new RegExp(code));
  }
});

test('PDF 200 JSON、HTML、文本错误及伪装 PDF MIME 的错误均被拒绝', async () => {
  for (const [body, type] of [['{"error":"private-marker"}', 'application/json'],
    ['{"error":true}', 'application/problem+json'], ['<html>Error</html>', 'text/html'],
    ['Error', 'text/plain'], ['<html>Error</html>', 'application/xhtml+xml'],
    ['{"error":true}', 'application/pdf'], ['<html>Error</html>', 'application/pdf'],
    ['Error', 'application/pdf']]) {
    await assert.rejects(readPdf(new Response(body, { headers: { 'Content-Type': type } })), error => {
      assert.match(error.message, /PDF_CONTENT_TYPE|PDF_HEADER/);
      assert.ok(!error.message.includes('private-marker'));
      return true;
    });
  }
});

test('PDF 校验仅有界读取头尾并返回原 Blob，不复制整个大文件', async () => {
  const reads = [];
  class TrackedBlob extends Blob {
    arrayBuffer() { throw new Error('Must not read the whole Blob'); }
    slice(...args) {
      const slice = super.slice(...args);
      reads.push(slice.size);
      return slice;
    }
  }
  // Deliberately only a signature fixture: this test does not claim full PDF validation.
  const blob = new TrackedBlob(['%PDF-1.7\n', new Uint8Array(2 * 1024 * 1024), '\n%%EOF\r\n']);
  let bodyReads = 0;
  const result = await readPdf({ ok: true, headers: new Headers(), blob: async () => { bodyReads++; return blob; } });
  assert.equal(result, blob);
  assert.equal(bodyReads, 1);
  assert.deepEqual(reads, [9, 1024]);
});
