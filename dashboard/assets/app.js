// Shared utilities for VideoHost Pro Dashboard

const API_BASE = window.location.origin;

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (res.status === 401) {
    window.location.href = '/dashboard/login.html';
    throw new Error('Não autorizado');
  }
  if (res.headers.get('content-type')?.includes('text/csv')) return res.text();
  return res.json();
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDuration(sec) {
  if (!sec) return '0:00';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatNumber(n) {
  if (n === null || n === undefined) return '0';
  return Number(n).toLocaleString('pt-BR');
}

function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:8px';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function showModal(title, content) {
  closeModal();
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'app-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">${content}</div>
    </div>
  `;
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('show'), 10);
}

function closeModal() {
  const m = document.getElementById('app-modal');
  if (m) m.remove();
}

function debounce(fn, delay = 500) {
  let timer;
  return function (...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); };
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Copiado!')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('Copiado!');
  });
}

function getEmbedCode(videoId) {
  const host = window.location.origin;
  return `<script src="${host}/player/player.js"><\/script>\n<ecv-player video-id="${videoId}"></ecv-player>`;
}

function getSpeedCode(videoId) {
  const host = window.location.origin;
  return `<!-- No <head> -->\n<link rel="preconnect" href="${host}">\n<link rel="preload" href="${host}/player/player.js" as="script">\n<link rel="preload" href="${host}/api/player-config/${videoId}" as="fetch" crossorigin>\n\n<!-- No <body> -->\n<script src="${host}/player/player.js"><\/script>\n<ecv-player video-id="${videoId}"></ecv-player>`;
}

// Auth check
if (!window.location.pathname.includes('login.html')) {
  api('GET', '/api/auth/me').catch(() => {
    window.location.href = '/dashboard/login.html';
  });
}
