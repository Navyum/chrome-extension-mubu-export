import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleCatalog } from './fixtures.mjs';
import { createCatalog } from '../src/core/catalog.js';
import { createSelectionTree } from '../src/ui/selection-tree.js';

// Minimal DOM implements only the APIs used by this renderer; no dependencies.
class Element {
  constructor(tag, ownerDocument) {
    this.tagName = tag; this.ownerDocument = ownerDocument; this.children = [];
    this.dataset = {}; this.attributes = {}; this.listeners = {};
    this.textContent = ''; this.hidden = false; this.checked = false; this.disabled = false;
  }
  appendChild(node) {
    if (node.tagName === '#fragment') { for (const child of [...node.children]) this.appendChild(child); return node; }
    node.remove(); this.children.push(node); node.parent = this; return node;
  }
  replaceChildren() { for (const node of [...this.children]) node.remove(); }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, callback) { this.listeners[event] = callback; }
  dispatch(event) { this.listeners[event]?.(); }
}
function dom() {
  const document = { createElement: tag => new Element(tag, document),
    createDocumentFragment: () => new Element('#fragment', document) };
  const root = new Element('div', document);
  return { root, nodes: () => {
    const found = []; const pending = [root];
    while (pending.length) { const node = pending.pop(); found.push(node); pending.push(...node.children); }
    return found;
  } };
}

test('树只渲染展开分支，文件夹及单篇复选框联动并显示半选', () => {
  const { root, nodes } = dom();
  let selected;
  const tree = createSelectionTree(root, sampleCatalog(), { onChange: ids => { selected = ids; } });
  const input = key => nodes().find(node => node.dataset.nodeKey === key);
  assert.equal(input('doc:child-doc'), undefined);
  input('folder:a').checked = true;
  input('folder:a').dispatch('change');
  assert.deepEqual([...selected], ['a-doc', 'child-doc']);
  const folderRow = input('folder:a').parent.parent;
  assert.equal(folderRow.children.at(-1).textContent, '2 个文档');
  folderRow.children[0].dispatch('click');
  assert.equal(input('folder:child').checked, true);
  assert.equal(input('folder:empty').disabled, true);
  assert.equal(input('folder:child').parent.parent.children.at(-1).textContent, '1 个文档');
  assert.equal(input('folder:empty').parent.parent.children.at(-1).textContent, '0 个文档');
  input('doc:a-doc').checked = false;
  input('doc:a-doc').dispatch('change');
  assert.equal(input('folder:a').indeterminate, true);
  assert.equal(input('folder:a').checked, false);
  tree.setSelection(['b-doc']);
  assert.equal(input('folder:b').checked, true);
  assert.equal(input('folder:a').indeterminate, false);
  tree.setDisabled(true);
  assert.equal(input('doc:a-doc').disabled, true);
});

test('数千篇折叠文档不创建 DOM，展开后分批加载；标题仅作为文本', () => {
  const { root, nodes } = dom();
  const hostile = '<img src=x onerror=alert(1)>';
  const catalog = createCatalog([{ id: 'f', folderId: '0', name: hostile }],
    Array.from({ length: 3500 }, (_, index) => ({ id: `d${index}`, folderId: 'f', name: hostile })), { revision: 'r' });
  createSelectionTree(root, catalog);
  assert.equal(nodes().filter(node => node.type === 'checkbox').length, 1);
  nodes().find(node => node.className === 'tree-expand').dispatch('click');
  assert.equal(nodes().filter(node => node.type === 'checkbox').length, 101);
  nodes().find(node => node.className === 'tree-more').dispatch('click');
  assert.equal(nodes().filter(node => node.type === 'checkbox').length, 201);
  assert.ok(nodes().some(node => node.textContent === hostile));
  assert.ok(nodes().filter(node => node.tagName === 'img').every(node =>
    ['../asserts/tree-folder.svg', '../asserts/tree-folder-open.svg', '../asserts/tree-document.svg'].includes(node.src)));
});

test('根目录文档也分批加载，禁选模式保留目录浏览', () => {
  const { root, nodes } = dom();
  const catalog = createCatalog([], Array.from({ length: 250 }, (_, index) => ({ id: `d${index}`, folderId: '0' })), { revision: 'r' });
  createSelectionTree(root, catalog, { disabled: true });
  const inputs = nodes().filter(node => node.type === 'checkbox');
  assert.equal(inputs.length, 100);
  assert.ok(inputs.every(input => input.disabled));
  assert.ok(nodes().some(node => node.className === 'tree-more'));
});

test('多文件夹大目录的选择更新只需线性读取，进度刷新不重复扫描目录', () => {
  const { root, nodes } = dom();
  const catalog = createCatalog(
    Array.from({ length: 100 }, (_, index) => ({ id: `f${index}`, folderId: '0' })),
    Array.from({ length: 10000 }, (_, index) => ({ id: `d${index}`, folderId: `f${index % 100}` })),
    { revision: 'large' }
  );
  let documentReads = 0;
  const ids = catalog.documents.map(doc => doc.id);
  for (const doc of catalog.documents) {
    const id = doc.id;
    Object.defineProperty(doc, 'id', { enumerable: true, get() { documentReads++; return id; } });
  }
  const tree = createSelectionTree(root, catalog);
  documentReads = 0;
  tree.setSelection(ids);
  // A complexity budget avoids machine-dependent timing assertions. Re-reading
  // every document for each visible folder exceeds this budget by two orders.
  assert.ok(documentReads <= ids.length * 5, `Unexpected full-directory scans: ${documentReads}`);
  const inputs = nodes().filter(node => node.type === 'checkbox');
  assert.equal(inputs.length, 100);
  assert.ok(inputs.every(input => input.checked && !input.indeterminate));
  documentReads = 0;
  tree.setDisabled(false);
  tree.setDisabled(true);
  tree.setDisabled(true);
  tree.setDisabled(false);
  assert.equal(documentReads, 0);
  tree.setSelection(ids.slice(1));
  const first = inputs.find(input => input.dataset.nodeKey === 'folder:f0');
  assert.equal(first.checked, false);
  assert.equal(first.indeterminate, true);
  assert.ok(inputs.filter(input => input !== first).every(input => input.checked));
  tree.setSelection([]);
  assert.ok(inputs.every(input => !input.checked && !input.indeterminate));
});

test('折叠时变更选择，稍后展开的子目录与文档使用最新统计', () => {
  const { root, nodes } = dom();
  const tree = createSelectionTree(root, sampleCatalog());
  const input = key => nodes().find(node => node.dataset.nodeKey === key);
  tree.setSelection(['child-doc']);
  assert.equal(input('folder:a').indeterminate, true);
  input('folder:a').parent.parent.children[0].dispatch('click');
  assert.equal(input('folder:child').checked, true);
  assert.equal(input('folder:empty').disabled, true);
  assert.equal(input('folder:child').parent.parent.children.at(-1).textContent, '1 个文档');
  assert.equal(input('folder:empty').parent.parent.children.at(-1).textContent, '0 个文档');
  input('folder:child').parent.parent.children[0].dispatch('click');
  assert.equal(input('doc:child-doc').checked, true);
  tree.setSelection(['a-doc']);
  assert.equal(input('folder:a').indeterminate, true);
  assert.equal(input('folder:child').checked, false);
  assert.equal(input('doc:child-doc').checked, false);
  assert.equal(input('doc:a-doc').checked, true);
});
