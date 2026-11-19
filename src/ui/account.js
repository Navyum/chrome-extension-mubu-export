import { i18n } from './i18n.js';
import { ACCOUNT_COOKIE_NAMES } from '../core/account.js';

export function initAccountMenu() {
  const button = document.getElementById('login-btn');
  const panel = document.getElementById('account-panel');
  const loginIcon = button.querySelector('.login-icon');
  const avatar = document.getElementById('account-avatar');
  const fallback = document.getElementById('account-initial');
  const details = document.getElementById('account-details');
  const status = document.getElementById('account-status');
  const retry = document.getElementById('account-retry');
  const login = document.getElementById('account-login');
  let current = { status: 'loading' };
  let request = 0;

  function close(restoreFocus = false) {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button.focus();
  }

  function render() {
    const signedIn = current.status === 'signed-in';
    const account = current.account;
    button.title = i18n(signedIn ? 'accountDetails' : current.status === 'signed-out' ? 'loginToMubu' : 'accountStatus');
    button.setAttribute('aria-label', button.title);
    loginIcon.hidden = signedIn;
    avatar.hidden = true;
    fallback.hidden = !signedIn;
    details.hidden = !signedIn;
    status.hidden = signedIn;
    retry.hidden = current.status !== 'unavailable';
    login.hidden = current.status !== 'unavailable';
    button.classList.toggle('is-signed-in', signedIn);
    if (signedIn) {
      const nickname = account.nickname || i18n('accountUnnamed');
      fallback.textContent = Array.from(nickname)[0];
      document.getElementById('account-name').textContent = nickname;
      document.getElementById('account-membership').textContent = i18n(`accountMember_${account.membership}`);
      const expiry = document.getElementById('account-expiry');
      expiry.hidden = !account.expiresOn;
      expiry.textContent = account.expiresOn ? i18n('accountExpires', [account.expiresOn]) : '';
      avatar.removeAttribute('src');
      if (account.avatarUrl) avatar.src = account.avatarUrl;
    } else {
      avatar.removeAttribute('src');
      fallback.textContent = '';
      document.getElementById('account-name').textContent = '';
      status.textContent = i18n(current.status === 'unavailable' ? 'accountUnavailable' : 'accountLoading');
      if (current.status === 'signed-out') close();
    }
  }

  async function refresh() {
    const version = ++request;
    current = { status: 'loading' };
    render();
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getAccountInfo' });
      if (version !== request) return;
      current = response || { status: 'unavailable' };
    } catch {
      if (version !== request) return;
      current = { status: 'unavailable' };
    }
    render();
  }

  avatar.addEventListener('load', () => {
    if (current.status !== 'signed-in' || !avatar.getAttribute('src')) return;
    avatar.hidden = false;
    fallback.hidden = true;
  });
  avatar.addEventListener('error', () => {
    avatar.hidden = true;
    fallback.hidden = current.status !== 'signed-in';
  });
  const openLogin = () => chrome.tabs.create({ url: 'https://mubu.com/login' });
  button.addEventListener('click', () => {
    if (current.status === 'signed-out') return openLogin();
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) panel.focus();
  });
  retry.addEventListener('click', refresh);
  login.addEventListener('click', openLogin);
  document.addEventListener('click', event => {
    if (!panel.contains(event.target) && !button.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      close(true);
    }
  });
  document.addEventListener('focusin', event => {
    if (!panel.contains(event.target) && !button.contains(event.target)) close();
  });
  const cookieChanged = ({ cookie }) => {
    if (ACCOUNT_COOKIE_NAMES.includes(cookie.name) && /(^|\.)mubu\.com$/.test(cookie.domain)) refresh();
  };
  chrome.cookies.onChanged?.addListener(cookieChanged);
  window.addEventListener('unload', () => chrome.cookies.onChanged?.removeListener(cookieChanged), { once: true });
  refresh();
}
