import { state, t, api, esc, icon, fmtNum, navigate } from '../core.js';

export function modelsView(root) {
  const lang = state.locale;
  root.innerHTML = `
    <div class="section-head">
      <div><h2>${esc(t('models.title'))}</h2><p class="sub">${esc(t('models.sub'))}</p></div>
    </div>
    <div id="modelGrid" class="model-grid"><div class="skeleton" style="height:260px"></div><div class="skeleton" style="height:260px"></div></div>`;

  api('/api/models')
    .then(({ providers }) => {
      const grid = root.querySelector('#modelGrid');
      grid.innerHTML = providers
        .map((p) => {
          const status = !p.requiresKey
            ? `<span class="pill ok"><i></i>${esc(t('models.ready'))}</span>`
            : p.verified
              ? `<span class="pill ok"><i></i>${esc(t('common.verified'))}</span>`
              : p.configured
                ? `<span class="pill warn"><i></i>${esc(t('models.unverified'))}</span>`
                : `<span class="pill idle"><i></i>${esc(t('models.needs_key'))}</span>`;
          const taskNames = p.tasks.map((task) => t(`models.${task}`)).join(' · ');
          return `<section class="model-card">
            <div class="head">
              <div><h3>${esc(p.name)}</h3><div class="vendor">${esc(p.vendor)}${p.enabled ? '' : ` · ${esc(t('common.disabled'))}`}</div></div>
              ${status}
            </div>
            <p class="summary">${esc(p.summary[lang] || p.summary.en)}</p>
            <div class="row wrap" style="gap:6px;margin-bottom:12px">
              <span class="badge">${esc(taskNames)}</span>
              <span class="badge ${p.requiresKey ? '' : 'grad'}">${esc(p.requiresKey ? t('models.key_required') : t('models.no_key_needed'))}</span>
            </div>
            <table class="model-table">
              <thead><tr><th>${esc(t('common.model'))}</th><th>${esc(t('common.cost'))}</th><th>${esc(t('models.limits'))}</th></tr></thead>
              <tbody>
                ${p.models
                  .map(
                    (m) => `<tr>
                      <td><b>${esc(m.name)}</b><br><span class="tiny dim">${esc(m.tasks.map((x) => t(`models.${x}`)).join(' · '))}</span></td>
                      <td class="nowrap">${fmtNum(m.cost)}</td>
                      <td><span class="tiny">${m.durations.length ? `${m.durations.join('/')}s` : '—'} · ${esc(m.resolutions.join('/'))} · ${esc(m.aspects.join(' '))}</span></td>
                    </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>
            <div class="limits">
              <span>${esc(t('models.aspect_limits'))}: ${esc(p.aspects.join(' '))}</span>
              <span>${esc(t('models.duration_limits'))}: ${p.durations.length ? p.durations.join('/') + 's' : '—'}</span>
              <span>${esc(t('models.resolution_limits'))}: ${esc(p.resolutions.join(' / '))}</span>
            </div>
            <div class="result-actions">
              <a class="btn sm ghost" href="${esc(p.docs)}" target="_blank" rel="noopener">${icon('link')}${esc(t('models.docs'))}</a>
              ${p.id !== 'local'
                ? `<button class="btn sm" data-use="${esc(p.id)}">${icon('sparkles')}${esc(t('models.use_model'))}</button>`
                : `<a class="btn sm" href="#/create/text_to_video">${icon('sparkles')}${esc(t('models.use_model'))}</a>`}
              ${p.requiresKey && !p.verified ? `<span class="tiny dim">${esc(t('models.admin_hint'))}</span>` : ''}
            </div>
          </section>`;
        })
        .join('');

      grid.querySelectorAll('[data-use]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const provider = providers.find((p) => p.id === btn.dataset.use);
          const task = provider?.models?.[0]?.tasks?.[0] || 'text_to_video';
          navigate(task === 'text_to_image' ? '/create/text_to_image' : task === 'image_to_video' ? '/create/image_to_video' : '/create/text_to_video');
        });
      });
    })
    .catch((err) => {
      root.querySelector('#modelGrid').innerHTML = `<div class="empty" style="grid-column:1/-1">${icon('alert')}<h3>${esc(t('common.error'))}</h3><p>${esc(err.message)}</p></div>`;
    });
}
