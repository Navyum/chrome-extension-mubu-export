/**
 * Internationalization helper using Chrome's built-in i18n API.
 *
 * Usage in JS: i18n('messageKey') or i18n('messageKey', ['arg1', 'arg2'])
 * Usage in HTML: add data-i18n="messageKey" to elements for text content,
 *                data-i18n-title="messageKey" for title attribute,
 *                data-i18n-placeholder="messageKey" for placeholder attribute,
 *                data-i18n-aria-label="messageKey" for aria-label attribute.
 */

export function i18n(messageName, substitutions) {
  return chrome.i18n.getMessage(messageName, substitutions) || messageName;
}

/**
 * Apply i18n translations to all elements with data-i18n* attributes
 * within the given root element (defaults to document).
 */
export function applyI18n(root = document) {
  // data-i18n → textContent
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = i18n(key);
    }
  });

  // data-i18n-html → innerHTML (for elements with inline icons)
  root.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    if (key) {
      el.textContent = i18n(key);
    }
  });

  // data-i18n-title → title attribute
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (key) {
      el.title = i18n(key);
    }
  });

  // data-i18n-placeholder → placeholder attribute
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      el.placeholder = i18n(key);
    }
  });

  // data-i18n-aria-label → aria-label attribute
  root.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria-label');
    if (key) {
      el.setAttribute('aria-label', i18n(key));
    }
  });

  // data-i18n-alt → alt attribute
  root.querySelectorAll('[data-i18n-alt]').forEach(el => {
    const key = el.getAttribute('data-i18n-alt');
    if (key) {
      el.alt = i18n(key);
    }
  });
}
