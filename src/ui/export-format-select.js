import { i18n } from './i18n.js';

// One controller per control: popup and settings share presentation and behavior.
export function createExportFormatSelect(container) {
  if (!container) return null;
  const document = container.ownerDocument;
  const select = container.querySelector('select');
  const trigger = container.querySelector('.select-trigger');
  const list = container.querySelector('.select-options');
  const label = container.querySelector('.select-trigger-text');
  const icon = container.querySelector('.select-icon');
  const buttons = [];
  const group = container.closest('.form-group');

  function close(restoreFocus = false) {
    const wasOpen = container.classList.contains('is-open');
    container.classList.remove('is-open');
    group?.classList.remove('is-select-open');
    trigger.setAttribute('aria-expanded', 'false');
    list.hidden = true;
    if (restoreFocus && wasOpen && !select.disabled) trigger.focus();
  }
  function sync() {
    const option = select.selectedOptions[0];
    const text = option?.textContent.trim() || i18n('exportFormatLabel');
    label.textContent = text;
    trigger.setAttribute('aria-label', `${i18n('exportFormatLabel')} ${text}`);
    trigger.disabled = select.disabled;
    container.classList.toggle('is-disabled', select.disabled);
    container.classList.toggle('has-selection', Boolean(select.value));
    container.classList.toggle('has-icon', Boolean(option?.dataset.icon));
    icon.classList.toggle('is-visible', Boolean(option?.dataset.icon));
    if (option?.dataset.icon) { icon.src = option.dataset.icon; icon.alt = ''; }
    for (const button of buttons) {
      const active = button.dataset.value === select.value;
      button.parentElement.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    }
    if (select.disabled) close();
  }
  function open() {
    if (select.disabled) return;
    list.hidden = false;
    container.classList.add('is-open');
    group?.classList.add('is-select-open');
    trigger.setAttribute('aria-expanded', 'true');
    (buttons.find(button => button.dataset.value === select.value) || buttons[0])?.focus();
  }
  list.replaceChildren();
  for (const option of select.options) {
    const item = document.createElement('li');
    item.className = 'select-option-item';
    item.setAttribute('role', 'presentation');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'select-option-button';
    button.dataset.value = option.value;
    button.setAttribute('role', 'option');
    button.tabIndex = -1;
    if (option.dataset.icon) {
      const image = document.createElement('img');
      image.src = option.dataset.icon;
      image.alt = '';
      button.appendChild(image);
    }
    const text = document.createElement('span');
    text.textContent = option.textContent.trim();
    button.appendChild(text);
    button.addEventListener('click', () => {
      if (select.disabled) return;
      if (select.value !== option.value) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      sync();
      close(true);
    });
    buttons.push(button);
    item.appendChild(button);
    list.appendChild(item);
  }
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  trigger.hidden = false;
  container.classList.add('is-enhanced');
  trigger.addEventListener('click', () => container.classList.contains('is-open') ? close(true) : open());
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(); }
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
  });
  list.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    const current = buttons.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (current + 1) % buttons.length;
    if (event.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    if (next !== undefined) { event.preventDefault(); buttons[next].focus(); }
  });
  select.addEventListener('change', sync);
  document.addEventListener('click', event => { if (!container.contains(event.target)) close(); });
  container.addEventListener('focusout', event => { if (!container.contains(event.relatedTarget)) close(); });
  sync();
  return { sync, close };
}
