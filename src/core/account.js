import { MUBU_API } from './constants.js';

// Current web client uses jwtToken; retain compatibility with older sessions.
export const ACCOUNT_COOKIE_NAMES = ['jwtToken', 'Jwt-Token', 'token'];
const AUTH_ERRORS = new Set([2, 1209, 10007, 20001]);

export function parseMembershipDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const date = new Date(value < 1e11 ? value * 1000 : value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4})[-/]?(\d{2})[-/]?(\d{2})$/.exec(value);
  if (parts) {
    const [, year, month, day] = parts.map(Number);
    const date = new Date(year, month - 1, day, 23, 59, 59, 999);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }
  const date = new Date(value.replace(/\//g, '-'));
  return Number.isFinite(date.getTime()) ? date : null;
}

export function normalizeAvatar(photo) {
  if (typeof photo !== 'string' || !photo.trim()) return '';
  try {
    // Mubu's getImageUrl prefixes relative photo paths with /v3.
    const path = photo.trim();
    const url = new URL(/^[a-z]+:/i.test(path) ? path : `https://api2.mubu.com/v3/${path.replace(/^\/+/, '')}`);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function normalizeAccount(profile, now = Date.now()) {
  if (!profile || !['string', 'number'].includes(typeof profile.id) || !String(profile.id).trim() || String(profile.id) === '0') {
    throw new Error('Invalid account profile');
  }
  const level = profile.level == null || profile.level === '' ? null : Number(profile.level);
  const vipEnd = parseMembershipDate(profile.vipEndDate);
  const maxEnd = parseMembershipDate(profile.maxEndDate);
  // Match the official client's MAX/VIP precedence and validity rules.
  const membership = level === 3 && maxEnd?.getTime() >= now ? 'max'
    : level === 2 || vipEnd?.getTime() >= now ? 'vip'
      : level === 0 || level === 1 || (level === 3 && maxEnd) ? 'free' : 'unknown';
  const expiry = membership === 'max' ? maxEnd : membership === 'vip' ? vipEnd : null;
  const expiresOn = expiry ? [expiry.getFullYear(), String(expiry.getMonth() + 1).padStart(2, '0'), String(expiry.getDate()).padStart(2, '0')].join('-') : '';
  return {
    nickname: typeof profile.name === 'string' ? profile.name.trim().slice(0, 200) : '',
    avatarUrl: normalizeAvatar(profile.photo),
    membership,
    expiresOn
  };
}

export async function getAccountInfo({ cookies = chrome.cookies, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  let timeout;
  const lookup = async () => {
    let token;
    for (const name of ACCOUNT_COOKIE_NAMES) {
      token = (await cookies.get({ url: MUBU_API.HOME_PAGE, name }))?.value;
      if (token) break;
    }
    if (!token) return { status: 'signed-out' };
    const response = await fetchImpl(MUBU_API.USER_PROFILE, {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'jwt-token': token },
      body: '{}', signal: controller.signal
    });
    if (response.status === 401) return { status: 'signed-out' };
    if (!response.ok) throw new Error('Profile request failed');
    const result = await response.json();
    if (AUTH_ERRORS.has(result.code)) return { status: 'signed-out' };
    if (result.code !== 0) throw new Error('Profile unavailable');
    return { status: 'signed-in', account: normalizeAccount(result.data) };
  };
  try {
    return await Promise.race([
      lookup(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => { controller.abort(); reject(new Error('Profile timeout')); }, timeoutMs);
      })
    ]);
  } catch {
    // Never pass tokens, raw profile fields or server error messages to the UI.
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timeout);
  }
}

export function registerAccountHandler() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.action !== 'getAccountInfo') return;
    getAccountInfo().then(sendResponse);
    return true;
  });
}
