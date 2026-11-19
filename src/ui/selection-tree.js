import { buildCatalogTree } from '../core/catalog.js';
import {
  normalizeSelection, setDocumentSelected, setFolderSelected
} from '../core/selection.js';

// Build data in memory, but create DOM only for expanded branches, 100 siblings
// at a time. Titles always go through textContent, including hostile markup.
export function createSelectionTree(container, catalog, {
  selectedIds = [], disabled = false, onChange = () => {},
  labels = { more: '显示更多', unresolved: '位置待确认', expand: '展开或折叠' }
} = {}) {
  const tree = buildCatalogTree(catalog);
  let selected = normalizeSelection(catalog, selectedIds);
  // Index branches once for this catalog. Children precede their parents when
  // iterating backwards, so selection counts need only one pass over the tree.
  const branches = [tree];
  for (let index = 0; index < branches.length; index++) {
    for (const child of branches[index].children) {
      if (child.kind !== 'document') branches.push(child);
    }
  }
  const folderCounts = new Map();
  function updateCounts() {
    for (let index = branches.length - 1; index >= 0; index--) {
      const branch = branches[index];
      let total = 0;
      let checked = 0;
      for (const child of branch.children) {
        if (child.kind === 'document') {
          total++;
          if (selected.has(child.id)) checked++;
        } else {
          const counts = folderCounts.get(child);
          total += counts.total;
          checked += counts.checked;
        }
      }
      folderCounts.set(branch, { total, checked });
    }
  }
  updateCounts();
  const checkboxes = new Map();
  const document = container.ownerDocument;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function sync() {
    for (const [input, node] of checkboxes) {
      if (node.kind === 'document') {
        input.checked = selected.has(node.id);
        input.disabled = disabled;
      } else {
        const { total, checked } = folderCounts.get(node);
        input.checked = total > 0 && checked === total;
        input.indeterminate = checked > 0 && checked < total;
        input.disabled = disabled || total === 0;
      }
    }
  }
  function renderList(parent, nodes) {
    let offset = 0;
    const more = element('button', 'tree-more', labels.more);
    more.type = 'button';
    function appendBatch() {
      more.remove();
      const fragment = document.createDocumentFragment();
      for (const node of nodes.slice(offset, offset + 100)) fragment.appendChild(renderNode(node));
      offset += 100;
      parent.appendChild(fragment);
      if (offset < nodes.length) parent.appendChild(more);
      sync();
    }
    more.addEventListener('click', appendBatch);
    appendBatch();
  }
  function renderNode(node) {
    const item = element('li', `tree-item tree-${node.kind}`);
    const icon = element('img', 'tree-node-icon');
    icon.src = node.kind === 'document' ? '../asserts/tree-document.svg' : '../asserts/tree-folder.svg';
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    const row = element('div', 'tree-row');
    item.appendChild(row);
    let children;
    if (node.kind !== 'document') {
      const expand = element('button', 'tree-expand', '▸');
      expand.type = 'button';
      expand.setAttribute('aria-label', labels.expand);
      expand.setAttribute('aria-expanded', 'false');
      children = element('ul', 'tree-children');
      children.hidden = true;
      let rendered = false;
      expand.addEventListener('click', () => {
        children.hidden = !children.hidden;
        expand.textContent = children.hidden ? '▸' : '▾';
        icon.src = children.hidden ? '../asserts/tree-folder.svg' : '../asserts/tree-folder-open.svg';
        expand.setAttribute('aria-expanded', String(!children.hidden));
        if (!rendered && !children.hidden) { rendered = true; renderList(children, node.children); }
      });
      row.appendChild(expand);
    } else row.appendChild(element('span', 'tree-spacer'));
    const label = element('label', 'tree-label');
    if (node.kind !== 'unresolved') {
      const input = element('input');
      input.type = 'checkbox';
      input.dataset.nodeKey = node.key;
      checkboxes.set(input, node);
      input.addEventListener('change', () => {
        selected = node.kind === 'document'
          ? setDocumentSelected(catalog, selected, node.id, input.checked)
          : setFolderSelected(catalog, selected, node.id, input.checked);
        updateCounts();
        sync();
        onChange(new Set(selected));
      });
      label.appendChild(input);
    }
    label.appendChild(icon);
    label.appendChild(element('span', 'tree-title', node.kind === 'document' ? node.title :
      node.kind === 'folder' ? node.name : labels.unresolved));
    row.appendChild(label);
    if (node.kind === 'folder') {
      const total = folderCounts.get(node).total;
      const count = labels.documentCount ? labels.documentCount(total) : `${total} 个文档`;
      row.appendChild(element('span', 'tree-document-count', count));
    }
    if (children) item.appendChild(children);
    return item;
  }
  container.replaceChildren();
  const list = element('ul', 'selection-tree');
  container.appendChild(list);
  renderList(list, tree.children);
  return {
    setSelection(ids) {
      const next = normalizeSelection(catalog, ids);
      if (next.size === selected.size && [...next].every(id => selected.has(id))) return;
      selected = next;
      updateCounts();
      sync();
    },
    setDisabled(value) {
      if (disabled === value) return;
      disabled = value;
      sync();
    },
    getSelection() { return new Set(selected); }
  };
}
