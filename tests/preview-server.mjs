// Optional, synthetic UI preview: node tests/preview-server.mjs
// No real cookies, Mubu requests or downloads are used by this fixture.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpeg': 'image/jpeg' };
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/preview') {
      response.writeHead(302, { Location: '/settings-preview#select-export' }).end(); return;
    }
    if (['/settings-preview', '/src/settings.html', '/popup-preview'].includes(url.pathname)) {
      const popup = url.pathname === '/popup-preview';
      const source = popup ? 'popup' : 'settings';
      let html = await readFile(path.join(root, `src/${source}.html`), 'utf8');
      const messages = await readFile(path.join(root, '_locales/zh_CN/messages.json'), 'utf8');
      html = html.replace('<head>', '<head><base href="/src/">');
      html = html.replace(/href="#(general|select-export|performance|about)"/g, (_, section) => `href="${url.pathname}#${section}"`);
      html = html.replace(`<script type="module" src="${source}.js"></script>`,
        `<script>globalThis.previewMessages=${messages};</script><script type="module">import '/tests/browser-fixture.mjs'; import '/src/${source}.js';</script>`);
      if (!popup) html = html.replace('<body>', '<body><div style="padding:8px;color:#fcd34d;font-size:12px">仅合成数据预览 · 不访问幕布、不创建真实下载 <button id="preview-allow-retry">测试：允许失败文档重试</button></div>');
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html);
      return;
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep) ||
        !/^(src|icons|asserts|_locales)\//.test(relative) && !['tests/browser-fixture.mjs', 'tests/fixtures.mjs'].includes(relative)) {
      response.writeHead(404).end(); return;
    }
    const content = await readFile(target);
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
    response.end(content);
  } catch { response.writeHead(404).end(); }
}).listen(8766, '127.0.0.1', () => console.log('Synthetic preview: http://127.0.0.1:8766/preview'));
