import { state, t, api, esc, icon, fmtNum, coverUrl, confirmDialog, toast, debounce, fmtDate, navigate } from '../core.js';

function projectCard(project) {
  const poster = coverUrl(project);
  return `<div class="project-card" data-project="${esc(project.id)}">
    <a class="thumb ${project.aspect === '9:16' ? 'portrait' : ''}" href="#/project/${esc(project.id)}">
      ${poster ? `<img src="${esc(poster)}" alt="" loading="lazy">` : `<span class="dim">${icon('film')}</span>`}
      <span class="status">${project.videoAssetId ? `<span class="pill ok"><i></i>${esc(t('common.ready'))}</span>` : `<span class="pill idle"><i></i>${esc(t('creations.no_video'))}</span>`}</span>
      ${project.isPublic ? `<span class="pill live" style="position:absolute;top:10px;inset-inline-end:10px"><i></i>${esc(t('creations.public'))}</span>` : ''}
      <span class="play-btn"><span class="ring">${icon('play')}</span></span>
    </a>
    <div class="project-meta">
      <div class="spread">
        <h3>${esc(project.title)}</h3>
        <button class="btn sm ghost" data-fav="${esc(project.id)}" title="${esc(project.favorite ? t('creations.unfavorite') : t('creations.favorite'))}" style="padding:4px 7px;color:${project.favorite ? '#ff7d95' : 'var(--dim)'}">${icon('heart')}</button>
      </div>
      <div class="meta-row">
        <span>${esc(project.style || '')}</span><span class="dot-sep"></span>
        <span>${esc(project.aspect)}</span><span class="dot-sep"></span>
        <span>${esc(fmtDate(project.createdAt))}</span>
      </div>
      <div class="row" style="margin-top:8px">
        <a class="btn sm ghost" href="#/project/${esc(project.id)}">${icon('eye')}${esc(t('creations.open'))}</a>
        <button class="btn sm ghost" data-del="${esc(project.id)}" style="margin-inline-start:auto;color:#ff9db0">${icon('trash')}</button>
      </div>
    </div>
  </div>`;
}

export function creationsView(root) {
  const filters = { type: '', favorite: false, q: '' };

  root.innerHTML = `
    <div class="section-head">
      <div><h2>${esc(t('creations.title'))}</h2><p class="sub">${esc(t('creations.sub'))}</p></div>
      <a class="btn sm" href="#/director">${icon('plus')}${esc(t('common.new'))}</a>
    </div>
    <div class="filters">
      <div class="search">${icon('search')}<input type="text" id="searchInput" placeholder="${esc(t('creations.search_placeholder'))}"></div>
      <button class="chip active" data-filter="all">${esc(t('common.all'))}</button>
      <button class="chip" data-filter="video">${esc(t('common.video'))}</button>
      <button class="chip" data-filter="image">${esc(t('common.image'))}</button>
      <button class="chip" data-filter="fav">${icon('heart')}${esc(t('creations.favorites_only'))}</button>
    </div>
    <div id="creationsGrid" class="card-grid"><div class="skeleton" style="height:220px"></div><div class="skeleton" style="height:220px"></div><div class="skeleton" style="height:220px"></div></div>`;

  const grid = root.querySelector('#creationsGrid');

  async function load() {
    const params = new URLSearchParams();
    if (filters.type) params.set('type', filters.type);
    if (filters.favorite) params.set('favorite', '1');
    if (filters.q) params.set('q', filters.q);
    try {
      const data = await api(`/api/creations?${params.toString()}`);
      const projects = data.projects || [];
      if (!projects.length) {
        grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${icon('film')}<h3>${esc(t('creations.empty'))}</h3><p>${esc(t('creations.empty_sub'))}</p><div style="margin-top:16px"><a class="btn primary" href="#/director">${icon('sparkles')}${esc(t('home.cta'))}</a></div></div>`;
        return;
      }
      grid.innerHTML = projects.map(projectCard).join('');
    } catch (err) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${icon('alert')}<h3>${esc(t('common.error'))}</h3><p>${esc(err.message)}</p></div>`;
    }
  }

  root.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('[data-filter]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const value = btn.dataset.filter;
      filters.type = value === 'video' || value === 'image' ? value : '';
      filters.favorite = value === 'fav';
      load();
    });
  });

  root.querySelector('#searchInput').addEventListener(
    'input',
    debounce((event) => {
      filters.q = event.target.value.trim();
      load();
    }, 320),
  );

  grid.addEventListener('click', async (event) => {
    const favBtn = event.target.closest('[data-fav]');
    if (favBtn) {
      event.preventDefault();
      const id = favBtn.dataset.fav;
      const card = favBtn.closest('.project-card');
      const isFav = favBtn.style.color.includes('255, 125, 149');
      try {
        await api(`/api/projects/${id}/favorite`, { method: isFav ? 'DELETE' : 'POST' });
        favBtn.style.color = isFav ? 'var(--dim)' : '#ff7d95';
        toast(isFav ? t('creations.unfavorite') : t('creations.favorite'), 'ok');
        if (filters.favorite) load();
      } catch (err) {
        toast(err.message, 'bad');
      }
      return;
    }
    const delBtn = event.target.closest('[data-del]');
    if (delBtn) {
      event.preventDefault();
      const id = delBtn.dataset.del;
      const ok = await confirmDialog(t('creations.delete_confirm'));
      if (!ok) return;
      try {
        await api(`/api/projects/${id}`, { method: 'DELETE' });
        toast(t('common.success'), 'ok');
        load();
      } catch (err) {
        toast(err.message, 'bad');
      }
    }
  });

  load();
}

export function discoverView(root) {
  const lang = state.locale;
  root.innerHTML = `
    <div class="section-head">
      <div><h2>${esc(t('discover.title'))}</h2><p class="sub">${esc(t('discover.sub'))}</p></div>
    </div>
    <div id="tplGrid" class="card-grid"><div class="skeleton" style="height:170px"></div><div class="skeleton" style="height:170px"></div><div class="skeleton" style="height:170px"></div></div>
    <div class="section">
      <div class="section-head"><div><h2>${esc(t('discover.public_title'))}</h2></div></div>
      <div id="publicGrid" class="card-grid"><div class="skeleton" style="height:200px"></div><div class="skeleton" style="height:200px"></div><div class="skeleton" style="height:200px"></div></div>
    </div>`;

  api('/api/discover')
    .then((data) => {
      const tplGrid = root.querySelector('#tplGrid');
      tplGrid.innerHTML = (data.templates || [])
        .map(
          (tpl) => `<div class="template-card">
            <div class="row wrap" style="gap:6px">
              <span class="badge grad">${esc(tpl.style)}</span>
              <span class="badge">${esc(tpl.aspect)}</span>
              <span class="badge">${tpl.duration}s</span>
            </div>
            <h3>${esc(tpl.title[lang] || tpl.title.en)}</h3>
            <p>${esc(tpl.brief[lang] || tpl.brief.en)}</p>
            <button class="btn sm ghost" data-tpl="${esc(tpl.id)}">${icon('sparkles')}${esc(t('discover.use_template'))}</button>
          </div>`,
        )
        .join('');

      tplGrid.querySelectorAll('[data-tpl]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tpl = data.templates.find((x) => x.id === btn.dataset.tpl);
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

      const publicGrid = root.querySelector('#publicGrid');
      if (!(data.creations || []).length) {
        publicGrid.innerHTML = `<div class="empty" style="grid-column:1/-1">${icon('compass')}<h3>${esc(t('discover.public_empty'))}</h3><p>${esc(t('discover.public_empty_sub'))}</p></div>`;
        return;
      }
      publicGrid.innerHTML = data.creations
        .map(
          (c) => `<a class="project-card" href="#/share/${esc(c.id)}">
            <div class="thumb">
              ${c.posterUrl ? `<img src="${esc(c.posterUrl)}" alt="" loading="lazy">` : `<span class="dim">${icon('film')}</span>`}
              <span class="play-btn"><span class="ring">${icon('play')}</span></span>
            </div>
            <div class="project-meta">
              <h3>${esc(c.title)}</h3>
              <div class="meta-row"><span>${esc(c.author || '')}</span><span class="dot-sep"></span><span>${esc(c.style || '')}</span><span class="dot-sep"></span><span>${fmtNum(c.duration)}s</span></div>
            </div>
          </a>`,
        )
        .join('');
    })
    .catch((err) => {
      root.querySelector('#tplGrid').innerHTML = `<div class="empty" style="grid-column:1/-1">${icon('alert')}<h3>${esc(t('common.error'))}</h3><p>${esc(err.message)}</p></div>`;
    });
}

export function shareView(root, id) {
  root.innerHTML = `<div class="skeleton" style="height:60vh"></div>`;
  api(`/api/public/creations/${id}`)
    .then(({ creation }) => {
      root.innerHTML = `
        <header class="share-head">
          <a class="brand" href="#/"><span class="brand-mark">N</span><span class="brand-text"><b>NOVA</b><small>VIDEO AGENT ULTRA</small></span></a>
          <a class="btn sm" href="#/">${icon('sparkles')}${esc(t('share.back_home'))}</a>
        </header>
        <div class="share-video">
          ${creation.videoUrl ? `<video controls playsinline preload="metadata" ${creation.posterUrl ? `poster="${esc(creation.posterUrl)}"` : ''} src="${esc(creation.videoUrl)}"></video>` : `<div class="empty">${icon('film')}<h3>${esc(t('creations.no_video'))}</h3></div>`}
        </div>
        <div class="share-meta">
          <div>
            <h1 style="font-size:28px">${esc(creation.title)}</h1>
            <p class="muted" style="margin-top:8px">${esc(t('share.by'))} ${esc(creation.author)} · ${esc(creation.style || '')} · ${esc(creation.aspect)} · ${fmtNum(creation.duration)} ${esc(t('common.seconds'))}</p>
            <div class="card panel" style="margin-top:18px">
              <div class="panel-head"><h3>${esc(t('share.prompt_label'))}</h3></div>
              <p class="small muted" style="line-height:1.7">${esc(creation.enhancedPrompt || '')}</p>
            </div>
          </div>
          <div class="card panel">
            <div class="panel-head"><h3>${esc(t('share.storyboard'))}</h3><span class="badge">${creation.scenes.length}</span></div>
            <div class="stack">
              ${creation.scenes
                .map(
                  (s) => `<div class="row" style="align-items:flex-start;gap:9px">
                    <span class="scene-num">${s.idx}</span>
                    <div><p class="small">${esc(s.description)}</p><p class="tiny dim">${esc(s.cameraAngle || '')} · ${esc(s.cameraMove || '')} · ${esc(s.lighting || '')}</p></div>
                  </div>`,
                )
                .join('')}
            </div>
          </div>
        </div>
        <p class="center dim tiny" style="margin-top:34px">${esc(t('share.made_with'))}</p>`;
    })
    .catch((err) => {
      root.innerHTML = `<div class="empty" style="margin-top:80px">${icon('alert')}<h3>${esc(t('share.not_public'))}</h3><p>${esc(err.message)}</p><div style="margin-top:16px"><a class="btn primary" href="#/">${esc(t('share.back_home'))}</a></div></div>`;
    });
}
