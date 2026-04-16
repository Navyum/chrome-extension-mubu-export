import { registerRuntimeHandlers, maybeResumeExport } from './core/exporter.js';
import { initDownloadHooks } from './core/downloads.js';
import { loadState } from './core/state.js';
import { sendLog } from './core/messaging.js';

initDownloadHooks();
registerRuntimeHandlers();

// Override Origin/Referer for all Mubu API requests
// (browser ignores Origin set via fetch headers for extension requests)
chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [1, 2],
  addRules: [
    {
      id: 1,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Origin', operation: 'set', value: 'https://mubu.com' },
          { header: 'Referer', operation: 'set', value: 'https://mubu.com/app/edit/home' }
        ]
      },
      condition: {
        urlFilter: '||api2.mubu.com/',
        resourceTypes: ['xmlhttprequest']
      }
    },
    {
      id: 2,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Origin', operation: 'set', value: 'https://mubu.com' },
          { header: 'Referer', operation: 'set', value: 'https://mubu.com/app/edit/home' }
        ]
      },
      condition: {
        urlFilter: '||mubu.com/convert/',
        resourceTypes: ['xmlhttprequest']
      }
    }
  ]
});

(async function bootstrap() {
  const { restored, error } = await loadState();
  if (restored) {
    sendLog('已从存储中恢复任务状态。');
  } else if (error) {
    sendLog('恢复任务状态失败，请重新获取文件信息。');
  }
  await maybeResumeExport();
})();
