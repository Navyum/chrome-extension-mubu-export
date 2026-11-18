import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateStoredState } from '../src/core/state-model.js';
import { buildExportTask } from '../src/core/task-builder.js';
import { sampleCatalog, installStorage } from './fixtures.mjs';
import * as state from '../src/core/state.js';

function legacyState() {
  return { exportState: {
    isExporting: true, isPaused: true, currentFileIndex: 1,
    totalFiles: 3, folderCount: 2, exportType: 'opml', subfolder: '旧备份', logs: ['原日志'],
    fileList: [
      { id: 1, title: '已完成', folderPath: '同名/子目录', status: 'success', localPath: '旧备份/a.opml', duration: 32 },
      { id: '2', title: '处理中', folderPath: '同名', status: 'in_progress', retryCount: 1, startTime: 123 },
      { id: '3', title: '失败', folderPath: '', status: 'failed' }
    ]
  } };
}

test('迁移旧任务保留状态、暂停、索引、格式、路径和耗时，不猜文件夹 ID', () => {
  const old = legacyState();
  const before = structuredClone(old);
  const migrated = migrateStoredState(old);
  const task = migrated.exportTask;
  assert.equal(task.isExporting, true);
  assert.equal(task.isPaused, true);
  assert.equal(task.currentFileIndex, 1);
  assert.equal(task.exportType, 'opml');
  assert.equal(task.subfolder, '旧备份');
  assert.equal(task.folderCount, 2);
  assert.deepEqual(task.fileList.map(file => file.status), ['success', 'in_progress', 'failed']);
  assert.equal(task.fileList[0].id, '1');
  assert.equal(task.fileList[0].localPath, '旧备份/a.opml');
  assert.equal(task.fileList[0].duration, 32);
  assert.equal(task.fileList[1].retryCount, 1);
  assert.equal(task.fileList[1].startTime, 123);
  assert.deepEqual(task.logs, ['原日志']);
  assert.equal(migrated.catalog.needsRefresh, true);
  assert.equal(migrated.catalog.folders.length, 0);
  assert.equal(migrated.catalog.documents[0].folderId, null);
  assert.equal(migrated.catalog.documents[0].folderPath, '同名/子目录');
  assert.equal(migrated.catalog.documents[0].status, undefined);
  task.fileList[0].title = '任务改名';
  assert.equal(migrated.catalog.documents[0].title, '已完成');
  assert.deepEqual(old, before);
});

test('仅 fileInfo 的旧安装可以继续全量导出，空存储得到空模型', () => {
  const result = migrateStoredState({ fileInfo: { totalFiles: 1, folderCount: 5,
    fileList: [{ id: 'd', title: '文档', folderPath: '目录' }] } });
  assert.equal(result.exportTask.fileList[0].status, 'pending');
  assert.equal(result.exportTask.folderCount, 5);
  assert.equal(result.exportTask.totalFiles, 1);
  assert.equal(migrateStoredState({}).exportTask.totalFiles, 0);
});

test('旧空任务和新版空任务都不回填陈旧 fileInfo', () => {
  const old = { exportState: { fileList: [] }, fileInfo: { fileList: [{ id: 'stale' }] } };
  const migrated = migrateStoredState(old);
  assert.equal(migrated.exportTask.totalFiles, 0);
  const roundtrip = migrateStoredState({ ...old, ...migrated });
  assert.equal(roundtrip.exportTask.totalFiles, 0);
  assert.equal(roundtrip.migrated, false);
});

test('新版迁移幂等，任务优先于旧缓存，草稿按版本清理', () => {
  const catalog = sampleCatalog();
  const exportTask = buildExportTask(catalog, { taskId: 't', scope: 'selected', selectedDocumentIds: ['a-doc'] });
  const stored = { stateVersion: 2, catalog, exportTask,
    selectionDraft: { catalogRevision: catalog.revision, selectedDocumentIds: ['b-doc', 'gone', 'b-doc'] },
    exportState: { fileList: [{ id: 'stale' }] } };
  const result = migrateStoredState(stored);
  assert.deepEqual(result.selectionDraft.selectedDocumentIds, ['b-doc']);
  assert.deepEqual(result.exportTask.fileList.map(file => file.id), ['a-doc']);
  assert.deepEqual(migrateStoredState(result), result);
  stored.selectionDraft.catalogRevision = 'old';
  assert.deepEqual(migrateStoredState(stored).selectionDraft.selectedDocumentIds, []);
  assert.equal(exportTask.fileList[0].status, 'pending');
});

test('损坏或未来版本不静默覆盖历史记录', () => {
  assert.throws(() => migrateStoredState({ stateVersion: 99 }), /不支持/);
  assert.throws(() => migrateStoredState({ exportState: { fileList: 'broken' } }), /损坏/);
  assert.throws(() => migrateStoredState({ exportState: { fileList: [{}] } }), /ID/);
  assert.throws(() => migrateStoredState({ exportState: { fileList: [{ id: 1 }, { id: '1' }] } }), /重复/);
  assert.throws(() => migrateStoredState({ stateVersion: 2 }), /损坏/);
});

test('真实状态适配器迁移、持久化并重新加载，保留兼容对象引用', async () => {
  state.resetExportState();
  const disk = installStorage(legacyState());
  const alias = state.exportState;
  const result = await state.loadState();
  assert.equal(result.restored, true);
  assert.equal(result.migrated, true);
  assert.equal(state.exportState, state.exportTask);
  assert.equal(state.exportState, alias);
  assert.equal(disk.read().stateVersion, 2);
  assert.equal(disk.read().exportTask.fileList[1].status, 'in_progress');
  const again = await state.loadState();
  assert.equal(again.migrated, false);
  state.resetExportState();
  await state.saveState();
  await state.loadState();
  assert.equal(state.exportState.totalFiles, 0);
  assert.equal(state.catalog.documents.length, 0);
});

test('刷新目录和修改草稿不改变任务快照，存储快照也不共享引用', async () => {
  state.resetExportState();
  const disk = installStorage();
  state.replaceCatalog(sampleCatalog());
  Object.assign(state.exportTask, buildExportTask(state.catalog, { taskId: 't' }));
  state.setSelectionDraft(['a-doc', 'gone']);
  await state.saveState();
  const next = sampleCatalog();
  next.revision = 'new';
  next.documents = next.documents.filter(doc => doc.id !== 'a-doc');
  next.documents[0].title = '已改名';
  state.replaceCatalog(next);
  assert.equal(state.exportTask.totalFiles, 4);
  assert.equal(state.exportTask.fileList[0].title, '根文档');
  assert.deepEqual(state.selectionDraft.selectedDocumentIds, []);
  state.exportTask.fileList[0].status = 'success';
  assert.equal(disk.read().exportTask.fileList[0].status, 'pending');
  assert.equal(state.catalog.documents[0].status, undefined);
});

test('加载损坏状态不回写存储', async () => {
  const disk = installStorage({ stateVersion: 99 });
  const result = await state.loadState();
  assert.equal(result.restored, false);
  assert.ok(result.error);
  assert.equal(disk.writes.length, 0);
});

test('旧活动任务列表仅存在 fileInfo 时保留暂停及任务参数', () => {
  const result = migrateStoredState({
    exportState: { isExporting: true, isPaused: true, fileList: [], exportType: 'json', subfolder: '旧目录' },
    fileInfo: { folderCount: 2, fileList: [{ id: 'd', title: '文档', status: 'failed', folderPath: 'A' }] }
  });
  assert.equal(result.exportTask.isPaused, true);
  assert.equal(result.exportTask.exportType, 'json');
  assert.equal(result.exportTask.subfolder, '旧目录');
  assert.equal(result.exportTask.fileList[0].status, 'failed');
  assert.equal(result.exportTask.folderCount, 2);
});

test('迁移写入失败不激活尚未持久化的任务', async () => {
  state.resetExportState();
  const disk = installStorage(legacyState());
  chrome.storage.local.set = async () => { throw new Error('storage failure'); };
  const result = await state.loadState();
  assert.match(result.error.message, /storage failure/);
  assert.equal(state.exportTask.isExporting, false);
  assert.equal(state.exportTask.fileList.length, 0);
  assert.equal(disk.read().stateVersion, undefined);
});

test('新版缺失任务、非法目录 ID 和未知任务状态不会降级成空任务', () => {
  const catalog = sampleCatalog();
  const task = buildExportTask(catalog, { taskId: 't' });
  assert.throws(() => migrateStoredState({ stateVersion: 2, catalog }), /任务缓存缺失/);
  const invalidCatalog = structuredClone(catalog);
  invalidCatalog.documents[0].id = null;
  assert.throws(() => migrateStoredState({ stateVersion: 2, catalog: invalidCatalog, exportTask: task }), /ID 损坏/);
  task.fileList[0].status = 'mystery';
  assert.throws(() => migrateStoredState({ stateVersion: 2, catalog, exportTask: task }), /状态损坏/);
});
