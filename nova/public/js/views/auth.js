import { t, api, esc, icon, setLocale, state } from '../core.js';

export function authView(root, onDone) {
  let mode = 'login';
  let error = '';

  function render() {
    const isLogin = mode === 'login';
    root.innerHTML = `
      <div class="auth-wrap">
        <aside class="auth-visual">
          <div>
            <div class="brand"><span class="brand-mark">N</span><span class="brand-text"><b>NOVA</b><small>VIDEO AGENT ULTRA</small></span></div>
            <h2>${esc(t('home.title'))}</h2>
            <p>${esc(t('home.sub'))}</p>
            <div class="auth-features">
              <div class="auth-feature">${icon('sparkles')}<span>${esc(t('home.how_1_d'))}</span></div>
              <div class="auth-feature">${icon('layers')}<span>${esc(t('home.how_2_d'))}</span></div>
              <div class="auth-feature">${icon('film')}<span>${esc(t('home.how_3_d'))}</span></div>
            </div>
          </div>
          <p class="tiny dim">${esc(t('share.made_with'))}</p>
        </aside>
        <div class="auth-card-wrap">
          <div class="auth-card">
            <div class="spread" style="margin-bottom:20px">
              <span class="badge grad">${esc(t('home.kicker'))}</span>
              <button class="lang-toggle" id="authLang">${state.locale === 'en' ? 'ع' : 'EN'}</button>
            </div>
            <h1>${esc(isLogin ? t('auth.login_title') : t('auth.register_title'))}</h1>
            <p class="sub">${esc(isLogin ? t('auth.login_sub') : t('auth.register_sub'))}</p>
            <form id="authForm" novalidate>
              ${error ? `<div class="form-error">${esc(error)}</div>` : ''}
              ${!isLogin ? `<div class="field"><label for="name">${esc(t('auth.name'))}</label><input type="text" id="name" autocomplete="name" required></div>` : ''}
              <div class="field"><label for="email">${esc(t('auth.email'))}</label><input type="email" id="email" autocomplete="email" required></div>
              <div class="field"><label for="password">${esc(t('auth.password'))}</label><input type="password" id="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required></div>
              <button class="btn primary block" type="submit" style="margin-top:8px">${esc(isLogin ? t('auth.submit_login') : t('auth.submit_register'))}</button>
            </form>
            <div class="auth-switch">
              ${esc(isLogin ? t('auth.no_account') : t('auth.have_account'))}
              <a href="#" id="switchMode">${esc(isLogin ? t('auth.register_link') : t('auth.signin_link'))}</a>
            </div>
            ${!isLogin ? `<div class="auth-note">${esc(t('auth.first_admin_note'))}</div>` : ''}
          </div>
        </div>
      </div>`;

    root.querySelector('#authLang').addEventListener('click', () => {
      setLocale(state.locale === 'en' ? 'ar' : 'en');
      render();
    });

    root.querySelector('#switchMode').addEventListener('click', (e) => {
      e.preventDefault();
      mode = isLogin ? 'register' : 'login';
      error = '';
      render();
    });

    root.querySelector('#authForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = root.querySelector('#email').value.trim();
      const password = root.querySelector('#password').value;
      const name = root.querySelector('#name')?.value.trim();
      const button = event.target.querySelector('button[type="submit"]');
      button.disabled = true;
      button.innerHTML = `<span class="spinner"></span>${esc(t('common.loading'))}`;
      try {
        if (isLogin) {
          await api('/api/auth/login', { method: 'POST', body: { email, password } });
        } else {
          await api('/api/auth/register', { method: 'POST', body: { email, password, name, locale: state.locale } });
        }
        await onDone();
      } catch (err) {
        error = err.message;
        render();
      }
    });
  }

  render();
}
