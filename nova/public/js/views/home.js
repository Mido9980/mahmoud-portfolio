import { state, t, api, esc, icon, navigate, fmtNum, coverUrl } from '../core.js';

const DURATIONS = [5, 10, 15, 20, 30];

function moduleIcon(id) {
  return (
    {
      director: 'sparkles',
      text_to_video: 'film',
      image_to_video: 'image',
      text_to_image: 'image',
      image_editor: 'wand',
      storyboard: 'layers',
      product_ad: 'megaphone',
      avatar: 'user',
      social: 'zap',
      extend: 'clock',
    }[id] || 'sparkles'
  );
}

function projectCard(project) {
  const poster = coverUrl(project);
  const hasVideo = Boolean(project.videoAssetId);
  return `<a class="project-card" href="#/project/${esc(project.id)}">
    <div class="thumb ${project.aspect === '9:16' ? 'portrait' : ''}">
      ${poster ? `<img src="${esc(poster)}" alt="" loading="lazy">` : `<span class="dim">${icon('film')}</span>`}
      <span class="status">${hasVideo ? '<span class="pill ok"><i></i>' + esc(t('common.ready')) + '</span>' : `<span class="pill idle"><i></i>${esc(t('creations.no_video'))}</span>`}</span>
      ${project.favorite ? `<span class="fav">${icon('heart')}</span>` : ''}
      <span class="play-btn"><span class="ring">${icon('play')}</span></span>
    </div>
    <div class="project-meta">
      <h3>${esc(project.title)}</h3>
      <div class="meta-row">
        <span>${esc(project.style || '')}</span><span class="dot-sep"></span>
        <span>${esc(project.aspect)}</span><span class="dot-sep"></span>
        <span>${fmtNum(project.duration)} ${esc(t('common.seconds'))}</span>
      </div>
    </div>
  </a>`;
}

export function homeView(root) {
  const lang = state.locale;
  const meta = state.meta || { modules: [], styles: [], aspects: ['16:9'] };
  const modules = (meta.modules || []).slice(0, 9);
  const styles = meta.styles || [];
  const aspects = meta.aspects || ['16:9'];

  root.innerHTML = `
    <section class="hero-card">
      <span class="hero-kicker">${icon('sparkles')}${esc(t('home.kicker'))}</span>
      <h1 class="hero-title">${esc(t('home.title'))}<span class="accent">${esc(t('home.title_accent'))}</span></h1>
      <p class="hero-sub">${esc(t('home.sub'))}</p>
      <div class="composer">
        <textarea id="heroBrief" placeholder="${esc(t('home.placeholder'))}"></textarea>
        <div class="composer-bar">
          <select id="heroStyle" aria-label="${esc(t('common.style'))}">
            ${styles.map((s) => `<option value="${esc(s.id)}">${esc(s[lang] || s.en)}</option>`).join('')}
          </select>
          <select id="heroAspect" aria-label="${esc(t('common.aspect'))}">
            ${aspects.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}
          </select>
          <select id="heroDuration" aria-label="${esc(t('common.duration'))}">
            ${DURATIONS.map((d) => `<option value="${d}" ${d === 10 ? 'selected' : ''}>${d} ${esc(t('common.seconds'))}</option>`).join('')}
          </select>
          <span class="spacer"></span>
          <button class="btn primary" id="heroCta">${icon('sparkles')}${esc(t('home.cta'))}</button>
        </div>
        <p class="composer-hint">${icon('zap')}${esc(t('home.cta_hint'))}</p>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>${esc(t('home.quick'))}</h2><p class="sub">${esc(t('home.quick_sub'))}</p></div>
        <a class="link" href="#/discover">${esc(t('nav.discover'))}${icon('arrowRight')}</a>
      </div>
      <div class="quick-grid">
        ${modules
          .map(
            (m) => `<a class="module-card" href="#/${m.id === 'director' ? 'director' : `create/${m.id}`}">
              <span class="tile">${icon(moduleIcon(m.id))}</span>
              <h3>${esc(m.name[lang] || m.name.en)}</h3>
              <p>${esc(m.description?.[lang] || m.description?.en || '')}</p>
              <span class="go">${esc(m.id === 'director' ? t('nav.director') : t('nav.studio'))}${icon('arrowRight')}</span>
            </a>`,
          )
          .join('')}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>${esc(t('home.recent'))}</h2><p class="sub">${esc(t('home.recent_sub'))}</p></div>
        <a class="link" href="#/creations">${esc(t('common.all'))}${icon('arrowRight')}</a>
      </div>
      <div id="recentGrid" class="card-grid"><div class="skeleton" style="height:210px"></div><div class="skeleton" style="height:210px"></div><div class="skeleton" style="height:210px"></div></div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>${esc(t('home.templates'))}</h2><p class="sub">${esc(t('home.templates_sub'))}</p></div>
      </div>
      <div id="templateGrid" class="card-grid"><div class="skeleton" style="height:180px"></div><div class="skeleton" style="height:180px"></div><div class="skeleton" style="height:180px"></div></div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><h2>${esc(t('home.providers'))}</h2><p class="sub">${esc(t('home.providers_sub'))}</p></div>
        <a class="link" href="#/models">${esc(t('home.explore'))}${icon('arrowRight')}</a>
      </div>
      <div class="provider-strip" id="providerStrip">
        ${(state.providers || [])
          .map(
            (p) => `<div class="provider-chip ${!p.requiresKey || (p.configured && p.verified) ? 'ready' : p.configured ? 'pending' : ''}">
              <span class="dot"></span><b>${esc(p.name)}</b>
              <span class="state">${esc(!p.requiresKey ? t('home.local_ready') : p.verified ? t('home.verified_ready') : p.configured ? t('home.unverified') : t('home.needs_key'))}</span>
            </div>`,
          )
          .join('')}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><h2>${esc(t('home.how'))}</h2></div></div>
      <div class="how-grid">
        <div class="step-card"><div class="num">01</div><h3>${esc(t('home.how_1_t'))}</h3><p>${esc(t('home.how_1_d'))}</p></div>
        <div class="step-card"><div class="num">02</div><h3>${esc(t('home.how_2_t'))}</h3><p>${esc(t('home.how_2_d'))}</p></div>
        <div class="step-card"><div class="num">03</div><h3>${esc(t('home.how_3_t'))}</h3><p>${esc(t('home.how_3_d'))}</p></div>
      </div>
    </section>`;

  const brief = root.querySelector('#heroBrief');
  const go = () => {
    const text = brief.value.trim();
    if (!text) {
      brief.focus();
      return;
    }
    sessionStorage.setItem(
      'nova_seed',
      JSON.stringify({
        brief: text,
        style: root.querySelector('#heroStyle').value,
        aspect: root.querySelector('#heroAspect').value,
        duration: Number(root.querySelector('#heroDuration').value),
      }),
    );
    navigate('/director');
  };
  root.querySelector('#heroCta').addEventListener('click', go);
  brief.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go();
  });

  Promise.all([api('/api/projects').catch(() => ({ projects: [] })), api('/api/discover').catch(() => ({ templates: [] }))])
    .then(([projects, discover]) => {
      const grid = root.querySelector('#recentGrid');
      const recent = (projects.projects || []).slice(0, 6);
      if (grid) {
        grid.innerHTML = recent.length
          ? recent.map(projectCard).join('')
          : `<div class="empty" style="grid-column:1/-1">${icon('film')}<h3>${esc(t('creations.empty'))}</h3><p>${esc(t('home.empty_recent'))}</p></div>`;
      }
      const tplGrid = root.querySelector('#templateGrid');
      if (tplGrid) {
        tplGrid.innerHTML = (discover.templates || [])
          .slice(0, 3)
          .map(
            (tpl) => `<div class="template-card">
              <div class="row" style="gap:8px"><span class="badge grad">${esc(tpl.style)}</span><span class="badge">${esc(tpl.aspect)}</span><span class="badge">${tpl.duration}s</span></div>
              <h3>${esc(tpl.title[lang] || tpl.title.en)}</h3>
              <p>${esc(tpl.brief[lang] || tpl.brief.en)}</p>
              <button class="btn sm ghost" data-tpl="${esc(tpl.id)}">${icon('sparkles')}${esc(t('discover.use_template'))}</button>
            </div>`,
          )
          .join('');
        tplGrid.querySelectorAll('[data-tpl]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const tpl = (discover.templates || []).find((x) => x.id === btn.dataset.tpl);
            if (!tpl) return;
            sessionStorage.setItem(
              'nova_seed',
              JSON.stringify({
                brief: tpl.brief[lang] || tpl.brief.en,
                style: tpl.style,
                aspect: tpl.aspect,
                duration: tpl.duration,
                module: tpl.module,
              }),
            );
            navigate(tpl.module === 'director' ? '/director' : `/create/${tpl.module}`);
          });
        });
      }
    })
    .catch(() => {});
}
