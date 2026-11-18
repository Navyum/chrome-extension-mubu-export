import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllDocuments } from '../src/core/mubu.js';
import { MUBU_API } from '../src/core/constants.js';

async function scan(responder) {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    calls.push({ url, payload, options });
    return { ok: true, json: async () => ({ code: 0, data: responder(url, payload) }) };
  };
  try { return { result: await fetchAllDocuments('test-token'), calls }; }
  finally { globalThis.fetch = previousFetch; }
}

test('扫描保留旧返回值，补全真实 ID、路径、空文件夹及上下文证据', async () => {
  const { result, calls } = await scan((url, payload) => {
    if (url === MUBU_API.LIST) return {
      folders: [{ id: 1, name: '目录', folder_id: 0 }],
      documents: [{ id: 11, name: '文档', folder_id: 1, type: 'doc' }]
    };
    if (url === MUBU_API.LIST_GET_FOLDER) return { folders: [
      { id: '1', name: '目录' }, { id: 2, name: '空目录', folderId: 1 },
      { id: 3, name: '全局发现', folderId: 0 }
    ] };
    if (!payload.folderId) return { folders: [{ id: '1', name: '目录' }], documents: [{ id: 'root', name: '根文档' }] };
    if (payload.folderId === '1') return {
      folders: [{ id: '2', name: '空目录' }], documents: [{ id: '11', name: '文档' }]
    };
    if (payload.folderId === '3') return { folders: [], documents: [{ id: 'remote', name: '另一个文档' }] };
    return { folders: [], documents: [] };
  });
  assert.equal(result.folderCount, 3);
  assert.equal(result.files.length, 3);
  assert.equal(result.catalog.complete, true);
  assert.equal(result.files[0].folderId, '1');
  assert.equal(result.files[0].folderPath, '目录');
  assert.equal(result.files[0].type, 'doc');
  assert.equal(result.files.find(file => file.id === 'root').folderId, '0');
  assert.equal(result.catalog.folders.find(folder => folder.id === '2').parentId, '1');
  assert.ok(calls.some(call => call.payload.folderId === '3'));
  assert.equal(calls[0].options.headers['jwt-token'], 'test-token');
  assert.ok(result.catalog.revision);
  assert.ok(result.catalog.fetchedAt);
});

test('全局分页缺少位置不默认为根；异常字段和无 ID 记录明确标记', async () => {
  const { result } = await scan(url => {
    if (url === MUBU_API.LIST) return { folders: [], documents: [{ id: 'unknown' }, { name: 'bad' }] };
    if (url === MUBU_API.LIST_GET_FOLDER) return [];
    return { folders: [], documents: {} };
  });
  assert.equal(result.files[0].folderId, null);
  assert.equal(result.catalog.complete, false);
  assert.ok(result.catalog.issues.some(issue => issue.code === 'missing-folder'));
  assert.ok(result.catalog.issues.some(issue => issue.code === 'invalid-id'));
  assert.ok(result.catalog.issues.some(issue => issue.code === 'missing-or-invalid-list'));
});

test('分页游标兼容 next_start 且不会重复添加文档', async () => {
  const { result, calls } = await scan((url, payload) => {
    if (url === MUBU_API.LIST) return {
      folders: [], documents: [{ id: 'd', folderId: 0, name: '文档' }], next_start: payload.start ? '' : 'page2'
    };
    if (url === MUBU_API.LIST_GET_FOLDER) return [];
    return { folders: [], documents: [] };
  });
  assert.equal(result.files.length, 1);
  assert.equal(calls.filter(call => call.url === MUBU_API.LIST).length, 2);
});

test('重复游标与分页上限显式标记不完整，仍返回旧全量列表', async () => {
  for (const repeated of [true, false]) {
    let pages = 0;
    const { result } = await scan(url => {
      if (url === MUBU_API.LIST) return {
        folders: [], documents: [{ id: 'd', folderId: 0 }], nextStart: repeated ? 'same' : `page${++pages}`
      };
      if (url === MUBU_API.LIST_GET_FOLDER) return [];
      return { folders: [], documents: [] };
    });
    assert.equal(result.files.length, 1);
    assert.equal(result.catalog.complete, false);
    assert.ok(result.catalog.issues.some(issue => issue.code === (repeated ? 'repeated-cursor' : 'page-limit')));
  }
});

test('扫描中关系变化与冲突别名进入异常列表', async () => {
  const { result } = await scan((url, payload) => {
    if (url === MUBU_API.LIST) return {
      folders: [{ id: 'a', folderId: 0 }, { id: 'b', folderId: 0 }],
      documents: [{ id: 'd', folderId: 'a', folder_id: 'b' }]
    };
    if (url === MUBU_API.LIST_GET_FOLDER) return [];
    if (payload.folderId === 'b') return { folders: [], documents: [{ id: 'd', folderId: 'b' }] };
    return { folders: [], documents: [] };
  });
  assert.equal(result.catalog.complete, false);
  assert.ok(result.catalog.issues.some(issue => issue.code === 'conflicting-relation'));
  assert.ok(result.catalog.issues.some(issue => issue.code === 'relationship-changed-during-scan'));
  assert.equal(result.files.length, 1);
});
