import test from 'node:test';
import assert from 'node:assert/strict';
import { saveContentToDisk, saveBlobToDisk } from '../src/core/downloads.js';

test('旧任务在 Blob 转换期间失效后不能再创建下载', async () => {
  let calls = 0;
  globalThis.chrome = { downloads: { download: async () => { calls++; } } };
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const originalReader = globalThis.FileReader;
  globalThis.FileReader = class {
    readAsDataURL() { gate.then(() => { this.result = 'data:application/pdf;base64,QQ=='; this.onloadend(); }); }
  };
  let active = true;
  try {
    const pending = saveBlobToDisk(new Blob(['synthetic']), { title: '合成文档' }, 'pdf', {
      subfolder: '原任务目录', isActive: () => active
    });
    active = false;
    finish();
    await assert.rejects(pending, { name: 'AbortError' });
    await assert.rejects(saveContentToDisk({ extension: 'md', mime: 'text/plain', content: 'synthetic' },
      { title: '合成文档' }, { isActive: () => false }), { name: 'AbortError' });
    assert.equal(calls, 0);
  } finally { globalThis.FileReader = originalReader; }
});
