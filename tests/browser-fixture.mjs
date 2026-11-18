import { sampleCatalog } from './fixtures.mjs';
import { createInitialTask } from '../src/core/task-builder.js';
import { registerRuntimeHandlers, maybeResumeExport } from '../src/core/exporter.js';
import * as state from '../src/core/state.js';
import { MUBU_API } from '../src/core/constants.js';

const storageKey = 'mubu-selective-export-synthetic-preview';
const runtimeListeners = [];
const storageListeners = [];
let disk = JSON.parse(localStorage.getItem(storageKey) || 'null');
if (!disk) {
  const catalog = sampleCatalog();
  catalog.documents.push(...Array.from({ length: 3500 }, (_, index) => ({
    id: `synthetic-${index}`, folderId: 'child', folderPath: '同名/子目录',
    title: index ? `合成测试文档 ${index}` : '<img src=x onerror=alert(1)>', locationValid: true
  })));
  disk = { stateVersion: 2, catalog, exportTask: createInitialTask(),
    selectionDraft: { schemaVersion: 2, catalogRevision: catalog.revision, selectedDocumentIds: [] } };
}
let allowRetry = false;
document.getElementById('preview-allow-retry')?.addEventListener('click', () => { allowRetry = true; });
globalThis.chrome = {
  i18n: { getMessage: (key, values = []) => (previewMessages[key]?.message || key).replace(/\$(\d+)/g, (_, index) => values[Number(index) - 1] || '') },
  cookies: { get: async () => ({ value: 'synthetic-preview-only' }) },
  tabs: { create: async ({ url }) => { window.open(url); } },
  storage: {
    onChanged: { addListener: listener => storageListeners.push(listener) },
    local: {
      async get(keys, callback) {
        const result = structuredClone(Object.fromEntries(keys.filter(key => Object.hasOwn(disk, key)).map(key => [key, disk[key]])));
        callback?.(result); return result;
      },
      async set(values, callback) {
        const changes = {};
        for (const [key, value] of Object.entries(values)) {
          if (JSON.stringify(disk[key]) !== JSON.stringify(value)) changes[key] = { oldValue: disk[key], newValue: structuredClone(value) };
        }
        Object.assign(disk, structuredClone(values));
        localStorage.setItem(storageKey, JSON.stringify(disk));
        for (const listener of storageListeners) listener(changes, 'local');
        callback?.();
      }
    }
  },
  downloads: { download: async () => 1 },
  runtime: {
    getURL: url => url === 'src/select-export.html' ? '/preview' : `/${url}`,
    openOptionsPage: async () => {},
    onMessage: { addListener: listener => runtimeListeners.push(listener) },
    sendMessage(message) {
      return new Promise(resolve => {
        let waiting = false;
        for (const listener of runtimeListeners) if (listener(message, {}, value => resolve(structuredClone(value))) === true) waiting = true;
        if (!waiting) resolve();
      });
    }
  }
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (url === MUBU_API.DOC_DETAIL) {
    const id = JSON.parse(options.body).docId;
    await new Promise(resolve => setTimeout(resolve, 300));
    if (id === 'b-doc' && !allowRetry) throw new Error('合成测试：模拟失败');
    return new Response(JSON.stringify({ code: 0, data: { definition: '{"nodes":[{"text":"synthetic"}]}' } }));
  }
  if (String(url).includes('mubu.com')) throw new Error('合成预览禁止真实幕布网络请求');
  return originalFetch(url, options);
};
const ready = state.loadState().then(() => maybeResumeExport());
registerRuntimeHandlers(ready);
