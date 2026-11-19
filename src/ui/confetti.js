export function showConfetti({ count = 60, host = document.body } = {}) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelector('.confetti-container')?.remove();
  const colors = ['#8b5cf6', '#a78bfa', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#fbbf24'];
  const container = document.createElement('div');
  container.className = 'confetti-container';
  container.setAttribute('aria-hidden', 'true');
  host.appendChild(container);

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.width = `${6 + Math.random() * 6}px`;
    piece.style.height = `${6 + Math.random() * 6}px`;
    piece.style.animationDelay = `${Math.random()}s`;
    piece.style.animationDuration = `${3 + Math.random()}s`;
    container.appendChild(piece);
  }

  setTimeout(() => container.remove(), 5000);
}
