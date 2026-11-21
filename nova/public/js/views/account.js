import { state, t, api, esc, icon, fmtDate, fmtNum, toast, setLocale, confirmDialog, refreshMe } from '../core.js';

export function accountView(root) {
  const lang = state.locale;
  const user = state.user;
  let plans = [];

  root.innerHTML = `
    <div class="section-head">
      <div><h2>${esc(t('account.title'))}</h2><p class="sub">${esc(t('account.sub'))}</p></div>
      <button class="btn sm danger" id="signOut">${icon('logout')}${esc(t('nav.signout'))}</button>
    </div>
    <div class="two-col">
      <section class="card panel">
        <div class="panel-head"><h2>${icon('user')}${esc(t('account.profile'))}</h2>${user.role === 'admin' ? `<span class="badge grad">admin</span>` : ''}</div>
        <div class="stack">
          <div class="field"><label>${esc(t('account.name'))}</label><input type="text" id="nameInput" value="${esc(user.name)}"></div>
          <div class="field"><label>${esc(t('account.email'))}</label><input type="email" value="${esc(user.email)}" disabled></div>
          <div class="field"><label>${esc(t('account.language'))}</label>
            <select id="localeSel"><option value="en" ${lang === 'en' ? 'selected' : ''}>English</option><option value="ar" ${lang === 'ar' ? 'selected' : ''}>العربية</option></select>
          </div>
          <button class="btn primary" id="saveProfile">${esc(t('account.save_profile'))}</button>
        </div>
        <div class="divider"></div>
        <div class="panel-head"><h2>${icon('key')}${esc(t('account.password'))}</h2></div>
        <div class="stack">
          <div class="field"><label>${esc(t('account.current_password'))}</label><input type="password" id="curPass" autocomplete="current-password"></div>
          <div class="field"><label>${esc(t('account.new_password'))}</label><input type="password" id="newPass" autocomplete="new-password"></div>
          <button class="btn" id="savePass">${esc(t('account.update_password'))}</button>
        </div>
      </section>
      <div class="stack">
        <section class="card panel">
          <div class="panel-head"><h2>${icon('zap')}${esc(t('account.plan_title'))}</h2><span class="badge grad">${fmtNum(user.credits)} ${esc(t('common.credits'))}</span></div>
          <p class="small dim">${esc(t('account.plan_sub'))}</p>
          <div id="planList" class="stack" style="margin-top:14px"></div>
          <p class="tiny dim" style="margin-top:12px">${esc(t('account.billing_off'))}</p>
        </section>
        <section class="card panel">
          <div class="panel-head"><h2>${icon('activity')}${esc(t('account.credits_title'))}</h2></div>
          <p class="small dim">${esc(t('account.credits_sub'))}</p>
          <div id="ledgerList" class="ledger" style="margin-top:10px"></div>
        </section>
      </div>
    </div>`;

  function renderPlans() {
    const list = root.querySelector('#planList');
    list.innerHTML = plans.length
      ? plans
          .map(
            (plan) => `<div class="plan-card-item ${plan.id === user.planId ? 'current' : ''}">
              <div class="spread"><b>${esc(lang === 'ar' ? plan.name_ar : plan.name_en)}</b><span class="price">${plan.price_cents === 0 ? esc(t('common.free')) : `$${(plan.price_cents / 100).toFixed(0)}`}</span></div>
              <span class="tiny dim">${fmtNum(plan.monthly_credits)} ${esc(t('common.credits'))} / ${esc(t('common.plan'))}</span>
              <ul>${(plan.features?.[lang] || plan.features?.en || []).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
              ${plan.id === user.planId ? `<span class="badge grad">${esc(t('common.plan'))}</span>` : ''}
            </div>`,
          )
          .join('')
      : `<p class="small dim">${esc(t('common.loading'))}</p>`;
  }

  function renderLedger() {
    const list = root.querySelector('#ledgerList');
    const rows = state.ledger || [];
    if (!rows.length) {
      list.innerHTML = `<p class="small dim">${esc(t('account.ledger_empty'))}</p>`;
      return;
    }
    list.innerHTML = rows
      .map(
        (row) => `<div class="ledger-row">
          <div><b class="small">${esc(row.reason.replaceAll('_', ' '))}</b><div class="reason">${esc(fmtDate(row.created_at))}${row.ref ? ` · ${esc(String(row.ref).slice(0, 40))}` : ''}</div></div>
          <span class="delta ${row.delta > 0 ? 'plus' : 'minus'}">${row.delta > 0 ? '+' : ''}${fmtNum(row.delta)}</span>
        </div>`,
      )
      .join('');
  }

  api('/api/plans')
    .then((data) => {
      plans = data.plans || [];
      renderPlans();
    })
    .catch(() => {});
  renderLedger();

  root.querySelector('#saveProfile').addEventListener('click', async () => {
    try {
      const name = root.querySelector('#nameInput').value.trim();
      const locale = root.querySelector('#localeSel').value;
      await api('/api/auth/profile', { method: 'PATCH', body: { name, locale } });
      await refreshMe();
      toast(t('account.profile_saved'), 'ok');
      if (locale !== state.locale) setLocale(locale);
    } catch (err) {
      toast(err.message, 'bad');
    }
  });

  root.querySelector('#savePass').addEventListener('click', async () => {
    try {
      const currentPassword = root.querySelector('#curPass').value;
      const newPassword = root.querySelector('#newPass').value;
      await api('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
      toast(t('account.password_saved'), 'ok');
      window.dispatchEvent(new CustomEvent('nova:refresh'));
    } catch (err) {
      toast(err.message, 'bad');
    }
  });

  root.querySelector('#signOut').addEventListener('click', async () => {
    const ok = await confirmDialog(t('account.signout_confirm'), t('nav.signout'));
    if (!ok) return;
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.dispatchEvent(new CustomEvent('nova:refresh'));
  });
}
