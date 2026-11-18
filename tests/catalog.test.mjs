import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalog, buildCatalogTree, normalizeId } from '../src/core/catalog.js';
import { sampleCatalog } from './fixtures.mjs';

test('真实 ID 区分同名目录，保留根文档、子目录和空目录', () => {
  const catalog = sampleCatalog();
  assert.equal(catalog.complete, true);
  assert.equal(catalog.documents.find(doc => doc.id === 'child-doc').folderPath, '同名/子目录');
  const tree = buildCatalogTree(catalog);
  const a = tree.children.find(node => node.key === 'folder:a');
  const b = tree.children.find(node => node.key === 'folder:b');
  assert.equal(a.children.find(node => node.id === 'child').children[0].id, 'child-doc');
  assert.equal(a.children.find(node => node.id === 'empty').children.length, 0);
  assert.equal(b.children[0].id, 'b-doc');
  assert.ok(tree.children.some(node => node.key === 'doc:root-doc'));
});

test('ID 类型和别名归一化，不把缺失的所属目录猜成根目录', () => {
  const catalog = createCatalog([{ id: 1, folder_id: 0, name: 'a/b' }], [
    { id: 2, folder_id: 1, name: '文档', type: 7 }, { id: 3 },
    { id: 4, folderId: 'missing' }, { name: '没有 ID' }, { id: false }
  ], { revision: 'r' });
  assert.equal(catalog.folders[0].id, '1');
  assert.equal(catalog.documents[0].folderId, '1');
  assert.equal(catalog.documents[0].folderPath, 'a_b');
  assert.equal(catalog.documents[0].type, 7);
  assert.equal(catalog.documents[1].folderId, null);
  assert.equal(catalog.documents[2].folderId, 'missing');
  assert.equal(catalog.documents.length, 3);
  assert.equal(catalog.complete, false);
  assert.ok(catalog.issues.some(issue => issue.code === 'invalid-id'));
  assert.equal(normalizeId({}), null);
  assert.equal(normalizeId('  x  '), 'x');
});

test('孤立父目录、循环和自引用不会递归溢出或丢失节点', () => {
  const catalog = createCatalog([
    { id: 'a', folderId: 'b', name: 'A' }, { id: 'b', folderId: 'a', name: 'B' },
    { id: 'self', folderId: 'self', name: 'Self' },
    { id: 'orphan', folderId: 'missing', name: 'Orphan' }, { id: 'unknown', name: 'Unknown' }
  ], [{ id: 'doc', folderId: 'a' }, { id: 'loose' }], { revision: 'r' });
  const tree = buildCatalogTree(catalog);
  const keys = [];
  const pending = [tree];
  while (pending.length) {
    const node = pending.pop();
    keys.push(node.key);
    pending.push(...(node.children || []));
  }
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.filter(key => key.startsWith('folder:')).length, 5);
  assert.equal(keys.filter(key => key.startsWith('doc:')).length, 2);
  assert.ok(catalog.issues.some(issue => issue.code === 'folder-cycle'));
  assert.equal(catalog.complete, false);
});

test('稀疏重复记录按 ID 合并，构建过程不修改原始响应', () => {
  const raw = [{ id: 1, folderId: 0, name: '文件夹' }, { id: '1', name: undefined }];
  const before = structuredClone(raw);
  const catalog = createCatalog(raw, [{ id: 2, folderId: 1, name: '原名' }, { id: '2', type: 3 }], { revision: 'r' });
  assert.equal(catalog.folders.length, 1);
  assert.equal(catalog.folders[0].name, '文件夹');
  assert.equal(catalog.documents[0].title, '原名');
  assert.deepEqual(raw, before);
  assert.throws(() => createCatalog([], [], {}), /版本/);
});

test('数千层目录通过迭代解析路径', () => {
  const folders = Array.from({ length: 2500 }, (_, index) => ({
    id: `f${index}`, folderId: index ? `f${index - 1}` : '0', name: 'x'
  })).reverse();
  const catalog = createCatalog(folders, [{ id: 'd', folderId: 'f2499' }], { revision: 'r' });
  assert.equal(catalog.complete, true);
  assert.equal(catalog.documents[0].folderPath.split('/').length, 2500);
});

test('字段冲突和非法关系显式标记，不静默声明目录完整', () => {
  const catalog = createCatalog([
    { id: 'a', folderId: '0', folder_id: 'unknown' },
    { id: 'b', folderId: {} },
    { id: 'c', folderId: '0' }, { id: 'c', folderId: 'a' }
  ], [{ id: 'd', folderId: false }, { id: 'e', folderId: '0', folder_id: 'a' }], { revision: 'r' });
  assert.equal(catalog.complete, false);
  assert.ok(catalog.issues.some(issue => issue.code === 'conflicting-relation' && issue.id === 'a'));
  assert.ok(catalog.issues.some(issue => issue.code === 'conflicting-relation' && issue.id === 'c'));
  assert.ok(catalog.issues.some(issue => issue.code === 'invalid-relation' && issue.id === 'b'));
  assert.equal(catalog.documents[0].folderId, null);
});
