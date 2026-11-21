import { state, t, api, esc, icon, fmtNum, fmtDateTime, statusPill, toast, confirmDialog, providerBadge } from '../core.js';

export function adminView(root) {
  if (state.user?.role !== 'admin') {
    root.innerHTML = `<div class="empty" style="margin-top:60px">${icon('shield')}<h3>${esc(t('admin.access_denied'))}</h3><p>${esc(t('common.error'))}</p></div>`;
    return;
  }

  const tabs = [
    ['overview', t('admin.overview'), 'grid'],
    ['users', t('admin.users'), 'users'],
    ['providers', t('admin.providers'), 'cpu'],
    ['jobs', t('admin.jobs'), 'activity'],
    ['plans', t('admin.plans'), 'layers'],
    ['health', t('admin.health'), 'database'],
  ];
  let active = 'overview';

  root.innerHTML = `
    <div class="section-head">
      <div><h2>${esc(t('admin.title'))}</h2><p class="sub">${esc(t('admin.sub'))}</p></div>
      <button class="btn sm ghost" id="refreshTab">${icon('refresh')}${esc(t('common.refresh'))}</button>
    </div>
    <div class="tabs" id="adminTabs">
      ${tabs.map(([id, label, ic]) => `<button class="tab ${id === active ? 'active' : ''}" data-tab="${id}">${icon(ic)}${esc(label)}</button>`).join('')}
    </div>
    <div id="tabBody"><div class="skeleton" style="height:320px"></div></div>`;

  const body = root.querySelector('#tabBody');

  root.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      active = btn.dataset.tab;
      root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      load();
    });
  });
  root.querySelector('#refreshTab').addEventListener('click', load);

  async function load() {
    body.innerHTML = `<div class="skeleton" style="height:320px"></div>`;
    try {
      if (active === 'overview') await overview();
      else if (active === 'users') await users();
      else if (active === 'providers') await providers();
      else if (active === 'jobs') await jobs('');
      else if (active === 'plans') await plans();
      else await health();
    } catch (err) {
      body.innerHTML = `<div class="empty">${icon('alert')}<h3>${esc(t('common.error'))}</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  async function overview() {
    const data = await api('/api/admin/overview');
    const s = data.stats;
    body.innerHTML = `
      <div class="stat-grid">
        <div class="stat"><span>${esc(t('admin.stat_users'))}</span><b>${fmtNum(s.users)}</b></div>
        <div class="stat"><span>${esc(t('admin.stat_projects'))}</span><b>${fmtNum(s.projects)}</b></div>
        <div class="stat"><span>${esc(t('admin.stat_jobs'))}</span><b>${fmtNum(s.jobs)}</b></div>
        <div class="stat"><span>${esc(t('admin.stat_credits'))}</span><b>${fmtNum(s.credits_spent)}</b></div>
        <div class="stat"><span>${esc(t('admin.stat_success'))}</span><b class="ok">${fmtNum(s.succeeded)}</b></div>
        <div class="stat"><span>${esc(t('admin.stat_failed'))}</span><b class="${s.failed ? 'bad' : ''}">${fmtNum(s.failed)}</b></div>
        <div class="stat"><span>${esc(t('admin.stat_public'))}</span><b>${fmtNum(s.public_creations)}</b></div>
        <div class="stat"><span>${esc(t('common.credits'))}</span><b>${fmtNum(s.credits_outstanding)}</b></div>
      </div>
      <div class="section">
        <div class="panel-head"><h2>${icon('activity')}${esc(t('admin.recent_jobs'))}</h2></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>${esc(t('common.created'))}</th><th>${esc(t('common.status'))}</th><th>${esc(t('common.provider'))}</th><th>${esc(t('common.model'))}</th><th>${esc(t('common.error'))}</th></tr></thead>
            <tbody>
              ${(data.recentJobs || []).length
                ? data.recentJobs
                    .map(
                      (j) => `<tr><td class="nowrap">${esc(fmtDateTime(j.created_at))}</td><td>${statusPill(j.status)}</td><td>${esc(j.provider_id)}</td><td>${esc(j.model_id)}</td><td class="small">${esc(j.error || '—')}</td></tr>`,
                    )
                    .join('')
                : `<tr><td colspan="5" class="dim">${esc(t('admin.jobs_empty'))}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
      <div class="section">
        <div class="panel-head"><h2>${icon('cpu')}${esc(t('admin.providers'))}</h2></div>
        <div class="provider-strip">
          ${(data.providers || [])
            .map(
              (p) => `<div class="provider-chip ${!p.requiresKey || p.verified ? 'ready' : p.configured ? 'pending' : ''}">
                <span class="dot"></span><b>${esc(p.name)}</b>
                <span class="state">${esc(!p.requiresKey ? t('home.local_ready') : p.verified ? t('common.verified') : p.configured ? t('home.unverified') : t('home.no_key'))}</span>
              </div>`,
            )
            .join('')}
        </div>
      </div>`;
  }

  async function users() {
    const [{ users: list }, { plans: planList }] = await Promise.all([
      api('/api/admin/users'),
      api('/api/admin/plans'),
    ]);
    body.innerHTML = `
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th>${esc(t('auth.name'))}</th><th>${esc(t('common.plan'))}</th><th>${esc(t('admin.credits_label'))}</th>
            <th>${esc(t('admin.role'))}</th><th>${esc(t('common.status'))}</th><th>${esc(t('common.actions'))}</th>
          </tr></thead>
          <tbody>
            ${list.length
              ? list
                  .map(
                    (u) => `<tr data-user="${esc(u.id)}">
                      <td><b>${esc(u.name)}</b><br><span class="tiny dim">${esc(u.email)}</span><br><span class="tiny dim">${fmtNum(u.projects)} projects · ${fmtNum(u.jobs)} jobs</span></td>
                      <td><select data-plan style="width:110px">${planList.map((p) => `<option value="${esc(p.id)}" ${u.plan_id === p.id ? 'selected' : ''}>${esc(p.id)}</option>`).join('')}</select></td>
                      <td><input type="number" min="0" step="1" value="${u.credits}" data-credits style="width:90px"></td>
                      <td><select data-role style="width:100px"><option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option></select></td>
                      <td>${u.status === 'active' ? `<span class="pill ok"><i></i>${esc(t('common.enabled'))}</span>` : `<span class="pill bad"><i></i>${esc(t('common.disabled'))}</span>`}</td>
                      <td class="nowrap"><button class="btn sm" data-save>${esc(t('common.save'))}</button> <button class="btn sm ghost" data-toggle-status>${esc(u.status === 'active' ? t('admin.suspend') : t('admin.activate'))}</button></td>
                    </tr>`,
                  )
                  .join('')
              : `<tr><td colspan="6" class="dim">${esc(t('admin.no_users'))}</td></tr>`}
          </tbody>
        </table>
      </div>`;

    body.querySelectorAll('tr[data-user]').forEach((row) => {
      const id = row.dataset.user;
      row.querySelector('[data-save]')?.addEventListener('click', async () => {
        try {
          await api(`/api/admin/users/${id}`, {
            method: 'PATCH',
            body: {
              credits: Number(row.querySelector('[data-credits]').value),
              planId: row.querySelector('[data-plan]').value,
              role: row.querySelector('[data-role]').value,
            },
          });
          toast(t('admin.user_saved'), 'ok');
        } catch (err) {
          toast(err.message, 'bad');
        }
      });
      row.querySelector('[data-toggle-status]')?.addEventListener('click', async () => {
        try {
          const current = row.querySelector('[data-toggle-status]').textContent.trim();
          const status = current === t('admin.suspend') ? 'suspended' : 'active';
          await api(`/api/admin/users/${id}`, { method: 'PATCH', body: { status } });
          toast(t('admin.user_saved'), 'ok');
          load();
        } catch (err) {
          toast(err.message, 'bad');
        }
      });
    });
  }

  async function providers() {
    const { providers: list } = await api('/api/admin/providers');
    body.innerHTML = `
      <p class="small dim" style="margin-bottom:14px">${esc(t('admin.provider_hint'))}</p>
      ${list
        .map(
          (p) => `<section class="provider-admin" data-provider="${esc(p.id)}">
            <div class="top">
              <div>
                <h3>${esc(p.name)}</h3>
                <div class="vendor">${esc(p.vendor)} · ${p.models.length} models · ${esc(p.tasks.map((x) => t(`models.${x}`)).join(' · '))}</div>
              </div>
              <div class="row">${providerBadge(p)}${p.requiresKey ? `<button class="btn sm ghost" data-toggle>${esc(p.enabled ? t('common.disabled') : t('common.enabled'))}</button>` : ''}</div>
            </div>
            <p class="note">${esc(p.summary[state.locale] || p.summary.en)}</p>
            ${p.keySource ? `<p class="note">${esc(p.keySource === 'env' ? t('admin.key_from_env') : t('admin.key_from_dashboard'))}</p>` : ''}
            ${p.requiresKey
              ? `<div class="key-row">
                  ${p.keyFields
                    .map(
                      (f) => `<input type="password" placeholder="${esc(f.label)}" data-key-field="${esc(f.name)}" autocomplete="off" value="">`,
                    )
                    .join('')}
                  <button class="btn sm" data-save-key>${esc(t('common.saveKey'))}</button>
                  <button class="btn sm ghost" data-test>${esc(t('common.testConnection'))}</button>
                  ${p.configured && p.keySource === 'dashboard' ? `<button class="btn sm danger" data-remove-key>${esc(t('common.removeKey'))}</button>` : ''}
                </div>
                <div data-test-result>${p.lastTestError ? `<div class="test-result bad">${esc(p.lastTestError)}</div>` : p.verified ? `<div class="test-result ok">${esc(t('admin.test_ok'))}</div>` : ''}</div>`
              : `<p class="note">${esc(t('models.no_key_needed'))}</p>`}
          </section>`,
        )
        .join('')}`;

    body.querySelectorAll('[data-provider]').forEach((card) => {
      const id = card.dataset.provider;
      card.querySelector('[data-save-key]')?.addEventListener('click', async () => {
        const payload = {};
        card.querySelectorAll('[data-key-field]').forEach((input) => {
          payload[input.dataset.keyField] = input.value;
        });
        try {
          const res = await api(`/api/admin/providers/${id}/key`, { method: 'POST', body: payload });
          toast(res.message || t('admin.key_saved'), 'ok');
          load();
        } catch (err) {
          toast(err.message, 'bad');
        }
      });

      card.querySelector('[data-test]')?.addEventListener('click', async () => {
        const resultEl = card.querySelector('[data-test-result]');
        if (resultEl) resultEl.innerHTML = `<div class="test-result ok"><span class="spinner"></span> ${esc(t('common.testing'))}</div>`;
        try {
          const res = await api(`/api/admin/providers/${id}/test`, { method: 'POST' });
          if (resultEl) {
            resultEl.innerHTML = res.ok
              ? `<div class="test-result ok">${esc(res.detail || t('admin.test_ok'))}</div>`
              : `<div class="test-result bad">${esc(res.error || t('admin.test_fail'))}</div>`;
          }
          if (res.ok) toast(t('admin.test_ok'), 'ok');
        } catch (err) {
          if (resultEl) resultEl.innerHTML = `<div class="test-result bad">${esc(err.message)}</div>`;
          toast(err.message, 'bad');
        }
      });

      card.querySelector('[data-toggle]')?.addEventListener('click', async () => {
        const enabled = card.querySelector('[data-toggle]').textContent.trim() === t('common.disabled') ? false : true;
        try {
          await api(`/api/admin/providers/${id}`, { method: 'PATCH', body: { enabled } });
          toast(enabled ? t('common.enabled') : t('admin.provider_disabled'), 'ok');
          load();
        } catch (err) {
          toast(err.message, 'bad');
        }
      });

      card.querySelector('[data-remove-key]')?.addEventListener('click', async () => {
        const ok = await confirmDialog(t('admin.remove_key_confirm'));
        if (!ok) return;
        try {
          await api(`/api/admin/providers/${id}/key`, { method: 'DELETE' });
          toast(t('common.success'), 'ok');
          load();
        } catch (err) {
          toast(err.message, 'bad');
        }
      });
    });
  }

  async function jobs(filter) {
    const { jobs: list } = await api(`/api/admin/jobs${filter ? `?status=${filter}` : ''}`);
    body.innerHTML = `
      <div class="filters">
        <button class="chip ${filter === '' ? 'active' : ''}" data-job-filter="">${esc(t('admin.all_jobs'))}</button>
        <button class="chip ${filter === 'failed' ? 'active' : ''}" data-job-filter="failed">${esc(t('admin.failed_jobs'))}</button>
        <button class="chip ${filter === 'running' ? 'active' : ''}" data-job-filter="running">${esc(t('common.generating'))}</button>
        <button class="chip ${filter === 'succeeded' ? 'active' : ''}" data-job-filter="succeeded">${esc(t('common.succeeded'))}</button>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>${esc(t('common.created'))}</th><th>${esc(t('auth.email'))}</th><th>${esc(t('nav.creations'))}</th><th>${esc(t('common.provider'))}</th><th>${esc(t('common.status'))}</th><th>${esc(t('common.credits'))}</th><th>${esc(t('common.error'))}</th><th></th></tr></thead>
          <tbody>
            ${list.length
              ? list
                  .map(
                    (j) => `<tr>
                      <td class="nowrap">${esc(fmtDateTime(j.createdAt))}</td>
                      <td>${esc(j.email || '')}</td>
                      <td>${esc(j.projectTitle || '')}</td>
                      <td>${esc(j.providerId)}<br><span class="tiny dim">${esc(j.modelId)}</span></td>
                      <td>${statusPill(j.status)}</td>
                      <td>${fmtNum(j.creditsCharged)}${j.refunded ? ` <span class="tiny dim">(${esc(t('job.refunded'))})</span>` : ''}</td>
                      <td class="small">${esc(j.error || '—')}</td>
                      <td>${j.status === 'failed' ? `<button class="btn sm ghost" data-retry-job="${esc(j.id)}">${icon('refresh')}</button>` : ''}</td>
                    </tr>`,
                  )
                  .join('')
              : `<tr><td colspan="8" class="dim">${esc(t('admin.jobs_empty'))}</td></tr>`}
          </tbody>
        </table>
      </div>`;

    body.querySelectorAll('[data-job-filter]').forEach((btn) => {
      btn.addEventListener('click', () => jobs(btn.dataset.jobFilter));
    });
    body.querySelectorAll('[data-retry-job]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api(`/api/admin/jobs/${btn.dataset.retryJob}/retry`, { method: 'POST' });
          toast(t('common.success'), 'ok');
          jobs(filter);
        } catch (err) {
          toast(err.message, 'bad');
        }
      });
    });
  }

  async function plans() {
    const { plans: list } = await api('/api/admin/plans');
    body.innerHTML = `
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>${esc(t('common.plan'))}</th><th>${esc(t('admin.plan_credits'))}</th><th>${esc(t('admin.plan_price'))}</th><th>${esc(t('admin.plan_active'))}</th><th></th></tr></thead>
          <tbody>
            ${list
              .map(
                (p) => `<tr data-plan-row="${esc(p.id)}">
                  <td><b>${esc(p.name_en)}</b><br><span class="tiny dim">${esc(p.id)}</span></td>
                  <td><input type="number" min="0" value="${p.monthly_credits}" data-plan-credits style="width:110px"></td>
                  <td><input type="number" min="0" value="${p.price_cents}" data-plan-price style="width:110px"></td>
                  <td><select data-plan-active style="width:100px"><option value="true" ${p.active ? 'selected' : ''}>${esc(t('common.yes'))}</option><option value="false" ${!p.active ? 'selected' : ''}>${esc(t('common.no'))}</option></select></td>
                  <td><button class="btn sm" data-plan-save>${esc(t('common.save'))}</button></td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <p class="tiny dim" style="margin-top:12px">${esc(t('account.billing_off'))}</p>`;

    body.querySelectorAll('[data-plan-row]').forEach((row) => {
      row.querySelector('[data-plan-save]').addEventListener('click', async () => {
        try {
          await api(`/api/admin/plans/${row.dataset.planRow}`, {
            method: 'PATCH',
            body: {
              monthlyCredits: Number(row.querySelector('[data-plan-credits]').value),
              priceCents: Number(row.querySelector('[data-plan-price]').value),
              active: row.querySelector('[data-plan-active]').value === 'true',
            },
          });
          toast(t('admin.plan_saved'), 'ok');
        } catch (err) {
          toast(err.message, 'bad');
        }
      });
    });
  }

  async function health() {
    const h = await api('/api/admin/health');
    body.innerHTML = `
      <div class="health-grid">
        <div class="health-card">${icon('database')}<div><b>${esc(t('admin.health_db'))}</b><span>${esc(h.db)}</span></div></div>
        <div class="health-card">${icon('activity')}<div><b>${esc(t('admin.health_worker'))}</b><span>${esc(h.worker)} · ${esc(h.lastTick || '—')}</span></div></div>
        <div class="health-card">${icon('film')}<div><b>${esc(t('admin.health_ffmpeg'))}</b><span>${h.ffmpeg ? 'ok' : 'missing'}</span></div></div>
      </div>
      <div class="card panel" style="margin-top:16px">
        <div class="panel-head"><h2>${icon('cpu')}${esc(t('admin.health'))}</h2></div>
        <div class="job-meta">
          <span>Node ${esc(h.node)}</span>
          <span>Uptime ${fmtNum(h.uptimeSec)}s</span>
          <span>${esc(t('admin.last_tick'))}: ${esc(h.lastTick || '—')}</span>
        </div>
        ${h.lastError ? `<div class="job-error">${esc(h.lastError)}</div>` : ''}
      </div>`;
  }

  load();
}
