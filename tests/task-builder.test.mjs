import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleCatalog } from './fixtures.mjs';
import { buildExportTask } from '../src/core/task-builder.js';
import { EXPORT_FORMATS } from '../src/core/constants.js';

test('全量队列保留原顺序、路径和所有格式', () => {
  for (const exportType of Object.keys(EXPORT_FORMATS)) {
    const catalog = sampleCatalog();
    const task = buildExportTask(catalog, { taskId: 'task', exportType, subfolder: '备份' });
    assert.equal(task.totalFiles, 4);
    assert.equal(task.exportType, exportType);
    assert.equal(task.subfolder, '备份');
    assert.deepEqual(task.fileList.map(doc => doc.id), catalog.documents.map(doc => doc.id));
    assert.ok(task.fileList.every(doc => doc.status === 'pending' && doc.localPath === ''));
    assert.equal(task.fileList[2].folderPath, '同名/子目录');
  }
});

test('选择队列按 ID 去重并隔离目录、草稿和不同任务', () => {
  const catalog = sampleCatalog();
  const selected = ['child-doc', 'b-doc', 'child-doc'];
  const task = buildExportTask(catalog, { taskId: 'one', scope: 'selected', selectedDocumentIds: selected });
  const nextTask = buildExportTask(catalog, { taskId: 'two', scope: 'selected', selectedDocumentIds: selected });
  assert.equal(task.totalFiles, 2);
  selected.length = 0;
  catalog.documents[2].title = '改名';
  task.fileList[0].status = 'success';
  task.fileList[0].folderPath = '已改路径';
  assert.equal(nextTask.fileList[0].title, '子文档');
  assert.equal(nextTask.fileList[0].status, 'pending');
  assert.equal(nextTask.fileList[0].folderPath, '同名/子目录');
  assert.equal(catalog.documents[2].status, undefined);
  assert.equal(task.fileList[0].title, '子文档');
});

test('队列拒绝空选择、未知 ID、旧目录版本、无效格式和范围', () => {
  const catalog = sampleCatalog();
  const options = { taskId: 't', scope: 'selected' };
  assert.throws(() => buildExportTask(catalog, options), /没有可导出/);
  assert.throws(() => buildExportTask(catalog, { ...options, selectedDocumentIds: ['gone'] }), /不存在/);
  assert.throws(() => buildExportTask(catalog, { ...options, selectedDocumentIds: ['a-doc', null] }), /不存在/);
  assert.throws(() => buildExportTask(catalog, { ...options, selectedDocumentIds: 'a-doc' }), /集合/);
  assert.throws(() => buildExportTask(catalog, { taskId: 't', catalogRevision: 'old' }), /版本/);
  assert.throws(() => buildExportTask(catalog, { taskId: 't', exportType: '__proto__' }), /格式/);
  assert.throws(() => buildExportTask(catalog, { taskId: 't', scope: 'unknown' }), /范围/);
  assert.throws(() => buildExportTask(catalog), /ID/);
});

test('异常目录不阻断旧全量队列，但不能创建选择任务', () => {
  const catalog = sampleCatalog();
  catalog.complete = false;
  assert.equal(buildExportTask(catalog, { taskId: 't' }).totalFiles, 4);
  assert.throws(() => buildExportTask(catalog, {
    taskId: 't', scope: 'selected', selectedDocumentIds: ['a-doc']
  }), /未确认/);
  catalog.needsRefresh = true;
  assert.throws(() => buildExportTask(catalog, { taskId: 't' }), /重新获取/);
});
