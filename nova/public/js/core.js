import { translate } from './i18n.js';

export const state = {
  user: null,
  plan: null,
  usage: null,
  providers: [],
  ledger: [],
  meta: null,
  locale: localStorage.getItem('nova_locale') || 'en',
  booted: false,
};

export function t(key, vars) {
  return translate(state.locale, key, vars);
}

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const options = { method, credentials: 'same-origin', headers: {} };
  if (form) {
    options.body = form;
  } else if (body !== undefined) {
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(path, options);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

export function navigate(path) {
  if (location.hash === `#${path}`) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = `#${path}`;
  }
}

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  sparkles: '<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.4l-1.8-4.9L5 9.7l5.2-1.8L12 3z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-4.5-4.5L7 21"/>',
  wand: '<path d="M15 4V2M15 10V8M11 6H9M21 6h-2M18.5 3.5l-1.4 1.4M18.5 8.5l-1.4-1.4M12.5 3.5l1.4 1.4"/><path d="m3 21 9-9 3 3-9 9H3v-3z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M14 8a4 4 0 0 1 0 8"/><path d="M17 5a8 8 0 0 1 0 14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-3.5 3.1-5.5 7-5.5s7 2 7 5.5"/><path d="M17 5.5a3 3 0 0 1 0 6M19 21c0-2.5-1-4-2.5-4.8"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2z"/>',
  cpu: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
  shield: '<path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M8 5v14l11-7-11-7z"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  heart: '<path d="M12 21s-8-4.7-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 11c0 5.3-8 10-8 10z"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  arrowRight: '<path d="M4 12h16"/><path d="m14 6 6 6-6 6"/>',
  arrowLeft: '<path d="M20 12H4"/><path d="m10 6-6 6 6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M4 4h16"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a1 1 0 0 0-1 1v9"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
  activity: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
  alert: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 9v5M12 17.5v.5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="m13 6 5 5"/>',
  spark: '<path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  send: '<path d="M4 12 21 4l-7 17-3-7-7-2z"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.spark}</svg>`;
}

export function fmtDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return new Intl.DateTimeFormat(state.locale === 'ar' ? 'ar-EG' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function fmtDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return new Intl.DateTimeFormat(state.locale === 'ar' ? 'ar-EG' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function fmtNum(value) {
  return new Intl.NumberFormat(state.locale === 'ar' ? 'ar-EG' : 'en-GB').format(Number(value) || 0);
}

export function fmtBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function statusLabel(status) {
  const map = {
    draft: 'common.draft',
    queued: 'common.queued',
    starting: 'common.queued',
    running: 'common.generating',
    ready: 'common.ready',
    succeeded: 'common.succeeded',
    failed: 'common.failed',
  };
  return t(map[status] || 'common.status');
}

export function statusPill(status) {
  const tone =
    status === 'ready' || status === 'succeeded'
      ? 'ok'
      : status === 'failed'
        ? 'bad'
        : status === 'running' || status === 'starting'
          ? 'live'
          : 'idle';
  return `<span class="pill ${tone}"><i></i>${esc(statusLabel(status))}</span>`;
}

export function toast(message, type = 'info') {
  const root = document.getElementById('toasts');
  if (!root) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `<span>${esc(message)}</span>`;
  root.appendChild(node);
  setTimeout(() => node.classList.add('out'), 3600);
  setTimeout(() => node.remove(), 4100);
}

export function confirmDialog(message, confirmLabel) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" role="presentation">
        <div class="modal card" role="dialog" aria-modal="true">
          <p class="modal-msg">${esc(message)}</p>
          <div class="modal-actions">
            <button class="btn ghost" data-answer="no">${esc(t('common.cancel'))}</button>
            <button class="btn danger" data-answer="yes">${esc(confirmLabel || t('common.delete'))}</button>
          </div>
        </div>
      </div>`;
    const close = (answer) => {
      root.innerHTML = '';
      resolve(answer);
    };
    root.querySelectorAll('[data-answer]').forEach((btn) => {
      btn.addEventListener('click', () => close(btn.dataset.answer === 'yes'));
    });
    root.querySelector('.modal-backdrop').addEventListener('click', (event) => {
      if (event.target === event.currentTarget) close(false);
    });
    root.querySelector('[data-answer="no"]').focus();
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('common.copied'), 'ok');
  } catch {
    toast('Copy failed — select the text manually.', 'bad');
  }
}

export async function refreshMe() {
  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
    state.plan = data.plan;
    state.usage = data.usage;
    state.ledger = data.ledger;
    state.providers = data.providers;
    return true;
  } catch (err) {
    if (err.status === 401) {
      state.user = null;
      state.plan = null;
      state.usage = null;
      state.ledger = [];
      return false;
    }
    throw err;
  }
}

export function applyLocale() {
  document.documentElement.lang = state.locale;
  document.documentElement.dir = state.locale === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.classList.toggle('rtl', state.locale === 'ar');
  localStorage.setItem('nova_locale', state.locale);
}

export async function setLocale(locale) {
  state.locale = locale === 'ar' ? 'ar' : 'en';
  applyLocale();
  if (state.user) {
    api('/api/auth/profile', { method: 'PATCH', body: { locale: state.locale } }).catch(() => {});
  }
  window.dispatchEvent(new CustomEvent('nova:locale'));
}

export function coverUrl(project) {
  if (!project?.coverAssetId) return null;
  return project.coverKind === 'image'
    ? `/api/assets/${project.coverAssetId}`
    : `/api/assets/${project.coverAssetId}/poster`;
}

export function aspectClass(aspect) {
  return aspect === '9:16' ? 'portrait' : aspect === '1:1' ? 'square' : 'landscape';
}

export function providerBadge(provider) {
  if (!provider.requiresKey) return `<span class="pill ok"><i></i>${esc(t('home.local_ready'))}</span>`;
  if (provider.verified) return `<span class="pill ok"><i></i>${esc(t('home.verified_ready'))}</span>`;
  if (provider.configured) return `<span class="pill warn"><i></i>${esc(t('home.unverified'))}</span>`;
  return `<span class="pill idle"><i></i>${esc(t('home.no_key'))}</span>`;
}

export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
