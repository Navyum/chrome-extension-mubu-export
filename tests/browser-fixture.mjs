import { sampleCatalog } from './fixtures.mjs';
import { createInitialTask } from '../src/core/task-builder.js';
import { registerRuntimeHandlers, maybeResumeExport } from '../src/core/exporter.js';
import * as state from '../src/core/state.js';
import { MUBU_API } from '../src/core/constants.js';
import { registerAccountHandler } from '../src/core/account.js';

// Change ?account=out|error|expired|free|fallback|broken|unsafe|vip for account UI QA.
const accountScenario = new URLSearchParams(location.search).get('account') || 'vip';

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
  cookies: { get: async () => accountScenario === 'out' ? null : ({ value: 'synthetic-preview-only' }) },
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
    getURL: url => url.startsWith('src/settings.html') ? url.replace('src/settings.html', '/settings-preview') : `/${url}`,
    openOptionsPage: async () => {},
    onMessage: { addListener: listener => runtimeListeners.push(listener) },
    sendMessage(message, callback) {
      const response = new Promise(resolve => {
        let waiting = false;
        for (const listener of runtimeListeners) if (listener(message, {}, value => {
          const result = structuredClone(value);
          if (message.action === 'getAccountInfo' && result?.account?.avatarUrl) {
            result.account.avatarUrl = accountScenario === 'broken' ? '/asserts/missing-avatar.png' : '/icons/icon48.png';
          }
          resolve(result);
        }) === true) waiting = true;
        if (!waiting) resolve();
      });
      if (callback) response.then(callback);
      return response;
    }
  }
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (url === MUBU_API.USER_PROFILE) {
    if (accountScenario === 'error') throw new Error('Synthetic network error');
    if (accountScenario === 'expired') return new Response(JSON.stringify({ code: 2 }));
    // Same-origin image used only in this synthetic fixture, after production URL normalization.
    return new Response(JSON.stringify({ code: 0, data: {
      id: 'synthetic-account', name: accountScenario === 'unsafe' ? '<img src=x onerror=alert(1)>'.repeat(10) : '幕布测试用户',
      photo: accountScenario === 'fallback' ? '' : '/synthetic-avatar.png',
      level: accountScenario === 'free' ? 0 : 2, vipEndDate: accountScenario === 'free' ? '' : '20991231'
    } }));
  }
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
registerAccountHandler();
