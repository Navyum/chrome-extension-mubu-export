import { buildCatalogTree } from '../core/catalog.js';
import {
  normalizeSelection, setDocumentSelected, setFolderSelected, getFolderSelectionState
} from '../core/selection.js';

// Build data in memory, but create DOM only for expanded branches, 100 siblings
// at a time. Titles always go through textContent, including hostile markup.
export function createSelectionTree(container, catalog, {
  selectedIds = [], disabled = false, onChange = () => {},
  labels = { more: '显示更多', unresolved: '位置待确认', expand: '展开或折叠' }
} = {}) {
  const tree = buildCatalogTree(catalog);
  let selected = normalizeSelection(catalog, selectedIds);
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
        const state = getFolderSelectionState(catalog, selected, node.id);
        input.checked = state.checked;
        input.indeterminate = state.indeterminate;
        input.disabled = disabled || state.disabled;
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
    const item = element('li', 'tree-item');
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
        sync();
        onChange(new Set(selected));
      });
      label.appendChild(input);
    }
    label.appendChild(element('span', 'tree-title', node.kind === 'document' ? node.title :
      node.kind === 'folder' ? node.name : labels.unresolved));
    row.appendChild(label);
    if (children) item.appendChild(children);
    return item;
  }
  container.replaceChildren();
  const list = element('ul', 'selection-tree');
  container.appendChild(list);
  renderList(list, tree.children);
  return {
    setSelection(ids) { selected = normalizeSelection(catalog, ids); sync(); },
    setDisabled(value) { disabled = value; sync(); },
    getSelection() { return new Set(selected); }
  };
}
