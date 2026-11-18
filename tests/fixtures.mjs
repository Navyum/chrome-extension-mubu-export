import { createCatalog } from '../src/core/catalog.js';

export function sampleCatalog() {
  return createCatalog([
    { id: 'a', folderId: '0', name: '同名' },
    { id: 'b', folder_id: '0', name: '同名' },
    { id: 'child', folderId: 'a', name: '子目录' },
    { id: 'empty', folderId: 'a', name: '空目录' }
  ], [
    { id: 'root-doc', folderId: 0, name: '根文档' },
    { id: 'a-doc', folderId: 'a', name: 'A 文档' },
    { id: 'child-doc', folder_id: 'child', name: '子文档' },
    { id: 'b-doc', folderId: 'b', name: 'B 文档' }
  ], { revision: 'revision-1', fetchedAt: 123 });
}

export function installStorage(initial = {}) {
  let disk = structuredClone(initial);
  const writes = [];
  globalThis.chrome = { storage: { local: {
    async get(keys) {
      return structuredClone(Object.fromEntries(keys.filter(key => Object.hasOwn(disk, key)).map(key => [key, disk[key]])));
    },
    async set(value) {
      writes.push(structuredClone(value));
      Object.assign(disk, structuredClone(value));
    }
  } } };
  return { writes, read: () => structuredClone(disk) };
}
