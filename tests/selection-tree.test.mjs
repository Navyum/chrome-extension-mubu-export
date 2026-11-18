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
  folderRow.children[0].dispatch('click');
  assert.equal(input('folder:child').checked, true);
  assert.equal(input('folder:empty').disabled, true);
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
  assert.equal(nodes().some(node => node.tagName === 'img'), false);
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
