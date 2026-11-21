import { state, t, api, esc, icon, applyLocale, refreshMe, setLocale } from './core.js';
import { homeView } from './views/home.js';
import { workspaceView } from './views/workspace.js';
import { projectView } from './views/project.js';
import { creationsView, discoverView, shareView } from './views/library.js';
import { modelsView } from './views/models.js';
import { adminView } from './views/admin.js';
import { accountView } from './views/account.js';
import { authView } from './views/auth.js';
import { editorView } from './views/editor.js';

const app = document.getElementById('app');

const ROUTES = [
  { re: /^\/?$/, nav: 'home', title: 'nav.home', view: homeView },
  { re: /^\/director$/, nav: 'director', title: 'nav.director', view: (root) => workspaceView(root, seedOptions('director')) },
  {
    re: /^\/create\/([\w-]+)$/,
    nav: 'studio',
    title: 'nav.studio',
    view: (root, match) =>
      match[1] === 'image_editor' ? editorView(root) : workspaceView(root, seedOptions(match[1])),
  },
  { re: /^\/project\/([\w-]+)$/, nav: 'creations', title: 'nav.creations', view: (root, match) => projectView(root, match[1]) },
  { re: /^\/creations$/, nav: 'creations', title: 'nav.creations', view: creationsView },
  { re: /^\/discover$/, nav: 'discover', title: 'nav.discover', view: discoverView },
  { re: /^\/models$/, nav: 'models', title: 'nav.models', view: modelsView },
  { re: /^\/admin$/, nav: 'admin', title: 'nav.admin', view: adminView },
  { re: /^\/account$/, nav: 'account', title: 'nav.account', view: accountView },
  { re: /^\/share\/([\w-]+)$/, bare: true, view: (root, match) => shareView(root, match[1]) },
];

function seedOptions(module) {
  let seed = {};
  try {
    seed = JSON.parse(sessionStorage.getItem('nova_seed') || '{}');
  } catch {
    seed = {};
  }
  sessionStorage.removeItem('nova_seed');
  return {
    module,
    brief: seed.brief || '',
    style: seed.style,
    aspect: seed.aspect,
    duration: seed.duration,
  };
}

function navItems() {
  const items = [
    ['home', '#/', 'home', 'nav.home'],
    ['director', '#/director', 'sparkles', 'nav.director'],
    ['studio', '#/create/text_to_video', 'film', 'nav.studio'],
    ['creations', '#/creations', 'grid', 'nav.creations'],
    ['discover', '#/discover', 'compass', 'nav.discover'],
    ['models', '#/models', 'cpu', 'nav.models'],
  ];
  if (state.user?.role === 'admin') items.push(['admin', '#/admin', 'shield', 'nav.admin']);
  items.push(['account', '#/account', 'settings', 'nav.account']);
  return items;
}

function titleFor(route, match) {
  if (route.re.source.includes('create') && match?.[1]) {
    const mod = (state.meta?.modules || []).find((m) => m.id === match[1]);
    if (mod) return mod.name[state.locale] || mod.name.en;
  }
  return t(route.title || 'nav.home');
}

function shellHTML(route, match) {
  const title = titleFor(route, match);
  const subtitle =
    route.nav === 'studio'
      ? t('studio.sub')
      : route.nav === 'home'
        ? t('home.kicker')
        : t('share.made_with');
  const user = state.user;
  const initial = (user?.name || 'N').trim().charAt(0).toUpperCase();
  const planName = state.plan ? (state.locale === 'ar' ? state.plan.name_ar : state.plan.name_en) : t('common.free');
  return `
    <div class="shell">
      <aside class="sidebar" id="sidebar">
        <a class="brand" href="#/">
          <span class="brand-mark">N</span>
          <span class="brand-text"><b>NOVA</b><small>VIDEO AGENT ULTRA</small></span>
        </a>
        <nav class="nav-group" aria-label="Main">
          <div class="nav-label">${esc(t('nav.home'))}</div>
          ${navItems()
            .slice(0, 6)
            .map(
              ([id, href, ic, label]) => `<a class="nav-item ${route.nav === id ? 'active' : ''}" href="${href}">${icon(ic)}<span>${esc(t(label))}</span></a>`,
            )
            .join('')}
        </nav>
        <nav class="nav-group" aria-label="Workspace">
          <div class="nav-label">${esc(t('nav.account'))}</div>
          ${navItems()
            .slice(6)
            .map(
              ([id, href, ic, label]) => `<a class="nav-item ${route.nav === id ? 'active' : ''}" href="${href}">${icon(ic)}<span>${esc(t(label))}</span>${id === 'admin' ? '<span class="nav-badge">ADMIN</span>' : ''}</a>`,
            )
            .join('')}
        </nav>
        <div class="sidebar-foot">
          <div class="plan-chip">
            <b>${esc(planName)}</b>
            <span>${user?.credits ?? 0} ${esc(t('common.credits'))}</span>
          </div>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="menu-btn" id="menuBtn" aria-label="${esc(t('nav.menu'))}">${icon('menu')}</button>
          <div class="topbar-left">
            <h1 class="page-title">${esc(title)}</h1>
            <p class="page-sub">${esc(subtitle)}</p>
          </div>
          <div class="topbar-right">
            <a class="credits-pill" href="#/account">${icon('zap')}${user?.credits ?? 0} ${esc(t('common.credits'))}</a>
            <button class="lang-toggle" id="langBtn">${state.locale === 'en' ? 'ع' : 'EN'}</button>
            <button class="avatar-btn" id="avatarBtn" aria-label="${esc(t('nav.account'))}">${esc(initial)}</button>
          </div>
          <div class="user-menu" id="userMenu">
            <div class="who"><b>${esc(user?.name || '')}</b><span>${esc(user?.email || '')}</span></div>
            <a href="#/account">${icon('settings')}${esc(t('nav.account'))}</a>
            ${user?.role === 'admin' ? `<a href="#/admin">${icon('shield')}${esc(t('nav.admin'))}</a>` : ''}
            <a href="#/models">${icon('cpu')}${esc(t('nav.models'))}</a>
            <button id="signOutBtn">${icon('logout')}${esc(t('nav.signout'))}</button>
          </div>
        </header>
        <main class="view" id="view"></main>
      </div>
    </div>`;
}

function bindShell() {
  const sidebar = document.getElementById('sidebar');
  const menu = document.getElementById('userMenu');

  document.getElementById('menuBtn')?.addEventListener('click', () => sidebar?.classList.toggle('open'));
  document.getElementById('avatarBtn')?.addEventListener('click', () => menu?.classList.toggle('open'));
  document.getElementById('langBtn')?.addEventListener('click', () => setLocale(state.locale === 'en' ? 'ar' : 'en'));

  document.querySelectorAll('.nav-item').forEach((link) => {
    link.addEventListener('click', () => sidebar?.classList.remove('open'));
  });

  document.getElementById('signOutBtn')?.addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    state.user = null;
    state.plan = null;
    render();
  });
}

function renderNotFound() {
  app.innerHTML = `<div class="view"><div class="empty" style="margin-top:60px">${icon('alert')}<h3>404</h3><p>${esc(t('common.error'))}</p><a class="btn primary" href="#/" style="margin-top:16px">${esc(t('share.back_home'))}</a></div></div>`;
}

function render() {
  const path = location.hash.replace(/^#/, '') || '/';
  const found = ROUTES.map((route) => ({ route, match: path.match(route.re) })).find((item) => item.match);
  if (!found) return renderNotFound();
  const { route, match } = found;

  if (route.bare) {
    app.innerHTML = `<main class="share-page" id="view"></main>`;
    route.view(document.getElementById('view'), match);
    return;
  }

  if (!state.user) {
    authView(app, async () => {
      await refreshMe().catch(() => {});
      render();
    });
    return;
  }

  app.innerHTML = shellHTML(route, match);
  bindShell();
  route.view(document.getElementById('view'), match);
}

async function boot() {
  applyLocale();
  try {
    state.meta = await api('/api/meta');
  } catch {
    state.meta = { modules: [], styles: [], aspects: ['16:9'] };
  }
  await refreshMe().catch(() => {});
  state.booted = true;
  if (!location.hash) location.hash = '#/';
  render();

  window.addEventListener('hashchange', render);
  window.addEventListener('nova:locale', () => {
    if (state.user) render();
  });
  window.addEventListener('nova:refresh', async () => {
    await refreshMe().catch(() => {});
    render();
  });

  document.addEventListener('click', (event) => {
    const menu = document.getElementById('userMenu');
    if (!menu) return;
    if (event.target.closest('#avatarBtn') || event.target.closest('#userMenu')) return;
    menu.classList.remove('open');
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

boot();
