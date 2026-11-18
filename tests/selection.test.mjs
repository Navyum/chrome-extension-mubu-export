import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleCatalog } from './fixtures.mjs';
import {
  selectAll, clearSelection, normalizeSelection, setDocumentSelected,
  setFolderSelected, getFolderSelectionState, createSelectionDraft
} from '../src/core/selection.js';

test('父目录选中全部后代；子文档取消后父目录半选', () => {
  const catalog = sampleCatalog();
  const original = new Set();
  const selected = setFolderSelected(catalog, original, 'a', true);
  assert.deepEqual([...selected], ['a-doc', 'child-doc']);
  assert.equal(original.size, 0);
  assert.equal(getFolderSelectionState(catalog, selected, 'a').checked, true);
  const partial = setDocumentSelected(catalog, selected, 'child-doc', false);
  assert.equal(getFolderSelectionState(catalog, partial, 'a').indeterminate, true);
  assert.equal(getFolderSelectionState(catalog, partial, 'child').selectedCount, 0);
  assert.equal(selected.size, 2);
});

test('子目录与直属文档全选后父目录全选，半选点击可补全', () => {
  const catalog = sampleCatalog();
  let selected = setFolderSelected(catalog, [], 'child', true);
  assert.equal(getFolderSelectionState(catalog, selected, 'a').indeterminate, true);
  selected = setDocumentSelected(catalog, selected, 'a-doc', true);
  assert.equal(getFolderSelectionState(catalog, selected, 'a').checked, true);
  selected = setDocumentSelected(catalog, selected, 'a-doc', false);
  selected = setFolderSelected(catalog, selected, 'a', true);
  assert.equal(getFolderSelectionState(catalog, selected, 'a').checked, true);
});

test('跨文件夹多选去重，取消父目录不影响其他目录', () => {
  const catalog = sampleCatalog();
  let selected = setFolderSelected(catalog, [], 'a', true);
  selected = setFolderSelected(catalog, selected, 'child', true);
  selected = setFolderSelected(catalog, selected, 'b', true);
  assert.equal(selected.size, 3);
  selected = setFolderSelected(catalog, selected, 'a', false);
  assert.deepEqual([...selected], ['b-doc']);
});

test('全选包含根文档，清空返回新集合；空目录禁选且不是全选', () => {
  const catalog = sampleCatalog();
  const all = selectAll(catalog);
  assert.equal(all.size, 4);
  assert.equal(getFolderSelectionState(catalog, all).checked, true);
  assert.deepEqual(setFolderSelected(catalog, [], '0', true), all);
  assert.equal(setFolderSelected(catalog, all, '0', false).size, 0);
  assert.equal(clearSelection().size, 0);
  assert.equal(all.size, 4);
  assert.deepEqual(getFolderSelectionState(catalog, all, 'empty'), {
    totalCount: 0, selectedCount: 0, checked: false, indeterminate: false, disabled: true
  });
});

test('草稿只保存文档 ID、绑定目录版本并移除过期 ID', () => {
  const catalog = sampleCatalog();
  const before = structuredClone(catalog);
  assert.deepEqual([...normalizeSelection(catalog, ['a-doc', 'a-doc', 'gone'])], ['a-doc']);
  assert.deepEqual(createSelectionDraft(catalog, ['gone', 'b-doc']), {
    schemaVersion: 2, catalogRevision: 'revision-1', selectedDocumentIds: ['b-doc']
  });
  assert.throws(() => setDocumentSelected(catalog, [], 'gone', true), /不存在/);
  assert.throws(() => setFolderSelected(catalog, [], 'gone', true), /不存在/);
  assert.deepEqual(catalog, before);
});
