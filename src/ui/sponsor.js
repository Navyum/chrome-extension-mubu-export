import { domRefs } from './dom.js';
import { toggleSponsorModal } from './ui.js';

const MAX_HOVER_SHOWS_PER_DAY = 3;
let sponsorHoverTimeout = null;

export function initSponsorInteractions() {
  const { sponsorBtn, sponsorModalClose } = domRefs;

  if (sponsorBtn) {
    sponsorBtn.addEventListener('click', () => {
      clearSponsorHoverTimeout();
      toggleSponsorModal(true);
    });
    sponsorBtn.addEventListener('mouseenter', handleSponsorHoverEnter);
    sponsorBtn.addEventListener('mouseleave', handleSponsorHoverLeave);
  }

  if (sponsorModalClose) {
    sponsorModalClose.addEventListener('click', () => toggleSponsorModal(false));
  }
}

function handleSponsorHoverEnter() {
  clearSponsorHoverTimeout();
  if (!canShowHoverToday()) return;
  sponsorHoverTimeout = setTimeout(() => {
    if (!canShowHoverToday()) return;
    incrementHoverCount();
    toggleSponsorModal(true, { focusClose: false });
  }, 400);
}

function handleSponsorHoverLeave() {
  clearSponsorHoverTimeout();
}

function clearSponsorHoverTimeout() {
  if (sponsorHoverTimeout) {
    clearTimeout(sponsorHoverTimeout);
    sponsorHoverTimeout = null;
  }
}

function getTodayKey() {
  const d = new Date();
  return `sponsor_hover_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function getHoverCountToday() {
  try {
    const key = getTodayKey();
    const value = localStorage.getItem(key);
    return value ? parseInt(value, 10) : 0;
  } catch {
    return 0;
  }
}

function canShowHoverToday() {
  return getHoverCountToday() < MAX_HOVER_SHOWS_PER_DAY;
}

function incrementHoverCount() {
  try {
    const key = getTodayKey();
    localStorage.setItem(key, String(getHoverCountToday() + 1));

    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const currentKey = localStorage.key(i);
      if (currentKey && currentKey.startsWith('sponsor_hover_') && currentKey !== key) {
        localStorage.removeItem(currentKey);
      }
    }
  } catch {
    // Ignore storage failures in popup context.
  }
}
